<script lang="ts">
	import type { PageData } from './$types';
	import { onDestroy, onMount } from 'svelte';
	import { browser } from '$app/environment';

	let { data }: { data: PageData } = $props();

	let mapContainer = $state<HTMLDivElement | null>(null);
	let mapError = $state('');
	let leafletMap: import('leaflet').Map | null = null;

	function escapeHtml(s: string): string {
		return s
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}

	/** Farbe nach Durchschnitt (Skala ca. 1–5); ohne Stimmen = neutral. */
	function pinPalette(avgScore: number, voteCount: number): { fill: string; stroke: string; fg: string } {
		if (voteCount === 0) {
			return { fill: '#475569', stroke: '#1e293b', fg: '#f8fafc' };
		}
		if (avgScore < 2.25) return { fill: '#b91c1c', stroke: '#7f1d1d', fg: '#fef2f2' };
		if (avgScore < 3.0) return { fill: '#ea580c', stroke: '#9a3412', fg: '#fff7ed' };
		if (avgScore < 3.75) return { fill: '#ca8a04', stroke: '#854d0e', fg: '#fefce8' };
		if (avgScore < 4.35) return { fill: '#65a30d', stroke: '#3f6212', fg: '#f7fee7' };
		return { fill: '#15803d', stroke: '#14532d', fg: '#f0fdf4' };
	}

	function pinLabel(avgScore: number, voteCount: number): string {
		if (voteCount === 0) return '–';
		return avgScore.toFixed(1);
	}

	onMount(async () => {
		if (!browser || !mapContainer || data.spots.length === 0) return;

		try {
			const L = await import('leaflet');
			await import('leaflet/dist/leaflet.css');

			leafletMap = L.map(mapContainer, {
				zoomControl: true,
				scrollWheelZoom: false
			});

			L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
				attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
			}).addTo(leafletMap);

			const bounds = L.latLngBounds([]);
			const pinW = 28;
			const pinH = 34;

			for (const spot of data.spots) {
				const lat = spot.latitude!;
				const lon = spot.longitude!;
				const { fill, stroke, fg } = pinPalette(spot.avgScore, spot.voteCount);
				const label = pinLabel(spot.avgScore, spot.voteCount);

				const html = `
					<div class="spots-map-pin" style="--pin-fill:${fill};--pin-stroke:${stroke};--pin-fg:${fg}">
						<div class="spots-map-pin-bubble">${label}</div>
						<div class="spots-map-pin-point"></div>
					</div>`;

				const icon = L.divIcon({
					className: 'spots-map-marker-leaflet',
					html,
					iconSize: [pinW, pinH],
					iconAnchor: [pinW / 2, pinH],
					popupAnchor: [0, -pinH + 3]
				});

				const m = L.marker([lat, lon], { icon }).addTo(leafletMap);

				const title = escapeHtml(spot.name);
				const city = escapeHtml(spot.city);
				const ratingLine =
					spot.voteCount === 0
						? 'Noch keine Bewertung'
						: `Ø ${spot.avgScore.toFixed(1)} · ${spot.voteCount} Stimme${spot.voteCount === 1 ? '' : 'n'}`;

				m.bindPopup(
					`<div class="spots-map-popup"><strong>${title}</strong><br/><span style="opacity:0.88;font-size:12px">${city}</span><br/><span style="font-size:12px;margin-top:4px;display:inline-block">${ratingLine}</span><br/><a href="/spots/${spot.id}">Spot öffnen</a></div>`,
					{ maxWidth: 260 }
				);
				bounds.extend([lat, lon]);
			}

			if (data.spots.length === 1) {
				const s = data.spots[0];
				leafletMap.setView([s.latitude!, s.longitude!], 13);
			} else if (bounds.isValid()) {
				leafletMap.fitBounds(bounds, { padding: [56, 56], maxZoom: 14 });
			}

			requestAnimationFrame(() => {
				leafletMap?.invalidateSize();
			});
			setTimeout(() => leafletMap?.invalidateSize(), 200);
		} catch (e) {
			console.error('[spots-map]', e);
			mapError = 'Karte konnte nicht geladen werden.';
		}
	});

	onDestroy(() => {
		if (leafletMap) {
			leafletMap.remove();
			leafletMap = null;
		}
	});
</script>

<svelte:head>
	<title>Karte — Parkour Portal</title>
</svelte:head>

<div class="space-y-4">
	<div>
		<a href="/spots" class="btn-link btn-link-ghost text-sm">← Zu den Spots</a>
		<h1 class="mt-2 text-2xl font-bold text-text-primary">Spot-Karte</h1>
	</div>

	{#if mapError}
		<div class="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{mapError}</div>
	{/if}

	{#if data.spots.length === 0}
		<div
			class="rounded-xl border border-border bg-bg-card px-6 py-12 text-center text-text-secondary text-sm"
		>
			<p>Keine Spots mit gespeicherten Koordinaten.</p>
		</div>
	{:else}
		<div
			bind:this={mapContainer}
			class="z-0 w-full min-h-[min(70vh,560px)] rounded-xl border border-border bg-bg-secondary shadow-inner md:min-h-[72vh]"
			role="application"
			aria-label="Interaktive Karte aller Spots"
		></div>
	{/if}
</div>

<style>
	:global(.spots-map-marker-leaflet) {
		background: transparent !important;
		border: none !important;
	}

	:global(.spots-map-pin) {
		display: flex;
		flex-direction: column;
		align-items: center;
		filter: drop-shadow(0 2px 5px rgb(0 0 0 / 0.4));
	}

	:global(.spots-map-pin-bubble) {
		width: 26px;
		height: 26px;
		border-radius: 9999px;
		border: 1.5px solid var(--pin-stroke);
		background: var(--pin-fill);
		color: var(--pin-fg);
		font-size: 9px;
		font-weight: 800;
		display: flex;
		align-items: center;
		justify-content: center;
		text-align: center;
		font-variant-numeric: tabular-nums;
		letter-spacing: -0.03em;
		box-sizing: border-box;
		line-height: 1;
	}

	:global(.spots-map-pin-point) {
		width: 0;
		height: 0;
		border-left: 5px solid transparent;
		border-right: 5px solid transparent;
		border-top: 7px solid var(--pin-fill);
		margin-top: -2px;
	}

	:global(.spots-map-popup a) {
		color: rgb(var(--color-accent-rgb));
		text-decoration: underline;
		text-underline-offset: 2px;
	}
</style>
