import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq } from 'drizzle-orm';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { getUploadWriteDir } from '$lib/server/uploads';
import { validateSpotImageBuffer } from '$lib/server/validateSpotImageBuffer';
import { logAudit } from '$lib/server/audit';

const MAX_SIZE = 5 * 1024 * 1024;

function currentAvatar(userId: number): string | null {
	return (
		db.select({ avatar: users.avatar }).from(users).where(eq(users.id, userId)).get()?.avatar ??
		null
	);
}

function deleteAvatarFile(filename: string | null) {
	if (!filename) return;
	try {
		const path = join(getUploadWriteDir(), filename);
		if (existsSync(path)) unlinkSync(path);
	} catch {
		/* Datei weg ist kein Drama */
	}
}

/** Eigenes Profilbild setzen — wird auf 256×256 WebP normalisiert. */
export const POST: RequestHandler = async (event) => {
	const { request, locals } = event;
	if (!locals.user) throw error(401, 'Nicht angemeldet');

	const formData = await request.formData();
	const file = formData.get('image') as File | null;
	if (!file) return json({ error: 'Bild erforderlich' }, { status: 400 });
	if (file.size > MAX_SIZE) return json({ error: 'Bild darf maximal 5MB gross sein' }, { status: 400 });

	const buffer = Buffer.from(await file.arrayBuffer());
	const magic = await validateSpotImageBuffer(buffer);
	if (!magic) {
		return json({ error: 'Datei ist kein gültiges JPEG-, PNG- oder WebP-Bild.' }, { status: 400 });
	}

	let processed: Buffer;
	try {
		processed = await sharp(buffer)
			.rotate() // EXIF-Orientierung anwenden (Handyfotos)
			.resize(256, 256, { fit: 'cover', position: 'attention' })
			.webp({ quality: 82 })
			.toBuffer();
	} catch {
		return json({ error: 'Bild konnte nicht verarbeitet werden.' }, { status: 400 });
	}

	const uploadDir = getUploadWriteDir();
	if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true, mode: 0o775 });

	const filename = `avatar-${locals.user.id}-${Date.now()}.webp`;
	writeFileSync(join(uploadDir, filename), processed);

	const old = currentAvatar(locals.user.id);
	db.update(users).set({ avatar: filename }).where(eq(users.id, locals.user.id)).run();
	deleteAvatarFile(old);

	logAudit({
		event,
		action: 'profile.avatar.set',
		actorUserId: locals.user.id,
		actorUsername: locals.user.username
	});

	return json({ ok: true, avatar: `/uploads/${filename}` });
};

/** Profilbild entfernen — zurück zum Initialen-Avatar. */
export const DELETE: RequestHandler = async (event) => {
	const { locals } = event;
	if (!locals.user) throw error(401, 'Nicht angemeldet');

	const old = currentAvatar(locals.user.id);
	db.update(users).set({ avatar: null }).where(eq(users.id, locals.user.id)).run();
	deleteAvatarFile(old);

	logAudit({
		event,
		action: 'profile.avatar.remove',
		actorUserId: locals.user.id,
		actorUsername: locals.user.username
	});

	return json({ ok: true });
};
