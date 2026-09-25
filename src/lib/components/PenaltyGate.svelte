<script lang="ts">
	/**
	 * Strafrunde: Warnhinweis für Leute, die ohne Abmeldung gefehlt haben.
	 *
	 * Erscheint bei jedem Öffnen (einmal pro Browser-Sitzung), bis das
	 * nächste Training beginnt — und lässt sich erst nach 20 Sekunden
	 * wegklicken. Bewusst unbequem: Wer sich nicht abmeldet, soll es einmal
	 * richtig merken. Die eigentliche Pointe (falscher Spot) folgt beim
	 * nächsten Training, siehe noShowPenalty.ts.
	 */
	import { onMount } from 'svelte';
	import { tapFeedback } from '$lib/haptics';

	type Penalty = {
		id: number;
		missed: { id: number; date: string; dayOfWeek: string };
		penalty: { id: number; date: string; dayOfWeek: string; timeStart: string; timeEnd: string };
		phase: 'warning' | 'wrongSpot';
	};

	const WAIT_SECONDS = 20;
	const SEEN_KEY = 'penalty-gate-seen';

	let penalty = $state<Penalty | null>(null);
	let secondsLeft = $state(WAIT_SECONDS);

	function prettyDate(d: string): string {
		return new Date(d + 'T12:00:00').toLocaleDateString('de-CH', {
			weekday: 'long',
			day: 'numeric',
			month: 'long'
		});
	}

	function seenThisSession(id: number): boolean {
		try {
			return sessionStorage.getItem(SEEN_KEY) === String(id);
		} catch {
			return false;
		}
	}

	function dismiss() {
		if (!penalty || secondsLeft > 0) return;
		tapFeedback();
		try {
			sessionStorage.setItem(SEEN_KEY, String(penalty.id));
		} catch {
			/* egal */
		}
		penalty = null;
	}

	onMount(async () => {
		try {
			const res = await fetch('/api/me/penalty', { credentials: 'include' });
			if (!res.ok) return;
			const data = (await res.json()) as { penalty: Penalty | null };
			if (!data.penalty || data.penalty.phase !== 'warning' || seenThisSession(data.penalty.id)) return;
			penalty = data.penalty;
			const timer = setInterval(() => {
				secondsLeft = Math.max(0, secondsLeft - 1);
				if (secondsLeft === 0) clearInterval(timer);
			}, 1000);
		} catch {
			/* Hinweis ist Beiwerk */
		}
	});
</script>

{#if penalty}
	<div
		class="fixed inset-0 z-[99] flex items-center justify-center bg-[#2a0608]/95 p-4 backdrop-blur-md"
		role="alertdialog"
		aria-modal="true"
		aria-labelledby="penalty-title"
	>
		<div class="w-full max-w-md rounded-2xl border-2 border-red-500/70 bg-[#3b0a0d] p-6 text-center shadow-2xl">
			<div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20 text-4xl" aria-hidden="true">
				⚠️
			</div>
			<p class="mt-4 font-display text-xs font-semibold uppercase tracking-[0.3em] text-red-300">
				Strafrunde
			</p>
			<h2 id="penalty-title" class="mt-1 font-display text-3xl font-bold uppercase tracking-wide text-red-100">
				Nicht abgemeldet!
			</h2>
			<p class="mt-4 text-base leading-relaxed text-red-50">
				Am <strong>{prettyDate(penalty.missed.date)}</strong> warst du nicht im Training und hast dich
				nicht abgemeldet.
			</p>
			<p class="mt-3 text-sm leading-relaxed text-red-200">
				Bis <strong>{prettyDate(penalty.penalty.date)}</strong> siehst du bei „Wer zieht" nur Fragezeichen.
				Und beim nächsten Training wird dir ein <strong>falscher Spot</strong> angezeigt. Viel Glück.
			</p>
			<p class="mt-3 text-xs text-red-300/80">
				Nächstes Mal: einfach abmelden. Dauert fünf Sekunden.
			</p>
			<button
				type="button"
				onclick={dismiss}
				disabled={secondsLeft > 0}
				class="mt-6 w-full cursor-pointer rounded-lg bg-red-500 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-red-400 disabled:cursor-not-allowed disabled:bg-red-900 disabled:text-red-300"
			>
				{secondsLeft > 0 ? `Verstanden (${secondsLeft})` : 'Verstanden'}
			</button>
		</div>
	</div>
{/if}
