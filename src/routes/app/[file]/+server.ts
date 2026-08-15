import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createReadStream, statSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';

/**
 * APK-Download mit Version im Dateinamen (parkour-portal-1.3.0.apk).
 *
 * Hintergrund: Früher hiess jede Fassung gleich — im Download-Ordner
 * sammelten sich identisch benannte Dateien und beim Installieren wurde
 * leicht eine alte erwischt. Jetzt akzeptiert die Route jeden Namen nach
 * dem Muster parkour-portal-*.apk und liefert immer die aktuelle Datei.
 */
const APK_PATH = join(process.cwd(), 'data', 'app', 'parkour-portal.apk');

export const GET: RequestHandler = async ({ params }) => {
	if (!/^parkour-portal(-[\w.]+)?\.apk$/.test(params.file)) {
		throw error(404, 'Unbekannte Datei');
	}
	let size: number;
	try {
		size = statSync(APK_PATH).size;
	} catch {
		throw error(404, 'Noch keine APK hinterlegt');
	}
	return new Response(Readable.toWeb(createReadStream(APK_PATH)) as ReadableStream, {
		headers: {
			'content-type': 'application/vnd.android.package-archive',
			'content-length': String(size),
			'content-disposition': `attachment; filename="${params.file}"`,
			// Niemals cachen — sonst liefern Browser oder Proxy alte Fassungen.
			'cache-control': 'no-store'
		}
	});
};
