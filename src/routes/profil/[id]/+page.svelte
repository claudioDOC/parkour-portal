<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import ImageLightbox from '$lib/components/ImageLightbox.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/** Profilbild vergrössert anzeigen (nur wenn eines gesetzt ist). */
	let avatarLightbox = $state<string | null>(null);

	function monthLabel(key: string): string {
		const [y, m] = key.split('-').map(Number);
		return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('de-CH', {
			month: 'short',
			year: '2-digit'
		});
	}

	function barWidth(percent: number): number {
		return Math.max(0, Math.min(100, Number(percent) || 0));
	}

	function formatDate(iso: string): string {
		return new Date(iso + 'Z').toLocaleDateString('de-CH', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}
</script>

<div class="space-y-8">
	<PageHeader kicker={data.isOwn ? 'Dein Verlauf' : 'Mitglied'} title={data.profile.username}>
		{#snippet actions()}
			<div class="flex items-center gap-3">
				{#if data.profile.avatar}
					<button
						type="button"
						onclick={() => (avatarLightbox = data.profile.avatarFull ?? data.profile.avatar)}
						class="cursor-zoom-in rounded-full transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
						aria-label="Profilbild vergrössern"
					>
						<UserAvatar src={data.profile.avatar} username={data.profile.username} size={72} />
					</button>
				{:else}
					<UserAvatar src={null} username={data.profile.username} size={72} />
				{/if}
			</div>
		{/snippet}
		{#if data.isOwn}
			<p class="text-text-muted text-sm">
				Profilbild änderst du in den
				<a href="/settings" class="text-accent hover:underline">Einstellungen</a>.
			</p>
		{/if}
	</PageHeader>

	{#if !data.me}
		<div class="bg-bg-card rounded-xl border border-border p-8 text-center">
			<p class="text-text-muted">Noch keine Trainingsdaten.</p>
		</div>
	{:else}
		<section class="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
			<div class="bg-bg-card rounded-xl border border-border p-4 md:p-5">
				<p class="text-text-muted text-xs uppercase tracking-wide">Gezogen %</p>
				<p class="text-2xl md:text-3xl font-bold text-accent mt-1">{data.me.showUpPercent}%</p>
				<p class="text-text-muted text-xs mt-1">Rang {data.myRank} von {data.totalMembers}</p>
			</div>
			<div class="bg-bg-card rounded-xl border border-border p-4 md:p-5">
				<p class="text-text-muted text-xs uppercase tracking-wide">Streak</p>
				<p class="text-2xl md:text-3xl font-bold text-text-primary mt-1">{data.me.streakNoAbsence}</p>
				<p class="text-text-muted text-xs mt-1">Trainings in Folge</p>
			</div>
			<div class="bg-bg-card rounded-xl border border-border p-4 md:p-5">
				<p class="text-text-muted text-xs uppercase tracking-wide">Gezogen</p>
				<p class="text-2xl md:text-3xl font-bold text-success mt-1">{data.me.implicitPresent}</p>
				<p class="text-text-muted text-xs mt-1">von {data.me.eligiblePastSessions} Trainings</p>
			</div>
			<div class="bg-bg-card rounded-xl border border-border p-4 md:p-5">
				<p class="text-text-muted text-xs uppercase tracking-wide">Challenges</p>
				<p class="text-2xl md:text-3xl font-bold text-accent-hot mt-1">{data.completedChallenges.length}</p>
				<p class="text-text-muted text-xs mt-1">geschafft · {data.openChallengeCount} offen</p>
			</div>
			<div class="bg-bg-card rounded-xl border border-border p-4 md:p-5 col-span-2 lg:col-span-1">
				<p class="text-text-muted text-xs uppercase tracking-wide">🏃 Solo</p>
				<p class="text-2xl md:text-3xl font-bold text-text-primary mt-1">{data.soloCount}</p>
				<p class="text-text-muted text-xs mt-1">Solo-Trainings</p>
			</div>
		</section>

		{#if data.monthly.length > 0}
			<section class="bg-bg-card rounded-xl border border-border p-5 md:p-6">
				<h3 class="text-lg font-semibold text-text-primary mb-4">Monatsverlauf</h3>
				<div class="space-y-2">
					{#each data.monthly as m (m.key)}
						<div class="grid grid-cols-[3.5rem_1fr_auto] items-center gap-3">
							<span class="text-text-muted text-xs tabular-nums">{monthLabel(m.key)}</span>
							<div class="h-2.5 overflow-hidden rounded-full bg-bg-hover">
								<div
									class="h-full rounded-full bg-gradient-to-r from-accent to-accent-hot"
									style="width: {barWidth(m.percent)}%"
								></div>
							</div>
							<span class="text-text-secondary text-xs tabular-nums w-20 text-right">
								{m.pulled}/{m.trainings} · <span class="text-accent font-semibold">{m.percent}%</span>
							</span>
						</div>
					{/each}
				</div>
			</section>
		{/if}

		<section class="bg-bg-card rounded-xl border border-border p-5 md:p-6">
			<h3 class="text-lg font-semibold text-text-primary mb-1">Geschaffte Challenges</h3>
			{#if data.completedChallenges.length === 0}
				<p class="text-text-muted text-sm">
					Noch keine — schau in der <a href="/challenges" class="text-accent hover:underline">Challenge-Arena</a> vorbei.
				</p>
			{:else}
				<div class="mt-3 space-y-1.5">
					{#each data.completedChallenges as c (c.id)}
						<a
							href="/spots/{c.spotId}"
							class="flex items-center justify-between gap-3 rounded-lg bg-bg-secondary px-3 py-2 transition-colors hover:bg-bg-hover"
						>
							<span class="min-w-0">
								<span class="block truncate text-sm font-medium text-text-primary">💪 {c.title}</span>
								<span class="block text-xs text-text-muted">{c.spotName}</span>
							</span>
							<span class="shrink-0 text-xs text-text-muted">{formatDate(c.completedAt)}</span>
						</a>
					{/each}
				</div>
			{/if}
		</section>
	{/if}

	<section class="bg-bg-card rounded-xl border border-border p-5 md:p-6">
		<h3 class="text-lg font-semibold text-text-primary mb-3">Alle Mitglieder</h3>
		<div class="flex flex-wrap gap-2">
			{#each data.members as m (m.id)}
				<a
					href="/profil/{m.id}"
					class="flex items-center gap-2 rounded-full border px-2.5 py-1.5 transition-colors {m.id === data.profile.id
						? 'border-accent/50 bg-accent/10'
						: 'border-border bg-bg-secondary hover:border-accent/40 hover:bg-bg-hover'}"
				>
					<UserAvatar src={m.avatar} username={m.username} size={24} />
					<span class="text-sm font-medium text-text-primary">{m.username}</span>
				</a>
			{/each}
		</div>
	</section>
</div>

<ImageLightbox
	url={avatarLightbox}
	alt="Profilbild von {data.profile.username}"
	onClose={() => (avatarLightbox = null)}
/>
