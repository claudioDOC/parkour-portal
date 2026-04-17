<script lang="ts">
	import { formatStimmen } from '$lib/formatStimmen';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function formatDate(dateStr: string): string {
		const d = new Date(dateStr + 'T00:00:00');
		return d.toLocaleDateString('de-CH', { weekday: 'short', day: 'numeric', month: 'short' });
	}

	function isToday(dateStr: string): boolean {
		return dateStr === new Date().toISOString().split('T')[0];
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
			<p class="text-text-secondary">
				Willkommen zurück, <span class="font-medium text-text-primary">{data.user?.username}</span>.
			</p>
		</div>
	</header>

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
					class="card-surface card-surface-lift relative overflow-hidden p-5 md:p-6 {i === 0
						? 'ring-2 ring-accent ring-offset-2 ring-offset-bg-bg-card shadow-next-training-soft'
						: ''}"
				>
					{#if i === 0}
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
							<div class="flex items-center gap-2 flex-wrap">
								<span class="font-semibold text-text-primary">{session.dayOfWeek}</span>
								{#if isToday(session.date)}
									<span class="text-xs bg-accent/20 text-accent px-2 py-0.5 rounded-full font-medium">Heute</span>
								{/if}
							</div>
							<p class="text-text-secondary text-sm mt-1">{formatDate(session.date)} &middot; {session.timeStart} - {session.timeEnd}</p>
							{#if session.topVote}
								<p class="text-accent text-sm mt-2 font-medium">
									Spot:
									<a
										href="/spots/{session.topVote.spotId}"
										class="pointer-events-auto relative z-20 hover:underline"
									>{session.topVote.spotName}</a>
									({session.topVote.spotCity}) &middot; {formatStimmen(session.topVote.voteCount)}
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
											<span class="bg-success/10 text-success text-xs px-2.5 py-1 rounded-full">{user.username}</span>
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
											<span class="bg-danger/10 text-danger text-xs px-2.5 py-1 rounded-full" title={absence.reason || ''}>
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
						{#if session.userEffectivelyAbsent}
							<div class="flex shrink-0 items-center gap-3">
								<span class="rounded-full bg-danger/20 px-3 py-1 text-xs font-medium text-danger">
									Abgemeldet
								</span>
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
					class="card-surface card-surface-lift block p-5 md:p-6"
				>
					<div class="flex items-start justify-between">
						<div>
							<span class="text-text-muted text-xs">#{i + 1}</span>
							<h4 class="font-semibold text-text-primary">{spot.name}</h4>
							<p class="text-text-secondary text-sm">{spot.city}</p>
						</div>
						<div class="text-right">
							<p class="text-accent font-bold">{Number(spot.avgScore).toFixed(1)}</p>
							<p class="text-text-muted text-xs">{spot.voteCount} Votes</p>
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
