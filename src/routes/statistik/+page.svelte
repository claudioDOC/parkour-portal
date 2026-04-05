<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const stats = data.stats;
	const myId = data.user?.id;

	let monthKey = $state(stats.monthDetail.length ? stats.monthDetail[stats.monthDetail.length - 1].key : '');

	const selectedMonth = $derived(stats.monthDetail.find((m) => m.key === monthKey) ?? null);

	const chartMax = $derived(
		Math.max(1, ...stats.monthly.map((m) => Math.max(m.sessionCount, m.absenceCount)))
	);

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
		{#if data.user?.role === 'admin'}
			<p class="text-text-muted text-sm mt-3 max-w-xl border-t border-border/60 pt-3">
				<strong class="text-text-secondary font-medium">Korrekturen:</strong> Fehlende Anwesenheit nachträglich als Abwesenheit eintragen oder aufheben unter
				<a href="/admin" class="text-accent hover:underline">Admin → Trainings</a>
				(„Nachträglich abmelden“ / „Aufheben“ bei bestehendem Eintrag). Es gibt kein separates Zurücksetzen der Statistik — sie folgt immer den gespeicherten Trainingsdaten.
			</p>
		{/if}
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
				<p class="text-text-muted text-xs uppercase tracking-wide">Ø pro Training</p>
				<p class="text-2xl md:text-3xl font-bold text-text-primary mt-1">{stats.group.avgAbsencesPerSession}</p>
				<p class="text-text-muted text-xs mt-1">Leute ziehen nicht</p>
			</div>
			<div class="bg-bg-card rounded-xl border border-border p-4 md:p-5">
				<p class="text-text-muted text-xs uppercase tracking-wide">Mitglieder</p>
				<p class="text-2xl md:text-3xl font-bold text-text-primary mt-1">{stats.group.memberCount}</p>
				<p class="text-text-muted text-xs mt-1">in der Wertung</p>
			</div>
		</section>

		{#if stats.monthly.length > 0}
			<section>
				<h3 class="text-lg font-semibold text-text-primary mb-1">Monatsverlauf</h3>
				<p class="text-text-muted text-sm mb-4">Grün = Trainings im Monat · Orange = gemeldete Abwesenheiten</p>
				<div class="space-y-3 bg-bg-card rounded-xl border border-border p-4 md:p-5">
					{#each stats.monthly as m}
						<div class="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
							<span class="text-text-secondary text-sm w-36 shrink-0">{m.label}</span>
							<div class="flex-1 flex flex-col gap-1.5 min-w-0">
								<div class="flex items-center gap-2">
									<span class="text-accent text-xs w-16 shrink-0">Training</span>
									<div class="flex-1 h-2.5 bg-bg-secondary rounded-full overflow-hidden">
										<div
											class="h-full bg-accent rounded-full transition-all"
											style="width: {(m.sessionCount / chartMax) * 100}%"
										></div>
									</div>
									<span class="text-text-primary text-sm font-medium w-8 text-right">{m.sessionCount}</span>
								</div>
								<div class="flex items-center gap-2">
									<span class="text-warning text-xs w-16 shrink-0">Abmeld.</span>
									<div class="flex-1 h-2.5 bg-bg-secondary rounded-full overflow-hidden">
										<div
											class="h-full bg-warning/80 rounded-full transition-all"
											style="width: {(m.absenceCount / chartMax) * 100}%"
										></div>
									</div>
									<span class="text-text-primary text-sm font-medium w-8 text-right">{m.absenceCount}</span>
								</div>
							</div>
						</div>
					{/each}
				</div>
			</section>
		{/if}

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
				<h3 class="text-lg font-semibold text-text-primary mb-1">Nach Monat</h3>
				<p class="text-text-muted text-sm mb-4">Gleiche Kennzahlen, gefiltert nach Kalendermonat.</p>
				<div class="flex flex-wrap items-center gap-3 mb-4">
					<label for="month-pick" class="text-text-secondary text-sm">Monat wählen</label>
					<select
						id="month-pick"
						bind:value={monthKey}
						class="bg-bg-secondary border border-border rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent cursor-pointer"
					>
						{#each stats.monthDetail as m}
							<option value={m.key}>{m.label} ({m.sessionCount} Trainings)</option>
						{/each}
					</select>
				</div>

				{#if selectedMonth}
					<p class="text-text-secondary text-sm mb-3">
						{selectedMonth.sessionCount} Trainings · {selectedMonth.absenceCount} Abmeldungen erfasst
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
									{#each selectedMonth.leaderboard as row}
										<tr class="{row.userId === myId ? 'bg-accent/10' : 'bg-bg-card'}">
											<td class="px-3 py-2 text-text-primary font-medium whitespace-nowrap">
												{row.username}{#if row.userId === myId}<span class="text-accent text-xs ml-1">(du)</span>{/if}
											</td>
											<td class="px-3 py-2 text-right text-text-secondary">{row.eligiblePastSessions}</td>
											<td class="px-3 py-2 text-right text-warning">{row.absences}</td>
											<td class="px-3 py-2 text-right font-medium text-success">{row.implicitPresent}</td>
											<td class="px-3 py-2 text-right font-medium text-accent">{row.showUpPercent}%</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</div>
				{/if}
			</section>
		{/if}

	{/if}
</div>
