<script lang="ts">
	/**
	 * Zug-O-Meter-Block: Titel links, rechts Emoji + Stufe + Spruch in EINER
	 * Zeile, darunter der Balken. Nur der Balken trägt Farbe und Glühen — der
	 * Block bleibt ruhig, sonst dominiert er das Dashboard. Bei „Grossartig"
	 * ist der Balken ganz voll und grün, und grünes Feuer lodert aus ihm; bei
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
	 * Feuer bei „Grossartig": viele glühende Teilchen, die aus dem Balken
	 * aufsteigen, dabei schrumpfen und verlöschen — übereinander ergeben sie
	 * lodernde Flammen statt einzelner Kerzen. Feste Formel statt Zufall
	 * (Server und Browser zeichnen dasselbe), dieselbe wie in der App
	 * (native/src/lib/ZugkraftCard.tsx). Jedes dritte Teilchen ist ein
	 * kleiner, heller Kern, der tiefer bleibt.
	 * x = Position (% der Füllung), s = Grösse, r = Steighöhe, dx = Drift
	 * (rem), d = Dauer (s), p = Phase 0–1.
	 */
	const frac = (n: number) => n - Math.floor(n);
	const r2 = (n: number) => Math.round(n * 100) / 100;
	const FIRE = Array.from({ length: 34 }, (_, i) => {
		const core = i % 3 === 0;
		const b = frac(i * 0.754878 + 0.13);
		const c = frac(i * 0.56984 + 0.29);
		const d = frac(i * 0.414214 + 0.07);
		return {
			core,
			x: r2(2 + frac(i * 0.618034) * 96),
			s: r2(core ? 0.45 + b * 0.2 : 0.75 + b * 0.45),
			r: r2(core ? 0.6 + c * 0.45 : 1.1 + c * 0.8),
			dx: r2((frac(i * 0.207107 + 0.5) - 0.5) * 0.5),
			d: r2(core ? 0.7 + d * 0.4 : 0.95 + d * 0.6),
			p: r2(frac(i * 0.324718 + 0.41))
		};
	});
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
	<div class="zug-track {fire ? 'mt-8' : 'mt-1.5'}" aria-hidden="true">
		{#if fire}
			<!-- Vor der Füllung im DOM: Die Füllung deckt den Ursprung der
			     Teilchen ab, sichtbar ist nur, was oben herauslodert. -->
			<div class="zug-flames" style="width: {width}%">
				{#each FIRE as f, i (i)}
					<span
						class={f.core ? 'core' : ''}
						style="left: {f.x}%; --s: {f.s}rem; --r: {f.r}rem; --dx: {f.dx}rem; --d: {f.d}s; --o: -{r2(f.p * f.d)}s; --p: {f.p}"
					></span>
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
