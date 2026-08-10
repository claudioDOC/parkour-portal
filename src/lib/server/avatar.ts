import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { getUploadReadDirs } from './uploads';

/** Name der unbeschnittenen Vollbild-Variante zum Quadrat-Avatar (Konvention). */
export function avatarFullFilename(filename: string): string {
	return filename.replace(/\.webp$/, '-full.webp');
}

/**
 * URL fürs vergrösserte Profilbild: Vollversion wenn vorhanden, sonst das
 * Quadrat (ältere Uploads haben keine Vollversion).
 */
export function avatarFullUrl(filename: string | null): string | null {
	if (!filename) return null;
	const full = avatarFullFilename(filename);
	for (const dir of getUploadReadDirs()) {
		if (existsSync(join(dir, full))) return `/uploads/${full}`;
	}
	return `/uploads/${filename}`;
}
