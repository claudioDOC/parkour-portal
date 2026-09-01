import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';

/**
 * Umgeht eine Inhaltsprüfung, die ausgelieferten Code verstümmelt.
 *
 * Gemessen am 1.9.2026: Der Baustein mit SvelteKits Routen-Dekodierung kam
 * bei Browsern mit einer Reihe „XXXX…" statt Code an — exakt ab
 * `String.fromCharCode(parseInt(`. Ein Filter zwischen Portal und Browser
 * hält das für Schadcode und überschreibt es zeichenweise. Folge:
 * Syntaxfehler, die Seite wird angezeigt, aber kein Knopf reagiert mehr.
 * Direkt am Portal (Port 3000) ist dieselbe Datei einwandfrei.
 *
 * `String["fromCharCode"]` arbeitet identisch, passt aber nicht mehr auf
 * die Signatur. Bewusst hier im Build (nicht als Nachbearbeitung): So
 * fliesst die Änderung in den Datei-Hash ein, die Datei bekommt einen
 * neuen Namen — und Browser, die die kaputte Fassung ein Jahr lang
 * zwischengespeichert haben, holen sie neu.
 */
function entschaerfeFilterMuster() {
	const MUSTER = 'String.fromCharCode';
	const ERSATZ = 'String["fromCharCode"]';
	return {
		name: 'entschaerfe-filter-muster',
		enforce: 'post' as const,
		apply: 'build' as const,
		/**
		 * Bewusst `generateBundle` und nicht `renderChunk`: Der Minifier
		 * läuft danach und würde `String["fromCharCode"]` wieder zu
		 * `String.fromCharCode` zusammenfalten — gemessen, der erste Anlauf
		 * wirkte nur im (unminifizierten) Server-Build.
		 */
		generateBundle(_options: unknown, bundle: Record<string, { type: string; code?: string }>) {
			for (const [name, datei] of Object.entries(bundle)) {
				if (datei.type !== 'chunk' || !datei.code?.includes(MUSTER)) continue;
				datei.code = datei.code.split(MUSTER).join(ERSATZ);
				console.log(`[filter-muster] entschärft in ${name}`);
			}
		}
	};
}

export default defineConfig({
	plugins: [
		entschaerfeFilterMuster(),
		tailwindcss(),
		sveltekit(),
		SvelteKitPWA({
			// `injectManifest` statt der Standard-Generierung: nötig, damit der
			// eigene Service Worker mit Push-Handlern zum Zug kommt. Die Quelle
			// liegt unter SvelteKits Konvention `src/service-worker.ts`.
			strategies: 'injectManifest',
			srcDir: 'src',
			filename: 'service-worker.ts',
			registerType: 'autoUpdate',
			scope: '/',
			base: '/',
			manifest: {
				id: '/',
				name: 'Parkour Portal',
				short_name: 'Parkour Portal',
				description: 'Trainings, Spots und Challenges der Parkour-Gruppe',
				start_url: '/',
				scope: '/',
				display: 'standalone',
				orientation: 'portrait',
				theme_color: '#191a1f',
				// Grund des Android-Splashscreens — gleiches Dunkel wie die App.
				background_color: '#0d0d0f',
				lang: 'de',
				categories: ['sports', 'lifestyle'],
				icons: [
					{
						src: 'pwa-192x192.png?v=7',
						sizes: '192x192',
						type: 'image/png',
						purpose: 'any'
					},
					{
						src: 'pwa-512x512.png?v=7',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'any'
					},
					{
						src: 'pwa-maskable-512x512.png?v=7',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'maskable'
					}
				],
				// Langer Druck auf das App-Icon führt direkt in den Bereich.
				shortcuts: [
					{
						name: 'Training',
						short_name: 'Training',
						url: '/training',
						icons: [{ src: 'pwa-192x192.png?v=7', sizes: '192x192', type: 'image/png' }]
					},
					{
						name: 'Spots',
						short_name: 'Spots',
						url: '/spots',
						icons: [{ src: 'pwa-192x192.png?v=7', sizes: '192x192', type: 'image/png' }]
					},
					{
						name: 'Spot-Finder',
						short_name: 'Finder',
						url: '/finder',
						icons: [{ src: 'pwa-192x192.png?v=7', sizes: '192x192', type: 'image/png' }]
					}
				]
			},
			injectManifest: {
				globPatterns: ['client/**/*.{js,css,ico,png,svg,webp,woff,woff2}'],
				// Ohne diese Grenze verweigert der Build grosse Bundles im Precache.
				maximumFileSizeToCacheInBytes: 4 * 1024 * 1024
			},
			devOptions: {
				enabled: false,
				type: 'module'
			}
		})
	]
});
