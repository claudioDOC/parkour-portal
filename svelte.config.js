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
		// CSRF: SvelteKits pauschale Prüfung ist AUS — sie blockte auch die
		// native App, die als Nicht-Browser keinen Origin-Header schickt
		// (Bild-Uploads schlugen mit 403 fehl). Der Schutz läuft jetzt in
		// src/hooks.server.ts: gleiche Regel für Browser, Ausnahme nur für
		// Anfragen mit gültigem Bearer-Token.
		csrf: { checkOrigin: false },
		/**
		 * Content-Security-Policy (Pentest F-01/F-05).
		 *
		 * Muss HIER stehen, nicht im Hook: SvelteKit bindet ein eigenes
		 * Startskript inline ein und ergänzt dafür automatisch die passenden
		 * Hashes. Setzt man die CSP von Hand, blockiert sie genau dieses
		 * Skript — die Seite wird dann zwar angezeigt, reagiert aber auf
		 * keinen Knopf mehr (nachgemessen).
		 */
		csp: {
			directives: {
				'default-src': ['self'],
				'base-uri': ['self'],
				'object-src': ['none'],
				'frame-ancestors': ['none'],
				'form-action': ['self'],
				'script-src': ['self'],
				'style-src': ['self', 'unsafe-inline', 'https://fonts.googleapis.com'],
				'font-src': ['self', 'https://fonts.gstatic.com', 'data:'],
				'img-src': [
					'self',
					'data:',
					'blob:',
					'https://server.arcgisonline.com',
					'https://tiles.openfreemap.org',
					'https://*.basemaps.cartocdn.com',
					'https://*.tile.openstreetmap.org'
				],
				'connect-src': [
					'self',
					'https://tiles.openfreemap.org',
					'https://server.arcgisonline.com',
					'https://nominatim.openstreetmap.org'
				],
				'worker-src': ['self', 'blob:'],
				'manifest-src': ['self'],
				'upgrade-insecure-requests': true
			}
		}
	}
};

export default config;
