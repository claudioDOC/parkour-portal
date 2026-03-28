<script lang="ts">
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

<div class="space-y-8">
	<div>
		<h2 class="text-2xl font-bold text-text-primary">Dashboard</h2>
		<p class="text-text-secondary mt-1">Willkommen zurück, {data.user?.username}!</p>
	</div>

	<div class="grid grid-cols-2 md:grid-cols-3 gap-4">
		<div class="bg-bg-card rounded-xl p-5 border border-border">
			<p class="text-text-muted text-sm">Mitglieder</p>
			<p class="text-2xl font-bold text-text-primary mt-1">{data.memberCount}</p>
		</div>
		<div class="bg-bg-card rounded-xl p-5 border border-border">
			<p class="text-text-muted text-sm">Nächstes Training</p>
			<p class="text-2xl font-bold text-accent mt-1">
				{#if data.nextTrainings.length > 0}
					{data.nextTrainings[0].dayOfWeek}
				{:else}
					-
				{/if}
			</p>
		</div>
		<div class="bg-bg-card rounded-xl p-5 border border-border col-span-2 md:col-span-1">
			<p class="text-text-muted text-sm">Top Spot</p>
			<p class="text-2xl font-bold text-text-primary mt-1 truncate">
				{#if data.topSpots.length > 0}
					{data.topSpots[0].name}
				{:else}
					-
				{/if}
			</p>
		</div>
	</div>

	<div>
		<h3 class="text-lg font-semibold text-text-primary mb-4">Nächste Trainings</h3>
		<div class="space-y-3">
			{#each data.nextTrainings as session}
				<div class="bg-bg-card rounded-xl p-5 border border-border">
					<div class="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
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
									<a href="/spots/{session.topVote.spotId}" class="hover:underline">{session.topVote.spotName}</a>
									({session.topVote.spotCity}) &middot; {session.topVote.voteCount} Stimmen
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
										Abgemeldet ({session.absences.length})
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
						<div class="flex items-center gap-3 shrink-0">
							{#if session.userEffectivelyAbsent}
								<span class="text-xs bg-danger/20 text-danger px-3 py-1 rounded-full font-medium">Abgemeldet</span>
							{:else}
								<span class="text-xs bg-success/20 text-success px-3 py-1 rounded-full font-medium">Zieht</span>
							{/if}
						</div>
					</div>
				</div>
			{/each}
			{#if data.nextTrainings.length === 0}
				<p class="text-text-muted text-center py-8">Keine kommenden Trainings</p>
			{/if}
		</div>
		<a href="/training" class="inline-block text-accent hover:underline text-sm mt-3">Alle Trainings &amp; Spot-Voting →</a>
	</div>

	<div>
		<h3 class="text-lg font-semibold text-text-primary mb-4">Top Spots</h3>
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
			{#each data.topSpots as spot, i}
				<a href="/spots/{spot.id}" class="bg-bg-card rounded-xl p-5 border border-border hover:border-accent/50 transition-colors block">
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
		<a href="/spots" class="inline-block text-accent hover:underline text-sm mt-3">Alle Spots anzeigen →</a>
	</div>
</div>
