import adapter from '@sveltejs/adapter-node';
import { relative, sep } from 'node:path';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// defaults to rune mode for the project, execept for `node_modules`. Can be removed in svelte 6.
		runes: ({ filename }) => {
			const relativePath = relative(import.meta.dirname, filename);
			const pathSegments = relativePath.toLowerCase().split(sep);
			const isExternalLibrary = pathSegments.includes('node_modules');

			return isExternalLibrary ? undefined : true;
		}
	},
	kit: {
		// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
		// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
		// See https://svelte.dev/docs/kit/adapters for more information about adapters.
		// adapter-node: Standard-Body-Limit für Produktion ist klein (ohne Env). Bild-Upload bis 5MB → BODY_SIZE_LIMIT setzen (siehe README).
		adapter: adapter(),
		// CSRF nur in Prod: hinter nginx ist event.url oft http://127.0.0.1:3000, Browser-Origin https://… → POST-Block.
		// Sauberer Fix auf dem Server: ORIGIN=https://domain (adapter-node). '*' schaltet Kit-CSRF wie in der Doku beschrieben ab.
		csrf: {
			trustedOrigins: ['*']
		}
	}
};

export default config;
