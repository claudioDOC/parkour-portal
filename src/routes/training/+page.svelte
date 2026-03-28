<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let loadingSession = $state<number | null>(null);
	let reasonInput = $state<Record<number, string>>({});
	let showReason = $state<number | null>(null);
	let showSpotPicker = $state<number | null>(null);
	let spotSearch = $state('');

	function formatDate(dateStr: string): string {
		const d = new Date(dateStr + 'T00:00:00');
		return d.toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
	}

	function isToday(dateStr: string): boolean {
		return dateStr === new Date().toISOString().split('T')[0];
	}

	function isPast(dateStr: string): boolean {
		const sessionDate = new Date(dateStr + 'T20:15:00');
		return sessionDate < new Date();
	}

	const filteredSpots = $derived(
		data.allSpots.filter((s) =>
			!spotSearch || s.name.toLowerCase().includes(spotSearch.toLowerCase()) || s.city.toLowerCase().includes(spotSearch.toLowerCase())
		)
	);

	async function postAction(action: string, sessionId: number, extra: Record<string, unknown> = {}) {
		loadingSession = sessionId;
		try {
			await fetch('/api/training', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action, sessionId, ...extra })
			});
			await invalidateAll();
		} finally {
			loadingSession = null;
			showReason = null;
			showSpotPicker = null;
			spotSearch = '';
		}
	}
</script>

<div class="space-y-6">
	<div>
		<h2 class="text-2xl font-bold text-text-primary">Training</h2>
		<p class="text-text-secondary mt-1">Dienstag & Donnerstag, 18:15 - 20:15</p>
		{#if data.weather}
			<p class="text-text-muted text-sm mt-1">Aktuelles Wetter Thun: {data.weather.weatherLabel} ({data.weather.temperature.toFixed(0)}°C)</p>
		{/if}
	</div>

	<div class="space-y-4">
		{#each data.sessions as session}
			{@const past = isPast(session.date)}
			<div class="bg-bg-card rounded-xl border border-border overflow-hidden {past ? 'opacity-60' : ''}">
				<div class="p-5">
				<div class="flex items-start justify-between gap-4">
						<div>
							<div class="flex items-center gap-2 flex-wrap">
								<h3 class="font-semibold text-text-primary text-lg">{session.dayOfWeek}</h3>
								{#if isToday(session.date)}
									<span class="text-xs bg-accent/20 text-accent px-2 py-0.5 rounded-full font-medium">Heute</span>
								{/if}
								{#if past}
									<span class="text-xs bg-bg-hover text-text-muted px-2 py-0.5 rounded-full">Vergangen</span>
								{/if}
							</div>
							<p class="text-text-secondary text-sm mt-1">{formatDate(session.date)}</p>
							<p class="text-text-muted text-sm">{session.timeStart} - {session.timeEnd}</p>
						</div>

						{#if !past}
							<div class="shrink-0 flex flex-col items-end gap-2">
								{#if session.userDbAbsent}
									<button
										onclick={() => postAction('cancel_absence', session.id)}
										disabled={loadingSession === session.id}
										class="bg-danger/15 hover:bg-danger/25 text-danger px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
									>
										{loadingSession === session.id ? '...' : 'Wieder anmelden'}
									</button>
								{:else if session.userVirtualAbsent}
									<button
										onclick={() => postAction('weekday_override_yes', session.id)}
										disabled={loadingSession === session.id}
										class="bg-accent/15 hover:bg-accent/25 text-accent px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
									>
										{loadingSession === session.id ? '...' : 'Diesmal doch dabei'}
									</button>
								{:else if data.viewerTrainingAttendance === 'opt_in'}
									<div class="flex flex-wrap justify-end gap-2">
										{#if session.userHasRsvp}
											<button
												onclick={() => postAction('rsvp_no', session.id)}
												disabled={loadingSession === session.id}
												class="bg-bg-hover hover:bg-warning/15 text-text-secondary px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
											>
												{loadingSession === session.id ? '...' : 'Zusage zurücknehmen'}
											</button>
										{:else}
											<button
												onclick={() => postAction('rsvp_yes', session.id)}
												disabled={loadingSession === session.id}
												class="bg-accent/15 hover:bg-accent/25 text-accent px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
											>
												{loadingSession === session.id ? '...' : 'Zusage'}
											</button>
										{/if}
									</div>
								{/if}
								{#if session.userHasWeekdayOverride && data.viewerTrainingAttendance === 'implicit'}
									<button
										onclick={() => postAction('weekday_override_no', session.id)}
										disabled={loadingSession === session.id}
										class="text-text-muted hover:text-warning text-xs px-2 py-1 transition-colors"
									>
										{loadingSession === session.id ? '...' : 'Standard-Abmeldung wieder für diesen Termin'}
									</button>
								{/if}
								{#if !session.userDbAbsent && !session.userVirtualAbsent && showReason === session.id}
								<div class="space-y-2">
									<div class="flex gap-2">
										<input
											type="text"
											bind:value={reasonInput[session.id]}
											placeholder="Grund angeben (mind. 10 Zeichen)"
											class="bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-text-primary w-56 focus:outline-none focus:border-accent"
										/>
										<button
											onclick={() => postAction('absence', session.id, { reason: reasonInput[session.id] || '' })}
											disabled={loadingSession === session.id || !reasonInput[session.id] || reasonInput[session.id].trim().length < 10}
											class="bg-danger hover:bg-danger/80 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 cursor-pointer"
										>
											{loadingSession === session.id ? '...' : 'Abmelden'}
										</button>
										<button
											onclick={() => { showReason = null; reasonInput[session.id] = ''; }}
											class="text-text-muted hover:text-text-secondary text-sm px-2 transition-colors cursor-pointer"
										>
											×
										</button>
									</div>
									{#if reasonInput[session.id] && reasonInput[session.id].trim().length > 0 && reasonInput[session.id].trim().length < 10}
										<p class="text-warning text-xs">Noch {10 - reasonInput[session.id].trim().length} Zeichen</p>
									{/if}
								</div>
								{:else if !session.userDbAbsent && !session.userVirtualAbsent}
									<button
										onclick={() => showReason = session.id}
										class="bg-bg-hover hover:bg-danger/15 hover:text-danger text-text-secondary px-4 py-2 rounded-lg text-sm font-medium transition-colors"
									>
										Abmelden
									</button>
								{/if}
							</div>
						{/if}
					</div>

				<div class="mt-4 pt-4 border-t border-border">
						<div class="flex items-center justify-between mb-3">
							<p class="text-text-primary text-sm font-semibold">Spot-Voting</p>
							{#if session.votingClosed}
								<span class="text-xs bg-bg-hover text-text-muted px-2 py-0.5 rounded-full">Voting geschlossen</span>
							{:else}
								<span class="text-xs bg-accent/15 text-accent px-2 py-0.5 rounded-full">Voting offen</span>
							{/if}
						</div>

						{#if session.winnerSpot}
							<div class="bg-accent/10 border border-accent/30 rounded-lg p-4 mb-3">
								<p class="text-accent text-xs font-medium uppercase tracking-wide">Gewinner-Spot</p>
								<a href="/spots/{session.winnerSpot.spotId}" class="text-text-primary font-semibold text-lg hover:text-accent transition-colors">
									{session.winnerSpot.name}
								</a>
								<p class="text-text-secondary text-sm">{session.winnerSpot.city} &middot; {session.winnerSpot.votes} Stimmen</p>
							</div>
						{:else if session.autoSpot && session.votingClosed}
							<div class="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 mb-3">
								<p class="text-amber-400 text-xs font-medium uppercase tracking-wide">Auto-Vorschlag (Wetter-basiert)</p>
								<a href="/spots/{session.autoSpot.spotId}" class="text-text-primary font-semibold text-lg hover:text-accent transition-colors">
									{session.autoSpot.name}
								</a>
								<p class="text-text-secondary text-sm">{session.autoSpot.city}</p>
							</div>
						{:else if session.votingClosed && session.spotVotes.length === 0}
							<p class="text-text-muted text-sm mb-3">Kein Spot vorgeschlagen. Noch keine Spots in Thun/Steffisburg vorhanden.</p>
						{/if}

					{#if session.spotVotes.length > 0}
							<div class="space-y-2 mb-3">
								{#each session.spotVotes as sv}
									<div class="flex items-center justify-between gap-3 bg-bg-secondary rounded-lg px-4 py-2.5 {session.userVotedSpotId === sv.spotId ? 'border-2 border-accent' : 'border border-transparent'}">
										<div class="flex items-center gap-3 min-w-0">
											<span class="text-accent font-bold text-lg shrink-0">{sv.voteCount}</span>
											<div class="min-w-0">
												<a
													href="/spots/{sv.spotId}"
													class="text-text-primary font-medium text-sm truncate block hover:text-accent transition-colors"
												>{sv.spotName}</a>
												<p class="text-text-muted text-xs">{sv.spotCity} &middot; {sv.voterList.join(', ')}</p>
											</div>
										</div>
										{#if !session.votingClosed && !past}
											{#if session.userVotedSpotId === sv.spotId}
												<button
													onclick={() => postAction('remove_vote', session.id)}
													disabled={loadingSession === session.id}
													class="text-text-muted hover:text-danger text-xs shrink-0 transition-colors"
												>
													Zurückziehen
												</button>
											{:else}
												<button
													onclick={() => postAction('vote_spot', session.id, { spotId: sv.spotId })}
													disabled={loadingSession === session.id}
													class="text-accent hover:text-accent-hover text-xs font-medium shrink-0 transition-colors"
												>
													Dafür
												</button>
											{/if}
										{/if}
									</div>
								{/each}
							</div>
						{/if}

					{#if !session.votingClosed && !past}
							{#if showSpotPicker === session.id}
								<div class="bg-bg-secondary rounded-lg p-4 space-y-3">
									<input
										type="text"
										bind:value={spotSearch}
										placeholder="Spot suchen..."
										class="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
									/>
									<div class="max-h-48 overflow-y-auto space-y-1">
										{#each filteredSpots as spot}
											<button
												onclick={() => postAction('vote_spot', session.id, { spotId: spot.id })}
												disabled={loadingSession === session.id}
												class="w-full text-left px-3 py-2 rounded-lg hover:bg-bg-hover text-sm text-text-primary transition-colors flex items-center justify-between"
											>
												<span>{spot.name}</span>
												<span class="text-text-muted text-xs">{spot.city}</span>
											</button>
										{/each}
										{#if filteredSpots.length === 0}
											<p class="text-text-muted text-sm text-center py-4">Keine Spots gefunden</p>
										{/if}
									</div>
									<div class="flex justify-between items-center pt-2">
										<a href="/finder?session={session.id}" class="text-accent text-xs hover:underline">Spot-Finder nutzen →</a>
										<button onclick={() => { showSpotPicker = null; spotSearch = ''; }} class="text-text-muted text-xs hover:text-text-secondary">Abbrechen</button>
									</div>
								</div>
							{:else}
								<button
									onclick={() => showSpotPicker = session.id}
									class="w-full bg-bg-secondary hover:bg-bg-hover border border-border border-dashed rounded-lg px-4 py-3 text-sm text-text-secondary hover:text-accent transition-colors text-center"
								>
									+ Spot vorschlagen / voten
								</button>
							{/if}
						{/if}
					</div>

				<div class="mt-4 pt-4 border-t border-border">
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
										<span class="text-text-muted text-xs">Niemand</span>
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
										<span class="text-text-muted text-xs">Niemand</span>
									{/if}
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		{/each}

		{#if data.sessions.length === 0}
			<p class="text-text-muted text-center py-12">Keine kommenden Trainings</p>
		{/if}
	</div>
</div>
