<script lang="ts">
	/**
	 * Umschalter zwischen zwei Ansichten desselben Inhalts (Liste ⇄ Karte).
	 *
	 * Bewusst als Schieber und nicht als einzelner Knopf: Man sieht damit,
	 * wo man gerade steht — ein Knopf, der nur die Gegenrichtung beschriftet,
	 * lässt das offen. Und bewusst als Knöpfe statt Links: Umgeschaltet wird
	 * an Ort und Stelle, ohne Seitenwechsel. Gleiche Bedienung wie im
	 * Spots-Tab der App.
	 */
	type Item = { key: string; label: string; icon: 'list' | 'map' };
	let {
		items,
		current,
		onSelect
	}: { items: Item[]; current: string; onSelect: (key: string) => void } = $props();
</script>

<div class="inline-flex shrink-0 rounded-full bg-bg-hover p-1">
	{#each items as item (item.key)}
		{@const active = item.key === current}
		<button
			type="button"
			onclick={() => onSelect(item.key)}
			aria-pressed={active}
			aria-current={active ? 'true' : undefined}
			class="flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors
				{active
				? 'bg-accent text-[#0c0c0e]'
				: 'text-text-secondary hover:text-text-primary'}"
		>
			{#if item.icon === 'list'}
				<svg class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
					<path d="M6 5h11M6 10h11M6 15h11M3 5h.01M3 10h.01M3 15h.01" stroke-linecap="round" />
				</svg>
			{:else}
				<svg class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
					<path d="M7.5 3 3 5v12l4.5-2 5 2L17 15V3l-4.5 2-5-2Zm0 0v12m5-10v12" stroke-linejoin="round" stroke-linecap="round" />
				</svg>
			{/if}
			{item.label}
		</button>
	{/each}
</div>
