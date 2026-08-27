import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { rateLimitImageUpload } from '$lib/server/rateLimitAuth';
import { db } from '$lib/server/db';
import { spotImages, spots } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { logAudit } from '$lib/server/audit';
import { getUploadWriteDir } from '$lib/server/uploads';
import sharp from 'sharp';
import { validateSpotImageBuffer } from '$lib/server/validateSpotImageBuffer';

// Handyfotos sind heute 10–25 MB; wird beim Speichern verkleinert.
const MAX_SIZE = 30 * 1024 * 1024;

export const POST: RequestHandler = async (event) => {
	const { request, locals } = event;
	if (!locals.user) throw error(401, 'Nicht angemeldet');

	// Missbrauchsbremse: Bilder darf jede:r beitragen, aber nicht endlos.
	const uploadLimit = rateLimitImageUpload(locals.user.id);
	if (!uploadLimit.ok) {
		return json(
			{ error: `Zu viele Uploads. Bitte in ${uploadLimit.retryAfterSec} Sekunden erneut.` },
			{ status: 429, headers: { 'Retry-After': String(uploadLimit.retryAfterSec) } }
		);
	}

	try {
		const formData = await request.formData();
		const file = formData.get('image') as File | null;
		const spotId = parseInt(formData.get('spotId') as string, 10);

		if (!file || !spotId) {
			return json({ error: 'Bild und Spot-ID erforderlich' }, { status: 400 });
		}

		if (file.size > MAX_SIZE) {
			return json({ error: 'Bild darf maximal 30 MB gross sein' }, { status: 400 });
		}

		const buffer = Buffer.from(await file.arrayBuffer());
		const magic = await validateSpotImageBuffer(buffer);
		if (!magic) {
			return json(
				{ error: 'Datei ist kein gültiges Bild (JPEG, PNG, WebP oder HEIC — Inhalt geprüft).' },
				{ status: 400 }
			);
		}

		const spot = db.select().from(spots).where(eq(spots.id, spotId)).get();
		if (!spot) {
			return json({ error: 'Spot nicht gefunden' }, { status: 404 });
		}

		const uploadDir = getUploadWriteDir();
		try {
			if (!existsSync(uploadDir)) {
				mkdirSync(uploadDir, { recursive: true, mode: 0o775 });
			}
		} catch (e) {
			console.error('upload mkdir failed', uploadDir, e);
			return json(
				{ error: 'Upload-Ordner nicht anlegbar (sudo mkdir -p data/uploads, Rechte für Dienst-User)' },
				{ status: 500 }
			);
		}

		/**
		 * Bilder werden beim Ablegen normalisiert:
		 *  - HEIC/HEIF zeigt kein Browser an → WebP.
		 *  - Alles über 2560 px wird auf 2560 px gebracht. Handyfotos kommen
		 *    heute mit 4000–8000 px und 4–8 MB an; für die Vollansicht
		 *    (max. 1600 px) ist das um ein Vielfaches zu viel — es kostet nur
		 *    Platz, Backup-Zeit und Bandbreite.
		 * Kleinere Bilder bleiben unverändert liegen.
		 */
		const MAX_EDGE = 2560;
		let toWrite = buffer;
		let converted = false;
		try {
			const meta = await sharp(buffer).metadata();
			const tooBig = Math.max(meta.width ?? 0, meta.height ?? 0) > MAX_EDGE;
			const isHeic = magic.mime === 'image/heic' || magic.mime === 'image/heif';
			if (isHeic || tooBig) {
				toWrite = await sharp(buffer)
					.rotate()
					.resize(MAX_EDGE, MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
					.webp({ quality: 86 })
					.toBuffer();
				converted = true;
			}
		} catch (e) {
			console.error('Bildaufbereitung fehlgeschlagen', e);
			return json({ error: 'Bild konnte nicht verarbeitet werden.' }, { status: 400 });
		}

		// Endung muss zum Inhalt passen: Wurde umgewandelt, ist es WebP —
		// sonst liefert der Server später den falschen MIME-Typ aus.
		const ext = converted ? 'webp' : magic.ext;
		// Zufallsanteil im Namen: Ohne ihn liessen sich Bilder fremder Spots
		// erraten (`<spotId>-<zeitstempel>`), obwohl /uploads ohne Login
		// erreichbar sein MUSS — die App lädt Bilder ohne Sitzung.
		const filename = `${spotId}-${Date.now()}-${randomBytes(6).toString('hex')}.${ext}`;
		const filepath = join(uploadDir, filename);

		try {
			writeFileSync(filepath, toWrite, { mode: 0o664 });
		} catch (e) {
			console.error('spot image write failed', e);
			return json({ error: 'Speichern fehlgeschlagen (Rechte/Pfad prüfen)' }, { status: 500 });
		}

		const ins = db
			.insert(spotImages)
			.values({
				spotId,
				filename,
				uploadedBy: locals.user.id
			})
			.run();

		const newId = Number(ins.lastInsertRowid);
		const result = db.select().from(spotImages).where(eq(spotImages.id, newId)).get();
		if (!result) {
			console.error('spotImages insert: row missing, lastInsertRowid=', newId);
			try {
				unlinkSync(filepath);
			} catch {
				/* ignore */
			}
			return json({ error: 'Bildmetadaten konnten nicht gespeichert werden' }, { status: 500 });
		}

		logAudit({
			event,
			action: 'spot.image.upload',
			actorUserId: locals.user.id,
			actorUsername: locals.user.username,
			detail: { spotId, spotName: spot.name, imageId: result.id, filename }
		});

		return json({ success: true, image: { id: result.id, filename, url: `/uploads/${filename}` } });
	} catch (e) {
		console.error('POST /api/spots/images', e);
		return json({ error: 'Upload fehlgeschlagen' }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async (event) => {
	const { request, locals } = event;
	if (!locals.user) throw error(401, 'Nicht angemeldet');

	const { imageId } = await request.json();

	const image = db.select().from(spotImages).where(eq(spotImages.id, imageId)).get();
	if (!image) {
		return json({ error: 'Bild nicht gefunden' }, { status: 404 });
	}

	// Wer den Spot verwalten darf, darf auch seine Bilder entfernen —
	// bei Challenge-Bildern galt das längst, hier fehlte der Spotmanager.
	const mayDelete =
		image.uploadedBy === locals.user.id ||
		locals.user.role === 'admin' ||
		locals.user.role === 'spotmanager';
	if (!mayDelete) {
		return json({ error: 'Keine Berechtigung' }, { status: 403 });
	}

	const filepath = join(getUploadWriteDir(), image.filename);
	try {
		unlinkSync(filepath);
	} catch {
		const legacy = join(process.cwd(), 'static', 'uploads', image.filename);
		try {
			unlinkSync(legacy);
		} catch {
			/* ignore */
		}
	}

	db.delete(spotImages).where(eq(spotImages.id, imageId)).run();

	logAudit({
		event,
		action: 'spot.image.delete',
		actorUserId: locals.user.id,
		actorUsername: locals.user.username,
		detail: { imageId, spotId: image.spotId, filename: image.filename }
	});

	return json({ success: true });
};
