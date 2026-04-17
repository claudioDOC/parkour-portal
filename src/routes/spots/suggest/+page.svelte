<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	const TECHNIQUES = [
		'Präzisionssprung', 'Schwingen', 'Flow', 'Armsprung',
		'Klettern', 'Tic-Tac', 'Vault', 'Balance',
		'Drops', 'Katz', 'Roofgap'
	];

	const WEATHER = ['trocken', 'nass'];

	let name = $state('');
	let city = $state('');
	let latitude = $state('');
	let longitude = $state('');
	let lighting = $state('teilweise');
	let selectedTechniques = $state<string[]>([]);
	let selectedWeather = $state<string[]>(['trocken', 'nass']);
	let description = $state('');
	let isMicro = $state(false);
	let parentSpotId = $state('');
	let parentCandidates = $state<{ id: number; name: string; city: string }[]>([]);
	let error = $state('');
	let loading = $state(false);
	let success = $state(false);

	let locationMode = $state<'search' | 'manual' | 'none'>('search');

	let addressQuery = $state('');
	let addressResults = $state<{ displayName: string; lat: number; lon: number; city: string }[]>([]);
	let searchingAddress = $state(false);
	let showAddressResults = $state(false);
	let selectedAddress = $state('');
	let searchTimeout: ReturnType<typeof setTimeout> | null = null;

	let imageFiles = $state<File[]>([]);
	let uploadingImages = $state(false);

	onMount(async () => {
		try {
			const res = await fetch('/api/spots', { credentials: 'include' });
			if (!res.ok) return;
			const data = (await res.json()) as {
				spots: { id: number; name: string; city: string; isMicro?: boolean }[];
			};
			parentCandidates = (data.spots || [])
				.filter((s) => !s.isMicro)
				.map((s) => ({ id: s.id, name: s.name, city: s.city }))
				.sort((a, b) => a.name.localeCompare(b.name, 'de'));
		} catch {
			// Optionales Feature: Parent-Liste bleibt leer bei Fehler.
		}
	});

	function toggleItem(list: string[], item: string): string[] {
		if (list.includes(item)) return list.filter(i => i !== item);
		return [...list, item];
	}

	function handleAddressInput() {
		if (searchTimeout) clearTimeout(searchTimeout);

		if (addressQuery.length < 3) {
			addressResults = [];
			showAddressResults = false;
			return;
		}

		searchTimeout = setTimeout(async () => {
			searchingAddress = true;
			try {
				const res = await fetch(`/api/geocode?q=${encodeURIComponent(addressQuery)}`);
				const data = await res.json();
				addressResults = data.results;
				showAddressResults = addressResults.length > 0;
			} finally {
				searchingAddress = false;
			}
		}, 400);
	}

	function selectAddress(result: typeof addressResults[0]) {
		latitude = String(result.lat);
		longitude = String(result.lon);
		selectedAddress = result.displayName;
		addressQuery = result.displayName.split(',').slice(0, 2).join(',').trim();
		showAddressResults = false;

		if (result.city && !city) {
			city = result.city;
		}
	}

	function clearAddress() {
		latitude = '';
		longitude = '';
		selectedAddress = '';
		addressQuery = '';
		addressResults = [];
	}

	function switchLocationMode(mode: typeof locationMode) {
		clearAddress();
		locationMode = mode;
	}

	function handleImageSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		if (input.files) {
			imageFiles = [...imageFiles, ...Array.from(input.files)];
			input.value = '';
		}
	}

	function removeImage(index: number) {
		imageFiles = imageFiles.filter((_, i) => i !== index);
	}

	async function uploadImages(spotId: number): Promise<boolean> {
		uploadingImages = true;
		try {
			for (const file of imageFiles) {
				const formData = new FormData();
				formData.append('image', file);
				formData.append('spotId', String(spotId));
				const res = await fetch('/api/spots/images', {
					method: 'POST',
					body: formData,
					credentials: 'include'
				});
				const raw = await res.text();
				let result: { error?: string } = {};
				try {
					result = raw ? JSON.parse(raw) : {};
				} catch {
					result = {};
				}
				if (!res.ok) {
					const msg =
						res.status === 413
							? 'Bild zu gross (Server/nginx-Limit). README: BODY_SIZE_LIMIT & client_max_body_size.'
							: result.error || 'Bild-Upload fehlgeschlagen';
					error = msg;
					return false;
				}
			}
			return true;
		} finally {
			uploadingImages = false;
		}
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		error = '';

		if (selectedWeather.length === 0) {
			error = 'Bitte mindestens eine Wetter-Eignung wählen';
			return;
		}

		loading = true;

		try {
			const res = await fetch('/api/spots', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name, city,
					latitude: latitude ? parseFloat(latitude) : null,
					longitude: longitude ? parseFloat(longitude) : null,
					lighting,
					techniques: selectedTechniques,
					goodWeather: selectedWeather,
					description,
					isMicro,
					parentSpotId: isMicro && parentSpotId ? Number(parentSpotId) : null
				})
			});

			const data = await res.json();

			if (!res.ok) {
				error = data.error;
				return;
			}

			if (imageFiles.length > 0) {
				const uploadsOk = await uploadImages(data.spot.id);
				if (!uploadsOk) return;
			}

			success = true;
			setTimeout(() => goto(`/spots/${data.spot.id}`), 1500);
		} catch {
			error = 'Verbindungsfehler';
		} finally {
			loading = false;
		}
	}
</script>

<div class="space-y-6 max-w-2xl">
	<div>
		<a href="/spots" class="btn-link btn-link-ghost">← Zurück zu Spots</a>
		<h2 class="text-2xl font-bold text-text-primary mt-2">Spot hinzufügen</h2>
		<p class="text-text-secondary mt-1">Neuen Spot für die Gruppe eintragen.</p>
	</div>

	{#if success}
		<div class="bg-success/10 border border-success/30 text-success rounded-xl p-6 text-center">
			<p class="text-lg font-semibold">Spot hinzugefügt!</p>
			<p class="text-sm mt-1">Du wirst weitergeleitet...</p>
		</div>
	{:else}
		<form onsubmit={handleSubmit} class="bg-bg-card rounded-xl border border-border p-6 space-y-5">
			{#if error}
				<div class="bg-danger/10 border border-danger/30 text-danger rounded-lg p-3 text-sm">{error}</div>
			{/if}

			<div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
				<div>
					<label for="name" class="block text-text-secondary text-sm font-medium mb-2">Name *</label>
					<input id="name" type="text" bind:value={name} required
						class="w-full bg-bg-secondary border border-border rounded-lg px-4 py-3 text-text-primary focus:outline-none focus:border-accent transition-colors"
						placeholder="z.B. Bahnhof Thun" />
				</div>
				<div>
					<label for="city" class="block text-text-secondary text-sm font-medium mb-2">Stadt *</label>
					<input id="city" type="text" bind:value={city} required
						class="w-full bg-bg-secondary border border-border rounded-lg px-4 py-3 text-text-primary focus:outline-none focus:border-accent transition-colors"
						placeholder="z.B. Thun" />
				</div>
			</div>

			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<div class="bg-bg-secondary rounded-lg p-3 border border-border/70">
					<label class="inline-flex items-center gap-2 cursor-pointer text-sm text-text-primary">
						<input
							type="checkbox"
							checked={isMicro}
							onchange={(e) => (isMicro = (e.currentTarget as HTMLInputElement).checked)}
							class="h-4 w-4 accent-[var(--color-accent)]"
						/>
						Als Microspot markieren
					</label>
					<p class="text-text-muted text-xs mt-1">Für kurze Sessions / kleine Gruppen.</p>
				</div>
				<div>
					<label for="parent-spot" class="block text-text-secondary text-sm font-medium mb-2">Hauptspot (optional)</label>
					<select
						id="parent-spot"
						bind:value={parentSpotId}
						disabled={!isMicro}
						class="w-full bg-bg-secondary border border-border rounded-lg px-4 py-3 text-text-primary focus:outline-none focus:border-accent disabled:opacity-50"
					>
						<option value="">Kein Hauptspot</option>
						{#each parentCandidates as spot}
							<option value={spot.id}>{spot.name} ({spot.city})</option>
						{/each}
					</select>
				</div>
			</div>

			<!-- Standort -->
			<div>
				<p class="text-text-secondary text-sm font-medium mb-2">Standort (optional)</p>
				<div class="flex gap-1 bg-bg-secondary rounded-lg p-1 mb-3">
					{#each [
						{ id: 'search' as const, label: 'Adresse suchen' },
						{ id: 'manual' as const, label: 'Koordinaten' },
						{ id: 'none' as const, label: 'Ohne' }
					] as mode}
						<button type="button" onclick={() => switchLocationMode(mode.id)}
							class="flex-1 px-3 py-2 rounded-md text-xs font-medium transition-colors cursor-pointer {locationMode === mode.id ? 'bg-bg-card text-text-primary shadow-sm' : 'text-text-muted hover:text-text-secondary'}">
							{mode.label}
						</button>
					{/each}
				</div>

				{#if locationMode === 'search'}
					<div class="relative">
						<div class="flex gap-2">
							<div class="relative flex-1">
								<input
									id="address"
									type="text"
									bind:value={addressQuery}
									oninput={handleAddressInput}
									onfocus={() => { if (addressResults.length > 0) showAddressResults = true; }}
									class="w-full bg-bg-secondary border border-border rounded-lg px-4 py-3 text-text-primary focus:outline-none focus:border-accent transition-colors pr-10"
									placeholder="z.B. Frutiger AG Thun"
								/>
								{#if searchingAddress}
									<div class="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">...</div>
								{/if}
							</div>
							{#if selectedAddress}
								<button type="button" onclick={clearAddress}
									class="bg-bg-secondary border border-border hover:border-danger hover:text-danger text-text-muted px-3 rounded-lg transition-colors text-sm shrink-0">
									×
								</button>
							{/if}
						</div>

						{#if showAddressResults}
							<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
							<div class="fixed inset-0 z-40" onclick={() => showAddressResults = false}></div>
							<div class="absolute z-50 top-full left-0 right-0 mt-1 bg-bg-secondary border border-border rounded-lg overflow-hidden shadow-xl max-h-60 overflow-y-auto">
								{#each addressResults as result}
									<button type="button" onclick={() => selectAddress(result)}
										class="w-full text-left px-4 py-3 hover:bg-bg-hover transition-colors border-b border-border last:border-b-0">
										<p class="text-text-primary text-sm leading-snug">{result.displayName.split(',').slice(0, 3).join(',')}</p>
										<p class="text-text-muted text-xs mt-0.5">{result.displayName}</p>
									</button>
								{/each}
							</div>
						{/if}
					</div>

					{#if selectedAddress}
						<div class="mt-2 bg-accent/10 border border-accent/30 rounded-lg px-3 py-2">
							<p class="text-accent text-xs font-medium">Standort gewählt</p>
							<p class="text-text-secondary text-xs mt-0.5">{selectedAddress.split(',').slice(0, 3).join(',')}</p>
							<p class="text-text-muted text-xs">Koordinaten: {parseFloat(latitude).toFixed(5)}, {parseFloat(longitude).toFixed(5)}</p>
						</div>
					{:else}
						<p class="text-text-muted text-xs mt-1.5">Tippe eine Adresse, Firma oder einen Ort ein (mind. 3 Zeichen)</p>
					{/if}

				{:else if locationMode === 'manual'}
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div>
							<label for="lat" class="block text-text-muted text-xs mb-1">Breitengrad</label>
							<input id="lat" type="text" bind:value={latitude}
								class="w-full bg-bg-secondary border border-border rounded-lg px-4 py-3 text-text-primary focus:outline-none focus:border-accent transition-colors"
								placeholder="z.B. 46.7580" />
						</div>
						<div>
							<label for="lng" class="block text-text-muted text-xs mb-1">Längengrad</label>
							<input id="lng" type="text" bind:value={longitude}
								class="w-full bg-bg-secondary border border-border rounded-lg px-4 py-3 text-text-primary focus:outline-none focus:border-accent transition-colors"
								placeholder="z.B. 7.6280" />
						</div>
					</div>

				{:else}
					<p class="text-text-muted text-xs">Spot wird ohne Standort gespeichert. Du kannst ihn später ergänzen.</p>
				{/if}
			</div>

			<!-- Kerntechniken -->
			<div>
				<p class="text-text-secondary text-sm font-medium mb-3">Kerntechniken</p>
				<div class="flex flex-wrap gap-2">
					{#each TECHNIQUES as tech}
						<button
							type="button"
							onclick={() => selectedTechniques = toggleItem(selectedTechniques, tech)}
							class="px-3 py-1.5 rounded-full text-sm font-medium border-2 transition-all {selectedTechniques.includes(tech) ? 'border-accent bg-accent/15 text-accent' : 'border-border bg-bg-secondary text-text-secondary hover:border-text-muted'}"
						>
							{tech}
						</button>
					{/each}
				</div>
			</div>

			<!-- Wetter-Eignung -->
			<div>
				<p class="text-text-secondary text-sm font-medium mb-3">Gut bei welchem Wetter? *</p>
				<div class="flex gap-3">
					{#each WEATHER as w}
						<button
							type="button"
							onclick={() => selectedWeather = toggleItem(selectedWeather, w)}
							class="flex-1 px-4 py-3 rounded-xl border-2 text-center text-sm font-medium transition-all capitalize {selectedWeather.includes(w) ? 'border-accent bg-accent/15 text-accent' : 'border-border bg-bg-secondary text-text-secondary hover:border-text-muted'}"
						>
							{w === 'trocken' ? '☀️ Trocken' : '🌧️ Nass'}
						</button>
					{/each}
				</div>
				<p class="text-text-muted text-xs mt-2">Beides heißt: Spot geht immer</p>
			</div>

			<!-- Beleuchtung -->
			<div>
				<label for="light" class="block text-text-secondary text-sm font-medium mb-2">Beleuchtung</label>
				<select id="light" bind:value={lighting}
					class="w-full bg-bg-secondary border border-border rounded-lg px-4 py-3 text-text-primary focus:outline-none focus:border-accent">
					<option value="ja">Ja</option>
					<option value="teilweise">Teilweise</option>
					<option value="nein">Nein</option>
				</select>
			</div>

			<!-- Bilder -->
			<div>
				<p class="text-text-secondary text-sm font-medium mb-3">Bilder</p>
				{#if imageFiles.length > 0}
					<div class="grid grid-cols-3 gap-2 mb-3">
						{#each imageFiles as file, i}
							<div class="relative rounded-lg overflow-hidden bg-bg-secondary h-24">
								<img src={URL.createObjectURL(file)} alt="Preview" class="w-full h-full object-cover" />
								<button
									type="button"
									onclick={() => removeImage(i)}
									class="absolute top-1 right-1 bg-black/60 hover:bg-danger/80 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs"
								>
									×
								</button>
							</div>
						{/each}
					</div>
				{/if}
				<label class="inline-block bg-bg-secondary hover:bg-bg-hover border border-border border-dashed px-4 py-2.5 rounded-lg text-sm text-text-secondary cursor-pointer transition-colors">
					+ Bilder hinzufügen
					<input type="file" accept="image/jpeg,image/png,image/webp" multiple class="hidden" onchange={handleImageSelect} />
				</label>
				<p class="text-text-muted text-xs mt-1">JPG, PNG oder WebP, max. 5MB pro Bild</p>
			</div>

			<div>
				<label for="desc" class="block text-text-secondary text-sm font-medium mb-2">Beschreibung</label>
				<textarea id="desc" bind:value={description} rows="3"
					class="w-full bg-bg-secondary border border-border rounded-lg px-4 py-3 text-text-primary focus:outline-none focus:border-accent transition-colors resize-none"
					placeholder="Was macht diesen Spot besonders?"></textarea>
			</div>

			<button
				type="submit"
				disabled={loading || uploadingImages}
				class="w-full cursor-pointer rounded-lg bg-accent px-4 py-3 font-semibold text-[#0c0c0e] transition-colors hover:bg-accent-hover disabled:opacity-50"
			>
				{#if uploadingImages}
					Bilder werden hochgeladen...
				{:else if loading}
					Wird gespeichert...
				{:else}
					Spot hinzufügen
				{/if}
			</button>
		</form>
	{/if}
</div>
