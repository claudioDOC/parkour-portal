import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
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

export const GET: RequestHandler = async ({ params, request }) => {
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
