<script lang="ts">
	import { escapeHtml } from '$lib/escapeHtml';
	/**
	 * „Bin da" — Live-Standort am Spot: Wer teilt, sieht die anderen
	 * Teilenden als Avatar-Pins auf einer Karte und findet die Gruppe.
	 * Gegenstück zur App; gleiche API (/api/live-location), TTL 45 min.
	 */
	type Pos = {
		userId: number;
		username: string;
		avatar: string | null;
		latitude: number;
		longitude: number;
	};

	let open = $state(false);
	let live = $state<{ sharing: boolean; positions: Pos[] } | null>(null);
	let busy = $state(false);
	let err = $state('');
	let mapEl = $state<HTMLDivElement | null>(null);
	let leaflet: typeof import('leaflet') | null = null;
	let map: import('leaflet').Map | null = null;

	async function load() {
		err = '';
		try {
			const res = await fetch('/api/live-location', { credentials: 'include' });
			live = await res.json();
			await renderMap();
		} catch {
			err = 'Standorte nicht abrufbar.';
		}
	}

	async function share() {
		if (!navigator.geolocation) {
			err = 'Dein Browser unterstützt keine Standortabfrage.';
			return;
		}
		busy = true;
		err = '';
		navigator.geolocation.getCurrentPosition(
			async (pos) => {
				try {
					await fetch('/api/live-location', {
						method: 'POST',
						credentials: 'include',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							latitude: pos.coords.latitude,
							longitude: pos.coords.longitude
						})
					});
					await load();
				} finally {
					busy = false;
				}
			},
			() => {
				err = 'Standort nicht verfügbar — Erlaubnis erteilt?';
				busy = false;
			},
			{ enableHighAccuracy: true, timeout: 10000 }
		);
	}

	async function stop() {
		await fetch('/api/live-location', { method: 'DELETE', credentials: 'include' });
		await load();
	}

	async function renderMap() {
		if (!live?.sharing || live.positions.length === 0) return;
		// Auf das Karten-Div warten (rendert erst nach dem State-Update).
		await new Promise((r) => setTimeout(r, 0));
		if (!mapEl) return;
		if (!leaflet) {
			leaflet = await import('leaflet');
			await import('leaflet/dist/leaflet.css');
		}
		const L = leaflet;
		if (map) {
			map.remove();
			map = null;
		}
		map = L.map(mapEl, { zoomControl: true, scrollWheelZoom: false });
		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			attribution: '&copy; OpenStreetMap'
		}).addTo(map);
		const bounds = L.latLngBounds([]);
		for (const p of live.positions) {
			// Auch der Marker selbst ist HTML: Bildpfad und Anfangsbuchstabe
			// maskieren, sonst liesse sich über den Benutzernamen oder einen
			// manipulierten Pfad Markup einschleusen.
			const inner = p.avatar
				? `<div class="live-avatar" style="background-image:url('${escapeHtml(p.avatar)}')"></div>`
				: `<div class="live-avatar live-avatar-initial">${escapeHtml(p.username.slice(0, 1).toUpperCase())}</div>`;
			const icon = L.divIcon({
				className: 'live-avatar-marker',
				html: inner,
				iconSize: [38, 38],
				iconAnchor: [19, 19]
			});
			// Benutzername maskieren: bindPopup setzt den Text als HTML ein.
			L.marker([p.latitude, p.longitude], { icon }).addTo(map).bindPopup(escapeHtml(p.username));
			bounds.extend([p.latitude, p.longitude]);
		}
		map.fitBounds(bounds.pad(0.3), { maxZoom: 17 });
	}
</script>

<div class="mt-2">
	<button
		type="button"
		onclick={() => {
			open = !open;
			if (open) void load();
		}}
		class="cursor-pointer rounded-lg border border-accent/35 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/20"
	>
		📍 Bin da — wer ist am Spot?
	</button>

	{#if open}
		<div class="mt-2 rounded-lg border border-border bg-bg-secondary/50 p-3 space-y-2">
			{#if live === null}
				<p class="text-text-muted text-sm">Lade …</p>
			{:else if !live.sharing}
				<p class="text-text-secondary text-sm">
					Teile deinen Standort, um zu sehen, wer schon da ist. Sichtbar bist du nur
					für Leute, die ebenfalls teilen — nach 45 Minuten ohne Aktualisierung
					verschwindet dein Punkt automatisch.
				</p>
				<button
					type="button"
					onclick={share}
					disabled={busy}
					class="bg-accent/15 hover:bg-accent/25 text-accent px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50"
				>
					{busy ? 'Ortet …' : '📍 Meinen Standort teilen'}
				</button>
			{:else}
				<div bind:this={mapEl} class="h-64 w-full rounded-lg overflow-hidden"></div>
				<p class="text-text-muted text-xs">
					{live.positions.length === 1
						? 'Nur du teilst gerade — die anderen erscheinen, sobald sie auch teilen.'
						: `${live.positions.length} am Start: ${live.positions.map((p) => p.username).join(', ')}`}
				</p>
				<div class="flex gap-2">
					<button
						type="button"
						onclick={share}
						disabled={busy}
						class="bg-accent/15 hover:bg-accent/25 text-accent px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
					>
						{busy ? '…' : 'Aktualisieren'}
					</button>
					<button
						type="button"
						onclick={stop}
						class="bg-bg-hover hover:bg-bg-card text-text-secondary px-3 py-1.5 rounded-lg text-xs font-medium"
					>
						Nicht mehr teilen
					</button>
				</div>
			{/if}
			{#if err}
				<p class="text-danger text-xs">{err}</p>
			{/if}
		</div>
	{/if}
</div>

<style>
	:global(.live-avatar-marker) {
		background: transparent;
		border: none;
	}
	:global(.live-avatar) {
		width: 38px;
		height: 38px;
		border-radius: 50%;
		border: 3px solid var(--color-accent, #2563eb);
		background-size: cover;
		background-position: center;
		background-color: #fff;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
	}
	:global(.live-avatar-initial) {
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		color: #1e293b;
	}
</style>
