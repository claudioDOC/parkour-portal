import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createReadStream, statSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { Readable } from 'node:stream';

/**
 * Liefert die Dateien eines veröffentlichten App-Updates (Bundle, Bilder,
 * Fonts) aus data/expo-updates/android/files/. URLs stehen im Manifest.
 */
const FILES_DIR = join(process.cwd(), 'data', 'expo-updates', 'android', 'files');

const EXT_MIME: Record<string, string> = {
	hbc: 'application/javascript',
	bundle: 'application/javascript',
	js: 'application/javascript',
	png: 'image/png',
	jpg: 'image/jpeg',
	webp: 'image/webp',
	gif: 'image/gif',
	ttf: 'font/ttf',
	otf: 'font/otf',
	json: 'application/json'
};

export const GET: RequestHandler = async ({ params }) => {
	// Pfad normalisieren und im Update-Verzeichnis einsperren (kein ../).
	const filePath = normalize(join(FILES_DIR, params.path));
	if (!filePath.startsWith(FILES_DIR)) throw error(400, 'Ungültiger Pfad');

	let size: number;
	try {
		size = statSync(filePath).size;
	} catch {
		throw error(404, 'Datei nicht gefunden');
	}

	const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
	return new Response(Readable.toWeb(createReadStream(filePath)) as ReadableStream, {
		headers: {
			'content-type': EXT_MIME[ext] ?? 'application/octet-stream',
			'content-length': String(size),
			// Dateinamen sind inhalts-gehasht — darf lange gecacht werden.
			'cache-control': 'public, max-age=31536000, immutable'
		}
	});
};
