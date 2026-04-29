import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { spotChallenges, spotChallengeImages } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { logAudit } from '$lib/server/audit';
import { getUploadWriteDir } from '$lib/server/uploads';
import { validateSpotImageBuffer } from '$lib/server/validateSpotImageBuffer';
import { isSpotChallengesSchemaReady, isSpotChallengeImagesReady } from '$lib/server/spotChallengesSchemaReady';

const MAX_SIZE = 5 * 1024 * 1024;
const MAX_IMAGES_PER_CHALLENGE = 5;

function canManageChallenge(
	userId: number,
	role: string,
	challengeCreatedBy: number
): boolean {
	return (
		userId === challengeCreatedBy || role === 'admin' || role === 'spotmanager'
	);
}

export const POST: RequestHandler = async (event) => {
	const { request, locals } = event;
	if (!locals.user) throw error(401, 'Nicht angemeldet');
	if (!isSpotChallengesSchemaReady() || !isSpotChallengeImagesReady()) {
		return json({ error: 'Challenge-Bilder: Schema nicht bereit (npm run db:migrate).' }, { status: 503 });
	}

	try {
		const formData = await request.formData();
		const file = formData.get('image') as File | null;
		const challengeId = parseInt(String(formData.get('challengeId') ?? ''), 10);

		if (!file || !challengeId) {
			return json({ error: 'Bild und Challenge-ID erforderlich' }, { status: 400 });
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

		const challenge = db
			.select({
				id: spotChallenges.id,
				spotId: spotChallenges.spotId,
				createdBy: spotChallenges.createdBy,
				deleted: spotChallenges.deleted
			})
			.from(spotChallenges)
			.where(eq(spotChallenges.id, challengeId))
			.get();

		if (!challenge || challenge.deleted) {
			return json({ error: 'Challenge nicht gefunden' }, { status: 404 });
		}

		if (
			!canManageChallenge(locals.user.id, locals.user.role, challenge.createdBy)
		) {
			return json({ error: 'Keine Berechtigung' }, { status: 403 });
		}

		const existing = db
			.select({ id: spotChallengeImages.id })
			.from(spotChallengeImages)
			.where(eq(spotChallengeImages.challengeId, challengeId))
			.all();
		if (existing.length >= MAX_IMAGES_PER_CHALLENGE) {
			return json({ error: `Maximal ${MAX_IMAGES_PER_CHALLENGE} Bilder pro Challenge` }, { status: 400 });
		}

		const uploadDir = getUploadWriteDir();
		try {
			if (!existsSync(uploadDir)) {
				mkdirSync(uploadDir, { recursive: true, mode: 0o775 });
			}
		} catch (e) {
			console.error('challenge image mkdir failed', uploadDir, e);
			return json({ error: 'Upload-Ordner nicht anlegbar' }, { status: 500 });
		}

		const ext = magic.ext;
		const filename = `ch${challengeId}-${Date.now()}.${ext}`;
		const filepath = join(uploadDir, filename);

		try {
			writeFileSync(filepath, buffer, { mode: 0o664 });
		} catch (e) {
			console.error('challenge image write failed', e);
			return json({ error: 'Speichern fehlgeschlagen' }, { status: 500 });
		}

		const ins = db
			.insert(spotChallengeImages)
			.values({
				challengeId,
				filename,
				uploadedBy: locals.user.id
			})
			.run();

		const newId = Number(ins.lastInsertRowid);
		const result = db.select().from(spotChallengeImages).where(eq(spotChallengeImages.id, newId)).get();
		if (!result) {
			try {
				unlinkSync(filepath);
			} catch {
				/* ignore */
			}
			return json({ error: 'Metadaten konnten nicht gespeichert werden' }, { status: 500 });
		}

		logAudit({
			event,
			action: 'spot.challenge.image.upload',
			actorUserId: locals.user.id,
			actorUsername: locals.user.username,
			detail: { challengeId, spotId: challenge.spotId, imageId: newId, filename }
		});

		return json({
			success: true,
			image: { id: result.id, filename, url: `/uploads/${filename}` }
		});
	} catch (e) {
		console.error('POST /api/spots/challenges/images', e);
		return json({ error: 'Upload fehlgeschlagen' }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async (event) => {
	const { request, locals } = event;
	if (!locals.user) throw error(401, 'Nicht angemeldet');
	if (!isSpotChallengeImagesReady()) {
		return json({ error: 'Challenge-Bilder: Schema nicht bereit' }, { status: 503 });
	}

	const { imageId } = await request.json();
	const id = Number(imageId);
	if (!id) {
		return json({ error: 'imageId erforderlich' }, { status: 400 });
	}

	const image = db
		.select({
			id: spotChallengeImages.id,
			filename: spotChallengeImages.filename,
			uploadedBy: spotChallengeImages.uploadedBy,
			challengeId: spotChallengeImages.challengeId
		})
		.from(spotChallengeImages)
		.where(eq(spotChallengeImages.id, id))
		.get();

	if (!image) {
		return json({ error: 'Bild nicht gefunden' }, { status: 404 });
	}

	const challenge = db
		.select({ createdBy: spotChallenges.createdBy })
		.from(spotChallenges)
		.where(eq(spotChallenges.id, image.challengeId))
		.get();

	if (!challenge) {
		return json({ error: 'Challenge nicht gefunden' }, { status: 404 });
	}

	const ok =
		image.uploadedBy === locals.user.id ||
		canManageChallenge(locals.user.id, locals.user.role, challenge.createdBy);

	if (!ok) {
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

	db.delete(spotChallengeImages).where(eq(spotChallengeImages.id, id)).run();

	logAudit({
		event,
		action: 'spot.challenge.image.delete',
		actorUserId: locals.user.id,
		actorUsername: locals.user.username,
		detail: { imageId: id, challengeId: image.challengeId, filename: image.filename }
	});

	return json({ success: true });
};
