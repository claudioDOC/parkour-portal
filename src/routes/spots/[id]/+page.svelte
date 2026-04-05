<script lang="ts">
	import { invalidateAll, goto } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let hoverScore = $state(0);
	let voting = $state(false);
	let uploading = $state(false);
	let fileInput = $state<HTMLInputElement | null>(null);
	let trainingVoting = $state(false);
	let trainingVoted = $state(false);

	const TECHNIQUES = [
		'Präzisionssprung', 'Schwingen', 'Flow', 'Armsprung',
		'Klettern', 'Tic-Tac', 'Vault', 'Balance',
		'Drops', 'Katz', 'Roofgap'
	];
	const WEATHER = ['trocken', 'nass'];

	const lightingLabels: Record<string, string> = { ja: 'Ja', nein: 'Nein', teilweise: 'Teilweise' };
	const isAdmin = $derived(data.user?.role === 'admin');
	const canEditSpots = $derived(data.user?.role === 'admin' || data.user?.role === 'spotmanager');

	const techniquesArr = $derived(
		(data.spot.techniques || '').split(',').filter(Boolean).map(t => t.trim())
	);

	const weatherArr = $derived(
		(data.spot.goodWeather || '').split(',').filter(Boolean).map(w => w.trim())
	);

	let showDeleteConfirm = $state(false);
	let showImageDeleteConfirm = $state<number | null>(null);
	let deleting = $state(false);

	let editing = $state(false);
	let editName = $state('');
	let editCity = $state('');
	let editLatitude = $state('');
	let editLongitude = $state('');
	let editLighting = $state('teilweise');
	let editTechniques = $state<string[]>([]);
	let editWeather = $state<string[]>([]);
	let editDescription = $state('');
	let editError = $state('');
	let saving = $state(false);

	function startEdit() {
		editName = data.spot.name;
		editCity = data.spot.city;
		editLatitude = data.spot.latitude ? String(data.spot.latitude) : '';
		editLongitude = data.spot.longitude ? String(data.spot.longitude) : '';
		editLighting = data.spot.lighting;
		editTechniques = techniquesArr.slice();
		editWeather = weatherArr.slice();
		editDescription = data.spot.description || '';
		editError = '';
		editing = true;
	}

	function toggleItem(list: string[], item: string): string[] {
		if (list.includes(item)) return list.filter(i => i !== item);
		return [...list, item];
	}

	async function saveEdit() {
		editError = '';
		if (!editName || !editCity) { editError = 'Name und Stadt erforderlich'; return; }
		if (editWeather.length === 0) { editError = 'Mindestens eine Wetter-Eignung wählen'; return; }

		saving = true;
		try {
			const res = await fetch('/api/admin/spots', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					spotId: data.spot.id,
					action: 'edit',
					name: editName,
					city: editCity,
					latitude: editLatitude ? parseFloat(editLatitude) : null,
					longitude: editLongitude ? parseFloat(editLongitude) : null,
					lighting: editLighting,
					techniques: editTechniques,
					goodWeather: editWeather,
					description: editDescription
				})
			});
			const result = await res.json();
			if (!res.ok) { editError = result.error; return; }
			editing = false;
			await invalidateAll();
		} finally {
			saving = false;
		}
	}

	async function trashSpot() {
		deleting = true;
		try {
			const res = await fetch('/api/admin/spots', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ spotId: data.spot.id, action: 'trash' })
			});
			if (res.ok) goto('/spots');
		} finally {
			deleting = false;
			showDeleteConfirm = false;
		}
	}

	async function vote(score: number) {
		voting = true;
		try {
			await fetch('/api/spots/vote', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ spotId: data.spot.id, score })
			});
			await invalidateAll();
		} finally {
			voting = false;
		}
	}

	async function removeVote() {
		voting = true;
		try {
			await fetch('/api/spots/vote', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ spotId: data.spot.id })
			});
			await invalidateAll();
		} finally {
			voting = false;
		}
	}

	async function uploadImage(e: Event) {
		const target = e.target as HTMLInputElement;
		const file = target.files?.[0];
		if (!file) return;

		uploading = true;
		try {
			const formData = new FormData();
			formData.append('image', file);
			formData.append('spotId', String(data.spot.id));

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
				const hint =
					res.status === 413
						? 'Datei zu gross (nginx: client_max_body_size / Server: BODY_SIZE_LIMIT). Siehe README.'
						: result.error || raw?.slice(0, 120) || 'Upload fehlgeschlagen';
				alert(hint);
				return;
			}

			await invalidateAll();
		} finally {
			uploading = false;
			if (fileInput) fileInput.value = '';
		}
	}

	async function voteForTraining() {
		if (!data.nextOpenSessionId) return;
		trainingVoting = true;
		try {
			const res = await fetch('/api/training', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'vote_spot', sessionId: data.nextOpenSessionId, spotId: data.spot.id })
			});
			if (res.ok) trainingVoted = true;
		} finally {
			trainingVoting = false;
		}
	}

	async function deleteImage() {
		if (showImageDeleteConfirm === null) return;
		const imageId = showImageDeleteConfirm;
		showImageDeleteConfirm = null;

		await fetch('/api/spots/images', {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ imageId })
		});
		await invalidateAll();
	}
</script>

{#if showDeleteConfirm}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="fixed inset-0 z-[100] flex items-center justify-center bg-black/70" onclick={() => showDeleteConfirm = false}>
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div class="bg-bg-card border border-border rounded-xl p-6 max-w-sm mx-4 shadow-2xl" onclick={(e) => e.stopPropagation()}>
			<h3 class="text-lg font-semibold text-text-primary mb-2">Spot in Papierkorb?</h3>
			<p class="text-text-secondary text-sm mb-1">
				<span class="font-medium text-text-primary">{data.spot.name}</span> wird ausgeblendet.
			</p>
			<p class="text-text-muted text-xs mb-4">Alle Daten bleiben erhalten. Du kannst den Spot jederzeit im Admin-Bereich wiederherstellen.</p>
			<div class="flex gap-2 justify-end">
				<button onclick={() => showDeleteConfirm = false}
					class="px-4 py-2 rounded-lg text-sm text-text-secondary bg-bg-secondary hover:bg-bg-hover border border-border transition-colors cursor-pointer">
					Abbrechen
				</button>
				<button onclick={trashSpot} disabled={deleting}
					class="px-4 py-2 rounded-lg text-sm font-medium text-white bg-warning hover:bg-warning/80 disabled:opacity-50 transition-colors cursor-pointer">
					{deleting ? '...' : 'In Papierkorb'}
				</button>
			</div>
		</div>
	</div>
{/if}

{#if showImageDeleteConfirm !== null}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="fixed inset-0 z-[100] flex items-center justify-center bg-black/70" onclick={() => showImageDeleteConfirm = null}>
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div class="bg-bg-card border border-border rounded-xl p-6 max-w-sm mx-4 shadow-2xl" onclick={(e) => e.stopPropagation()}>
			<h3 class="text-lg font-semibold text-text-primary mb-2">Bild löschen?</h3>
			<p class="text-text-secondary text-sm mb-4">Das Bild wird dauerhaft entfernt.</p>
			<div class="flex gap-2 justify-end">
				<button onclick={() => showImageDeleteConfirm = null}
					class="px-4 py-2 rounded-lg text-sm text-text-secondary bg-bg-secondary hover:bg-bg-hover border border-border transition-colors cursor-pointer">
					Abbrechen
				</button>
				<button onclick={deleteImage}
					class="px-4 py-2 rounded-lg text-sm font-medium text-white bg-danger hover:bg-danger/80 transition-colors cursor-pointer">
					Löschen
				</button>
			</div>
		</div>
	</div>
{/if}

<div class="space-y-6">
	<a href="/spots" class="text-text-secondary hover:text-accent text-sm transition-colors">← Zurück zu Spots</a>

	{#if data.spot.deleted}
		<div class="bg-warning/10 border border-warning/30 text-warning rounded-lg p-3 text-sm">
			Dieser Spot ist im Papierkorb und nur für Admins sichtbar.
		</div>
	{/if}

	{#if data.images.length > 0}
		<div class="grid grid-cols-2 md:grid-cols-3 gap-3">
			{#each data.images as img}
				<div class="relative group rounded-xl overflow-hidden bg-bg-secondary">
					<img src={img.url} alt={data.spot.name} class="w-full h-full object-cover" />
					{#if img.uploadedBy === data.user?.id || isAdmin}
						<button
							onclick={() => showImageDeleteConfirm = img.id}
							class="absolute top-2 right-2 bg-black/60 hover:bg-danger/80 text-white w-7 h-7 rounded-full flex items-center justify-center text-sm opacity-0 group-hover:opacity-100 transition-opacity"
						>
							×
						</button>
					{/if}
				</div>
			{/each}
		</div>
	{/if}

	{#if editing}
		<div class="bg-bg-card rounded-xl border border-accent/50 p-6 space-y-5">
			<div class="flex items-center justify-between">
				<h3 class="text-lg font-semibold text-text-primary">Spot bearbeiten</h3>
				<button onclick={() => editing = false} class="text-text-muted hover:text-text-primary text-sm cursor-pointer">Abbrechen</button>
			</div>

			{#if editError}
				<div class="bg-danger/10 border border-danger/30 text-danger rounded-lg p-3 text-sm">{editError}</div>
			{/if}

			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<div>
					<label for="edit-name" class="block text-text-secondary text-sm font-medium mb-1">Name *</label>
					<input id="edit-name" type="text" bind:value={editName}
						class="w-full bg-bg-secondary border border-border rounded-lg px-3 py-2.5 text-text-primary text-sm focus:outline-none focus:border-accent" />
				</div>
				<div>
					<label for="edit-city" class="block text-text-secondary text-sm font-medium mb-1">Stadt *</label>
					<input id="edit-city" type="text" bind:value={editCity}
						class="w-full bg-bg-secondary border border-border rounded-lg px-3 py-2.5 text-text-primary text-sm focus:outline-none focus:border-accent" />
				</div>
			</div>

			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<div>
					<label for="edit-lat" class="block text-text-secondary text-sm font-medium mb-1">Breitengrad</label>
					<input id="edit-lat" type="text" bind:value={editLatitude}
						class="w-full bg-bg-secondary border border-border rounded-lg px-3 py-2.5 text-text-primary text-sm focus:outline-none focus:border-accent" />
				</div>
				<div>
					<label for="edit-lng" class="block text-text-secondary text-sm font-medium mb-1">Längengrad</label>
					<input id="edit-lng" type="text" bind:value={editLongitude}
						class="w-full bg-bg-secondary border border-border rounded-lg px-3 py-2.5 text-text-primary text-sm focus:outline-none focus:border-accent" />
				</div>
			</div>

			<div>
				<p class="text-text-secondary text-sm font-medium mb-2">Kerntechniken</p>
				<div class="flex flex-wrap gap-2">
					{#each TECHNIQUES as tech}
						<button type="button" onclick={() => editTechniques = toggleItem(editTechniques, tech)}
							class="px-3 py-1.5 rounded-full text-xs font-medium border-2 transition-all cursor-pointer {editTechniques.includes(tech) ? 'border-accent bg-accent/15 text-accent' : 'border-border bg-bg-secondary text-text-secondary hover:border-text-muted'}">
							{tech}
						</button>
					{/each}
				</div>
			</div>

			<div>
				<p class="text-text-secondary text-sm font-medium mb-2">Wetter-Eignung *</p>
				<div class="flex gap-3">
					{#each WEATHER as w}
						<button type="button" onclick={() => editWeather = toggleItem(editWeather, w)}
							class="flex-1 px-4 py-2.5 rounded-xl border-2 text-center text-sm font-medium transition-all cursor-pointer capitalize {editWeather.includes(w) ? 'border-accent bg-accent/15 text-accent' : 'border-border bg-bg-secondary text-text-secondary hover:border-text-muted'}">
							{w === 'trocken' ? '☀️ Trocken' : '🌧️ Nass'}
						</button>
					{/each}
				</div>
			</div>

			<div>
				<label for="edit-light" class="block text-text-secondary text-sm font-medium mb-1">Beleuchtung</label>
				<select id="edit-light" bind:value={editLighting}
					class="w-full bg-bg-secondary border border-border rounded-lg px-3 py-2.5 text-text-primary text-sm focus:outline-none focus:border-accent">
					<option value="ja">Ja</option>
					<option value="teilweise">Teilweise</option>
					<option value="nein">Nein</option>
				</select>
			</div>

			<div>
				<label for="edit-desc" class="block text-text-secondary text-sm font-medium mb-1">Beschreibung</label>
				<textarea id="edit-desc" bind:value={editDescription} rows="3"
					class="w-full bg-bg-secondary border border-border rounded-lg px-3 py-2.5 text-text-primary text-sm focus:outline-none focus:border-accent resize-none"></textarea>
			</div>

			<button onclick={saveEdit} disabled={saving}
				class="w-full cursor-pointer rounded-lg bg-accent px-4 py-3 font-semibold text-[#0c0c0e] transition-colors hover:bg-accent-hover disabled:opacity-50">
				{saving ? 'Wird gespeichert...' : 'Änderungen speichern'}
			</button>
		</div>

	{:else}
		<div class="bg-bg-card rounded-xl border border-border p-6 md:p-8">
			<div class="flex items-start justify-between gap-4 flex-wrap">
				<div>
					<h2 class="text-3xl font-bold text-text-primary">{data.spot.name}</h2>
					<p class="text-text-secondary text-lg mt-1">{data.spot.city}</p>
				</div>
				<div class="flex items-center gap-3">
					<div class="text-center">
						<p class="text-4xl font-bold text-accent">{Number(data.avgScore).toFixed(1)}</p>
						<p class="text-text-muted text-sm">{data.voteCount} Votes</p>
					</div>
				</div>
			</div>

		<div class="mt-4 flex gap-2 flex-wrap items-center">
				{#if data.nextOpenSessionId && !data.spot.deleted}
					{#if trainingVoted}
						<span class="text-xs bg-success/15 text-success px-3 py-1.5 rounded-lg font-medium">
							✓ Fürs Training gevoted · <a href="/training" class="underline">Zum Training</a>
						</span>
					{:else}
						<button onclick={voteForTraining} disabled={trainingVoting}
							class="text-xs bg-accent/15 hover:bg-accent/25 text-accent font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 cursor-pointer">
							{trainingVoting ? '...' : 'Fürs nächste Training voten'}
						</button>
					{/if}
				{/if}
				{#if canEditSpots}
					<button onclick={startEdit}
						class="text-xs bg-bg-secondary hover:bg-bg-hover border border-border px-3 py-1.5 rounded-lg text-text-secondary transition-colors cursor-pointer">
						Bearbeiten
					</button>
				{/if}
				{#if isAdmin}
					<button onclick={() => showDeleteConfirm = true}
						class="text-xs bg-warning/10 hover:bg-warning/20 border border-warning/30 px-3 py-1.5 rounded-lg text-warning transition-colors cursor-pointer">
						In Papierkorb
					</button>
				{/if}
			</div>

		{#if data.spot.description}
			<p class="text-text-secondary mt-4 leading-relaxed">{data.spot.description}</p>
		{/if}

		{#if data.spot.latitude && data.spot.longitude}
			<div class="mt-5 rounded-xl overflow-hidden border border-border">
				<iframe
					title="Spot-Standort"
					src="https://maps.google.com/maps?q={data.spot.latitude},{data.spot.longitude}&t=k&z=17&output=embed"
					width="100%"
					height="220"
					style="border:0;"
					allowfullscreen
					loading="lazy"
					referrerpolicy="no-referrer-when-downgrade"
				></iframe>
			</div>
		{/if}

		{#if techniquesArr.length > 0}
				<div class="mt-5">
					<p class="text-text-muted text-xs uppercase tracking-wide mb-2">Kerntechniken</p>
					<div class="flex flex-wrap gap-2">
						{#each techniquesArr as tech}
							<span class="text-sm bg-accent/15 text-accent px-3 py-1 rounded-full">{tech}</span>
						{/each}
					</div>
				</div>
			{/if}

			<div class="grid grid-cols-2 gap-4 mt-6">
				<div class="bg-bg-secondary rounded-lg p-4">
					<p class="text-text-muted text-xs uppercase tracking-wide">Beleuchtung</p>
					<p class="text-text-primary font-medium mt-1">{lightingLabels[data.spot.lighting]}</p>
				</div>
				<div class="bg-bg-secondary rounded-lg p-4">
					<p class="text-text-muted text-xs uppercase tracking-wide">Wetter</p>
					<div class="flex flex-wrap gap-1.5 mt-1">
						{#each weatherArr as w}
							<span class="text-sm text-text-primary font-medium capitalize">{w}</span>
						{/each}
					</div>
				</div>
			</div>

		{#if data.spot.latitude && data.spot.longitude}
			<div class="mt-6">
				<a
					href="https://www.google.com/maps?q={data.spot.latitude},{data.spot.longitude}"
					target="_blank"
					rel="noopener noreferrer"
					class="text-accent hover:underline text-sm"
				>
					Auf Google Maps öffnen →
				</a>
			</div>
		{/if}

			<div class="mt-6 pt-6 border-t border-border">
				<div class="flex items-center justify-between mb-3">
					<h3 class="text-lg font-semibold text-text-primary">Bilder</h3>
					<label class="bg-bg-secondary hover:bg-bg-hover border border-border px-4 py-2 rounded-lg text-sm text-text-primary transition-colors cursor-pointer {uploading ? 'opacity-50 pointer-events-none' : ''}">
						{uploading ? 'Wird hochgeladen...' : '+ Bild hochladen'}
						<input
							bind:this={fileInput}
							type="file"
							accept="image/jpeg,image/png,image/webp"
							class="hidden"
							onchange={uploadImage}
							disabled={uploading}
						/>
					</label>
				</div>
				{#if data.images.length === 0}
					<p class="text-text-muted text-sm">Noch keine Bilder. Sei der Erste!</p>
				{/if}
			</div>

			<div class="mt-6 pt-6 border-t border-border">
				<h3 class="text-lg font-semibold text-text-primary mb-3">Deine Bewertung</h3>
				<div class="flex items-center gap-1">
					{#each [1, 2, 3, 4, 5] as star}
						<button
							onclick={() => vote(star)}
							onmouseenter={() => hoverScore = star}
							onmouseleave={() => hoverScore = 0}
							disabled={voting}
							class="text-3xl transition-transform hover:scale-110 disabled:opacity-50 cursor-pointer"
						>
							{#if (hoverScore || data.userVote || 0) >= star}
								<span class="text-yellow-400">★</span>
							{:else}
								<span class="text-text-muted">☆</span>
							{/if}
						</button>
					{/each}
					{#if data.userVote}
						<span class="text-text-muted text-sm ml-3">Dein Vote: {data.userVote}/5</span>
						<button
							onclick={removeVote}
							disabled={voting}
							class="text-text-muted hover:text-danger text-sm ml-2 transition-colors disabled:opacity-50 cursor-pointer"
						>
							(entfernen)
						</button>
					{/if}
				</div>
			</div>

			<div class="mt-6 pt-4 border-t border-border">
				<p class="text-text-muted text-xs">Hinzugefügt von {data.spot.addedByName}</p>
			</div>
		</div>
	{/if}
</div>
