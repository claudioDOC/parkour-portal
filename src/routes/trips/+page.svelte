<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import TripRouteMap from '$lib/components/TripRouteMap.svelte';
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

	let joinTransportMode = $state<Record<number, string>>({});
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

	async function post(action: string, payload: Record<string, unknown>) {
		await fetch('/api/trips', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action, ...payload })
		});
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

	async function joinTrip(tripId: number) {
		busyTripId = tripId;
		try {
			await post('join_trip', {
				tripId,
				transportMode: joinTransportMode[tripId] || 'mitfahrt',
				note: joinNote[tripId] || ''
			});
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
	<div>
		<h2 class="text-2xl font-bold text-text-primary">Geplante Trips</h2>
		<p class="text-text-secondary mt-1">
			Trip ist fix. Geplant wird: Wer kommt, Anreise, Abstimmung zu Zeitraum und Ablauf — Route unten auf der Karte.
		</p>
	</div>

	<div class="bg-bg-card rounded-xl border border-border p-4 space-y-3">
		<p class="text-text-primary font-semibold text-sm">Neuen Trip planen</p>
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

	<div class="space-y-4">
		{#each data.trips as trip}
			<div class="bg-bg-card rounded-xl border border-border p-5 space-y-4">
				<div class="flex items-start justify-between gap-3 flex-wrap">
					<div>
						<h3 class="text-lg font-semibold text-text-primary">{trip.title}</h3>
						<p class="text-text-secondary text-sm">{formatDateRange(trip.startDate, trip.endDate)}</p>
						{#if trip.notes}
							<p class="text-text-muted text-sm mt-1">{trip.notes}</p>
						{/if}
					</div>
					<div class="flex flex-wrap items-center gap-2">
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

				<div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
					<div class="rounded-xl border border-success/35 bg-success/10 px-3 py-3 text-center shadow-sm">
						<p class="text-2xl sm:text-3xl font-bold tabular-nums text-success leading-none">{trip.joinedCount}</p>
						<p class="text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-text-secondary mt-1.5">Angemeldet</p>
					</div>
					<div class="rounded-xl border border-border bg-bg-secondary/80 px-3 py-3 text-center shadow-sm">
						<p class="text-2xl sm:text-3xl font-bold tabular-nums text-text-primary leading-none">{trip.pendingCount}</p>
						<p class="text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-text-muted mt-1.5">Offen</p>
					</div>
					<div class="rounded-xl border border-danger/35 bg-danger/10 px-3 py-3 text-center shadow-sm">
						<p class="text-2xl sm:text-3xl font-bold tabular-nums text-danger leading-none">{trip.declinedCount}</p>
						<p class="text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-text-secondary mt-1.5">Abgemeldet</p>
					</div>
				</div>

				<div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
					<div class="rounded-lg border border-border bg-bg-secondary/50 p-3 space-y-2">
						<p class="text-xs uppercase tracking-wide text-success">Anmeldung & Anreise</p>
						<div class="flex flex-wrap gap-1.5 items-start">
							{#each trip.memberStates as p}
								{@const memberKey = `${trip.id}:${p.userId}`}
								{@const label =
									p.status === 'pending'
										? 'Offen'
										: p.status === 'declined'
											? 'Abgemeldet'
											: p.transportMode === 'auto_owner'
												? 'Eigenes Auto'
												: p.transportMode === 'motorrad'
													? 'Motorrad'
													: p.transportMode === 'zug'
														? 'Zug'
														: p.transportMode === 'unentschlossen'
															? 'Unentschlossen'
															: 'Mitfahrt'}
								{@const chipClass =
									p.status === 'declined'
										? 'bg-danger/10 text-danger'
										: p.status === 'pending'
											? 'bg-bg-hover text-text-muted'
											: p.transportMode === 'auto_owner'
												? 'bg-accent/15 text-accent'
												: p.transportMode === 'motorrad'
													? 'bg-amber-500/15 text-amber-400'
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
						<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
							<select
								value={joinTransportMode[trip.id] ?? (trip.myParticipation?.transportMode || 'mitfahrt')}
								onchange={(e) => (joinTransportMode[trip.id] = (e.currentTarget as HTMLSelectElement).value)}
								class="bg-bg-card border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary"
							>
								<option value="mitfahrt">Mitfahrt</option>
								<option value="auto_owner">Eigenes Auto</option>
								<option value="motorrad">Motorrad</option>
								<option value="zug">Zug</option>
								<option value="unentschlossen">Unentschlossen</option>
							</select>
							<input type="text" value={joinNote[trip.id] ?? (trip.myParticipation?.note || '')} oninput={(e) => (joinNote[trip.id] = (e.currentTarget as HTMLInputElement).value)} placeholder="Notiz für alle sichtbar (optional)" class="bg-bg-card border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary" />
						</div>
						<div class="flex gap-2">
							<button type="button" onclick={() => joinTrip(trip.id)} disabled={busyTripId === trip.id} class="bg-success/15 hover:bg-success/25 text-success px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50">Anmelden / Update</button>
							<button type="button" onclick={() => declineTrip(trip.id)} disabled={busyTripId === trip.id} class="bg-danger/15 hover:bg-danger/25 text-danger px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50">Abmelden</button>
							{#if trip.myParticipation}
								<button type="button" onclick={() => leaveTrip(trip.id)} disabled={busyTripId === trip.id} class="bg-bg-hover hover:bg-bg-secondary text-text-secondary px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50">Zurück auf offen</button>
							{/if}
						</div>
					</div>

					<div class="rounded-lg border border-sky-500/30 bg-sky-500/5 p-3 space-y-2">
						<p class="text-xs uppercase tracking-wide text-sky-400">Zeitraum (Abstimmung)</p>
						<p class="text-[11px] text-text-muted">
							Offiziell im Trip: <span class="text-text-secondary font-medium">{formatDateRange(trip.startDate, trip.endDate)}</span>
							— hier alternative Daten vorschlagen und abstimmen (z. B. einen Tag später).
						</p>
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
											{/if}
										</p>
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
