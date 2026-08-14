import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { join } from 'node:path';

/** Liefert die aktuelle APK aus data/app/ (liegt bewusst ausserhalb des Repos). */
export const GET: RequestHandler = async () => {
	const path = join(process.cwd(), 'data', 'app', 'parkour-portal.apk');
	if (!existsSync(path)) throw error(404, 'Noch keine APK hinterlegt');
	const size = statSync(path).size;
	return new Response(Readable.toWeb(createReadStream(path)) as unknown as ReadableStream, {
		headers: {
			'content-type': 'application/vnd.android.package-archive',
			'content-disposition': 'attachment; filename="parkour-portal.apk"',
			'content-length': String(size),
			'cache-control': 'no-cache'
		}
	});
};
