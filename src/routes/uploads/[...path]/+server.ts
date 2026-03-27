import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { getUploadReadDirs } from '$lib/server/uploads';

const MIME: Record<string, string> = {
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	png: 'image/png',
	webp: 'image/webp',
	gif: 'image/gif'
};

export const GET: RequestHandler = async ({ params }) => {
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
			const buf = readFileSync(filepath);
			return new Response(buf, {
				headers: {
					'content-type': type,
					'cache-control': 'public, max-age=86400'
				}
			});
		}
	}

	throw error(404, 'Not found');
};
