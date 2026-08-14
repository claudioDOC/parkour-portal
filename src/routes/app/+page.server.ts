import type { PageServerLoad } from './$types';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ANDROID_APP_VERSION } from '$lib/appVersion';

export const load: PageServerLoad = async () => {
	const path = join(process.cwd(), 'data', 'app', 'parkour-portal.apk');
	const available = existsSync(path);
	return {
		available,
		version: ANDROID_APP_VERSION,
		sizeMb: available ? Math.round((statSync(path).size / 1024 / 1024) * 10) / 10 : 0,
		builtAt: available ? statSync(path).mtime.toISOString() : null
	};
};
