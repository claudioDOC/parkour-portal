<script lang="ts">
	import { formatStimmen } from '$lib/formatStimmen';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function formatDate(dateStr: string): string {
		const d = new Date(dateStr + 'T00:00:00');
		return d.toLocaleDateString('de-CH', { weekday: 'short', day: 'numeric', month: 'short' });
	}

	function isToday(dateStr: string): boolean {
		return dateStr === data.calendarToday;
	}

	/** „Heute“, „Morgen“, sonst „in N Tagen“ — fürs schnelle Einordnen. */
	function countdownLabel(dateStr: string): string {
		const target = new Date(dateStr + 'T00:00:00');
		const today = new Date(data.calendarToday + 'T00:00:00');
		const days = Math.round((target.getTime() - today.getTime()) / 86_400_000);
		if (days <= 0) return 'Heute';
		if (days === 1) return 'Morgen';
		return `in ${days} Tagen`;
	}

	function formatTripRange(start: string, end: string): string {
		const fmt = (d: string) =>
			new Date(`${d}T12:00:00`).toLocaleDateString('de-CH', { day: 'numeric', month: 'short' });
		return start === end ? fmt(start) : `${fmt(start)} – ${fmt(end)}`;
	}
	function formatDeadline(s: string | null): string {
		if (!s) return '–';
		return new Date(s.replace(' ', 'T') + 'Z').toLocaleDateString('de-CH', { weekday: 'short', day: 'numeric', month: 'short' });
	}
</script>

<div class="space-y-10">
	<header class="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-5">
		<div
			class="hidden h-14 w-1.5 shrink-0 rounded-sm bg-gradient-to-b from-accent via-accent-hot to-accent-hot/60 shadow-accent-bar-glow sm:block"
			aria-hidden="true"
		></div>
		<div class="min-w-0 space-y-1">
			<p class="font-display text-sm font-medium uppercase tracking-[0.35em] text-accent-hot">Übersicht</p>
			<div class="space-y-2">
				<h2 class="font-display text-4xl font-semibold uppercase tracking-[0.06em] text-text-primary md:text-5xl">
					Dashboard
				</h2>
				<div
					class="h-1.5 w-16 rounded-sm bg-gradient-to-r from-accent to-accent-hot sm:hidden"
					aria-hidden="true"
				></div>
			</div>
			<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
				{#if data.myStreak >= 2}
					<span
						class="rounded-full bg-accent-hot/15 px-2.5 py-0.5 text-xs font-semibold text-accent-hot"
						title="Trainings in Folge dabei"
					>
						🔥 {data.myStreak}er-Streak
					</span>
				{/if}
			</div>
		</div>
	</header>

	{#if data.zugkraft}
		<!-- Zugkraft: absichtlich klein. Eine Zeile Kopf, ein farbiger Balken als
		     Blickfang (an den Extremen mit Effekt), ein Satz. Die Details stehen
		     in der Statistik — das Dashboard soll nicht zugedeckt werden. -->
		{@const z = data.zugkraft}
		{@const tone =
			z.level.key === 'legendaer' || z.level.key === 'stark'
				? { text: 'text-success', bar: 'bg-success' }
				: z.level.key === 'solide'
					? { text: 'text-accent', bar: 'bg-accent' }
					: z.level.key === 'wackelig'
						? { text: 'text-warning', bar: 'bg-warning' }
						: { text: 'text-danger', bar: 'bg-danger' }}
		{@const fx =
			z.level.intensity === 2 ? (z.level.key === 'legendaer' ? 'zug-bar-glow' : 'zug-bar-alarm') : ''}
		<a href="/statistik" class="block rounded-lg px-1 py-1 transition-colors hover:bg-bg-hover" aria-label="Zugkraft der Gruppe — Details in der Statistik">
			<div class="flex items-baseline gap-2 text-sm">
				<span class="text-base {z.level.intensity === 2 ? 'zug-emoji' : ''}" aria-hidden="true">{z.level.emoji}</span>
				<span class="font-semibold tabular-nums {tone.text}">{z.percent}%</span>
				<span class="text-text-secondary">Zugkraft · {z.level.label}</span>
				{#if z.trend !== 0}
					<span class="text-xs {z.trend > 0 ? 'text-success' : 'text-danger'}" title="Gegenüber den 14 Tagen davor">
						{z.trend > 0 ? '↑' : '↓'}{Math.abs(z.trend)}
					</span>
				{/if}
				<span class="ml-auto text-xs text-text-muted tabular-nums">⌀ {z.avgPast}/{z.memberCount}</span>
			</div>
			<div class="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-bg-hover" aria-hidden="true">
				<div
					class="h-full rounded-full {tone.bar} {fx} transition-[width] duration-700"
					style="width: {Math.max(z.percent, 2)}%"
				></div>
			</div>
			<p class="mt-1 text-xs text-text-muted">{z.level.blurb}</p>
		</a>
	{/if}

	{#if data.nextTrip}
		<!-- Nächster Trip als eine Zeile — kein weiterer Block, nur ein Hinweis,
		     der auffällt, solange die Terminumfrage eine Antwort braucht. -->
		{@const t = data.nextTrip}
		{@const needsVote = t.pollOpen && !t.hasResponded && !t.deadlinePassed}
		<a
			href="/trips?trip={t.id}"
			class="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors {needsVote
				? 'border-accent/50 bg-accent/10 text-text-primary hover:bg-accent/15'
				: 'border-border bg-bg-card/60 text-text-secondary hover:bg-bg-hover'}"
		>
			<span aria-hidden="true">✈️</span>
			<span class="min-w-0 flex-1 truncate">
				<span class="font-semibold text-text-primary">{t.title}</span>
				<span class="text-text-muted"> · {formatTripRange(t.startDate, t.endDate)}</span>
			</span>
			<span class="shrink-0 text-xs font-semibold {needsVote ? 'text-accent' : 'text-text-muted'}">
				{#if t.locked}
					Termin fix
				{:else if needsVote}
					Abstimmen bis {formatDeadline(t.deadline)}
				{:else if t.pollOpen}
					{t.leaderYes}/{t.minYes} Zusagen
				{:else}
					{t.joinedCount} dabei
				{/if}
			</span>
		</a>
	{/if}

	<section class="space-y-4">
		<div class="flex items-center gap-3">
			<span
				class="h-1 w-10 shrink-0 rounded-sm bg-gradient-to-r from-accent to-accent-hot/80"
				aria-hidden="true"
			></span>
			<h3 class="font-display text-xl font-medium uppercase tracking-[0.1em] text-text-primary">Nächste Trainings</h3>
		</div>
		<div class="space-y-3">
			{#each data.nextTrainings as session, i}
				<div
					class="card-surface card-surface-lift relative overflow-hidden {i === 0
						? 'p-6 md:p-8 ring-2 ring-accent ring-offset-2 ring-offset-bg-bg-card shadow-next-training-soft'
						: 'p-5 md:p-6'}"
				>
					{#if i === 0}
						<!-- Hero: Spot-Foto als Bühne, dunkler Verlauf für Lesbarkeit -->
						{#if session.topVote?.thumbnail && !session.cancelled}
							<div class="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
								<img
									src={session.topVote.thumbnail}
									alt=""
									class="h-full w-full object-cover opacity-35"
								/>
								<div class="absolute inset-0 bg-gradient-to-r from-bg-card via-bg-card/85 to-bg-card/40"></div>
								<div class="absolute inset-0 bg-gradient-to-t from-bg-card via-transparent to-transparent"></div>
							</div>
						{/if}
						<div
							class="pointer-events-none absolute left-0 right-0 top-0 z-30 flex items-center justify-between gap-2 bg-gradient-to-r from-accent to-accent-hot px-4 py-1.5 font-display text-[10px] font-semibold uppercase tracking-[0.22em] text-black sm:text-xs"
						>
							<span>Nächstes Training</span>
							<span class="opacity-80" aria-hidden="true">●</span>
						</div>
						<div class="h-7 sm:h-8" aria-hidden="true"></div>
					{/if}
					<a
						href="/training#session-{session.id}"
						class="absolute inset-0 z-0 rounded-[0.625rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-bg-card"
						aria-label="Training {session.dayOfWeek} {formatDate(session.date)} im Training-Tab öffnen"
					>
						<span class="sr-only">Zum Training im Tab öffnen</span>
					</a>
					<div class="pointer-events-none relative z-10 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2.5 flex-wrap">
								<span
									class="{i === 0
										? 'font-display text-3xl md:text-4xl font-semibold uppercase tracking-[0.05em]'
										: 'font-semibold'} text-text-primary"
								>{session.dayOfWeek}</span>
								<span
									class="{i === 0 ? 'text-sm px-2.5 py-1' : 'text-xs px-2 py-0.5'} rounded-full font-semibold {isToday(session.date)
										? 'bg-accent/25 text-accent'
										: 'bg-bg-hover text-text-secondary'}"
								>
									{countdownLabel(session.date)}
								</span>
								{#if session.cancelled}
									<span class="text-xs bg-danger/20 text-danger px-2 py-0.5 rounded-full font-semibold">Abgesagt</span>
								{/if}
							</div>
							<p class="text-text-secondary text-sm mt-1">{formatDate(session.date)} &middot; {session.timeStart} - {session.timeEnd}</p>
							{#if i === 0 && data.trainingForecast}
								<p class="text-text-muted text-sm mt-1">{data.trainingForecast.summaryLine}</p>
							{/if}
							{#if session.topVote}
								<p class="text-accent text-sm mt-2 font-medium">
									{session.topVote.fixedByAdmin ? 'Spot steht fest:' : 'Spot:'}
									<a
										href="/spots/{session.topVote.spotId}"
										class="pointer-events-auto relative z-20 hover:underline"
									>{session.topVote.spotName}</a>
									({session.topVote.spotCity}){#if !session.topVote.fixedByAdmin} &middot; {formatStimmen(session.topVote.voteCount)}{/if}
								</p>
							{:else}
								<p class="text-text-muted text-xs mt-2">Noch kein Spot vorgeschlagen</p>
							{/if}
							<div class="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
								<div>
									<p class="text-success text-xs font-medium uppercase tracking-wide mb-2">
										Zieht ({session.attending.length + (session.guests?.length || 0)})
									</p>
									<div class="flex flex-wrap gap-1.5">
										{#each session.attending as user}
											{#if user.id < 0}
												<span class="relative z-20 bg-success/10 text-success text-xs px-2.5 py-1 rounded-full">?</span>
											{:else}
												<a href="/profil/{user.id}" class="pointer-events-auto relative z-20 text-xs px-2.5 py-1 rounded-full transition-colors {user.lateMarked ? 'bg-danger/15 text-danger ring-1 ring-danger/60' : 'bg-success/10 text-success hover:bg-success/20'}" title={user.lateMarked ? 'Hat sich letzte Woche kurzfristig abgemeldet' : ''}>{user.username}</a>
											{/if}
										{/each}
										{#each session.guests || [] as guest}
											<span class="bg-amber-500/10 text-amber-400 text-xs px-2.5 py-1 rounded-full">{guest.name}</span>
										{/each}
										{#if session.attending.length === 0 && !(session.guests?.length)}
											<span class="text-text-muted text-xs">–</span>
										{/if}
									</div>
								</div>
								<div>
									<p class="text-danger text-xs font-medium uppercase tracking-wide mb-2">
										Zieht nicht ({session.absences.length})
									</p>
									<div class="flex flex-wrap gap-1.5">
										{#each session.absences as absence}
											<span class="text-xs px-2.5 py-1 rounded-full {absence.lateMarked ? 'bg-danger/25 text-danger ring-1 ring-danger font-semibold' : 'bg-danger/10 text-danger'}" title={absence.lateMarked ? `Kurzfristig abgemeldet · ${absence.reason || ''}` : absence.reason || ''}>
												{absence.username}{#if absence.reason} *{/if}
											</span>
										{/each}
										{#if session.absences.length === 0}
											<span class="text-text-muted text-xs">–</span>
										{/if}
									</div>
								</div>
							</div>
						</div>
						{#if !session.cancelled}
							<div class="flex shrink-0 items-center gap-3">
								{#if session.userEffectivelyAbsent}
									<span class="rounded-full bg-danger/20 px-3 py-1 text-xs font-medium text-danger">
										Abgemeldet
									</span>
								{:else}
									<span class="rounded-full bg-success/15 px-3 py-1 text-xs font-medium text-success">
										✓ Du ziehst mit
									</span>
								{/if}
							</div>
						{/if}
					</div>
				</div>
			{/each}
			{#if data.nextTrainings.length === 0}
				<p class="text-text-muted text-center py-8">Keine kommenden Trainings</p>
			{/if}
		</div>
		<a
			href="/training"
			class="btn-link btn-link-secondary"
		>
			Alle Trainings &amp; Spot-Voting
			<span aria-hidden="true">→</span>
		</a>
	</section>

	<section class="space-y-4">
		<div class="flex items-center gap-3">
			<span
				class="h-1 w-10 shrink-0 rounded-sm bg-gradient-to-r from-accent to-accent-hot/80"
				aria-hidden="true"
			></span>
			<h3 class="font-display text-xl font-medium uppercase tracking-[0.1em] text-text-primary">Top Spots</h3>
		</div>
		<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
			{#each data.topSpots as spot, i}
				<a
					href="/spots/{spot.id}"
					class="card-surface card-surface-lift group block overflow-hidden"
				>
					{#if spot.thumbnail}
						<div class="relative h-32 overflow-hidden">
							<img
								src={spot.thumbnail}
								alt={spot.name}
								loading="lazy"
								class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
							/>
							<span
								class="absolute left-3 top-3 rounded-full bg-black/60 px-2 py-0.5 font-display text-xs font-semibold text-white backdrop-blur-sm"
							>#{i + 1}</span>
						</div>
					{/if}
					<div class="p-5 {spot.thumbnail ? 'pt-4' : 'md:p-6'}">
						<div class="flex items-start justify-between gap-2">
							<div class="min-w-0">
								{#if !spot.thumbnail}
									<span class="text-text-muted text-xs">#{i + 1}</span>
								{/if}
								<h4 class="font-semibold text-text-primary truncate group-hover:text-accent transition-colors">{spot.name}</h4>
								<p class="text-text-secondary text-sm">{spot.city}</p>
							</div>
							<div class="text-right shrink-0">
								<p class="text-accent font-bold text-lg">{Number(spot.avgScore).toFixed(1)}</p>
								<p class="text-text-muted text-xs">{spot.voteCount} Votes</p>
							</div>
						</div>
					</div>
				</a>
			{/each}
			{#if data.topSpots.length === 0}
				<p class="text-text-muted text-center py-8 col-span-full">Noch keine Spots vorhanden</p>
			{/if}
		</div>
		<a
			href="/spots"
			class="btn-link btn-link-secondary"
		>
			Alle Spots anzeigen
			<span aria-hidden="true">→</span>
		</a>
	</section>
</div>
