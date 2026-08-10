<script lang="ts">
	/**
	 * Einheitlicher Seitenkopf im Stil des Dashboards: Kicker-Zeile,
	 * grosse Display-Überschrift, Akzentbalken. `actions` landet rechts
	 * (z. B. ein Button), `children` unter der Sub-Zeile.
	 */
	import type { Snippet } from 'svelte';

	let {
		kicker,
		title,
		sub = '',
		actions,
		children
	}: {
		kicker: string;
		title: string;
		sub?: string;
		actions?: Snippet;
		children?: Snippet;
	} = $props();
</script>

<header class="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-5">
	<div
		class="hidden h-14 w-1.5 shrink-0 rounded-sm bg-gradient-to-b from-accent via-accent-hot to-accent-hot/60 shadow-accent-bar-glow sm:block"
		aria-hidden="true"
	></div>
	<div class="min-w-0 flex-1 space-y-1">
		<p class="font-display text-sm font-medium uppercase tracking-[0.35em] text-accent-hot">
			{kicker}
		</p>
		<div class="space-y-2">
			<h2
				class="font-display text-4xl font-semibold uppercase tracking-[0.06em] text-text-primary md:text-5xl"
			>
				{title}
			</h2>
			<div
				class="h-1.5 w-16 rounded-sm bg-gradient-to-r from-accent to-accent-hot sm:hidden"
				aria-hidden="true"
			></div>
		</div>
		{#if sub}
			<p class="text-text-secondary">{sub}</p>
		{/if}
		{#if children}
			{@render children()}
		{/if}
	</div>
	{#if actions}
		<div class="shrink-0 sm:pt-2">
			{@render actions()}
		</div>
	{/if}
</header>
