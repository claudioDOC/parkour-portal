<script lang="ts">
	/**
	 * Das Portal-Logo: ein Blockraster, durch das eine Diagonale frei
	 * bleibt — der Weg durchs Hindernis. Blöcke vor der Route stehen
	 * zurück, die dahinter voll. Monochrom Weiss auf Nachtschwarz,
	 * unabhängig vom UI-Theme. Gleiche Geometrie wie die App-Icons
	 * (scripts/generate-brand.mjs) — dort werden die PNGs erzeugt.
	 *
	 * `tile` zeichnet die dunkle Kachel dahinter (Header/Login), ohne
	 * `tile` nur das Mark.
	 */
	let {
		size = 44,
		tile = true,
		class: className = ''
	}: { size?: number; tile?: boolean; class?: string } = $props();

	// Eindeutige IDs, falls das Logo mehrfach auf einer Seite steht.
	const uid = `bl${Math.random().toString(36).slice(2, 8)}`;

	const CELL = 84;
	const GAP = 14;
	// Exakt zentriert: 4 Zellen + 3 Lücken = 378 → (512 - 378) / 2.
	const START = (512 - (4 * CELL + 3 * GAP)) / 2;

	/** Alle Blöcke ausser der freien Gegendiagonale. */
	const cells = Array.from({ length: 4 }, (_, row) =>
		Array.from({ length: 4 }, (_, col) => ({ row, col }))
	)
		.flat()
		.filter(({ row, col }) => row + col !== 3)
		.map(({ row, col }) => ({
			key: `${row}-${col}`,
			x: START + col * (CELL + GAP),
			y: START + row * (CELL + GAP),
			opacity: row + col < 3 ? 0.42 : 1
		}));
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
		{#each cells as cell (cell.key)}
			<rect
				x={cell.x}
				y={cell.y}
				width={CELL}
				height={CELL}
				rx="10"
				fill="#fafafa"
				opacity={cell.opacity}
			/>
		{/each}
	</g>
</svg>
