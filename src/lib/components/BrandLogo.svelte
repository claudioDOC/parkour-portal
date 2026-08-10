<script lang="ts">
	/**
	 * Das Portal-Logo: drei gestaffelte Chevrons — Bewegung, Tempo,
	 * vorwärts-aufwärts. Monochrom Weiss auf Nachtschwarz, unabhängig vom
	 * UI-Theme. App-Icons: scripts/generate-brand.mjs (gleiches Motiv).
	 *
	 * `tile` zeichnet die dunkle Kachel dahinter (Header/Login), ohne `tile`
	 * nur das Mark.
	 */
	let {
		size = 40,
		tile = true,
		class: className = ''
	}: { size?: number; tile?: boolean; class?: string } = $props();

	// Eindeutige IDs, falls das Logo mehrfach auf einer Seite steht.
	const uid = `bl${Math.random().toString(36).slice(2, 8)}`;

	/** Chevrons wie im Generator: [x, Deckkraft]. */
	const chevrons: [number, number][] = [
		[96, 0.25],
		[196, 0.55],
		[296, 1]
	];
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 512 512"
	xmlns="http://www.w3.org/2000/svg"
	class={className}
	role="img"
	aria-label="Parkour Portal"
>
	{#if tile}
		<defs>
			<clipPath id="{uid}-clip"><rect width="512" height="512" rx="110" /></clipPath>
		</defs>
	{/if}

	<g clip-path={tile ? `url(#${uid}-clip)` : undefined}>
		{#if tile}
			<rect width="512" height="512" fill="#111214" />
		{/if}
		<g transform="rotate(-14 256 256)">
			{#each chevrons as [x, opacity] (x)}
				<path
					d="M{x} 168 L{x + 106} 268 L{x} 368"
					fill="none"
					stroke="#fafafa"
					stroke-width="46"
					stroke-linejoin="miter"
					{opacity}
				/>
			{/each}
		</g>
	</g>
</svg>
