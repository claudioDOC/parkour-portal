import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { Readable } from 'node:stream';
import { join, resolve } from 'node:path';
import { getUploadReadDirs } from '$lib/server/uploads';

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
 * ruckelte entsprechend. Erlaubte Breiten sind fest vorgegeben, damit
 * niemand den Server mit beliebigen Grössen beschäftigen kann; erzeugte
 * Fassungen liegen als WebP im Zwischenspeicher auf der Platte.
 */
const THUMB_WIDTHS = new Set([120, 240, 480, 960]);

function thumbnail(filepath: string, width: number, cacheDir: string, name: string): Buffer | null {
	try {
		mkdirSync(cacheDir, { recursive: true });
		const cached = join(cacheDir, `${width}-${name}.webp`);
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

	const segments = raw.split('/').filter(Boolean);
	if (segments.length === 0 || segments.some((s) => s === '..' || s.includes('\\'))) {
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
			const wanted = Number(url.searchParams.get('w') ?? '');
			if (THUMB_WIDTHS.has(wanted)) {
				const name = segments.at(-1) ?? 'bild';
				const cacheDir = join(baseResolved, '.thumbs');
				const cachedBuf = thumbnail(filepath, wanted, cacheDir, name);
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
					const small = await sharp(filepath)
						.rotate()
						.resize({ width: wanted, withoutEnlargement: true })
						.webp({ quality: 80 })
						.toBuffer();
					try {
						writeFileSync(join(cacheDir, `${wanted}-${name}.webp`), small);
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
