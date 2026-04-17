<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function formatShortDate(iso: string): string {
		const d = new Date(iso.includes('T') ? iso : `${iso}T12:00:00`);
		if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
		return d.toLocaleDateString('de-CH', { day: 'numeric', month: 'short' });
	}
</script>

<div class="space-y-8">
	{#if !data.schemaReady}
		<div class="rounded-xl border border-border bg-bg-card px-6 py-12 text-center">
			<p class="text-text-secondary">Challenges sind in dieser Umgebung noch nicht verfügbar (Datenbank-Schema).</p>
			<a href="/spots" class="btn-link btn-link-secondary mt-4 inline-flex">Zu den Spots</a>
		</div>
	{:else}
		<header
			class="relative overflow-hidden rounded-2xl border border-accent/25 bg-gradient-to-br from-accent/[0.12] via-bg-card to-bg-card px-5 py-6 md:px-8 md:py-8"
		>
			<div
				class="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-accent-hot/20 blur-2xl"
				aria-hidden="true"
			></div>
			<div class="relative space-y-3">
				<p class="font-display text-xs font-semibold uppercase tracking-[0.28em] text-accent-hot">Quest-Board</p>
				<h2 class="font-display text-3xl font-semibold uppercase tracking-[0.08em] text-text-primary md:text-4xl">
					Challenge-Arena
				</h2>
				<p class="max-w-2xl text-sm text-text-secondary md:text-base">
					Alle aktiven Spot-Quests — wer hat was erlegt? Offene Quests locken, die Rangliste ehrt die fleissigsten
					Legenden.
				</p>
			</div>

			<div class="relative mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
				<div class="rounded-xl border border-border bg-bg-secondary/80 px-3 py-3 text-center shadow-inner shadow-black/10">
					<p class="font-display text-2xl font-bold text-accent md:text-3xl">{data.totalChallenges}</p>
					<p class="mt-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">Aktive Quests</p>
				</div>
				<div class="rounded-xl border border-border bg-bg-secondary/80 px-3 py-3 text-center shadow-inner shadow-black/10">
					<p class="font-display text-2xl font-bold text-success md:text-3xl">{data.totalClears}</p>
					<p class="mt-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">Siege gesamt</p>
				</div>
				<div class="rounded-xl border border-border bg-bg-secondary/80 px-3 py-3 text-center shadow-inner shadow-black/10">
					<p class="font-display text-2xl font-bold text-warning md:text-3xl">{data.openQuests}</p>
					<p class="mt-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">Noch offen</p>
				</div>
				<div class="rounded-xl border border-border bg-bg-secondary/80 px-3 py-3 text-center shadow-inner shadow-black/10">
					<p class="font-display text-2xl font-bold text-accent-blue md:text-3xl">{data.spotsWithChallenges.length}</p>
					<p class="mt-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">Spots am Start</p>
				</div>
			</div>
		</header>

		<div class="grid gap-8 lg:grid-cols-[1fr_minmax(16rem,22rem)]">
			<div class="space-y-6">
				{#if data.spotsWithChallenges.length === 0}
					<div class="rounded-xl border border-border bg-bg-card px-6 py-12 text-center">
						<p class="text-text-secondary">Noch keine Quests in der Arena — Spot-Challenges anlegen und Gas geben.</p>
						<a href="/spots" class="btn-link btn-link-secondary mt-4 inline-flex">Zu den Spots</a>
					</div>
				{:else}
					{#each data.spotsWithChallenges as group (group.spotId)}
						<section
							class="overflow-hidden rounded-xl border border-border bg-bg-card shadow-[inset_0_1px_0_rgb(255_255_255/0.04)]"
						>
							<div
								class="flex flex-col gap-2 border-b border-border bg-bg-secondary/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5"
							>
								<div class="min-w-0">
									<a
										href="/spots/{group.spotId}"
										class="font-display text-lg font-semibold uppercase tracking-wide text-text-primary transition-colors hover:text-accent"
									>
										{group.spotName}
									</a>
									<p class="text-sm text-text-muted">
										{group.spotCity}{#if group.isMicro}
											<span class="text-accent-blue"> · Microspot</span>
										{/if}
									</p>
								</div>
								<a
									href="/spots/{group.spotId}"
									class="shrink-0 rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-accent transition-colors hover:bg-accent/20"
								>
									Zum Spot
								</a>
							</div>
							<ul class="divide-y divide-border">
								{#each group.challenges as ch (ch.id)}
									<li class="px-4 py-4 sm:px-5">
										<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
											<div class="min-w-0 flex-1">
												<p class="font-medium text-text-primary">{ch.title}</p>
												{#if ch.description}
													<p class="mt-1 text-sm leading-relaxed text-text-secondary">{ch.description}</p>
												{/if}
												<p class="mt-2 text-xs text-text-muted">
													Quest von <span class="text-text-secondary">{ch.createdByName}</span>
													{#if ch.createdAt}
														· {ch.createdAt.slice(0, 10)}
													{/if}
												</p>
											</div>
											<div
												class="shrink-0 rounded-lg border px-2 py-1 text-center text-[10px] font-bold uppercase tracking-wider {ch
													.completers.length > 0
													? 'border-success/40 bg-success/10 text-success'
													: 'border-warning/35 bg-warning/10 text-warning'}"
											>
												{ch.completers.length} Sieg{ch.completers.length === 1 ? '' : 'e'}
											</div>
										</div>
										{#if ch.completers.length > 0}
											<div class="mt-3">
												<p class="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
													Legenden (Abschluss)
												</p>
												<div class="flex flex-wrap gap-1.5">
													{#each ch.completers as co, i (co.username + ':' + co.completedAt + ':' + i)}
														<span
															class="rounded-full border border-success/25 bg-success/10 px-2.5 py-1 text-xs font-medium text-success"
															title={co.completedAt}
														>
															{co.username}
															<span class="text-success/70">· {formatShortDate(co.completedAt)}</span>
														</span>
													{/each}
												</div>
											</div>
										{:else}
											<p class="mt-3 text-xs italic text-warning/90">Noch niemand — erste:r gewinnt die Ehre.</p>
										{/if}
									</li>
								{/each}
							</ul>
						</section>
					{/each}
				{/if}
			</div>

			<div class="space-y-6 lg:sticky lg:top-6 lg:self-start">
				<section class="rounded-xl border border-border bg-bg-card p-4 md:p-5">
					<h3 class="font-display text-sm font-semibold uppercase tracking-[0.2em] text-accent">Rangliste</h3>
					<p class="mt-1 text-xs text-text-muted">Meiste Challenge-Siege (aktive Spots)</p>
					{#if data.leaderboard.length === 0}
						<p class="mt-4 text-sm text-text-muted">Noch keine Siege — Zeit, loszulegen.</p>
					{:else}
						<ol class="mt-4 space-y-2">
							{#each data.leaderboard as row, rank (row.userId)}
								<li
									class="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm {data.viewerUsername ===
									row.username
										? 'border-accent/40 bg-accent/10'
										: 'border-border bg-bg-secondary/50'}"
								>
									<div class="flex min-w-0 items-center gap-2">
										<span
											class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md font-display text-xs font-bold {rank <
											3
												? 'bg-gradient-to-br from-accent to-accent-hot text-black'
												: 'bg-bg-hover text-text-muted'}"
										>
											{rank + 1}
										</span>
										<span class="truncate font-medium text-text-primary">{row.username}</span>
									</div>
									<span class="shrink-0 font-display text-lg font-semibold text-accent">{row.clears}</span>
								</li>
							{/each}
						</ol>
					{/if}
				</section>

				<section class="rounded-xl border border-border bg-bg-card p-4 md:p-5">
					<h3 class="font-display text-sm font-semibold uppercase tracking-[0.2em] text-accent-hot">Letzte Siege</h3>
					<p class="mt-1 text-xs text-text-muted">Frisch im Logbuch</p>
					{#if data.recentClears.length === 0}
						<p class="mt-4 text-sm text-text-muted">Hier knistert’s noch nicht.</p>
					{:else}
						<ul class="mt-3 space-y-2.5">
							{#each data.recentClears as ev, i (`${i}-${ev.at}-${ev.username}-${ev.challengeTitle}`)}
								<li class="rounded-lg border border-border bg-bg-secondary/40 px-3 py-2 text-xs leading-snug">
									<span class="font-semibold text-text-primary">{ev.username}</span>
									<span class="text-text-muted"> hat </span>
									<span class="text-accent">„{ev.challengeTitle}“</span>
									<span class="text-text-muted"> geklärt · </span>
									<a href="/spots/{ev.spotId}" class="text-accent hover:underline">{ev.spotName}</a>
									<span class="block text-[10px] text-text-muted mt-0.5">{formatShortDate(ev.at)}</span>
								</li>
							{/each}
						</ul>
					{/if}
				</section>
			</div>
		</div>
	{/if}
</div>
