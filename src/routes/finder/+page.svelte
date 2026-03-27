<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { CITY_REGIONS } from '$lib/cityRegions';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type Step = 'start' | 'city' | 'weather' | 'technique' | 'result';

	let currentStep = $state<Step>('start');
	let loading = $state(false);

	let answers = $state({
		useAutoWeather: false,
		cityMode: 'all' as 'all' | 'pick',
		cityPick: [] as string[],
		weatherCondition: 'egal' as 'trocken' | 'nass' | 'egal',
		isDark: false,
		techniqueMode: 'all' as 'all' | 'pick',
		techniquePick: [] as string[]
	});

	const voteSessionId = $derived(data.voteSessionId ?? data.nextOpenSessionId ?? null);

	type SpotResult = {
		id: number;
		name: string;
		city: string;
		covered: boolean;
		lighting: string;
		techniques: string;
		goodWeather: string;
		description: string | null;
		avgScore: number;
		voteCount: number;
		finalScore: number;
	};

	let results = $state<SpotResult[]>([]);
	let votingSpotId = $state<number | null>(null);

	const steps: { key: Step; label: string; number: number }[] = [
		{ key: 'start', label: 'Start', number: 1 },
		{ key: 'city', label: 'Stadt', number: 2 },
		{ key: 'weather', label: 'Wetter', number: 3 },
		{ key: 'technique', label: 'Technik', number: 4 },
		{ key: 'result', label: 'Ergebnis', number: 5 }
	];

	function nextStep() {
		if (currentStep === 'start') {
			if (answers.useAutoWeather) {
				currentStep = 'city';
			} else {
				currentStep = 'city';
			}
		} else if (currentStep === 'city') {
			if (answers.useAutoWeather) {
				currentStep = 'technique';
			} else {
				currentStep = 'weather';
			}
		} else if (currentStep === 'weather') {
			currentStep = 'technique';
		} else if (currentStep === 'technique') {
			findSpots();
		}
	}

	function prevStep() {
		if (currentStep === 'city') currentStep = 'start';
		else if (currentStep === 'weather') currentStep = 'city';
		else if (currentStep === 'technique') {
			currentStep = answers.useAutoWeather ? 'city' : 'weather';
		}
		else if (currentStep === 'result') currentStep = 'technique';
	}

	function restart() {
		answers = {
			useAutoWeather: false,
			cityMode: 'all',
			cityPick: [],
			weatherCondition: 'egal',
			isDark: false,
			techniqueMode: 'all',
			techniquePick: []
		};
		results = [];
		currentStep = 'start';
	}

	function setCityAll() {
		answers.cityMode = 'all';
		answers.cityPick = [];
	}

	function toggleCity(city: string) {
		answers.cityMode = 'pick';
		if (answers.cityPick.includes(city)) {
			const next = answers.cityPick.filter((x) => x !== city);
			answers.cityPick = next;
			if (next.length === 0) answers.cityMode = 'all';
		} else {
			answers.cityPick = [...answers.cityPick, city];
		}
	}

	function regionCitiesActive(regionCities: string[]) {
		return regionCities.every((c) => answers.cityPick.includes(c));
	}

	function toggleRegion(regionCities: string[]) {
		answers.cityMode = 'pick';
		const allIn = regionCitiesActive(regionCities);
		if (allIn) {
			const next = answers.cityPick.filter((c) => !regionCities.includes(c));
			answers.cityPick = next;
			if (next.length === 0) answers.cityMode = 'all';
		} else {
			answers.cityPick = [...new Set([...answers.cityPick, ...regionCities])];
		}
	}

	function setTechniqueAll() {
		answers.techniqueMode = 'all';
		answers.techniquePick = [];
	}

	function toggleTechnique(tech: string) {
		answers.techniqueMode = 'pick';
		if (answers.techniquePick.includes(tech)) {
			const next = answers.techniquePick.filter((x) => x !== tech);
			answers.techniquePick = next;
			if (next.length === 0) answers.techniqueMode = 'all';
		} else {
			answers.techniquePick = [...answers.techniquePick, tech];
		}
	}

	async function findSpots() {
		loading = true;
		try {
			const res = await fetch('/api/finder', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					useAutoWeather: answers.useAutoWeather,
					weatherCondition: answers.weatherCondition,
					isDark: answers.isDark,
					cities: answers.cityMode === 'all' ? [] : answers.cityPick,
					techniques: answers.techniqueMode === 'all' ? [] : answers.techniquePick
				})
			});
			const json = await res.json();
			results = json.results;
			currentStep = 'result';
		} finally {
			loading = false;
		}
	}

	const weatherLabels: Record<string, string> = {
		trocken: 'Trocken',
		nass: 'Nass',
		egal: 'Egal'
	};

	async function voteForTraining(spotId: number) {
		if (!voteSessionId) return;
		votingSpotId = spotId;
		try {
			const res = await fetch('/api/training', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'vote_spot', sessionId: voteSessionId, spotId })
			});
			if (res.ok) {
				await invalidateAll();
				await goto('/training');
			}
		} finally {
			votingSpotId = null;
		}
	}
</script>

<div class="space-y-6 max-w-2xl mx-auto">
	<div class="text-center">
		<h2 class="text-2xl font-bold text-text-primary">Spot-Finder</h2>
		<p class="text-text-secondary mt-1">Beantworte ein paar Fragen und wir finden den perfekten Spot.</p>
	</div>

	<div class="flex items-center justify-center gap-2">
		{#each steps as step}
			<div class="flex items-center gap-2">
				<div class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors
					{currentStep === step.key ? 'bg-accent text-white' :
					 steps.findIndex(s => s.key === currentStep) > steps.findIndex(s => s.key === step.key) ? 'bg-accent/30 text-accent' : 'bg-bg-card text-text-muted border border-border'}">
					{step.number}
				</div>
				{#if step.key !== 'result'}
					<div class="w-6 h-0.5 {steps.findIndex(s => s.key === currentStep) > steps.findIndex(s => s.key === step.key) ? 'bg-accent/30' : 'bg-border'}"></div>
				{/if}
			</div>
		{/each}
	</div>

	<div class="bg-bg-card rounded-xl border border-border p-6 md:p-8">
		{#if currentStep === 'start'}
			<h3 class="text-xl font-semibold text-text-primary mb-2">Wie sollen wir das Wetter bestimmen?</h3>
			<p class="text-text-secondary text-sm mb-6">Wir können das aktuelle Wetter automatisch abfragen oder du gibst es manuell an.</p>

			<div class="space-y-3">
				<button
					onclick={() => answers.useAutoWeather = true}
					class="w-full p-5 rounded-xl border-2 text-left flex items-center gap-4 transition-all {answers.useAutoWeather ? 'border-accent bg-accent/10' : 'border-border bg-bg-secondary hover:border-text-muted'}"
				>
					<span class="text-2xl">🌤️</span>
					<div>
						<p class="font-medium text-text-primary">Aktuelles Wetter verwenden</p>
						<p class="text-text-muted text-xs">Wetterdaten werden automatisch für Thun abgefragt</p>
					</div>
				</button>
				<button
					onclick={() => answers.useAutoWeather = false}
					class="w-full p-5 rounded-xl border-2 text-left flex items-center gap-4 transition-all {!answers.useAutoWeather ? 'border-accent bg-accent/10' : 'border-border bg-bg-secondary hover:border-text-muted'}"
				>
					<span class="text-2xl">✍️</span>
					<div>
						<p class="font-medium text-text-primary">Manuell angeben</p>
						<p class="text-text-muted text-xs">Du sagst uns wie das Wetter ist</p>
					</div>
				</button>
			</div>

		{:else if currentStep === 'city'}
			<h3 class="text-xl font-semibold text-text-primary mb-2">In welcher Stadt?</h3>
			<p class="text-text-secondary text-sm mb-6">Zuerst Pendelregion wählen oder unten einzelne Orte – am Spot bleibt der genaue Ort erhalten.</p>

			<p class="text-text-secondary text-sm font-medium mb-3">Region (Arbeitsweg)</p>
			<div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
				{#each CITY_REGIONS as region}
					<button
						type="button"
						onclick={() => toggleRegion(region.cities)}
						class="p-4 rounded-xl border-2 text-left transition-all {answers.cityMode === 'pick' && regionCitiesActive(region.cities) ? 'border-accent bg-accent/10' : 'border-border bg-bg-secondary hover:border-text-muted'}"
					>
						<span class="text-lg">🗺️</span>
						<p class="font-medium text-text-primary mt-1">{region.label}</p>
						<p class="text-text-muted text-xs mt-1 leading-snug">{region.cities.join(', ')}</p>
						{#if answers.cityMode === 'pick' && regionCitiesActive(region.cities)}
							<p class="text-accent text-xs mt-1">Alle Orte dieser Region</p>
						{/if}
					</button>
				{/each}
			</div>

			<p class="text-text-secondary text-sm font-medium mb-3">Genauer Ort</p>
			<div class="grid grid-cols-2 gap-3">
				<button
					type="button"
					onclick={setCityAll}
					class="p-4 rounded-xl border-2 text-left transition-all {answers.cityMode === 'all' ? 'border-accent bg-accent/10' : 'border-border bg-bg-secondary hover:border-text-muted'}"
				>
					<span class="text-lg">🌍</span>
					<p class="font-medium text-text-primary mt-1">Alle Städte</p>
					<p class="text-text-muted text-xs">Kein Filter</p>
				</button>
				{#each data.cities as city}
					<button
						type="button"
						onclick={() => toggleCity(city)}
						class="p-4 rounded-xl border-2 text-left transition-all {answers.cityMode === 'pick' && answers.cityPick.includes(city) ? 'border-accent bg-accent/10' : 'border-border bg-bg-secondary hover:border-text-muted'}"
					>
						<span class="text-lg">📍</span>
						<p class="font-medium text-text-primary mt-1">{city}</p>
						{#if answers.cityPick.includes(city)}
							<p class="text-accent text-xs mt-0.5">Ausgewählt</p>
						{/if}
					</button>
				{/each}
			</div>

		{:else if currentStep === 'weather'}
			<h3 class="text-xl font-semibold text-text-primary mb-2">Wie ist das Wetter?</h3>
			<p class="text-text-secondary text-sm mb-6">Was trifft gerade zu?</p>

			<div class="space-y-4">
				<div>
					<p class="text-text-secondary text-sm font-medium mb-3">Wetterlage</p>
					<div class="grid grid-cols-3 gap-3">
						<button
							onclick={() => answers.weatherCondition = 'trocken'}
							class="p-4 rounded-xl border-2 text-center transition-all {answers.weatherCondition === 'trocken' ? 'border-accent bg-accent/10' : 'border-border bg-bg-secondary hover:border-text-muted'}"
						>
							<span class="text-2xl">☀️</span>
							<p class="font-medium text-text-primary mt-1 text-sm">Trocken</p>
						</button>
						<button
							onclick={() => answers.weatherCondition = 'nass'}
							class="p-4 rounded-xl border-2 text-center transition-all {answers.weatherCondition === 'nass' ? 'border-accent bg-accent/10' : 'border-border bg-bg-secondary hover:border-text-muted'}"
						>
							<span class="text-2xl">🌧️</span>
							<p class="font-medium text-text-primary mt-1 text-sm">Nass</p>
						</button>
						<button
							onclick={() => answers.weatherCondition = 'egal'}
							class="p-4 rounded-xl border-2 text-center transition-all {answers.weatherCondition === 'egal' ? 'border-accent bg-accent/10' : 'border-border bg-bg-secondary hover:border-text-muted'}"
						>
							<span class="text-2xl">🤷</span>
							<p class="font-medium text-text-primary mt-1 text-sm">Egal</p>
						</button>
					</div>
				</div>

				<button
					onclick={() => answers.isDark = !answers.isDark}
					class="w-full p-4 rounded-xl border-2 text-left flex items-center gap-4 transition-all {answers.isDark ? 'border-accent bg-accent/10' : 'border-border bg-bg-secondary hover:border-text-muted'}"
				>
					<span class="text-2xl">🌙</span>
					<div>
						<p class="font-medium text-text-primary">Es ist dunkel</p>
						<p class="text-text-muted text-xs">Nur beleuchtete Spots</p>
					</div>
				</button>
			</div>

		{:else if currentStep === 'technique'}
			<h3 class="text-xl font-semibold text-text-primary mb-2">Welche Kerntechnik?</h3>
			<p class="text-text-secondary text-sm mb-6">Mehrfachauswahl: Spot passt, wenn mindestens eine Technik vorkommt. Oder „Egal“.</p>

			<div class="grid grid-cols-2 gap-3">
				<button
					onclick={setTechniqueAll}
					class="p-4 rounded-xl border-2 text-left transition-all {answers.techniqueMode === 'all' ? 'border-accent bg-accent/10' : 'border-border bg-bg-secondary hover:border-text-muted'}"
				>
					<span class="text-lg">🤸</span>
					<p class="font-medium text-text-primary mt-1">Egal</p>
					<p class="text-text-muted text-xs">Kein Technik-Filter</p>
				</button>
				{#each data.techniques as tech}
					<button
						onclick={() => toggleTechnique(tech)}
						class="p-4 rounded-xl border-2 text-left transition-all {answers.techniqueMode === 'pick' && answers.techniquePick.includes(tech) ? 'border-accent bg-accent/10' : 'border-border bg-bg-secondary hover:border-text-muted'}"
					>
						<p class="font-medium text-text-primary">{tech}</p>
						{#if answers.techniquePick.includes(tech)}
							<p class="text-accent text-xs mt-1">Ausgewählt</p>
						{/if}
					</button>
				{/each}
			</div>

		{:else if currentStep === 'result'}
			<h3 class="text-xl font-semibold text-text-primary mb-2">Perfekte Spots für dich</h3>
			<p class="text-text-secondary text-sm mb-6">Basierend auf deinen Antworten</p>

			{#if results.length === 0}
				<div class="text-center py-8">
					<p class="text-text-muted text-lg">Keine passenden Spots gefunden</p>
					<p class="text-text-muted text-sm mt-1">Versuche weniger strenge Kriterien</p>
				</div>
			{:else}
				<div class="space-y-4">
					{#each results as spot, i}
						<div class="bg-bg-secondary rounded-xl p-5 border border-border transition-colors">
							<div class="flex items-start gap-4">
								<div class="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold shrink-0">
									{i + 1}
								</div>
								<div class="flex-1 min-w-0">
									<div class="flex items-start justify-between gap-2">
										<div>
											<a href="/spots/{spot.id}" class="font-semibold text-text-primary hover:text-accent transition-colors">{spot.name}</a>
											<p class="text-text-secondary text-sm">{spot.city}</p>
										</div>
										<div class="text-right shrink-0">
											<p class="text-accent font-bold">{Number(spot.avgScore).toFixed(1)}</p>
											<p class="text-text-muted text-xs">{spot.voteCount} Votes</p>
										</div>
									</div>
									<div class="flex flex-wrap gap-1.5 mt-2">
										<span class="text-xs bg-bg-hover text-text-secondary px-2 py-0.5 rounded-full">Licht: {spot.lighting}</span>
										{#each (spot.goodWeather || '').split(',').filter(Boolean) as w}
											<span class="text-xs bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-full capitalize">{w.trim()}</span>
										{/each}
										{#each (spot.techniques || '').split(',').filter(Boolean) as tech}
											<span class="text-xs bg-accent/15 text-accent px-2 py-0.5 rounded-full">{tech.trim()}</span>
										{/each}
									</div>
									{#if voteSessionId}
										<div class="mt-3">
											<button
												onclick={() => voteForTraining(spot.id)}
												disabled={votingSpotId !== null}
												class="bg-accent/15 hover:bg-accent/25 text-accent text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
											>
												{votingSpotId === spot.id ? '...' : 'Fürs Training voten & zur Übersicht'}
											</button>
										</div>
									{/if}
								</div>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		{/if}

		<div class="flex justify-between items-center gap-4 flex-wrap mt-8 pt-6 border-t border-border">
			{#if currentStep !== 'start'}
				<div class="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
					<button
						type="button"
						onclick={prevStep}
						class="text-text-secondary hover:text-text-primary transition-colors text-sm font-medium text-left"
					>
						← Zurück
					</button>
					{#if currentStep === 'result'}
						<button
							type="button"
							onclick={restart}
							class="text-text-muted hover:text-text-secondary transition-colors text-sm text-left sm:border-l sm:border-border sm:pl-4"
						>
							Von vorne
						</button>
					{/if}
				</div>
			{:else}
				<div></div>
			{/if}

			{#if currentStep !== 'result'}
				<button
					onclick={nextStep}
					disabled={loading}
					class="bg-accent hover:bg-accent-hover disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer"
				>
					{#if loading}
						Suche...
					{:else if currentStep === 'technique'}
						Spot finden!
					{:else}
						Weiter →
					{/if}
				</button>
			{/if}
		</div>
	</div>
</div>
