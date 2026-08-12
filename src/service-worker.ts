/// <reference lib="webworker" />
/**
 * Service Worker des Parkour Portals.
 *
 * Zwei Aufgaben:
 *  1. Offline-Betrieb — App-Hülle vorab im Cache, Inhalte „network first“ mit
 *     Rückfall auf die letzte bekannte Antwort, Bilder dauerhaft im Cache.
 *  2. Push-Benachrichtigungen — Anzeige und Klickverhalten.
 *
 * Gebaut über `injectManifest` (siehe vite.config.ts): Diese Datei wird
 * mitgebündelt, `self.__WB_MANIFEST` durch die Precache-Liste ersetzt.
 */
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

declare const self: ServiceWorkerGlobalScope;

const OFFLINE_URL = '/offline';

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

self.addEventListener('install', (event) => {
	// Offline-Seite sofort bereitlegen, damit sie auch beim allerersten
	// Verbindungsabbruch schon da ist.
	event.waitUntil(
		caches.open('offline-shell').then((cache) => cache.add(OFFLINE_URL)).catch(() => undefined)
	);
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
	if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

/* ---------------------------------------------------------------- Offline */

/**
 * Seitenaufrufe: erst Netz (max. 4 s), sonst letzte gecachte Fassung, sonst
 * die Offline-Seite. SvelteKit rendert serverseitig, daher kein App-Shell-
 * Fallback auf eine einzelne HTML-Datei.
 */
const navigationHandler = new NetworkFirst({
	cacheName: 'pages',
	networkTimeoutSeconds: 4,
	plugins: [
		new CacheableResponsePlugin({ statuses: [200] }),
		new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 14 })
	]
});

registerRoute(
	new NavigationRoute(async (options) => {
		try {
			return await navigationHandler.handle(options);
		} catch {
			const cache = await caches.open('offline-shell');
			const fallback = await cache.match(OFFLINE_URL);
			return (
				fallback ??
				new Response('Offline', {
					status: 503,
					headers: { 'Content-Type': 'text/plain; charset=utf-8' }
				})
			);
		}
	})
);

/** JSON-Daten: frisch bevorzugt, offline die letzte Antwort. */
registerRoute(
	({ url, request }) =>
		request.method === 'GET' &&
		url.origin === self.location.origin &&
		url.pathname.startsWith('/api/'),
	new NetworkFirst({
		cacheName: 'api',
		networkTimeoutSeconds: 5,
		plugins: [
			new CacheableResponsePlugin({ statuses: [200] }),
			new ExpirationPlugin({ maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 7 })
		]
	})
);

/** Hochgeladene Spot- und Challenge-Bilder ändern sich nie — dauerhaft cachen. */
registerRoute(
	({ url }) => url.origin === self.location.origin && url.pathname.startsWith('/uploads/'),
	new CacheFirst({
		cacheName: 'uploads',
		plugins: [
			new CacheableResponsePlugin({ statuses: [0, 200] }),
			new ExpirationPlugin({ maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 60, purgeOnQuotaError: true })
		]
	})
);

/** Karten-Kacheln von OpenStreetMap — begrenzt, damit der Speicher nicht ausufert. */
registerRoute(
	({ url }) => /(^|\.)tile\.openstreetmap\.org$/.test(url.hostname) || /(^|\.)basemaps\.cartocdn\.com$/.test(url.hostname),
	new CacheFirst({
		cacheName: 'map-tiles',
		plugins: [
			new CacheableResponsePlugin({ statuses: [0, 200] }),
			new ExpirationPlugin({ maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30, purgeOnQuotaError: true })
		]
	})
);

/** Google-Fonts: Stylesheet frisch halten, Schriftdateien langfristig cachen. */
registerRoute(
	({ url }) => url.hostname === 'fonts.googleapis.com',
	new StaleWhileRevalidate({ cacheName: 'google-fonts-css' })
);
registerRoute(
	({ url }) => url.hostname === 'fonts.gstatic.com',
	new CacheFirst({
		cacheName: 'google-fonts-files',
		plugins: [
			new CacheableResponsePlugin({ statuses: [0, 200] }),
			new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 })
		]
	})
);

/* ------------------------------------------------------------------- Push */

type PushPayload = {
	title?: string;
	body?: string;
	url?: string;
	tag?: string;
};

/** Diagnose ans Portal — Fehler hier sind egal. */
function beacon(stage: string, detail?: string) {
	return fetch('/api/push/beacon', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ stage, detail })
	}).catch(() => undefined);
}

self.addEventListener('push', (event) => {
	event.waitUntil(
		(async () => {
			let payload: PushPayload = {};
			try {
				payload = event.data?.json() ?? {};
			} catch {
				payload = { body: event.data?.text() };
			}

			const title = payload.title || 'Parkour Portal';
			try {
				await self.registration.showNotification(title, {
					body: payload.body || '',
					// ?v= muss zur Icon-Version in app.html passen, sonst zeigt der
					// Browser ein altes gecachtes Logo (oder gar keins).
					icon: '/pwa-192x192.png?v=7',
					badge: '/notification-badge.png?v=7',
					tag: payload.tag || 'parkour-portal',
					data: { url: payload.url || '/' }
				});
				await beacon('angezeigt', title);
			} catch (err) {
				// Notfall: nackte Meldung ohne Icons — besser als gar nichts.
				await beacon('anzeige-fehler', String(err));
				try {
					await self.registration.showNotification(title, { body: payload.body || '' });
					await beacon('fallback-angezeigt');
				} catch (err2) {
					await beacon('fallback-fehler', String(err2));
				}
			}
		})()
	);
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const target = (event.notification.data?.url as string) || '/';
	const targetUrl = new URL(target, self.location.origin).href;

	event.waitUntil(
		(async () => {
			const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
			// Bereits offene App wiederverwenden statt einen zweiten Tab zu öffnen.
			for (const client of clientList) {
				if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
					await client.focus();
					if ('navigate' in client) await client.navigate(targetUrl).catch(() => undefined);
					return;
				}
			}
			await self.clients.openWindow(targetUrl);
		})()
	);
});
