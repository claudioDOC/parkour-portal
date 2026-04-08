<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const stats = data.stats;
	const myId = data.user?.id;
	const spotMonths = [...new Set(stats.spotUsageEvents.map((e) => e.date.slice(0, 7)))].sort();
	const spotYears = [...new Set(stats.spotUsageEvents.map((e) => e.date.slice(0, 4)))].sort();
	const monthKeys = stats.monthDetail.map((m) => m.key);
	const monthYears = [...new Set(monthKeys.map((k) => k.slice(0, 4)))].sort();

	let monthKey = $state(stats.monthDetail.length ? stats.monthDetail[stats.monthDetail.length - 1].key : '');
	let monthViewMode = $state<'month' | 'year' | 'range'>('month');
	let monthYear = $state(monthYears.length ? monthYears[monthYears.length - 1] : '');
	let monthFromDate = $state(monthKeys.length ? `${monthKeys[0]}-01` : '');
	let monthToDate = $state(stats.today);

	const selectedMonth = $derived(stats.monthDetail.find((m) => m.key === monthKey) ?? null);
	let spotMode = $state<'month' | 'year' | 'range'>('month');
	let spotMonth = $state(spotMonths.length ? spotMonths[spotMonths.length - 1] : '');
	let spotYear = $state(spotYears.length ? spotYears[spotYears.length - 1] : '');
	let rangeFrom = $state(spotMonths.length ? `${spotMonths[0]}-01` : '');
	let rangeTo = $state(stats.today);

	const selectedMonthRows = $derived.by(() => {
		if (monthViewMode === 'month') {
			return (selectedMonth?.leaderboard ?? []).map((row) => ({
				userId: row.userId,
				username: row.username,
				trainings: row.eligiblePastSessions,
				absences: row.absences,
				pulled: row.implicitPresent,
				pulledPercent: row.showUpPercent
			}));
		}
		const filteredMonths =
			monthViewMode === 'year'
				? stats.monthDetail.filter((m) => m.key.startsWith(monthYear))
				: stats.monthDetail.filter((m) => {
						const fromKey = (monthFromDate || '0000-01-01').slice(0, 7);
						const toKey = (monthToDate || '9999-12-31').slice(0, 7);
						return m.key >= fromKey && m.key <= toKey;
					});

		const byUser = new Map<
			number,
			{ userId: number; username: string; trainings: number; absences: number; pulled: number; pulledPercent: number }
		>();
		for (const month of filteredMonths) {
			for (const row of month.leaderboard) {
				const prev = byUser.get(row.userId);
				if (prev) {
					prev.trainings += row.eligiblePastSessions;
					prev.absences += row.absences;
					prev.pulled += row.implicitPresent;
				} else {
					byUser.set(row.userId, {
						userId: row.userId,
						username: row.username,
						trainings: row.eligiblePastSessions,
						absences: row.absences,
						pulled: row.implicitPresent,
						pulledPercent: 0
					});
				}
			}
		}
		const rows = [...byUser.values()];
		for (const r of rows) {
			r.pulledPercent = r.trainings > 0 ? Math.round((r.pulled / r.trainings) * 1000) / 10 : 0;
		}
		return rows.sort((a, b) => b.pulledPercent - a.pulledPercent || b.pulled - a.pulled || a.username.localeCompare(b.username, 'de'));
	});
	const selectedMonthSummary = $derived.by(() => {
		if (monthViewMode === 'month') {
			return {
				sessions: selectedMonth?.sessionCount ?? 0,
				absences: selectedMonth?.absenceCount ?? 0
			};
		}
		const filteredMonths =
			monthViewMode === 'year'
				? stats.monthDetail.filter((m) => m.key.startsWith(monthYear))
				: stats.monthDetail.filter((m) => {
						const fromKey = (monthFromDate || '0000-01-01').slice(0, 7);
						const toKey = (monthToDate || '9999-12-31').slice(0, 7);
						return m.key >= fromKey && m.key <= toKey;
					});
		let sessions = 0;
		let absences = 0;
		for (const m of filteredMonths) {
			sessions += m.sessionCount;
			absences += m.absenceCount;
		}
		return { sessions, absences };
	});
	const filteredSpotEvents = $derived.by(() => {
		const events = stats.spotUsageEvents;
		if (spotMode === 'month') return events.filter((e) => e.date.startsWith(spotMonth));
		if (spotMode === 'year') return events.filter((e) => e.date.startsWith(spotYear));
		const from = rangeFrom || '0000-01-01';
		const to = rangeTo || '9999-12-31';
		return events.filter((e) => e.date >= from && e.date <= to);
	});
	const spotUsageRows = $derived.by(() => {
		const m = new Map<
			number,
			{ spotId: number; spotName: string; spotCity: string; timesSelected: number; totalTopVotes: number }
		>();
		for (const e of filteredSpotEvents) {
			const prev = m.get(e.spotId);
			if (prev) {
				prev.timesSelected += 1;
				prev.totalTopVotes += e.voteCount;
			} else {
				m.set(e.spotId, {
					spotId: e.spotId,
					spotName: e.spotName,
					spotCity: e.spotCity,
					timesSelected: 1,
					totalTopVotes: e.voteCount
				});
			}
		}
		return [...m.values()].sort(
			(a, b) => b.timesSelected - a.timesSelected || b.totalTopVotes - a.totalTopVotes || a.spotName.localeCompare(b.spotName, 'de')
		);
	});

	function medal(i: number): string {
		if (i === 0) return '🥇';
		if (i === 1) return '🥈';
		if (i === 2) return '🥉';
		return '';
	}
</script>

<div class="space-y-10 pb-8">
	<section class="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-accent/10 via-bg-card to-bg-card p-6 md:p-8">
		<div class="absolute -right-8 -top-8 text-8xl opacity-[0.07] select-none pointer-events-none" aria-hidden="true">📊</div>
		<h2 class="text-2xl md:text-3xl font-bold text-text-primary tracking-tight">Statistik</h2>
		<p class="text-text-muted text-sm mt-2 max-w-xl">
			<strong class="text-text-secondary font-medium">Gezogen</strong> = wie oft ohne Abmeldung zum Training (geschätzt, ab Registrierung).
			<strong class="text-text-secondary font-medium">Gezogen %</strong> = Anteil „gezogen“ an allen relevanten Trainings.
		</p>
	</section>

	{#if stats.group.pastSessionCount === 0}
		<div class="bg-bg-card rounded-xl border border-border p-8 text-center">
			<p class="text-text-muted text-sm">Noch keine vergangenen Trainings.</p>
		</div>
	{:else}
		<section class="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
			<div class="bg-bg-card rounded-xl border border-border p-4 md:p-5">
				<p class="text-text-muted text-xs uppercase tracking-wide">Trainings</p>
				<p class="text-2xl md:text-3xl font-bold text-accent mt-1">{stats.group.pastSessionCount}</p>
				<p class="text-text-muted text-xs mt-1">bisher durch</p>
			</div>
			<div class="bg-bg-card rounded-xl border border-border p-4 md:p-5">
				<p class="text-text-muted text-xs uppercase tracking-wide">Abmeldungen</p>
				<p class="text-2xl md:text-3xl font-bold text-warning mt-1">{stats.group.totalAbsences}</p>
				<p class="text-text-muted text-xs mt-1">insgesamt gemeldet</p>
			</div>
			<div class="bg-bg-card rounded-xl border border-border p-4 md:p-5">
				<p class="text-text-muted text-xs uppercase tracking-wide">Ø 🚂 pro Training</p>
				<p class="text-2xl md:text-3xl font-bold text-text-primary mt-1">{stats.group.avgPulledPerSession}</p>
				<p class="text-text-muted text-xs mt-1">Mitglieder im Schnitt dabei</p>
			</div>
			<div class="bg-bg-card rounded-xl border border-border p-4 md:p-5">
				<p class="text-text-muted text-xs uppercase tracking-wide">Mitglieder</p>
				<p class="text-2xl md:text-3xl font-bold text-text-primary mt-1">{stats.group.memberCount}</p>
				<p class="text-text-muted text-xs mt-1">in der Wertung</p>
			</div>
		</section>

		<section>
			<h3 class="text-lg font-semibold text-text-primary mb-1">Hall of Fame</h3>
			<p class="text-text-muted text-sm mb-4">Streak = letzte Trainings in Folge gezogen (ohne Abmeldung dazwischen).</p>

			{#if stats.leaderboard.length >= 3}
				<div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
					{#each stats.leaderboard.slice(0, 3) as row, i}
						<div
							class="rounded-xl border p-4 text-center {row.userId === myId
								? 'border-accent bg-accent/10'
								: 'border-border bg-bg-card'}"
						>
							<div class="text-3xl mb-1">{medal(i)}</div>
							<p class="font-semibold text-text-primary">{row.username}</p>
							<p class="text-2xl font-bold text-accent mt-2">{row.showUpPercent}%</p>
							<p class="text-text-secondary text-xs mt-1">{row.implicitPresent}× gezogen</p>
							<p class="text-text-muted text-xs mt-0.5">Streak {row.streakNoAbsence}</p>
						</div>
					{/each}
				</div>
			{/if}

			<div class="rounded-xl border border-border overflow-hidden">
				<div class="overflow-x-auto">
					<table class="w-full text-sm text-left min-w-[720px]">
						<thead class="bg-bg-secondary text-text-muted text-xs uppercase tracking-wide">
							<tr>
								<th class="px-3 py-2 font-medium">#</th>
								<th class="px-3 py-2 font-medium">Name</th>
								<th class="px-3 py-2 font-medium text-right">Trainings</th>
								<th class="px-3 py-2 font-medium text-right">Abmeld.</th>
								<th class="px-3 py-2 font-medium text-right">Gezogen</th>
								<th class="px-3 py-2 font-medium text-right">Gezogen %</th>
								<th class="px-3 py-2 font-medium text-right">Streak</th>
								<th class="px-3 py-2 font-medium text-right">Spots</th>
								<th class="px-3 py-2 font-medium text-right">Sterne</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-border">
							{#each stats.leaderboard as row, i}
								<tr
									class="{row.userId === myId
										? 'bg-accent/10'
										: 'bg-bg-card hover:bg-bg-secondary/40'} transition-colors"
								>
									<td class="px-3 py-2 text-text-muted whitespace-nowrap">{medal(i) || i + 1}</td>
									<td class="px-3 py-2 font-medium text-text-primary whitespace-nowrap">
										{row.username}{#if row.userId === myId}<span class="text-accent text-xs ml-1">(du)</span>{/if}
									</td>
									<td class="px-3 py-2 text-right text-text-secondary">{row.eligiblePastSessions}</td>
									<td class="px-3 py-2 text-right text-warning">{row.absences}</td>
									<td class="px-3 py-2 text-right font-medium text-success">{row.implicitPresent}</td>
									<td class="px-3 py-2 text-right font-semibold text-accent">{row.showUpPercent}%</td>
									<td class="px-3 py-2 text-right text-text-secondary">{row.streakNoAbsence}</td>
									<td class="px-3 py-2 text-right text-text-muted">{row.spotsSuggested}</td>
									<td class="px-3 py-2 text-right text-text-muted">{row.spotStarVotes}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		</section>

		{#if stats.monthDetail.length > 0}
			<section>
				<h3 class="text-lg font-semibold text-text-primary mb-1">Nach Zeitraum</h3>
				<p class="text-text-muted text-sm mb-4">Gleiche Kennzahlen, gefiltert nach Monat/Jahr oder freiem Datumsbereich.</p>
				<div class="flex flex-wrap items-center gap-3 mb-4">
					<label for="month-mode" class="text-text-secondary text-sm">Zeitraum</label>
					<select
						id="month-mode"
						bind:value={monthViewMode}
						class="bg-bg-secondary border border-border rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent cursor-pointer"
					>
						<option value="month">Monat</option>
						<option value="year">Jahr</option>
						<option value="range">Von Datum bis Datum</option>
					</select>

					{#if monthViewMode === 'month'}
						<select
							id="month-pick"
							bind:value={monthKey}
							class="bg-bg-secondary border border-border rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent cursor-pointer"
						>
							{#each stats.monthDetail as m}
								<option value={m.key}>{m.label} ({m.sessionCount} Trainings)</option>
							{/each}
						</select>
					{:else if monthViewMode === 'year'}
						<select
							bind:value={monthYear}
							class="bg-bg-secondary border border-border rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent cursor-pointer"
						>
							{#each monthYears as y}
								<option value={y}>{y}</option>
							{/each}
						</select>
					{:else}
						<input
							type="date"
							bind:value={monthFromDate}
							class="bg-bg-secondary border border-border rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent"
						/>
						<span class="text-text-muted text-sm">bis</span>
						<input
							type="date"
							bind:value={monthToDate}
							class="bg-bg-secondary border border-border rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent"
						/>
					{/if}
				</div>

				{#if selectedMonthRows.length > 0}
					<p class="text-text-secondary text-sm mb-3">
						{selectedMonthSummary.sessions} Trainings · {selectedMonthSummary.absences} Abmeldungen erfasst
					</p>
					<div class="rounded-xl border border-border overflow-hidden">
						<div class="overflow-x-auto">
							<table class="w-full text-sm text-left min-w-[600px]">
								<thead class="bg-bg-secondary text-text-muted text-xs uppercase tracking-wide">
									<tr>
										<th class="px-3 py-2 font-medium">Name</th>
										<th class="px-3 py-2 font-medium text-right">Trainings</th>
										<th class="px-3 py-2 font-medium text-right">Abmeld.</th>
										<th class="px-3 py-2 font-medium text-right">Gezogen</th>
										<th class="px-3 py-2 font-medium text-right">Gezogen %</th>
									</tr>
								</thead>
								<tbody class="divide-y divide-border">
									{#each selectedMonthRows as row}
										<tr class="{row.userId === myId ? 'bg-accent/10' : 'bg-bg-card'}">
											<td class="px-3 py-2 text-text-primary font-medium whitespace-nowrap">
												{row.username}{#if row.userId === myId}<span class="text-accent text-xs ml-1">(du)</span>{/if}
											</td>
											<td class="px-3 py-2 text-right text-text-secondary">{row.trainings}</td>
											<td class="px-3 py-2 text-right text-warning">{row.absences}</td>
											<td class="px-3 py-2 text-right font-medium text-success">{row.pulled}</td>
											<td class="px-3 py-2 text-right font-medium text-accent">{row.pulledPercent}%</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</div>
				{:else}
					<div class="bg-bg-card rounded-xl border border-border p-5 text-text-muted text-sm">
						Keine Trainingsdaten im gewählten Zeitraum.
					</div>
				{/if}
			</section>
		{/if}

		<section>
			<h3 class="text-lg font-semibold text-text-primary mb-1">Spot-Auswertung</h3>
			<p class="text-text-muted text-sm mb-4">Wie oft ein Spot gewählt wurde.</p>

			{#if stats.spotUsageEvents.length === 0}
				<div class="bg-bg-card rounded-xl border border-border p-5 text-text-muted text-sm">
					Keine Spot-Votings in vergangenen Trainings vorhanden.
				</div>
			{:else}
				<div class="bg-bg-card rounded-xl border border-border p-4 md:p-5 space-y-4">
					<div class="flex flex-wrap items-center gap-3">
						<label for="spot-period-mode" class="text-text-secondary text-sm">Zeitraum</label>
						<select
							id="spot-period-mode"
							bind:value={spotMode}
							class="bg-bg-secondary border border-border rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent cursor-pointer"
						>
							<option value="month">Monat</option>
							<option value="year">Jahr</option>
							<option value="range">Frei (von-bis)</option>
						</select>

						{#if spotMode === 'month'}
							<select
								bind:value={spotMonth}
								class="bg-bg-secondary border border-border rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent cursor-pointer"
							>
								{#each spotMonths as mk}
									<option value={mk}>{mk}</option>
								{/each}
							</select>
						{:else if spotMode === 'year'}
							<select
								bind:value={spotYear}
								class="bg-bg-secondary border border-border rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent cursor-pointer"
							>
								{#each spotYears as y}
									<option value={y}>{y}</option>
								{/each}
							</select>
						{:else}
							<input
								type="date"
								bind:value={rangeFrom}
								class="bg-bg-secondary border border-border rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent"
							/>
							<span class="text-text-muted text-sm">bis</span>
							<input
								type="date"
								bind:value={rangeTo}
								class="bg-bg-secondary border border-border rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent"
							/>
						{/if}
					</div>

					<div class="rounded-xl border border-border overflow-hidden">
						<div class="overflow-x-auto">
							<table class="w-full text-sm text-left min-w-[560px]">
								<thead class="bg-bg-secondary text-text-muted text-xs uppercase tracking-wide">
									<tr>
										<th class="px-3 py-2 font-medium">#</th>
										<th class="px-3 py-2 font-medium">Spot</th>
										<th class="px-3 py-2 font-medium text-right">Wie oft genommen</th>
										<th class="px-3 py-2 font-medium text-right">Top-Votes gesamt</th>
									</tr>
								</thead>
								<tbody class="divide-y divide-border">
									{#if spotUsageRows.length === 0}
										<tr class="bg-bg-card">
											<td class="px-3 py-4 text-text-muted" colspan="4">Keine Daten für diesen Zeitraum.</td>
										</tr>
									{:else}
										{#each spotUsageRows as row, i}
											<tr class="bg-bg-card hover:bg-bg-secondary/40 transition-colors">
												<td class="px-3 py-2 text-text-muted">{i + 1}</td>
												<td class="px-3 py-2 text-text-primary">
													<a href="/spots/{row.spotId}" class="font-medium hover:text-accent transition-colors">{row.spotName}</a>
													<span class="text-text-muted text-xs ml-1">({row.spotCity})</span>
												</td>
												<td class="px-3 py-2 text-right font-semibold text-accent">{row.timesSelected}</td>
												<td class="px-3 py-2 text-right text-text-secondary">{row.totalTopVotes}</td>
											</tr>
										{/each}
									{/if}
								</tbody>
							</table>
						</div>
					</div>
				</div>
			{/if}
		</section>

	{/if}
</div>
