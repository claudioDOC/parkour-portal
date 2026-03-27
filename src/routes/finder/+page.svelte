<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type Step = 'start' | 'city' | 'weather' | 'technique' | 'result';

	let currentStep = $state<Step>('start');
	let loading = $state(false);

	let answers = $state({
		useAutoWeather: false,
		city: 'egal',
		weatherCondition: 'egal' as 'trocken' | 'nass' | 'egal',
		isDark: false,
		technique: 'egal'
	});

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
	let votedSpotId = $state<number | null>(null);

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
			city: 'egal',
			weatherCondition: 'egal',
			isDark: false,
			technique: 'egal'
		};
		results = [];
		currentStep = 'start';
	}

	async function findSpots() {
		loading = true;
		try {
			const res = await fetch('/api/finder', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(answers)
			});
			const data = await res.json();
			results = data.results;
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
		if (!data.nextOpenSessionId) return;
		votingSpotId = spotId;
		try {
			const res = await fetch('/api/training', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'vote_spot', sessionId: data.nextOpenSessionId, spotId })
			});
			if (res.ok) votedSpotId = spotId;
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
			<p class="text-text-secondary text-sm mb-6">Wo willst du heute trainieren?</p>

			<div class="grid grid-cols-2 gap-3">
				<button
					onclick={() => answers.city = 'egal'}
					class="p-4 rounded-xl border-2 text-left transition-all {answers.city === 'egal' ? 'border-accent bg-accent/10' : 'border-border bg-bg-secondary hover:border-text-muted'}"
				>
					<span class="text-lg">🌍</span>
					<p class="font-medium text-text-primary mt-1">Egal</p>
					<p class="text-text-muted text-xs">Alle Städte</p>
				</button>
				{#each data.cities as city}
					<button
						onclick={() => answers.city = city}
						class="p-4 rounded-xl border-2 text-left transition-all {answers.city === city ? 'border-accent bg-accent/10' : 'border-border bg-bg-secondary hover:border-text-muted'}"
					>
						<span class="text-lg">📍</span>
						<p class="font-medium text-text-primary mt-1">{city}</p>
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
			<p class="text-text-secondary text-sm mb-6">Optional: Wonach suchst du?</p>

			<div class="grid grid-cols-2 gap-3">
				<button
					onclick={() => answers.technique = 'egal'}
					class="p-4 rounded-xl border-2 text-left transition-all {answers.technique === 'egal' ? 'border-accent bg-accent/10' : 'border-border bg-bg-secondary hover:border-text-muted'}"
				>
					<span class="text-lg">🤸</span>
					<p class="font-medium text-text-primary mt-1">Egal</p>
					<p class="text-text-muted text-xs">Alles passt</p>
				</button>
				{#each data.techniques as tech}
					<button
						onclick={() => answers.technique = tech}
						class="p-4 rounded-xl border-2 text-left transition-all {answers.technique === tech ? 'border-accent bg-accent/10' : 'border-border bg-bg-secondary hover:border-text-muted'}"
					>
						<p class="font-medium text-text-primary">{tech}</p>
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
				{#if votedSpotId}
					<div class="bg-success/10 border border-success/30 text-success rounded-lg p-3 text-sm mb-4">
						Spot wurde fürs nächste Training gevoted! <a href="/training" class="underline font-medium">Zum Training →</a>
					</div>
				{/if}
				<div class="space-y-4">
					{#each results as spot, i}
						<div class="bg-bg-secondary rounded-xl p-5 border border-border {votedSpotId === spot.id ? 'border-accent/50' : ''} transition-colors">
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
									{#if data.nextOpenSessionId}
										<div class="mt-3">
											{#if votedSpotId === spot.id}
												<span class="text-success text-xs font-medium">✓ Gevoted fürs Training</span>
											{:else}
												<button
													onclick={() => voteForTraining(spot.id)}
													disabled={votingSpotId !== null || votedSpotId !== null}
													class="bg-accent/15 hover:bg-accent/25 text-accent text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
												>
													{votingSpotId === spot.id ? '...' : 'Fürs nächste Training voten'}
												</button>
											{/if}
										</div>
									{/if}
								</div>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		{/if}

		<div class="flex justify-between mt-8 pt-6 border-t border-border">
			{#if currentStep !== 'start'}
				<button
					onclick={currentStep === 'result' ? restart : prevStep}
					class="text-text-secondary hover:text-text-primary transition-colors text-sm font-medium"
				>
					{currentStep === 'result' ? 'Nochmal starten' : '← Zurück'}
				</button>
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
