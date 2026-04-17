<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';

	/** Fester Startpunkt für alle Trip-Routen (Trainingsregion). */
	const ROUTE_START_LAT = 46.758;
	const ROUTE_START_LON = 7.628;
	const ROUTE_START_LABEL = 'Thun';

	function formatDriveDuration(seconds: number): string {
		const s = Math.max(0, Math.round(seconds));
		const h = Math.floor(s / 3600);
		const m = Math.floor((s % 3600) / 60);
		if (h > 0 && m > 0) return `ca. ${h} Std. ${m} Min`;
		if (h > 0) return `ca. ${h} Std.`;
		return `ca. ${m} Min`;
	}

	/** Geocoding-Namen auf der Karte: nicht volle Adresszeilen. */
	function labelForMap(text: string, maxChars = 38): string {
		const t = text.trim();
		if (t.length <= maxChars) return t;
		return `${t.slice(0, maxChars - 1).trimEnd()}…`;
	}

	export type TripStopoverRow = {
		id: number;
		label: string;
		latitude: number;
		longitude: number;
		sortOrder: number;
		proposedBy: number;
		proposedByName: string;
	};

	let {
		tripId,
		createdBy,
		destinationLatitude,
		destinationLongitude,
		destinationLabel,
		stopovers,
		currentUserId,
		isAdmin
	}: {
		tripId: number;
		createdBy: number;
		destinationLatitude: number | null;
		destinationLongitude: number | null;
		destinationLabel: string | null;
		stopovers: TripStopoverRow[];
		currentUserId: number;
		isAdmin: boolean;
	} = $props();

	const canEditDestination = $derived(createdBy === currentUserId || isAdmin);

	let mapContainer = $state<HTMLDivElement | null>(null);
	let mapMode = $state<'satellite' | 'street'>('street');
	let mapReady = $state(false);
	let mapError = $state('');
	let leafletMap: import('leaflet').Map | null = null;
	let markerLayer: import('leaflet').LayerGroup | null = null;
	let routeLayer: import('leaflet').Layer | null = null;
	let tileStreet: import('leaflet').TileLayer | null = null;
	let tileSatellite: import('leaflet').TileLayer | null = null;

	let routeNote = $state('');

	let destSearch = $state('');
	let destSearchBusy = $state(false);
	let destGeocodeHits = $state<{ lat: number; lon: number; displayName: string }[]>([]);
	let destActionBusy = $state(false);

	let stopLabel = $state('');
	let stopSearch = $state('');
	let stopBusy = $state(false);
	let stopGeocodeHits = $state<{ lat: number; lon: number; displayName: string }[]>([]);
	let stopAddBusy = $state(false);

	async function postTrip(action: string, payload: Record<string, unknown>) {
		const res = await fetch('/api/trips', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action, tripId, ...payload })
		});
		if (!res.ok) {
			const err = await res.json().catch(() => ({}));
			console.warn('[trip-map]', err);
		}
		await invalidateAll();
	}

	async function runGeocode(q: string) {
		const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
		if (!res.ok) return [];
		const data = (await res.json()) as { results?: { lat: number; lon: number; displayName: string }[] };
		return data.results || [];
	}

	async function searchDestination() {
		destSearchBusy = true;
		try {
			destGeocodeHits = await runGeocode(destSearch);
		} finally {
			destSearchBusy = false;
		}
	}

	async function applyDestination(hit: { lat: number; lon: number; displayName: string }) {
		destActionBusy = true;
		try {
			await postTrip('set_trip_destination', {
				latitude: hit.lat,
				longitude: hit.lon,
				label: hit.displayName
			});
			destGeocodeHits = [];
			destSearch = '';
		} finally {
			destActionBusy = false;
		}
	}

	async function clearDestination() {
		if (!confirm('Kartenziel wirklich entfernen?')) return;
		destActionBusy = true;
		try {
			await postTrip('set_trip_destination', { clear: true });
		} finally {
			destActionBusy = false;
		}
	}

	async function searchStopover() {
		stopBusy = true;
		try {
			stopGeocodeHits = await runGeocode(stopSearch);
		} finally {
			stopBusy = false;
		}
	}

	async function addStopover(hit: { lat: number; lon: number; displayName: string }) {
		const label = stopLabel.trim() || hit.displayName.slice(0, 120);
		stopAddBusy = true;
		try {
			await postTrip('propose_stopover', { label, latitude: hit.lat, longitude: hit.lon });
			stopLabel = '';
			stopSearch = '';
			stopGeocodeHits = [];
		} finally {
			stopAddBusy = false;
		}
	}

	async function removeStopover(id: number) {
		if (!confirm('Diesen Zwischenstopp entfernen?')) return;
		await postTrip('delete_stopover', { stopoverId: id });
	}

	async function fetchRouteOsrm(
		points: { lat: number; lon: number }[]
	): Promise<{ geometry: object; duration: number; distance: number } | null> {
		if (points.length < 2) return null;
		const coordStr = points.map((p) => `${p.lon},${p.lat}`).join(';');
		const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`;
		const r = await fetch(url);
		if (!r.ok) return null;
		const data = (await r.json()) as {
			code: string;
			routes?: { geometry: object; duration: number; distance: number }[];
		};
		if (data.code !== 'Ok' || !data.routes?.[0]) return null;
		const route = data.routes[0];
		return { geometry: route.geometry, duration: route.duration, distance: route.distance };
	}

	async function refreshMap(L: typeof import('leaflet')) {
		const map = leafletMap;
		const markers = markerLayer;
		if (!map || !markers) return;
		markers.clearLayers();
		if (routeLayer) {
			map.removeLayer(routeLayer);
			routeLayer = null;
		}
		routeNote = '';

		const bounds = L.latLngBounds([]);
		const sortedStops = [...stopovers].sort(
			(a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id
		);

		const pin = (className: string) =>
			L.divIcon({ className, iconSize: [18, 18], iconAnchor: [9, 9] });

		const startM = L.marker([ROUTE_START_LAT, ROUTE_START_LON], {
			icon: pin('trip-route-pin trip-route-pin-start')
		}).addTo(markers);
		startM.bindTooltip(`Start (${ROUTE_START_LABEL})`, {
			permanent: true,
			direction: 'top',
			offset: [0, -10],
			className: 'trip-route-map-label'
		});
		startM.on('click', () => {
			window.open(
				`https://www.google.com/maps/search/?api=1&query=${ROUTE_START_LAT},${ROUTE_START_LON}`,
				'_blank',
				'noopener,noreferrer'
			);
		});
		bounds.extend([ROUTE_START_LAT, ROUTE_START_LON]);

		sortedStops.forEach((s, i) => {
			const m = L.marker([s.latitude, s.longitude], {
				icon: pin('trip-route-pin trip-route-pin-stop')
			}).addTo(markers);
			m.bindTooltip(`Zwischenstopp ${i + 1}: ${labelForMap(s.label, 32)}`, {
				permanent: true,
				direction: 'top',
				offset: [0, -10],
				className: 'trip-route-map-label'
			});
			m.on('click', () => {
				window.open(
					`https://www.google.com/maps/dir/?api=1&origin=${ROUTE_START_LAT},${ROUTE_START_LON}&destination=${s.latitude},${s.longitude}`,
					'_blank',
					'noopener,noreferrer'
				);
			});
			bounds.extend([s.latitude, s.longitude]);
		});

		if (destinationLatitude != null && destinationLongitude != null) {
			const m = L.marker([destinationLatitude, destinationLongitude], {
				icon: pin('trip-route-pin trip-route-pin-dest')
			}).addTo(markers);
			m.bindTooltip(labelForMap(destinationLabel || 'Ziel', 40), {
				permanent: true,
				direction: 'top',
				offset: [0, -10],
				className: 'trip-route-map-label'
			});
			m.on('click', () => {
				window.open(
					`https://www.google.com/maps/dir/?api=1&origin=${ROUTE_START_LAT},${ROUTE_START_LON}&destination=${destinationLatitude},${destinationLongitude}`,
					'_blank',
					'noopener,noreferrer'
				);
			});
			bounds.extend([destinationLatitude, destinationLongitude]);
		}

		if (bounds.isValid()) {
			map.fitBounds(bounds.pad(0.12));
		} else {
			map.setView([ROUTE_START_LAT, ROUTE_START_LON], 11);
		}

		const routePoints: { lat: number; lon: number }[] = [
			{ lat: ROUTE_START_LAT, lon: ROUTE_START_LON }
		];
		for (const s of sortedStops) {
			routePoints.push({ lat: s.latitude, lon: s.longitude });
		}
		if (destinationLatitude != null && destinationLongitude != null) {
			routePoints.push({ lat: destinationLatitude, lon: destinationLongitude });
		}

		if (routePoints.length >= 2) {
			const r = await fetchRouteOsrm(routePoints);
			if (r) {
				routeLayer = L.geoJSON(r.geometry as never, {
					style: { color: '#b8dd62', weight: 5, opacity: 0.88 }
				}).addTo(map);
				const timeStr = formatDriveDuration(r.duration);
				const km = (r.distance / 1000).toFixed(1);
				routeNote = `Route ab ${ROUTE_START_LABEL} (Auto, Schätzung OSRM): ${timeStr} · ${km} km`;
			} else {
				routeNote = 'Routing-Daten konnten nicht geladen werden.';
			}
		}
	}

	onMount(async () => {
		if (!mapContainer) return;
		try {
			const L = await import('leaflet');
			await import('leaflet/dist/leaflet.css');

			leafletMap = L.map(mapContainer, { zoomControl: true, scrollWheelZoom: false });
			tileStreet = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
				attribution: '&copy; OpenStreetMap'
			});
			tileSatellite = L.tileLayer(
				'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
				{ attribution: 'Tiles &copy; Esri' }
			);
			tileStreet.addTo(leafletMap);
			markerLayer = L.layerGroup().addTo(leafletMap);

			await refreshMap(L);
			mapReady = true;
		} catch (e) {
			console.error('[trip-map]', e);
			mapError = 'Karte konnte nicht geladen werden.';
		}
	});

	$effect(() => {
		tripId;
		destinationLatitude;
		destinationLongitude;
		destinationLabel;
		stopovers;
		if (!mapReady || !leafletMap) return;
		void (async () => {
			const L = await import('leaflet');
			await refreshMap(L);
		})();
	});

	onDestroy(() => {
		if (leafletMap) {
			leafletMap.remove();
			leafletMap = null;
		}
	});

	function setMapMode(mode: 'satellite' | 'street') {
		mapMode = mode;
		if (!leafletMap || !tileStreet || !tileSatellite) return;
		if (mode === 'street') {
			if (leafletMap.hasLayer(tileSatellite)) leafletMap.removeLayer(tileSatellite);
			if (!leafletMap.hasLayer(tileStreet)) tileStreet.addTo(leafletMap);
		} else {
			if (leafletMap.hasLayer(tileStreet)) leafletMap.removeLayer(tileStreet);
			if (!leafletMap.hasLayer(tileSatellite)) tileSatellite.addTo(leafletMap);
		}
	}
</script>

<div class="rounded-lg border border-border bg-bg-secondary/40 overflow-hidden">
	<div class="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-border bg-bg-card/50">
		<p class="text-xs uppercase tracking-wide text-text-secondary">Route & Karte</p>
		<div class="flex gap-1">
			<button
				type="button"
				onclick={() => setMapMode('street')}
				class="text-[11px] px-2 py-1 rounded-md border {mapMode === 'street'
					? 'border-accent text-accent bg-accent/10'
					: 'border-border text-text-muted hover:text-text-primary'}"
			>
				Karte
			</button>
			<button
				type="button"
				onclick={() => setMapMode('satellite')}
				class="text-[11px] px-2 py-1 rounded-md border {mapMode === 'satellite'
					? 'border-accent text-accent bg-accent/10'
					: 'border-border text-text-muted hover:text-text-primary'}"
			>
				Satellit
			</button>
		</div>
	</div>

	{#if mapError}
		<p class="text-danger text-sm p-3">{mapError}</p>
	{:else}
		<div bind:this={mapContainer} class="w-full h-56 sm:h-72 z-0"></div>
	{/if}

	{#if routeNote}
		<p class="text-xs text-text-secondary px-3 py-2 border-t border-border bg-bg-card/30">{routeNote}</p>
	{/if}

	<div class="p-3 space-y-3 border-t border-border text-xs">
		<p class="text-text-muted">
			Start der Route ist fest <span class="text-text-secondary font-medium">{ROUTE_START_LABEL}</span> — Fahrzeit und Linie beziehen sich darauf.
		</p>

		{#if canEditDestination}
			<div class="rounded-md border border-border bg-bg-card/40 p-2 space-y-2">
				<p class="text-text-muted text-[11px] uppercase tracking-wide">Kartenziel (Trip)</p>
				<div class="flex flex-wrap gap-2">
					<input
						bind:value={destSearch}
						type="text"
						placeholder="Ort oder Adresse suchen…"
						class="flex-1 min-w-[12rem] bg-bg-card border border-border rounded-lg px-2 py-1.5 text-text-primary"
					/>
					<button
						type="button"
						onclick={() => searchDestination()}
						disabled={destSearchBusy || !destSearch.trim()}
						class="bg-accent/15 text-accent px-3 py-1.5 rounded-lg font-medium disabled:opacity-50"
					>
						{destSearchBusy ? '…' : 'Suchen'}
					</button>
					{#if destinationLatitude != null}
						<button
							type="button"
							onclick={() => clearDestination()}
							disabled={destActionBusy}
							class="text-danger/90 bg-danger/10 px-3 py-1.5 rounded-lg disabled:opacity-50"
						>
							Ziel löschen
						</button>
					{/if}
				</div>
				{#if destGeocodeHits.length > 0}
					<ul class="space-y-1 max-h-32 overflow-y-auto">
						{#each destGeocodeHits as hit}
							<li>
								<button
									type="button"
									disabled={destActionBusy}
									onclick={() => applyDestination(hit)}
									class="w-full text-left px-2 py-1 rounded border border-border hover:border-accent/50 text-text-primary"
								>
									{hit.displayName}
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{:else if destinationLatitude == null}
			<p class="text-text-muted">Noch kein Kartenziel — der Trip-Ersteller oder ein Admin kann es setzen.</p>
		{/if}

		<div class="rounded-md border border-accent/25 bg-accent/5 p-2 space-y-2">
			<p class="text-text-muted text-[11px] uppercase tracking-wide text-accent">Zwischenstopp vorschlagen</p>
			<input
				bind:value={stopLabel}
				type="text"
				placeholder="Kurzbezeichnung (optional)"
				class="w-full bg-bg-card border border-border rounded-lg px-2 py-1.5 text-text-primary"
			/>
			<div class="flex flex-wrap gap-2">
				<input
					bind:value={stopSearch}
					type="text"
					placeholder="Ort suchen…"
					class="flex-1 min-w-[12rem] bg-bg-card border border-border rounded-lg px-2 py-1.5 text-text-primary"
				/>
				<button
					type="button"
					onclick={() => searchStopover()}
					disabled={stopBusy || !stopSearch.trim()}
					class="bg-accent/15 text-accent px-3 py-1.5 rounded-lg font-medium disabled:opacity-50"
				>
					{stopBusy ? '…' : 'Suchen'}
				</button>
			</div>
			{#if stopGeocodeHits.length > 0}
				<ul class="space-y-1 max-h-28 overflow-y-auto">
					{#each stopGeocodeHits as hit}
						<li>
							<button
								type="button"
								disabled={stopAddBusy}
								onclick={() => addStopover(hit)}
								class="w-full text-left px-2 py-1 rounded border border-border hover:border-accent/50"
							>
								{hit.displayName}
							</button>
						</li>
					{/each}
				</ul>
			{/if}
			{#if stopovers.length > 0}
				<ul class="space-y-1 pt-1 border-t border-border/60">
					{#each stopovers as s, i}
						<li class="flex flex-wrap items-center justify-between gap-2 text-text-secondary">
							<span
								>{i + 1}. {s.label}
								<span class="text-text-muted">· {s.proposedByName}</span></span
							>
							{#if s.proposedBy === currentUserId || isAdmin}
								<button
									type="button"
									onclick={() => removeStopover(s.id)}
									class="text-danger/90 text-[11px] hover:underline"
								>
									Entfernen
								</button>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</div>
</div>

<style>
	:global(.trip-route-pin) {
		border-radius: 50%;
		border: 2px solid #0c0c0e;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.45);
	}
	:global(.trip-route-pin-dest) {
		background: #ef4444;
	}
	:global(.trip-route-pin-stop) {
		background: #f59e0b;
	}
	:global(.trip-route-pin-start) {
		background: #22c55e;
	}
	:global(.trip-route-map-label) {
		background: rgba(12, 12, 14, 0.82) !important;
		color: #e8e8ec !important;
		border: 1px solid rgba(255, 255, 255, 0.12) !important;
		border-radius: 4px !important;
		font-size: 10px !important;
		font-weight: 600 !important;
		padding: 2px 6px !important;
		box-shadow: none !important;
		max-width: 12rem !important;
		overflow: hidden !important;
		text-overflow: ellipsis !important;
		white-space: nowrap !important;
		line-height: 1.25 !important;
	}
</style>
