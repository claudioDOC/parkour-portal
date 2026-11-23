<script lang="ts">
	/**
	 * Zug-O-Meter-Block: Titel links, rechts Emoji + Stufe + Spruch in EINER
	 * Zeile, darunter der Balken. Nur der Balken trägt Farbe und Glühen — der
	 * Block bleibt ruhig, sonst dominiert er das Dashboard. Bei „Grossartig"
	 * bleibt der Balken grün und grüne Flammen züngeln aus ihm heraus; bei
	 * den zwei schlechtesten Stufen pulsiert er als Alarm.
	 *
	 * Eine Zeile auch auf schmalen Handys: Die Kopfzeile ist ein Container und
	 * ihre Schrift skaliert mit dessen Breite (cqi), höchstens 14 px — so
	 * passt auch „🔥🔥🔥 Grossartig · Maximaler Zug!!!" neben den Titel.
	 *
	 * Startseite und Admin-Vorschau nutzen dieselbe Komponente.
	 */
	type LevelKey = 'grossartig' | 'super' | 'gut' | 'ok' | 'schwach' | 'katastrophe';
	let {
		z,
		href = '/statistik'
	}: {
		z: {
			percent: number;
			/** Balkenfüllung 0–100 (Stufen-Skala); fehlt sie, gilt percent. */
			fill?: number;
			level: { key: LevelKey; label: string; emoji: string; blurb: string; intensity: number };
		};
		/** null = kein Link (Vorschau). */
		href?: string | null;
	} = $props();

	/** Stufenfarbe: 1 dunkelrot … 6 starkes Grün — in jedem Farbschema gleich. */
	const COLOR: Record<LevelKey, { hex: string; rgb: string }> = {
		grossartig: { hex: '#00e676', rgb: '0, 230, 118' },
		super: { hex: '#22c55e', rgb: '34, 197, 94' },
		gut: { hex: '#eab308', rgb: '234, 179, 8' },
		ok: { hex: '#f97316', rgb: '249, 115, 22' },
		schwach: { hex: '#ef4444', rgb: '239, 68, 68' },
		katastrophe: { hex: '#991b1b', rgb: '153, 27, 27' }
	};
	const c = $derived(COLOR[z.level.key] ?? COLOR.ok);
	const fire = $derived(z.level.key === 'grossartig');
	const fx = $derived(fire ? 'zug-fire' : z.level.intensity === 2 ? 'zug-alarm' : 'zug-steady');
	const width = $derived(Math.max(z.fill ?? z.percent, 3));

	/**
	 * Flammenzungen entlang der Oberkante: Position (% der Füllung), Höhe,
	 * Flacker-Dauer und Versatz — feste Werte statt Zufall, damit Server und
	 * Browser dasselbe zeichnen und nichts springt.
	 */
	const FLAMES = [
		{ x: 3, h: 0.8, d: 0.62, o: 0 },
		{ x: 11, h: 1.15, d: 0.74, o: 0.21 },
		{ x: 19, h: 0.9, d: 0.58, o: 0.4 },
		{ x: 27, h: 1.3, d: 0.81, o: 0.1 },
		{ x: 35, h: 1, d: 0.66, o: 0.33 },
		{ x: 43, h: 1.4, d: 0.77, o: 0.05 },
		{ x: 51, h: 0.95, d: 0.6, o: 0.45 },
		{ x: 59, h: 1.25, d: 0.7, o: 0.18 },
		{ x: 67, h: 1.05, d: 0.84, o: 0.36 },
		{ x: 75, h: 1.35, d: 0.63, o: 0.08 },
		{ x: 83, h: 0.9, d: 0.72, o: 0.27 },
		{ x: 91, h: 1.2, d: 0.59, o: 0.42 },
		{ x: 98, h: 0.85, d: 0.79, o: 0.14 }
	];
</script>

{#snippet body()}
	<div class="zug-head flex items-baseline gap-2 whitespace-nowrap">
		<span class="shrink-0 font-semibold uppercase tracking-[0.18em] text-text-muted" style="font-size: 0.79em">
			Zug-O-Meter
		</span>
		<span class="ml-auto min-w-0 overflow-hidden text-ellipsis text-right">
			<span class={z.level.intensity === 2 ? 'zug-emoji' : ''} aria-hidden="true">{z.level.emoji}</span>
			<span class="font-semibold" style="color: {c.hex}">{z.level.label}</span>
			<span class="text-text-muted" style="font-size: 0.93em">· {z.level.blurb}</span>
		</span>
	</div>
	<div class="zug-track {fire ? 'mt-5' : 'mt-1.5'}" aria-hidden="true">
		{#if fire}
			<!-- Vor der Füllung im DOM: Die Füllung deckt die Flammenwurzeln ab,
			     sichtbar bleibt nur, was oben herauszüngelt. -->
			<div class="zug-flames" style="width: {width}%">
				{#each FLAMES as f (f.x)}
					<span style="left: {f.x}%; --zug-h: {f.h}; --zug-d: {f.d}s; --zug-o: -{f.o}s"></span>
				{/each}
			</div>
		{/if}
		<div class="zug-fill {fx}" style="width: {width}%; background-color: {c.hex}"></div>
	</div>
{/snippet}

{#if href}
	<a
		{href}
		class="zug-box block rounded-lg px-1 py-1 transition-colors hover:bg-bg-hover"
		style="--zug-rgb: {c.rgb}"
		aria-label="Zug-O-Meter: {z.level.label} — {z.level.blurb}. Details in der Statistik"
	>
		{@render body()}
	</a>
{:else}
	<div class="zug-box px-1 py-1" style="--zug-rgb: {c.rgb}" aria-label="Zug-O-Meter: {z.level.label} — {z.level.blurb}">
		{@render body()}
	</div>
{/if}

<style>
	.zug-box {
		container-type: inline-size;
	}
	/* 3.7 % der Breite ≈ die längste Zeile passt noch; nie grösser als 14 px. */
	.zug-head {
		font-size: min(0.875rem, 3.7cqi);
	}
</style>
