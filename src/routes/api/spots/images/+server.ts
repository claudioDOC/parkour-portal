import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { spotImages, spots } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';

const UPLOAD_DIR = './static/uploads';
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Nicht angemeldet');

	const formData = await request.formData();
	const file = formData.get('image') as File | null;
	const spotId = parseInt(formData.get('spotId') as string);

	if (!file || !spotId) {
		return json({ error: 'Bild und Spot-ID erforderlich' }, { status: 400 });
	}

	if (file.size > MAX_SIZE) {
		return json({ error: 'Bild darf maximal 5MB groß sein' }, { status: 400 });
	}

	const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
	if (!validTypes.includes(file.type)) {
		return json({ error: 'Nur JPG, PNG und WebP erlaubt' }, { status: 400 });
	}

	const spot = db.select().from(spots).where(eq(spots.id, spotId)).get();
	if (!spot) {
		return json({ error: 'Spot nicht gefunden' }, { status: 404 });
	}

	if (!existsSync(UPLOAD_DIR)) {
		mkdirSync(UPLOAD_DIR, { recursive: true });
	}

	const ext = file.name.split('.').pop() || 'jpg';
	const filename = `${spotId}-${Date.now()}.${ext}`;
	const filepath = join(UPLOAD_DIR, filename);

	const buffer = Buffer.from(await file.arrayBuffer());
	writeFileSync(filepath, buffer);

	const result = db.insert(spotImages).values({
		spotId,
		filename,
		uploadedBy: locals.user.id
	}).returning().get();

	return json({ success: true, image: { id: result.id, filename, url: `/uploads/${filename}` } });
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Nicht angemeldet');

	const { imageId } = await request.json();

	const image = db.select().from(spotImages).where(eq(spotImages.id, imageId)).get();
	if (!image) {
		return json({ error: 'Bild nicht gefunden' }, { status: 404 });
	}

	if (image.uploadedBy !== locals.user.id && locals.user.role !== 'admin') {
		return json({ error: 'Keine Berechtigung' }, { status: 403 });
	}

	const filepath = join(UPLOAD_DIR, image.filename);
	try { unlinkSync(filepath); } catch {}

	db.delete(spotImages).where(eq(spotImages.id, imageId)).run();

	return json({ success: true });
};
