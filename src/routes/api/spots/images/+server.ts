import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { spotImages, spots } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { logAudit } from '$lib/server/audit';
import { getUploadWriteDir } from '$lib/server/uploads';
import { validateSpotImageBuffer } from '$lib/server/validateSpotImageBuffer';

const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export const POST: RequestHandler = async (event) => {
	const { request, locals } = event;
	if (!locals.user) throw error(401, 'Nicht angemeldet');

	try {
		const formData = await request.formData();
		const file = formData.get('image') as File | null;
		const spotId = parseInt(formData.get('spotId') as string, 10);

		if (!file || !spotId) {
			return json({ error: 'Bild und Spot-ID erforderlich' }, { status: 400 });
		}

		if (file.size > MAX_SIZE) {
			return json({ error: 'Bild darf maximal 5MB groß sein' }, { status: 400 });
		}

		const buffer = Buffer.from(await file.arrayBuffer());
		const magic = await validateSpotImageBuffer(buffer);
		if (!magic) {
			return json(
				{ error: 'Datei ist kein gültiges JPEG-, PNG- oder WebP-Bild (Inhalt geprüft).' },
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

		const ext = magic.ext;
		const filename = `${spotId}-${Date.now()}.${ext}`;
		const filepath = join(uploadDir, filename);

		try {
			writeFileSync(filepath, buffer, { mode: 0o664 });
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

	if (image.uploadedBy !== locals.user.id && locals.user.role !== 'admin') {
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
