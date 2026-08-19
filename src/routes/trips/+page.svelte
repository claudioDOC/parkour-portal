<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';
	import TripRouteMap from '$lib/components/TripRouteMap.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let busyTripId = $state<number | null>(null);
	let creating = $state(false);

	let createTitle = $state('');
	let createStartDate = $state('');
	let createEndDate = $state('');
	let createNotes = $state('');
	let createDestSearch = $state('');
	let createDestBusy = $state(false);
	let createDestHits = $state<{ lat: number; lon: number; displayName: string }[]>([]);
	let createPickedDest = $state<{ lat: number; lon: number; displayName: string } | null>(null);

	let joinNote = $state<Record<number, string>>({});
	let ablaufText = $state<Record<number, string>>({});
	let dateAltStart = $state<Record<number, string>>({});
	let dateAltEnd = $state<Record<number, string>>({});
	let dateAltNote = $state<Record<number, string>>({});
	/** Schlüssel tripId:userId für sichtbare Teilnehmer-Notizen (wie Training Abmeldung) */
	let openTripMemberNoteKey = $state<string | null>(null);

	function formatDateRange(startDate: string, endDate: string): string {
		const a = new Date(`${startDate}T00:00:00`).toLocaleDateString('de-DE');
		const b = new Date(`${endDate}T00:00:00`).toLocaleDateString('de-DE');
		return a === b ? a : `${a} - ${b}`;
	}

	let actionError = $state('');

	/** Deep-Link aus ?trip= — Karte hervorheben und hinscrollen. */
	const highlightTripId = $derived(Number($page.url.searchParams.get('trip')) || null);
	$effect(() => {
		const id = highlightTripId;
		if (!id) return;
		queueMicrotask(() => {
			document.getElementById(`trip-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
		});
	});

	/** Teilbarer Link für den Chat — Web-Share, sonst Zwischenablage. */
	let sharedTripId = $state<number | null>(null);
	// Trip-Eckdaten bearbeiten (Ersteller/Admin) — nutzt die edit_trip-Aktion.
	let editTripId = $state<number | null>(null);
	let editTrip = $state({ title: '', startDate: '', endDate: '', notes: '' });

	function startTripEdit(trip: {
		id: number;
		title: string;
		startDate: string;
		endDate: string;
		notes: string | null;
	}) {
		editTripId = editTripId === trip.id ? null : trip.id;
		editTrip = {
			title: trip.title,
			startDate: trip.startDate,
			endDate: trip.endDate,
			notes: trip.notes ?? ''
		};
	}

	async function saveTripEdit(tripId: number) {
		if (!editTrip.title.trim() || !editTrip.startDate || !editTrip.endDate) return;
		busyTripId = tripId;
		try {
			await post('edit_trip', {
				tripId,
				title: editTrip.title.trim(),
				startDate: editTrip.startDate,
				endDate: editTrip.endDate,
				notes: editTrip.notes.trim()
			});
			editTripId = null;
		} finally {
			busyTripId = null;
		}
	}
	async function shareTrip(trip: { id: number; title: string; startDate: string; endDate: string }) {
		const url = `${location.origin}/trips?trip=${trip.id}`;
		const text = `${trip.title} (${formatDateRange(trip.startDate, trip.endDate)}) — bist du dabei?`;
		try {
			if (navigator.share) {
				await navigator.share({ title: trip.title, text, url });
				return;
			}
		} catch {
			return; // Nutzer hat abgebrochen
		}
		try {
			await navigator.clipboard.writeText(`${text}\n${url}`);
			sharedTripId = trip.id;
			setTimeout(() => (sharedTripId = null), 2500);
		} catch {
			actionError = 'Kopieren nicht möglich — Link: ' + url;
			setTimeout(() => (actionError = ''), 10000);
		}
	}

	async function post(action: string, payload: Record<string, unknown>) {
		actionError = '';
		try {
			const res = await fetch('/api/trips', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action, ...payload })
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string };
				actionError = body.error || `Aktion fehlgeschlagen (${res.status})`;
				setTimeout(() => (actionError = ''), 8000);
			}
		} catch {
			actionError = 'Keine Verbindung — Aktion wurde nicht gespeichert.';
			setTimeout(() => (actionError = ''), 8000);
		}
		await invalidateAll();
	}

	async function searchCreateDest() {
		createDestBusy = true;
		try {
			const res = await fetch(`/api/geocode?q=${encodeURIComponent(createDestSearch)}`);
			const data = (await res.json()) as { results?: { lat: number; lon: number; displayName: string }[] };
			createDestHits = data.results || [];
		} finally {
			createDestBusy = false;
		}
	}

	async function createTrip() {
		creating = true;
		try {
			const payload: Record<string, unknown> = {
				title: createTitle,
				startDate: createStartDate,
				endDate: createEndDate,
				notes: createNotes
			};
			if (createPickedDest) {
				payload.destinationLatitude = createPickedDest.lat;
				payload.destinationLongitude = createPickedDest.lon;
				payload.destinationLabel = createPickedDest.displayName;
			}
			await post('create_trip', payload);
			createTitle = '';
			createStartDate = '';
			createEndDate = '';
			createNotes = '';
			createDestSearch = '';
			createDestHits = [];
			createPickedDest = null;
		} finally {
			creating = false;
		}
	}

	/** mode: „dabei" oder „bedingt" (dabei unter Vorbehalt, Bedingung in der Notiz). */
	async function joinTrip(tripId: number, mode: 'dabei' | 'bedingt' = 'dabei') {
		busyTripId = tripId;
		try {
			await post('join_trip', { tripId, mode, note: joinNote[tripId] || '' });
		} finally {
			busyTripId = null;
		}
	}

	async function abstainTrip(tripId: number) {
		busyTripId = tripId;
		try {
			await post('abstain_trip', { tripId });
		} finally {
			busyTripId = null;
		}
	}

	async function declineTrip(tripId: number) {
		busyTripId = tripId;
		try {
			await post('decline_trip', {
				tripId,
				note: joinNote[tripId] || ''
			});
		} finally {
			busyTripId = null;
		}
	}

	async function leaveTrip(tripId: number) {
		busyTripId = tripId;
		try {
			await post('leave_trip', { tripId });
		} finally {
			busyTripId = null;
		}
	}

	async function proposePlanOption(tripId: number) {
		busyTripId = tripId;
		try {
			await post('propose_plan_option', {
				tripId,
				text: ablaufText[tripId] || ''
			});
			ablaufText[tripId] = '';
		} finally {
			busyTripId = null;
		}
	}

	async function trashTripAsAdmin(tripId: number) {
		if (!data.isAdmin) return;
		busyTripId = tripId;
		try {
			const res = await fetch('/api/admin/trips', {
				method: 'PATCH',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ tripId, action: 'trash' })
			});
			if (!res.ok) return;
			await invalidateAll();
		} finally {
			busyTripId = null;
		}
	}

	async function votePlanOption(tripId: number, destinationId: number) {
		busyTripId = tripId;
		try {
			await post('vote_plan_option', { tripId, destinationId });
		} finally {
			busyTripId = null;
		}
	}

	async function removePlanVote(tripId: number) {
		busyTripId = tripId;
		try {
			await post('remove_plan_vote', { tripId });
		} finally {
			busyTripId = null;
		}
	}

	async function proposeDateOption(tripId: number) {
		busyTripId = tripId;
		try {
			await post('propose_date_option', {
				tripId,
				startDate: dateAltStart[tripId] || '',
				endDate: dateAltEnd[tripId] || '',
				note: dateAltNote[tripId] || ''
			});
			dateAltStart[tripId] = '';
			dateAltEnd[tripId] = '';
			dateAltNote[tripId] = '';
		} finally {
			busyTripId = null;
		}
	}

	async function voteDateOption(tripId: number, dateOptionId: number) {
		busyTripId = tripId;
		try {
			await post('vote_date_option', { tripId, dateOptionId });
		} finally {
			busyTripId = null;
		}
	}

	async function removeDateVote(tripId: number) {
		busyTripId = tripId;
		try {
			await post('remove_date_vote', { tripId });
		} finally {
			busyTripId = null;
		}
	}
</script>

<div class="space-y-6">
	<PageHeader
		kicker="Unterwegs"
		title="Trips"
		sub="Trip ist fix. Geplant wird: Wer kommt, Anreise, Abstimmung zu Zeitraum und Ablauf."
	/>

	{#if actionError}
		<div class="fixed right-3 top-16 z-[72] w-[min(24rem,calc(100vw-1.5rem))] rounded-lg border border-danger/40 bg-danger/15 px-3 py-2 text-sm text-danger shadow-lg backdrop-blur md:right-6 md:top-6">
			{actionError}
		</div>
	{/if}

	<details class="group bg-bg-card rounded-xl border border-border overflow-hidden">
		<summary class="flex cursor-pointer list-none items-center justify-between px-4 py-3 [&::-webkit-details-marker]:hidden">
			<span class="text-text-primary font-semibold text-sm">+ Neuen Trip planen</span>
			<span class="text-text-muted transition-transform group-open:rotate-180" aria-hidden="true">▾</span>
		</summary>
		<div class="border-t border-border p-4 space-y-3">
		<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
			<input bind:value={createTitle} type="text" placeholder="Titel (z. B. Fontainebleau)" class="bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent" />
			<input bind:value={createStartDate} type="date" class="bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent" />
			<input bind:value={createEndDate} type="date" class="bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent" />
		</div>
		<textarea bind:value={createNotes} rows="2" placeholder="Optional: Ablauf, Übernachtung..." class="w-full bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent resize-none"></textarea>
		<div class="rounded-lg border border-border bg-bg-secondary/60 p-3 space-y-2 text-sm">
			<p class="text-text-muted text-xs">Optional: Kartenziel beim Erstellen (Ort suchen)</p>
			<div class="flex flex-wrap gap-2">
				<input
					bind:value={createDestSearch}
					type="text"
					placeholder="z. B. Fontainebleau, Frankreich"
					class="flex-1 min-w-[12rem] bg-bg-card border border-border rounded-lg px-3 py-2 text-text-primary"
				/>
				<button
					type="button"
					onclick={() => searchCreateDest()}
					disabled={createDestBusy || !createDestSearch.trim()}
					class="bg-accent/15 text-accent px-3 py-2 rounded-lg text-xs font-medium disabled:opacity-50"
				>
					{createDestBusy ? '…' : 'Suchen'}
				</button>
			</div>
			{#if createDestHits.length > 0}
				<ul class="space-y-1 max-h-28 overflow-y-auto text-xs">
					{#each createDestHits as hit}
						<li>
							<button
								type="button"
								onclick={() => {
									createPickedDest = hit;
									createDestHits = [];
								}}
								class="w-full text-left px-2 py-1.5 rounded border border-border hover:border-accent/50 text-text-primary"
							>
								{hit.displayName}
							</button>
						</li>
					{/each}
				</ul>
			{/if}
			{#if createPickedDest}
				<p class="text-xs text-success">
					Kartenziel: {createPickedDest.displayName}
					<button
						type="button"
						onclick={() => (createPickedDest = null)}
						class="ml-2 text-text-muted hover:text-danger underline"
					>
						entfernen
					</button>
				</p>
			{/if}
		</div>
		<button
			type="button"
			onclick={createTrip}
			disabled={creating || !createTitle || !createStartDate || !createEndDate}
			class="bg-accent text-[#0c0c0e] px-4 py-2 rounded-lg text-sm font-semibold hover:bg-accent-hover disabled:opacity-50"
		>
			{creating ? '...' : 'Trip erstellen'}
		</button>
		</div>
	</details>

	<div class="space-y-4">
		{#each data.trips as trip}
			<div
				id="trip-{trip.id}"
				class="bg-bg-card rounded-xl border p-5 space-y-4 scroll-mt-24 {highlightTripId === trip.id
					? 'border-accent ring-2 ring-accent/40'
					: 'border-border'}"
			>
				<div class="flex items-start justify-between gap-3 flex-wrap">
					<div>
						<h3 class="text-lg font-semibold text-text-primary">{trip.title}</h3>
						<p class="text-text-secondary text-sm">{formatDateRange(trip.startDate, trip.endDate)}</p>
						{#if trip.notes}
							<p class="text-text-muted text-sm mt-1">{trip.notes}</p>
						{/if}
					</div>
					<div class="flex flex-wrap items-center gap-2">
						{#if data.isAdmin || trip.createdBy === data.user.id}
							<button
								type="button"
								onclick={() => startTripEdit(trip)}
								class="cursor-pointer rounded-lg border border-border bg-bg-secondary px-3 py-2 text-xs font-semibold text-text-secondary transition-colors hover:bg-bg-hover"
							>
								{editTripId === trip.id ? 'Bearbeiten schliessen' : 'Bearbeiten'}
							</button>
						{/if}
						<button
							type="button"
							onclick={() => shareTrip(trip)}
							class="cursor-pointer rounded-lg border border-accent/35 bg-accent/10 px-3 py-2 text-xs font-semibold text-accent transition-colors hover:bg-accent/20"
						>
							{sharedTripId === trip.id ? 'Link kopiert ✓' : 'Link teilen'}
						</button>
						<div class="text-xs bg-bg-secondary border border-border rounded-lg px-3 py-2 text-text-secondary">
							Trip fix · Teilnehmerplanung aktiv
						</div>
						{#if data.isAdmin}
							<button
								type="button"
								onclick={() => {
									if (confirm(`Trip „${trip.title}“ in den Papierkorb legen?`)) void trashTripAsAdmin(trip.id);
								}}
								disabled={busyTripId === trip.id}
								class="text-xs bg-warning/15 hover:bg-warning/25 text-warning px-3 py-1.5 rounded-lg border border-warning/30 transition-colors disabled:opacity-50"
							>
								In Papierkorb
							</button>
						{/if}
					</div>
				</div>

				{#if editTripId === trip.id}
					<div class="rounded-lg border border-border bg-bg-secondary/50 p-3 space-y-2">
						<p class="text-xs uppercase tracking-wide text-text-secondary">Trip bearbeiten</p>
						<input
							type="text"
							bind:value={editTrip.title}
							placeholder="Titel"
							class="w-full bg-bg-card border border-border rounded-lg px-2 py-1.5 text-sm text-text-primary"
						/>
						<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
							<input
								type="date"
								bind:value={editTrip.startDate}
								class="bg-bg-card border border-border rounded-lg px-2 py-1.5 text-sm text-text-primary"
							/>
							<input
								type="date"
								bind:value={editTrip.endDate}
								class="bg-bg-card border border-border rounded-lg px-2 py-1.5 text-sm text-text-primary"
							/>
						</div>
						<input
							type="text"
							bind:value={editTrip.notes}
							placeholder="Notizen (optional)"
							class="w-full bg-bg-card border border-border rounded-lg px-2 py-1.5 text-sm text-text-primary"
						/>
						<button
							type="button"
							onclick={() => saveTripEdit(trip.id)}
							disabled={busyTripId === trip.id || !editTrip.title.trim()}
							class="bg-accent/15 hover:bg-accent/25 text-accent px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
						>
							Speichern
						</button>
					</div>
				{/if}

				<div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
					<div class="rounded-xl border border-success/35 bg-success/10 px-3 py-3 text-center shadow-sm">
						<p class="text-2xl sm:text-3xl font-bold tabular-nums text-success leading-none">{trip.joinedCount}</p>
						<p class="text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-text-secondary mt-1.5">Dabei</p>
					</div>
					<div class="rounded-xl border border-accent/35 bg-accent/10 px-3 py-3 text-center shadow-sm">
						<p class="text-2xl sm:text-3xl font-bold tabular-nums text-accent leading-none">{trip.conditionalCount}</p>
						<p class="text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-text-secondary mt-1.5">Bedingt</p>
					</div>
					<div class="rounded-xl border border-border bg-bg-secondary/80 px-3 py-3 text-center shadow-sm">
						<p class="text-2xl sm:text-3xl font-bold tabular-nums text-text-primary leading-none">{trip.pendingCount + trip.abstainedCount}</p>
						<p class="text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-text-muted mt-1.5">Offen</p>
					</div>
					<div class="rounded-xl border border-danger/35 bg-danger/10 px-3 py-3 text-center shadow-sm">
						<p class="text-2xl sm:text-3xl font-bold tabular-nums text-danger leading-none">{trip.declinedCount}</p>
						<p class="text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-text-secondary mt-1.5">Nicht dabei</p>
					</div>
				</div>

				<div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
					<div class="rounded-lg border border-border bg-bg-secondary/50 p-3 space-y-2">
						<p class="text-xs uppercase tracking-wide text-success">Wer ist dabei?</p>
						<div class="flex flex-wrap gap-1.5 items-start">
							{#each trip.memberStates as p}
								{@const memberKey = `${trip.id}:${p.userId}`}
				{@const label =
									p.status === 'pending'
										? 'Offen'
										: p.status === 'declined'
											? 'Nicht dabei'
											: p.status === 'abstained'
												? 'Weiss noch nicht'
												: p.status === 'conditional'
													? 'Dabei, wenn …'
													: 'Dabei'}
								{@const chipClass =
									p.status === 'declined'
										? 'bg-danger/10 text-danger'
										: p.status === 'pending'
											? 'bg-bg-hover text-text-muted'
											: p.status === 'abstained'
												? 'bg-amber-500/15 text-amber-400'
												: p.status === 'conditional'
													? 'bg-accent/15 text-accent'
													: 'bg-success/10 text-success'}
								<div class="flex flex-col items-start max-w-[min(100%,18rem)]">
									{#if p.note}
										<button
											type="button"
											class="text-xs px-2 py-1 rounded-full cursor-pointer text-left {chipClass}"
											title={p.note}
											aria-expanded={openTripMemberNoteKey === memberKey}
											onclick={() =>
												(openTripMemberNoteKey = openTripMemberNoteKey === memberKey ? null : memberKey)}
										>
											{p.username} · {label} *
										</button>
										{#if openTripMemberNoteKey === memberKey}
											<p
												class="mt-1 w-full text-[11px] leading-4 rounded-md px-2 py-1 whitespace-pre-wrap break-words {p.status === 'declined'
													? 'text-danger/90 bg-danger/5 border border-danger/20'
													: 'text-text-secondary bg-bg-card border border-border'}"
											>
												{p.note}
											</p>
										{/if}
									{:else}
										<span class="text-xs px-2 py-1 rounded-full {chipClass}">
											{p.username} · {label}
										</span>
									{/if}
								</div>
							{/each}
						</div>
						<input
							type="text"
							value={joinNote[trip.id] ?? (trip.myParticipation?.note || '')}
							oninput={(e) => (joinNote[trip.id] = (e.currentTarget as HTMLInputElement).value)}
							placeholder="Notiz für alle sichtbar — bei „Dabei, wenn …“ die Bedingung"
							class="w-full bg-bg-card border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary"
						/>
						<div class="flex flex-wrap gap-2">
							<button type="button" onclick={() => joinTrip(trip.id, 'dabei')} disabled={busyTripId === trip.id} class="bg-success/15 hover:bg-success/25 text-success px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50">Dabei</button>
							<button type="button" onclick={() => joinTrip(trip.id, 'bedingt')} disabled={busyTripId === trip.id} class="bg-accent/15 hover:bg-accent/25 text-accent px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50">Dabei, wenn …</button>
							<button type="button" onclick={() => declineTrip(trip.id)} disabled={busyTripId === trip.id} class="bg-danger/15 hover:bg-danger/25 text-danger px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50">Nicht dabei</button>
							<button type="button" onclick={() => abstainTrip(trip.id)} disabled={busyTripId === trip.id} class="bg-bg-hover hover:bg-bg-secondary text-text-secondary px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50">Weiss noch nicht</button>
							{#if trip.myParticipation}
								<button type="button" onclick={() => leaveTrip(trip.id)} disabled={busyTripId === trip.id} class="bg-bg-hover hover:bg-bg-secondary text-text-muted px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50">Zurück auf offen</button>
							{/if}
						</div>
						<p class="text-[11px] text-text-muted">
							„Dabei, wenn …“ heisst: grundsätzlich dabei, aber nur unter der Bedingung
							aus deiner Notiz — etwa bei einem anderen Termin aus der Abstimmung.
						</p>
					</div>

					<div class="rounded-lg border border-sky-500/30 bg-sky-500/5 p-3 space-y-2">
						<p class="text-xs uppercase tracking-wide text-sky-400">Zeitraum (Abstimmung)</p>
						<p class="text-[11px] text-text-muted">
							Offiziell im Trip: <span class="text-text-secondary font-medium">{formatDateRange(trip.startDate, trip.endDate)}</span>
							— hier alternative Daten vorschlagen und abstimmen (z. B. einen Tag später).
						</p>
						{#if trip.votesNeeded > 0}
							<p class="text-[11px] text-sky-400/90">
								Ab <strong>{trip.votesNeeded}</strong> von {trip.eligibleVoters} Stimmen wird ein Vorschlag
								automatisch zum neuen Trip-Termin.
							</p>
						{/if}
						<div class="space-y-1.5">
							{#each trip.dateOptions as opt}
								<div class="flex items-start justify-between gap-3 rounded-lg border border-border bg-bg-card px-3 py-2 text-xs">
									<div class="min-w-0 flex-1">
										<p class="text-text-primary font-medium">
											{formatDateRange(opt.startDate, opt.endDate)}
										</p>
										<p class="text-text-muted mt-1">
											{opt.voteCount} Stimmen · {opt.proposedByName}
											{#if opt.sameAsPlanned}
												<span class="text-sky-400/90"> · wie Trip geplant</span>
											{:else if trip.votesNeeded > 0 && opt.voteCount < trip.votesNeeded}
												<span> · noch {trip.votesNeeded - opt.voteCount} bis zur Mehrheit</span>
											{/if}
										</p>
										{#if trip.votesNeeded > 0 && !opt.sameAsPlanned}
											<div class="mt-1.5 h-1.5 w-full max-w-[12rem] overflow-hidden rounded-full bg-bg-hover" aria-hidden="true">
												<div
													class="h-full rounded-full bg-sky-400 transition-[width] duration-500"
													style="width: {Math.min(100, Math.round((opt.voteCount / trip.votesNeeded) * 100))}%"
												></div>
											</div>
										{/if}
										{#if opt.note}
											<p class="text-text-secondary mt-1 whitespace-pre-wrap break-words">{opt.note}</p>
										{/if}
									</div>
									{#if trip.myVoteDateOptionId === opt.id}
										<button
											type="button"
											onclick={() => removeDateVote(trip.id)}
											disabled={busyTripId === trip.id}
											class="shrink-0 px-2.5 py-1 rounded-md bg-sky-500 text-[#0c0c0e] text-[11px] font-medium disabled:opacity-50"
										>
											Zurückziehen
										</button>
									{:else}
										<button
											type="button"
											onclick={() => voteDateOption(trip.id, opt.id)}
											disabled={busyTripId === trip.id}
											class="shrink-0 px-2.5 py-1 rounded-md bg-bg-hover text-text-secondary hover:text-text-primary text-[11px] font-medium disabled:opacity-50"
										>
											Voten
										</button>
									{/if}
								</div>
							{/each}
							{#if trip.dateOptions.length === 0}
								<p class="text-text-muted text-xs">Noch kein alternativer Zeitraum.</p>
							{/if}
						</div>
						<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
							<input
								type="date"
								value={dateAltStart[trip.id] ?? ''}
								oninput={(e) => (dateAltStart[trip.id] = (e.currentTarget as HTMLInputElement).value)}
								class="bg-bg-card border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary"
							/>
							<input
								type="date"
								value={dateAltEnd[trip.id] ?? ''}
								oninput={(e) => (dateAltEnd[trip.id] = (e.currentTarget as HTMLInputElement).value)}
								class="bg-bg-card border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary"
							/>
						</div>
						<input
							type="text"
							value={dateAltNote[trip.id] ?? ''}
							oninput={(e) => (dateAltNote[trip.id] = (e.currentTarget as HTMLInputElement).value)}
							placeholder="Kurznotiz (optional), z. B. „+1 Tag wegen Arbeit“"
							class="w-full bg-bg-card border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary"
						/>
						<button
							type="button"
							onclick={() => proposeDateOption(trip.id)}
							disabled={busyTripId === trip.id || !(dateAltStart[trip.id] || '').trim() || !(dateAltEnd[trip.id] || '').trim()}
							class="bg-sky-500/15 hover:bg-sky-500/25 text-sky-400 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50 w-full sm:w-auto"
						>
							Zeitraum als Vorschlag einreichen
						</button>
					</div>

					<div class="rounded-lg border border-accent/30 bg-accent/5 p-3 space-y-2">
						<p class="text-xs uppercase tracking-wide text-accent">Ablauf (Abstimmung)</p>
						<div class="space-y-1.5">
							{#each trip.destinations as d}
								<div class="flex items-start justify-between gap-3 rounded-lg border border-border bg-bg-card px-3 py-2 text-xs">
									<div class="min-w-0 flex-1">
										<p class="text-text-primary font-medium whitespace-pre-wrap break-words">{d.name}</p>
										<p class="text-text-muted mt-1">{d.voteCount} Stimmen · Vorschlag: {d.proposedByName}</p>
									</div>
									{#if trip.myVoteDestinationId === d.id}
										<button
											type="button"
											onclick={() => removePlanVote(trip.id)}
											disabled={busyTripId === trip.id}
											class="shrink-0 px-2.5 py-1 rounded-md bg-accent text-[#0c0c0e]"
										>
											Zurückziehen
										</button>
									{:else}
										<button
											type="button"
											onclick={() => votePlanOption(trip.id, d.id)}
											disabled={busyTripId === trip.id}
											class="shrink-0 px-2.5 py-1 rounded-md bg-bg-hover text-text-secondary hover:text-text-primary"
										>
											Voten
										</button>
									{/if}
								</div>
							{/each}
							{#if trip.destinations.length === 0}
								<p class="text-text-muted text-xs">Noch kein Ablauf-Vorschlag.</p>
							{/if}
						</div>
						<textarea
							bind:value={ablaufText[trip.id]}
							rows="4"
							placeholder="Ablauf beschreiben (freier Text) — z. B. ganze Woche mit Trainer, erste Hälfte nur Gruppe, wer fährt mit wem …"
							class="w-full bg-bg-card border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary resize-y min-h-[5rem] focus:outline-none focus:border-accent"
						></textarea>
						<button type="button" onclick={() => proposePlanOption(trip.id)} disabled={busyTripId === trip.id || !(ablaufText[trip.id] || '').trim()} class="bg-accent/15 hover:bg-accent/25 text-accent px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50">
							Als Vorschlag einreichen
						</button>
					</div>
				</div>

				<TripRouteMap
					tripId={trip.id}
					createdBy={trip.createdBy}
					destinationLatitude={trip.destinationLatitude ?? null}
					destinationLongitude={trip.destinationLongitude ?? null}
					destinationLabel={trip.destinationLabel ?? null}
					stopovers={trip.stopovers}
					currentUserId={data.user.id}
					isAdmin={data.isAdmin}
				/>
			</div>
		{/each}

		{#if data.trips.length === 0}
			<p class="text-text-muted text-center py-10">Noch keine geplanten Trips.</p>
		{/if}
	</div>
</div>
