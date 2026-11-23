<script lang="ts">
	/**
	 * Zug-O-Meter-Block: Titel links, rechts Emoji + Stufe + Spruch in EINER
	 * Zeile, darunter der Balken. Nur der Balken trägt Farbe und Glühen — der
	 * Block bleibt ruhig, sonst dominiert er das Dashboard. Bei sechs flackert
	 * der Balken wie Feuer, bei eins und zwei pulsiert er als Alarm.
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
	const fx = $derived(
		z.level.key === 'grossartig' ? 'zug-flame' : z.level.intensity === 2 ? 'zug-alarm' : 'zug-steady'
	);
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
	<div class="zug-track mt-1.5" aria-hidden="true">
		<div class="zug-fill {fx}" style="width: {Math.max(z.percent, 3)}%; background-color: {c.hex}"></div>
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
