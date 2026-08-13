<script lang="ts">
	/**
	 * Glocke mit rotem Punkt — überall sichtbar (mobile Kopfleiste + Sidebar).
	 * Zeigt den Aktivitäts-Feed; neue Ereignisse erscheinen zusätzlich als
	 * Popup (siehe ActivityToasts), damit man Dinge live mitbekommt.
	 */
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { activityStore, refreshActivity, markActivitySeen } from '$lib/activityStore.svelte';
	import { tapFeedback } from '$lib/haptics';

	let open = $state(false);

	function timeAgo(iso: string): string {
		const then = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z').getTime();
		const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
		if (mins < 1) return 'gerade eben';
		if (mins < 60) return `vor ${mins} Min.`;
		const h = Math.round(mins / 60);
		if (h < 24) return `vor ${h} Std.`;
		return `vor ${Math.round(h / 24)} T.`;
	}

	function toggle() {
		open = !open;
		tapFeedback();
		if (open) markActivitySeen();
	}

	// Schliessen, wenn man auf einen Eintrag navigiert
	$effect(() => {
		void $page.url.pathname;
		open = false;
	});

	onMount(() => {
		void refreshActivity();
	});
</script>

<div class="relative">
	<button
		type="button"
		onclick={toggle}
		class="relative flex h-10 w-10 items-center justify-center rounded-full text-text-secondary transition-colors hover:text-text-primary"
		aria-label="Benachrichtigungen{activityStore.unread > 0 ? ` (${activityStore.unread} neu)` : ''}"
		aria-expanded={open}
	>
		<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="1.75" stroke="currentColor">
			<path stroke-linecap="round" stroke-linejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
		</svg>
		{#if activityStore.unread > 0}
			<span
				class="absolute right-1.5 top-1.5 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-danger ring-2 ring-bg-secondary"
				aria-hidden="true"
			></span>
		{/if}
	</button>

	{#if open}
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div class="fixed inset-0 z-[85]" onclick={() => (open = false)}></div>
		<div
			class="absolute right-0 z-[86] mt-2 max-h-[70vh] w-[min(22rem,calc(100vw-1.5rem))] overflow-y-auto rounded-xl border border-border bg-bg-card shadow-2xl"
		>
			<div class="sticky top-0 flex items-center justify-between border-b border-border bg-bg-card px-4 py-2.5">
				<p class="font-semibold text-text-primary">Aktivität</p>
				<span class="text-xs text-text-muted">{activityStore.entries.length}</span>
			</div>
			{#if activityStore.entries.length === 0}
				<p class="px-4 py-8 text-center text-sm text-text-muted">Noch nichts passiert.</p>
			{:else}
				<ul class="divide-y divide-border">
					{#each activityStore.entries as e (e.id)}
						<li>
							<a
								href={e.url ?? '/'}
								class="block px-4 py-3 transition-colors hover:bg-bg-hover {e.id > activityStore.seenAtOpen ? 'bg-accent/[0.06]' : ''}"
							>
								<p class="text-sm font-medium leading-snug text-text-primary">{e.title}</p>
								{#if e.body}
									<p class="mt-0.5 text-xs leading-snug text-text-secondary">{e.body}</p>
								{/if}
								<p class="mt-1 text-[11px] text-text-muted">{timeAgo(e.createdAt)}</p>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</div>
