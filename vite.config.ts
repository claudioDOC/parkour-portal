import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
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
