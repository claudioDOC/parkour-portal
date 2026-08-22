<script lang="ts">
	/**
	 * Entscheidungs-Dialog für Zusatztrainings — Gegenstück zu
	 * TripDecisionGate.svelte.
	 *
	 * Beim Zusatztraining zählt nur die ausdrückliche Antwort: Wer nichts
	 * sagt, ist weder dabei noch abgemeldet. Damit das niemand übersieht,
	 * fragt die App beim Öffnen nach — anders als beim Trip aber sofort und
	 * nicht erst beim zweiten Start, weil ein Zusatztraining schon heute
	 * sein kann.
	 *
	 * „Später" verschiebt die Frage lokal um zwei Stunden; die Erinnerung per
	 * Push kommt ohnehin drei Stunden vor Beginn.
	 */
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { invalidateAll } from '$app/navigation';
	import { tapFeedback } from '$lib/haptics';

	type PendingExtra = {
		id: number;
		date: string;
		dayOfWeek: string;
		timeStart: string;
		timeEnd: string;
		note: string | null;
		createdByName: string | null;
		inCount: number;
		outCount: number;
	};

	const SNOOZE_KEY = 'extra-gate-snooze';
	const SNOOZE_MS = 2 * 60 * 60 * 1000;

	let session = $state<PendingExtra | null>(null);
	let busy = $state(false);
	let errorMsg = $state('');
	let reason = $state('');

	function snoozed(id: number): boolean {
		try {
			const raw = JSON.parse(localStorage.getItem(SNOOZE_KEY) ?? '{}') as Record<string, number>;
			return typeof raw[id] === 'number' && Date.now() - raw[id] < SNOOZE_MS;
		} catch {
			return false;
		}
	}

	function snooze(id: number) {
		try {
			const raw = JSON.parse(localStorage.getItem(SNOOZE_KEY) ?? '{}') as Record<string, number>;
			raw[id] = Date.now();
			localStorage.setItem(SNOOZE_KEY, JSON.stringify(raw));
		} catch {
			/* egal */
		}
	}

	function prettyDate(d: string): string {
		return new Date(d + 'T12:00:00').toLocaleDateString('de-CH', {
			weekday: 'long',
			day: 'numeric',
			month: 'long'
		});
	}

	async function load() {
		try {
			const res = await fetch('/api/training/pending-extra', { credentials: 'include' });
			if (!res.ok) return;
			const data = (await res.json()) as { session: PendingExtra | null };
			if (!data.session || snoozed(data.session.id)) {
				session = null;
				return;
			}
			session = data.session;
		} catch {
			/* Dialog ist optional */
		}
	}

	async function decide(action: 'rsvp_yes' | 'absence') {
		if (!session) return;
		tapFeedback();
		busy = true;
		errorMsg = '';
		try {
			const res = await fetch('/api/training', {
				method: 'POST',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action,
					sessionId: session.id,
					...(action === 'absence' ? { reason: reason.trim() } : {})
				})
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string };
				errorMsg = body.error || `Fehlgeschlagen (${res.status})`;
				return;
			}
			session = null;
			reason = '';
			await invalidateAll();
			void load(); // ggf. nächstes offenes Zusatztraining
		} catch {
			errorMsg = 'Keine Verbindung — bitte nochmal.';
		} finally {
			busy = false;
		}
	}

	function later() {
		if (!session) return;
		snooze(session.id);
		session = null;
	}

	onMount(() => {
		void load();
	});

	// Auf der Trainingsseite selbst nicht blockieren — dort steht alles.
	const hidden = $derived($page.url.pathname.startsWith('/training'));
</script>

{#if session && !hidden}
	<div
		class="fixed inset-0 z-[94] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center"
		role="dialog"
		aria-modal="true"
		aria-labelledby="extra-gate-title"
	>
		<div class="w-full max-w-md rounded-2xl border border-accent-blue/40 bg-bg-card p-5 shadow-2xl">
			<p class="font-display text-xs font-semibold uppercase tracking-[0.24em] text-accent-blue">
				Zusatztraining
			</p>
			<h2 id="extra-gate-title" class="mt-1 text-xl font-bold text-text-primary">
				{prettyDate(session.date)}
			</h2>
			<p class="mt-1 text-sm text-text-secondary">
				{session.timeStart} – {session.timeEnd}
				{#if session.createdByName}
					· eingetragen von {session.createdByName}
				{/if}
			</p>
			<p class="mt-0.5 text-xs text-text-muted">
				{session.inCount} dabei, {session.outCount} abgesagt
			</p>
			{#if session.note}
				<p class="mt-2 rounded-lg bg-bg-secondary px-3 py-2 text-sm leading-snug text-text-secondary">
					{session.note}
				</p>
			{/if}

			<p class="mt-4 text-sm font-medium text-text-primary">
				Bist du dabei? Ohne Antwort zählst du nicht mit.
			</p>

			{#if errorMsg}
				<p class="mt-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
					{errorMsg}
				</p>
			{/if}

			<input
				type="text"
				bind:value={reason}
				placeholder="Grund (optional, nur bei Absage)"
				class="mt-3 w-full rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
			/>

			<div class="mt-3 grid gap-2">
				<button
					type="button"
					onclick={() => decide('rsvp_yes')}
					disabled={busy}
					class="cursor-pointer rounded-lg bg-accent px-4 py-3 text-sm font-bold text-[#0c0c0e] transition-colors hover:bg-accent-hover disabled:opacity-50"
				>
					Ich bin dabei
				</button>
				<div class="grid grid-cols-2 gap-2">
					<button
						type="button"
						onclick={() => decide('absence')}
						disabled={busy || (reason.trim().length > 0 && reason.trim().length < 10)}
						class="cursor-pointer rounded-lg border border-danger/35 px-4 py-2.5 text-sm font-semibold text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
					>
						Kann nicht
					</button>
					<button
						type="button"
						onclick={later}
						disabled={busy}
						class="cursor-pointer rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-text-secondary transition-colors hover:text-text-primary disabled:opacity-50"
					>
						Später
					</button>
				</div>
			</div>
			<p class="mt-2 text-center text-[11px] text-text-muted">
				„Später" fragt in zwei Stunden erneut.
			</p>
		</div>
	</div>
{/if}
