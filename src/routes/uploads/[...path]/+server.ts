import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { Readable } from 'node:stream';
import { join, resolve } from 'node:path';
import { getUploadReadDirs, isServedUploadName, THUMB_DIR, THUMB_WIDTHS, thumbPath } from '$lib/server/uploads';

const MIME: Record<string, string> = {
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	png: 'image/png',
	webp: 'image/webp',
	gif: 'image/gif',
	mp4: 'video/mp4',
	mov: 'video/quicktime',
	webm: 'video/webm'
};

const STREAMED = new Set(['mp4', 'mov', 'webm']);

/**
 * Verkleinerte Fassungen für Galerien und Listen.
 *
 * Vorher lieferte jede Vorschau das Original — bei Handyfotos gern 4–8 MB
 * pro Bild. Eine Spot-Seite mit zehn Bildern zog damit zig Megabyte und
 * ruckelte entsprechend. Erlaubte Breiten sind fest vorgegeben
 * (THUMB_WIDTHS), damit niemand den Server mit beliebigen Grössen
 * beschäftigen kann; erzeugte Fassungen liegen als WebP im
 * Zwischenspeicher `.thumbs` — der selbst nie ausgeliefert wird.
 */
const THUMB_SET = new Set(THUMB_WIDTHS);
const THUMB_SOURCE = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);

function thumbnail(filepath: string, cached: string): Buffer | null {
	try {
		if (existsSync(cached) && statSync(cached).mtimeMs >= statSync(filepath).mtimeMs) {
			return readFileSync(cached);
		}
		return null;
	} catch {
		return null;
	}
}

export const GET: RequestHandler = async ({ params, request, url }) => {
	const raw = params.path;
	if (!raw) throw error(404, 'Not found');

	// Nur Dateinamen, wie der Server sie selbst vergibt: ein Segment, kein
	// Punkt am Anfang. Damit sind Unterordner, `..` und vor allem der
	// Vorschau-Ordner `.thumbs` gar nicht erst erreichbar — vorher liessen
	// sich ohne Login Vorschauen von Vorschauen erzeugen, endlos, bis die
	// Platte voll ist.
	const segments = raw.split('/').filter(Boolean);
	if (segments.length !== 1 || !isServedUploadName(segments[0])) {
		throw error(404, 'Not found');
	}

	for (const base of getUploadReadDirs()) {
		const baseResolved = resolve(base);
		const filepath = resolve(join(baseResolved, ...segments));
		if (!filepath.startsWith(baseResolved + '/') && filepath !== baseResolved) continue;
		if (existsSync(filepath) && statSync(filepath).isFile()) {
			const ext = segments.at(-1)?.split('.').pop()?.toLowerCase() ?? '';
			const type = MIME[ext] ?? 'application/octet-stream';

			// Videos: streamen und Range-Requests bedienen — sonst kein Vorspulen
			// und der ganze Film läge im Arbeitsspeicher.
			if (STREAMED.has(ext)) {
				const size = statSync(filepath).size;
				const range = request.headers.get('range');
				const common = {
					'content-type': type,
					'cache-control': 'public, max-age=86400',
					'accept-ranges': 'bytes',
					'X-Content-Type-Options': 'nosniff'
				};
				if (range) {
					const m = /bytes=(\d*)-(\d*)/.exec(range);
					const start = m && m[1] ? Number(m[1]) : 0;
					const end = m && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
					if (Number.isNaN(start) || start >= size || end < start) {
						return new Response(null, {
							status: 416,
							headers: { 'content-range': `bytes */${size}` }
						});
					}
					const nodeStream = createReadStream(filepath, { start, end });
					return new Response(Readable.toWeb(nodeStream) as unknown as ReadableStream, {
						status: 206,
						headers: {
							...common,
							'content-range': `bytes ${start}-${end}/${size}`,
							'content-length': String(end - start + 1)
						}
					});
				}
				const nodeStream = createReadStream(filepath);
				return new Response(Readable.toWeb(nodeStream) as unknown as ReadableStream, {
					headers: { ...common, 'content-length': String(size) }
				});
			}

			// Verkleinerte Fassung, falls angefragt und die Breite erlaubt ist.
			// `gray=1` liefert sie schwarz-weiss (Platzhalter der Trainingskarte) —
			// fertig vom Server, weil der Graufilter in der App nicht auf jedem
			// Handy greift.
			const wanted = Number(url.searchParams.get('w') ?? '');
			if (THUMB_SET.has(wanted) && THUMB_SOURCE.has(ext)) {
				const name = segments[0];
				const gray = url.searchParams.get('gray') === '1';
				const cacheDir = join(baseResolved, THUMB_DIR);
				const cachedFile = thumbPath(baseResolved, wanted, name, gray);
				const cachedBuf = thumbnail(filepath, cachedFile);
				if (cachedBuf) {
					return new Response(new Uint8Array(cachedBuf), {
						headers: {
							'content-type': 'image/webp',
							'cache-control': 'public, max-age=604800',
							'X-Content-Type-Options': 'nosniff'
						}
					});
				}
				try {
					let pipeline = sharp(filepath)
						.rotate()
						.resize({ width: wanted, withoutEnlargement: true });
					if (gray) pipeline = pipeline.grayscale();
					const small = await pipeline.webp({ quality: 80 }).toBuffer();
					try {
						mkdirSync(cacheDir, { recursive: true });
						writeFileSync(cachedFile, small);
					} catch {
						/* ohne Zwischenspeicher halt jedes Mal neu */
					}
					return new Response(new Uint8Array(small), {
						headers: {
							'content-type': 'image/webp',
							'cache-control': 'public, max-age=604800',
							'X-Content-Type-Options': 'nosniff'
						}
					});
				} catch {
					// Kein Bild oder Umwandlung fehlgeschlagen — Original liefern.
				}
			}

			const buf = readFileSync(filepath);
			return new Response(buf, {
				headers: {
					'content-type': type,
					'cache-control': 'public, max-age=86400',
					'X-Content-Type-Options': 'nosniff'
				}
			});
		}
	}

	throw error(404, 'Not found');
};
