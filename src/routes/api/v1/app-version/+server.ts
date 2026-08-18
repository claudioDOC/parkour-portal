import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ANDROID_APP_VERSION, ANDROID_APP_VERSION_CODE } from '$lib/appVersion';

/**
 * Neueste APK-Version — damit die App selbst merken kann, dass eine
 * neue Installation bereitsteht, und sie direkt anbieten kann.
 * Bewusst ohne Login: die Datei unter /app ist ohnehin öffentlich.
 */
export const GET: RequestHandler = async ({ url }) => {
	const path = join(process.cwd(), 'data', 'app', 'parkour-portal.apk');
	const available = existsSync(path);
	return json({
		version: ANDROID_APP_VERSION,
		versionCode: ANDROID_APP_VERSION_CODE,
		available,
		sizeBytes: available ? statSync(path).size : 0,
		builtAt: available ? statSync(path).mtime.toISOString() : null,
		url: `${url.origin}/app/parkour-portal-${ANDROID_APP_VERSION}.apk`
	});
};
