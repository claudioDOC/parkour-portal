<script lang="ts">
	/**
	 * „Zusatztraining eintragen" — ein Formular für beides, was ausserhalb der
	 * festen Dienstags-/Donnerstagstermine passiert:
	 *
	 *  - Mit der Gruppe: spontaner Termin, alle werden benachrichtigt, mit
	 *    Anmeldung und Spot-Voting.
	 *  - Solo: eigenes Training, heute oder bis 14 Tage zurück. Zählt in die
	 *    Extra-Einheiten, nicht in „Gezogen %".
	 *
	 * Gleich aufgebaut wie das Zusatztraining-Sheet der App — Startseite und
	 * Trainingsseite nutzen dieselbe Komponente.
	 */
	import { invalidateAll } from '$app/navigation';

	type Mode = 'gruppe' | 'solo';
	let {
		calendarToday,
		mySolo,
		onClose,
		onNotice,
		initialMode = 'gruppe'
	}: {
		calendarToday: string;
		mySolo: { todayLogged: boolean; countMonth: number };
		onClose: () => void;
		onNotice: (text: string, kind?: 'info' | 'error') => void;
		initialMode?: Mode;
	} = $props();

	function addDaysYmd(ymd: string, days: number): string {
		const [y, m, d] = ymd.split('-').map(Number);
		return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
	}

	// svelte-ignore state_referenced_locally
	let mode = $state<Mode>(initialMode);
	let busy = $state(false);

	// Gruppe
	// svelte-ignore state_referenced_locally
	let extraDate = $state(calendarToday);
	let extraStart = $state('18:15');
	let extraEnd = $state('20:15');
	let extraNote = $state('');

	// Solo
	// svelte-ignore state_referenced_locally
	let soloDate = $state(calendarToday);
	let soloNote = $state('');
	const soloTodayDone = $derived(mySolo.todayLogged && soloDate === calendarToday);

	async function send(method: 'POST' | 'DELETE', url: string, payload: Record<string, unknown>) {
		const res = await fetch(url, {
			method,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});
		const body = (await res.json().catch(() => ({}))) as { error?: string };
		return { ok: res.ok, error: body.error, status: res.status };
	}

	async function createGroup() {
		if (!extraDate) {
			onNotice('Bitte ein Datum wählen.', 'error');
			return;
		}
		busy = true;
		try {
			const r = await send('POST', '/api/training', {
				action: 'create_extra',
				date: extraDate,
				timeStart: extraStart,
				timeEnd: extraEnd,
				note: extraNote.trim()
			});
			if (!r.ok) {
				onNotice(r.error || 'Konnte nicht angelegt werden.', 'error');
				return;
			}
			onNotice('Zusatztraining eingetragen — alle wurden benachrichtigt.');
			extraNote = '';
			onClose();
			await invalidateAll();
		} catch {
			onNotice('Keine Verbindung — nichts gespeichert.', 'error');
		} finally {
			busy = false;
		}
	}

	async function logSolo() {
		busy = true;
		try {
			const r = await send('POST', '/api/solo', { date: soloDate, note: soloNote.trim() });
			if (!r.ok) {
				onNotice(r.error || `Eintragen fehlgeschlagen (${r.status})`, 'error');
				return;
			}
			onNotice('💪 Solo-Training eingetragen!');
			soloNote = '';
			onClose();
			await invalidateAll();
		} catch {
			onNotice('Keine Verbindung — nicht gespeichert.', 'error');
		} finally {
			busy = false;
		}
	}

	/** Versehentlich eingetragen? Der heutige Solo-Eintrag fliegt wieder raus. */
	async function undoSolo() {
		busy = true;
		try {
			const r = await send('DELETE', '/api/solo', { date: soloDate });
			if (!r.ok) {
				onNotice(r.error || 'Rückgängig fehlgeschlagen', 'error');
				return;
			}
			onNotice('Solo-Eintrag entfernt.');
			await invalidateAll();
		} catch {
			onNotice('Keine Verbindung — nichts geändert.', 'error');
		} finally {
			busy = false;
		}
	}

	const field =
		'bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent';
</script>

<div class="space-y-3">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<p class="text-text-primary text-sm font-semibold">Zusatztraining eintragen</p>
		<!-- Umschalter wie in der App: zwei Ansichten desselben Formulars. -->
		<div class="flex rounded-full bg-bg-hover p-[3px]" role="tablist" aria-label="Art des Trainings">
			{#each [{ key: 'gruppe', label: 'Mit der Gruppe' }, { key: 'solo', label: 'Solo' }] as o (o.key)}
				<button
					type="button"
					role="tab"
					aria-selected={mode === o.key}
					onclick={() => (mode = o.key as Mode)}
					class="cursor-pointer rounded-full px-3 py-1 text-xs font-semibold transition-colors {mode === o.key
						? 'bg-accent text-black'
						: 'text-text-muted hover:text-text-primary'}"
				>
					{o.label}
				</button>
			{/each}
		</div>
	</div>

	{#if mode === 'gruppe'}
		<p class="text-text-muted text-xs">
			Für spontane Termine neben Dienstag und Donnerstag. Alle werden benachrichtigt, können sich
			anmelden und den Spot wählen; die Statistik bleibt unberührt.
		</p>
		<div class="flex flex-wrap gap-2">
			<input type="date" bind:value={extraDate} min={calendarToday} class={field} />
			<input type="time" bind:value={extraStart} class={field} />
			<span class="self-center text-text-muted text-sm">bis</span>
			<input type="time" bind:value={extraEnd} class={field} />
		</div>
		<input
			type="text"
			bind:value={extraNote}
			maxlength="200"
			placeholder="Notiz (optional), z. B. „Skatepark, bringt Wasser mit“"
			class="w-full {field}"
		/>
		<div class="flex gap-2">
			<button
				type="button"
				onclick={createGroup}
				disabled={busy}
				class="cursor-pointer bg-accent hover:bg-accent-hover text-black px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
			>
				{busy ? 'Wird eingetragen …' : 'Eintragen'}
			</button>
			<button
				type="button"
				onclick={onClose}
				class="cursor-pointer bg-bg-hover hover:bg-bg-secondary text-text-secondary px-4 py-2 rounded-lg text-sm font-medium"
			>
				Abbrechen
			</button>
		</div>
	{:else}
		<p class="text-text-muted text-xs">
			Alleine oder ausserhalb der Gruppenzeiten trainiert? Zählt in die
			<a href="/statistik" class="text-accent hover:underline">Extra-Einheiten</a>, nicht in „Gezogen %".
			{#if mySolo.countMonth > 0}
				<span class="text-accent-hot font-medium">Diesen Monat: {mySolo.countMonth}× solo.</span>
			{/if}
		</p>
		<div class="flex flex-col gap-2 sm:flex-row sm:items-center">
			<input
				type="date"
				bind:value={soloDate}
				min={addDaysYmd(calendarToday, -14)}
				max={calendarToday}
				class={field}
			/>
			<input
				type="text"
				bind:value={soloNote}
				maxlength="200"
				placeholder="Optional: was/wo (z. B. Morgenrunde Flips)"
				class="flex-1 {field}"
			/>
		</div>
		<div class="flex flex-wrap gap-2">
			<button
				type="button"
				onclick={logSolo}
				disabled={busy || soloTodayDone}
				class="cursor-pointer bg-accent hover:bg-accent-hover text-black px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
			>
				{busy ? '…' : soloTodayDone ? 'Heute schon drin ✓' : 'Eintragen'}
			</button>
			{#if soloTodayDone}
				<button
					type="button"
					onclick={undoSolo}
					disabled={busy}
					class="cursor-pointer bg-bg-hover hover:bg-bg-secondary text-text-secondary px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
				>
					Rückgängig
				</button>
			{/if}
			<button
				type="button"
				onclick={onClose}
				class="cursor-pointer bg-bg-hover hover:bg-bg-secondary text-text-secondary px-4 py-2 rounded-lg text-sm font-medium"
			>
				Abbrechen
			</button>
		</div>
	{/if}
</div>
