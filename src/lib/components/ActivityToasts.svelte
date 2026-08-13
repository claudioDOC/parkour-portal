<script lang="ts">
	/** Live-Popups: erscheinen sofort, wenn jemand anderes etwas macht. */
	import { activityStore, dismissToast } from '$lib/activityStore.svelte';
</script>

{#if activityStore.toasts.length > 0}
	<div
		class="pointer-events-none fixed inset-x-3 top-[calc(4.5rem+env(safe-area-inset-top))] z-[88] mx-auto flex max-w-sm flex-col gap-2 md:right-6 md:left-auto md:top-6 md:mx-0"
		role="status"
		aria-live="polite"
	>
		{#each activityStore.toasts as t (t.id)}
			<a
				href={t.url ?? '/'}
				onclick={() => dismissToast(t.id)}
				class="pointer-events-auto rounded-xl border border-accent/35 bg-bg-card/97 px-4 py-3 shadow-2xl backdrop-blur transition-transform active:scale-[0.98]"
			>
				<p class="text-sm font-semibold leading-snug text-text-primary">{t.title}</p>
				{#if t.body}
					<p class="mt-0.5 text-xs leading-snug text-text-secondary">{t.body}</p>
				{/if}
			</a>
		{/each}
	</div>
{/if}
