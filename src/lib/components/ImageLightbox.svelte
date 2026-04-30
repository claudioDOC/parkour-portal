<script lang="ts">
	type Props = {
		url: string | null;
		alt?: string;
		onClose: () => void;
	};
	let { url, alt = '', onClose }: Props = $props();

	function handleWindowKeydown(e: KeyboardEvent) {
		if (url !== null && e.key === 'Escape') {
			onClose();
		}
	}
</script>

<svelte:window onkeydown={handleWindowKeydown} />

{#if url}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-[10050] flex items-center justify-center bg-black/92 p-3 sm:p-8"
		role="dialog"
		aria-modal="true"
		aria-label="Vergrössertes Bild"
		onclick={onClose}
	>
		<button
			type="button"
			class="absolute right-3 top-3 z-[10052] flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-white/25 bg-black/55 text-2xl leading-none text-white hover:bg-black/75"
			onclick={(e) => {
				e.stopPropagation();
				onClose();
			}}
			aria-label="Schliessen"
		>
			×
		</button>
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<img
			src={url}
			alt={alt}
			class="relative z-[10051] max-h-[min(92vh,920px)] max-w-[min(96vw,1200px)] cursor-default rounded-lg object-contain shadow-2xl"
			onclick={(e) => e.stopPropagation()}
		/>
	</div>
{/if}
