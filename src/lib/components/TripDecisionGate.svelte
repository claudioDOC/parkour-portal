<script lang="ts">
	/**
	 * Entscheidungs-Dialog für Trips: blockiert die App, bis man reagiert hat.
	 * Damit geht kein Trip mehr unter, ohne dass jemand es mitbekommt.
	 *
	 * Bewusste Bremsen, damit es nie im falschen Moment blockiert:
	 *  - erscheint erst ab dem ZWEITEN App-Start nach dem Ereignis
	 *    (ein schneller Blick „wo ist heute Training" wird nie blockiert)
	 *  - „Enthalten" ist immer möglich; danach 3 Tage Ruhe (Server)
	 *  - nie über der Trips-Seite selbst (dort entscheidet man ja gerade)
	 */
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { invalidateAll } from '$app/navigation';
	import { refreshActivity } from '$lib/activityStore.svelte';
	import { tapFeedback } from '$lib/haptics';

	type PendingTrip = {
		id: number;
		title: string;
		startDate: string;
		endDate: string;
		notes: string | null;
		destinationLabel: string | null;
		creatorName: string | null;
		inCount: number;
		outCount: number;
	};

	const SEEN_KEY = 'trip-gate-seen';

	let trip = $state<PendingTrip | null>(null);
	let busy = $state(false);
	let errorMsg = $state('');
	let transport = $state('mitfahrt');

	function formatRange(a: string, b: string): string {
		const f = (d: string) =>
			new Date(d + 'T12:00:00').toLocaleDateString('de-CH', { day: 'numeric', month: 'short' });
		return a === b ? f(a) : `${f(a)} – ${f(b)}`;
	}

	async function load() {
		try {
			const res = await fetch('/api/trips/pending', { credentials: 'include' });
			if (!res.ok) return;
			const data = (await res.json()) as { trip: PendingTrip | null };
			if (!data.trip) {
				trip = null;
				return;
			}
			// Erst beim zweiten Start nach dem Ereignis blockieren.
			let seen: number[] = [];
			try {
				seen = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as number[];
			} catch {
				seen = [];
			}
			if (!seen.includes(data.trip.id)) {
				localStorage.setItem(SEEN_KEY, JSON.stringify([...seen, data.trip.id].slice(-20)));
				return; // dieses Mal nur merken
			}
			trip = data.trip;
		} catch {
			/* Dialog ist optional */
		}
	}

	async function decide(action: 'join_trip' | 'decline_trip' | 'abstain_trip') {
		if (!trip) return;
		tapFeedback();
		busy = true;
		errorMsg = '';
		try {
			const res = await fetch('/api/trips', {
				method: 'POST',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action,
					tripId: trip.id,
					...(action === 'join_trip' ? { transportMode: transport } : {})
				})
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string };
				errorMsg = body.error || `Fehlgeschlagen (${res.status})`;
				return;
			}
			trip = null;
			await invalidateAll();
			void refreshActivity();
			void load(); // ggf. nächster offener Trip
		} catch {
			errorMsg = 'Keine Verbindung — bitte nochmal.';
		} finally {
			busy = false;
		}
	}

	onMount(() => {
		void load();
	});

	// Auf der Trips-Seite nicht blockieren — dort entscheidet man ohnehin.
	const hidden = $derived($page.url.pathname.startsWith('/trips'));
</script>

{#if trip && !hidden}
	<div
		class="fixed inset-0 z-[95] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center"
		role="dialog"
		aria-modal="true"
		aria-labelledby="trip-gate-title"
	>
		<div class="w-full max-w-md rounded-2xl border border-accent/40 bg-bg-card p-5 shadow-2xl">
			<p class="font-display text-xs font-semibold uppercase tracking-[0.24em] text-accent-hot">
				Trip-Abstimmung
			</p>
			<h2 id="trip-gate-title" class="mt-1 text-xl font-bold text-text-primary">{trip.title}</h2>
			<p class="mt-1 text-sm text-text-secondary">
				{formatRange(trip.startDate, trip.endDate)}
				{#if trip.destinationLabel}
					· {trip.destinationLabel.split(',')[0]}
				{/if}
			</p>
			{#if trip.creatorName}
				<p class="mt-0.5 text-xs text-text-muted">
					Geplant von {trip.creatorName} · {trip.inCount} dabei, {trip.outCount} abgemeldet
				</p>
			{/if}
			{#if trip.notes}
				<p class="mt-2 rounded-lg bg-bg-secondary px-3 py-2 text-sm leading-snug text-text-secondary">
					{trip.notes}
				</p>
			{/if}

			<p class="mt-4 text-sm font-medium text-text-primary">Bist du dabei?</p>

			{#if errorMsg}
				<p class="mt-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
					{errorMsg}
				</p>
			{/if}

			<div class="mt-2">
				<label for="trip-gate-transport" class="text-xs text-text-muted">Anreise (falls dabei)</label>
				<select
					id="trip-gate-transport"
					bind:value={transport}
					class="mt-1 w-full rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
				>
					<option value="mitfahrt">Mitfahrt gesucht</option>
					<option value="auto_owner">Ich fahre (Auto)</option>
					<option value="oev">ÖV</option>
					<option value="eigen">Eigene Anreise</option>
				</select>
			</div>

			<div class="mt-3 grid gap-2">
				<button
					type="button"
					onclick={() => decide('join_trip')}
					disabled={busy}
					class="cursor-pointer rounded-lg bg-accent px-4 py-3 text-sm font-bold text-[#0c0c0e] transition-colors hover:bg-accent-hover disabled:opacity-50"
				>
					Ich bin dabei
				</button>
				<div class="grid grid-cols-2 gap-2">
					<button
						type="button"
						onclick={() => decide('decline_trip')}
						disabled={busy}
						class="cursor-pointer rounded-lg border border-danger/35 px-4 py-2.5 text-sm font-semibold text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
					>
						Nicht dabei
					</button>
					<button
						type="button"
						onclick={() => decide('abstain_trip')}
						disabled={busy}
						class="cursor-pointer rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-text-secondary transition-colors hover:text-text-primary disabled:opacity-50"
					>
						Weiss noch nicht
					</button>
				</div>
			</div>
			<p class="mt-2 text-center text-[11px] text-text-muted">
				„Weiss noch nicht“ fragt in 3 Tagen erneut.
			</p>
		</div>
	</div>
{/if}
