<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let filterCity = $state('');
	let filterTechnique = $state('');
	let filterSearch = $state('');

	const cities = $derived([...new Set(data.spots.map((s) => s.city))].sort());

	const allTechniques = $derived(() => {
		const set = new Set<string>();
		for (const s of data.spots) {
			if (s.techniques) {
				for (const t of s.techniques.split(',')) {
					if (t.trim()) set.add(t.trim());
				}
			}
		}
		return [...set].sort();
	});

	const filteredSpots = $derived(
		data.spots.filter((s) => {
			const q = filterSearch.trim().toLowerCase();
			if (q) {
				const haystack = `${s.name} ${s.city} ${s.parentSpotName || ''}`.toLowerCase();
				if (!haystack.includes(q)) return false;
			}
			if (filterCity && s.city !== filterCity) return false;
			if (filterTechnique && !(s.techniques || '').split(',').map(t => t.trim()).includes(filterTechnique)) return false;
			return true;
		})
	);
	const filteredMainSpots = $derived(filteredSpots.filter((s) => !s.isMicro));
	const filteredMicroSpots = $derived(filteredSpots.filter((s) => s.isMicro));

	const lightingLabels: Record<string, string> = { ja: 'Ja', nein: 'Nein', teilweise: 'Teilweise' };

	function weatherTags(gw: string): string[] {
		return (gw || '').split(',').map(w => w.trim()).filter(Boolean);
	}
</script>

<div class="space-y-6">
	<div class="flex items-start justify-between gap-4 flex-wrap">
		<div>
			<h2 class="text-2xl font-bold text-text-primary">Spots</h2>
			<p class="text-text-secondary mt-1">{data.spots.length} Spots im Raum Thun - Bern</p>
		</div>
		<a
			href="/spots/suggest"
			class="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-[#0c0c0e] transition-colors hover:bg-accent-hover"
		>
			+ Spot hinzufügen
		</a>
	</div>

	<div class="flex gap-3 flex-wrap">
		<input
			type="search"
			bind:value={filterSearch}
			placeholder="Spot suchen (Name, Stadt, Hauptspot)"
			class="min-w-[220px] flex-1 bg-bg-card border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
		/>
		<select bind:value={filterCity} class="bg-bg-card border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent">
			<option value="">Alle Städte</option>
			{#each cities as city}
				<option value={city}>{city}</option>
			{/each}
		</select>
		<select bind:value={filterTechnique} class="bg-bg-card border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent">
			<option value="">Alle Techniken</option>
			{#each allTechniques() as tech}
				<option value={tech}>{tech}</option>
			{/each}
		</select>
	</div>

	<div class="space-y-6">
		<div>
			<h3 class="text-sm font-semibold uppercase tracking-wide text-text-muted mb-3">Normale Spots</h3>
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
				{#each filteredMainSpots as spot}
					<a href="/spots/{spot.id}" class="bg-bg-card rounded-xl border border-border hover:border-accent/50 transition-colors block overflow-hidden group">
						{#if spot.thumbnail}
							<div class="h-36 overflow-hidden">
								<img src={spot.thumbnail} alt={spot.name} class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
							</div>
						{/if}
						<div class="p-5">
							<div class="flex items-start justify-between gap-2">
								<div class="min-w-0">
									<h3 class="font-semibold text-text-primary group-hover:text-accent transition-colors truncate">{spot.name}</h3>
									<p class="text-text-secondary text-sm">{spot.city}</p>
								</div>
								<div class="text-right shrink-0">
									<p class="text-accent font-bold text-lg">{Number(spot.avgScore).toFixed(1)}</p>
									<p class="text-text-muted text-xs">{spot.voteCount} Votes</p>
								</div>
							</div>

							<div class="flex flex-wrap gap-1.5 mt-3">
								<span class="text-xs bg-bg-hover text-text-secondary px-2 py-0.5 rounded-full">Licht: {lightingLabels[spot.lighting]}</span>
								{#each weatherTags(spot.goodWeather) as w}
									<span class="text-xs bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-full capitalize">{w}</span>
								{/each}
								{#each (spot.techniques || '').split(',').filter(Boolean).slice(0, 3) as tech}
									<span class="text-xs bg-accent/15 text-accent px-2 py-0.5 rounded-full">{tech.trim()}</span>
								{/each}
							</div>
						</div>
					</a>
				{/each}
				{#if filteredMainSpots.length === 0}
					<p class="text-text-muted text-center py-10 col-span-full">Keine normalen Spots gefunden</p>
				{/if}
			</div>
		</div>

		<div>
			<h3 class="text-sm font-semibold uppercase tracking-wide text-text-muted mb-3">Microspots</h3>
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
				{#each filteredMicroSpots as spot}
					<a href="/spots/{spot.id}" class="bg-bg-card rounded-xl border border-border/80 hover:border-accent/40 transition-colors block overflow-hidden group">
						<div class="p-5">
							<div class="flex items-start justify-between gap-2">
								<div class="min-w-0">
									<h3 class="font-semibold text-text-primary group-hover:text-accent transition-colors truncate">{spot.name}</h3>
									<p class="text-text-secondary text-sm">{spot.city}</p>
								</div>
								<div class="text-right shrink-0">
									<p class="text-accent font-bold text-lg">{Number(spot.avgScore).toFixed(1)}</p>
									<p class="text-text-muted text-xs">{spot.voteCount} Votes</p>
								</div>
							</div>
							<div class="flex flex-wrap gap-1.5 mt-3">
								<span class="text-xs bg-accent-blue/15 text-accent-blue px-2 py-0.5 rounded-full">Microspot</span>
								{#if spot.parentSpotName}
									<span class="text-xs bg-bg-hover text-text-secondary px-2 py-0.5 rounded-full">Bei {spot.parentSpotName}</span>
								{/if}
								{#each (spot.techniques || '').split(',').filter(Boolean).slice(0, 2) as tech}
									<span class="text-xs bg-accent/15 text-accent px-2 py-0.5 rounded-full">{tech.trim()}</span>
								{/each}
							</div>
						</div>
					</a>
				{/each}
				{#if filteredMicroSpots.length === 0}
					<p class="text-text-muted text-center py-10 col-span-full">Keine Microspots gefunden</p>
				{/if}
			</div>
		</div>
	</div>
</div>
