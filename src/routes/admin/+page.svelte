<script lang="ts">
	import { onMount } from 'svelte';

	type Invite = {
		id: number;
		token: string;
		used: boolean;
		expiresAt: string;
		createdAt: string;
		createdByName: string;
	};

	type User = {
		id: number;
		username: string;
		role: 'admin' | 'spotmanager' | 'member';
		active: boolean;
		createdAt: string;
		spotCount: number;
		voteCount: number;
	};

	type Spot = {
		id: number;
		name: string;
		city: string;
		addedByName: string;
		deleted: boolean;
	};

	let activeTab = $state<'invites' | 'users' | 'spots' | 'trash'>('users');

	let invites = $state<Invite[]>([]);
	let generatingInvite = $state(false);
	let copiedToken = $state<string | null>(null);

	let userList = $state<User[]>([]);
	let resetUserId = $state<number | null>(null);
	let resetPassword = $state('');
	let userMessage = $state('');
	let userError = $state('');
	let confirmAction = $state<{ type: string; user: User } | null>(null);

	type UserData = {
		spotVotes: { id: number; spotName: string; spotCity: string; score: number; createdAt: string }[];
		trainingVotes: { id: number; spotName: string; sessionDate: string; sessionDay: string; createdAt: string }[];
		absences: { id: number; sessionDate: string; sessionDay: string; reason: string | null; createdAt: string }[];
	};
	let expandedUserId = $state<number | null>(null);
	let userData = $state<UserData | null>(null);
	let loadingUserData = $state(false);

	let spotList = $state<Spot[]>([]);
	let trashedSpots = $state<Spot[]>([]);
	let spotMessage = $state('');
	let confirmSpot = $state<{ action: string; spot: Spot } | null>(null);

	onMount(() => {
		loadUsers();
		loadInvites();
		loadSpots();
		loadTrashedSpots();
	});

	async function loadInvites() {
		const res = await fetch('/api/admin/invites');
		const data = await res.json();
		invites = data.invites;
	}

	async function generateInvite() {
		generatingInvite = true;
		try {
			await fetch('/api/admin/invites', { method: 'POST' });
			await loadInvites();
		} finally {
			generatingInvite = false;
		}
	}

	function getInviteUrl(token: string) {
		return `${window.location.origin}/register/${token}`;
	}

	async function copyInviteLink(token: string) {
		await navigator.clipboard.writeText(getInviteUrl(token));
		copiedToken = token;
		setTimeout(() => copiedToken = null, 2000);
	}

	async function loadUsers() {
		const res = await fetch('/api/admin/users');
		const data = await res.json();
		userList = data.users;
	}

	async function resetUserPassword() {
		if (!resetUserId || !resetPassword) return;
		userMessage = '';
		userError = '';

		const res = await fetch('/api/admin/users', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ userId: resetUserId, action: 'reset_password', newPassword: resetPassword })
		});

		const data = await res.json();
		if (!res.ok) { userError = data.error; return; }

		userMessage = data.message;
		resetUserId = null;
		resetPassword = '';
	}

	async function setRole(user: User, newRole: string) {
		if (newRole === user.role) return;
		userMessage = '';
		userError = '';

		const res = await fetch('/api/admin/users', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ userId: user.id, action: 'change_role', newRole })
		});

		const data = await res.json();
		if (!res.ok) { userError = data.error; return; }

		userMessage = data.message;
		await loadUsers();
	}

	const roleLabels: Record<string, string> = {
		admin: 'Admin',
		spotmanager: 'Spot-Manager',
		member: 'Mitglied'
	};

	async function toggleActive(user: User) {
		confirmAction = null;
		userMessage = '';
		userError = '';

		const res = await fetch('/api/admin/users', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ userId: user.id, action: 'toggle_active' })
		});

		const data = await res.json();
		if (!res.ok) { userError = data.error; return; }

		userMessage = data.message;
		await loadUsers();
	}

	async function toggleUserData(userId: number) {
		if (expandedUserId === userId) {
			expandedUserId = null;
			userData = null;
			return;
		}
		expandedUserId = userId;
		loadingUserData = true;
		try {
			const res = await fetch(`/api/admin/userdata?userId=${userId}`);
			if (res.ok) userData = await res.json();
		} finally {
			loadingUserData = false;
		}
	}

	async function deleteUserEntry(type: string, id: number) {
		const res = await fetch('/api/admin/userdata', {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ type, id })
		});
		if (res.ok && expandedUserId) {
			await toggleUserData(expandedUserId);
			await toggleUserData(expandedUserId);
			await loadUsers();
		}
	}

	async function loadSpots() {
		const res = await fetch('/api/admin/spots?deleted=false');
		if (res.ok) {
			const data = await res.json();
			spotList = data.spots || [];
		}
	}

	async function loadTrashedSpots() {
		const res = await fetch('/api/admin/spots?deleted=true');
		if (res.ok) {
			const data = await res.json();
			trashedSpots = data.spots || [];
		}
	}

	async function spotAction(spot: Spot, action: string) {
		confirmSpot = null;
		spotMessage = '';

		const res = await fetch('/api/admin/spots', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ spotId: spot.id, action })
		});

		const data = await res.json();
		spotMessage = data.message || data.error;
		await loadSpots();
		await loadTrashedSpots();
	}

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString('de-CH', { day: 'numeric', month: 'short', year: 'numeric' });
	}

	function isExpired(dateStr: string): boolean {
		return new Date(dateStr) < new Date();
	}
</script>

{#if confirmAction}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="fixed inset-0 z-[100] flex items-center justify-center bg-black/70" onclick={() => confirmAction = null}>
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div class="bg-bg-card border border-border rounded-xl p-6 max-w-sm mx-4 shadow-2xl" onclick={(e) => e.stopPropagation()}>
			{#if confirmAction.type === 'deactivate'}
				<h3 class="text-lg font-semibold text-text-primary mb-2">User deaktivieren?</h3>
				<p class="text-text-secondary text-sm mb-1">
					<span class="font-medium text-text-primary">{confirmAction.user.username}</span> kann sich nicht mehr einloggen.
				</p>
				<p class="text-text-muted text-xs mb-4">Alle Daten bleiben erhalten. Du kannst den Account jederzeit wieder aktivieren.</p>
				<div class="flex gap-2 justify-end">
					<button onclick={() => confirmAction = null}
						class="px-4 py-2 rounded-lg text-sm text-text-secondary bg-bg-secondary hover:bg-bg-hover border border-border transition-colors cursor-pointer">
						Abbrechen
					</button>
					<button onclick={() => confirmAction && toggleActive(confirmAction.user)}
						class="px-4 py-2 rounded-lg text-sm font-medium text-white bg-warning hover:bg-warning/80 transition-colors cursor-pointer">
						Deaktivieren
					</button>
				</div>
			{:else}
				<h3 class="text-lg font-semibold text-text-primary mb-2">User aktivieren?</h3>
				<p class="text-text-secondary text-sm mb-4">
					<span class="font-medium text-text-primary">{confirmAction.user.username}</span> kann sich wieder einloggen.
				</p>
				<div class="flex gap-2 justify-end">
					<button onclick={() => confirmAction = null}
						class="px-4 py-2 rounded-lg text-sm text-text-secondary bg-bg-secondary hover:bg-bg-hover border border-border transition-colors cursor-pointer">
						Abbrechen
					</button>
					<button onclick={() => confirmAction && toggleActive(confirmAction.user)}
						class="px-4 py-2 rounded-lg text-sm font-medium text-white bg-success hover:bg-success/80 transition-colors cursor-pointer">
						Aktivieren
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}

{#if confirmSpot}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="fixed inset-0 z-[100] flex items-center justify-center bg-black/70" onclick={() => confirmSpot = null}>
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div class="bg-bg-card border border-border rounded-xl p-6 max-w-sm mx-4 shadow-2xl" onclick={(e) => e.stopPropagation()}>
			{#if confirmSpot.action === 'trash'}
				<h3 class="text-lg font-semibold text-text-primary mb-2">Spot in Papierkorb?</h3>
				<p class="text-text-secondary text-sm mb-1">
					<span class="font-medium text-text-primary">{confirmSpot.spot.name}</span> wird ausgeblendet.
				</p>
				<p class="text-text-muted text-xs mb-4">Alle Daten bleiben erhalten. Du kannst den Spot jederzeit wiederherstellen.</p>
				<div class="flex gap-2 justify-end">
					<button onclick={() => confirmSpot = null}
						class="px-4 py-2 rounded-lg text-sm text-text-secondary bg-bg-secondary hover:bg-bg-hover border border-border transition-colors cursor-pointer">
						Abbrechen
					</button>
					<button onclick={() => confirmSpot && spotAction(confirmSpot.spot, 'trash')}
						class="px-4 py-2 rounded-lg text-sm font-medium text-white bg-warning hover:bg-warning/80 transition-colors cursor-pointer">
						In Papierkorb
					</button>
				</div>
			{:else}
				<h3 class="text-lg font-semibold text-text-primary mb-2">Spot wiederherstellen?</h3>
				<p class="text-text-secondary text-sm mb-4">
					<span class="font-medium text-text-primary">{confirmSpot.spot.name}</span> wird wieder für alle sichtbar.
				</p>
				<div class="flex gap-2 justify-end">
					<button onclick={() => confirmSpot = null}
						class="px-4 py-2 rounded-lg text-sm text-text-secondary bg-bg-secondary hover:bg-bg-hover border border-border transition-colors cursor-pointer">
						Abbrechen
					</button>
					<button onclick={() => confirmSpot && spotAction(confirmSpot.spot, 'restore')}
						class="px-4 py-2 rounded-lg text-sm font-medium text-white bg-success hover:bg-success/80 transition-colors cursor-pointer">
						Wiederherstellen
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}

<div class="space-y-6">
	<div>
		<h2 class="text-2xl font-bold text-text-primary">Admin-Bereich</h2>
		<p class="text-text-secondary mt-1">User, Spots und Einladungen verwalten</p>
	</div>

	<div class="flex gap-1 bg-bg-secondary rounded-lg p-1">
		{#each [
			{ id: 'users' as const, label: 'User', count: userList.length },
			{ id: 'spots' as const, label: 'Spots', count: spotList.length },
			{ id: 'trash' as const, label: 'Papierkorb', count: trashedSpots.length },
			{ id: 'invites' as const, label: 'Einladungen', count: invites.length }
		] as tab}
			<button
				onclick={() => activeTab = tab.id}
				class="flex-1 px-3 py-2.5 rounded-md text-sm font-medium transition-colors cursor-pointer {activeTab === tab.id ? 'bg-bg-card text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'}"
			>
				{tab.label} <span class="text-text-muted">({tab.count})</span>
			</button>
		{/each}
	</div>

	{#if spotMessage}
		<div class="bg-success/10 border border-success/30 text-success rounded-lg p-3 text-sm">{spotMessage}</div>
	{/if}

	{#if activeTab === 'users'}
		<div class="space-y-4">
			{#if userMessage}
				<div class="bg-success/10 border border-success/30 text-success rounded-lg p-3 text-sm">{userMessage}</div>
			{/if}
			{#if userError}
				<div class="bg-danger/10 border border-danger/30 text-danger rounded-lg p-3 text-sm">{userError}</div>
			{/if}

			{#each userList as user}
				<div class="bg-bg-card rounded-xl border border-border p-5 {!user.active ? 'opacity-60' : ''}">
					<div class="flex items-center justify-between gap-4 flex-wrap">
						<div class="flex items-center gap-3">
							<div class="w-10 h-10 rounded-full {user.active ? 'bg-accent/20 text-accent' : 'bg-danger/20 text-danger'} flex items-center justify-center font-bold">
								{user.username.charAt(0).toUpperCase()}
							</div>
							<div>
								<div class="flex items-center gap-2">
									<p class="text-text-primary font-medium">{user.username}</p>
									{#if !user.active}
										<span class="text-xs bg-danger/15 text-danger px-2 py-0.5 rounded-full">Deaktiviert</span>
									{/if}
								</div>
								<p class="text-text-muted text-xs">
									{roleLabels[user.role] || user.role} · seit {formatDate(user.createdAt)} · {user.spotCount} Spots · {user.voteCount} Votes
								</p>
							</div>
						</div>
					<div class="flex items-center gap-2 flex-wrap">
						<button
							onclick={() => toggleUserData(user.id)}
							class="text-xs bg-accent/10 hover:bg-accent/20 border border-accent/30 px-3 py-1.5 rounded-lg text-accent transition-colors cursor-pointer"
						>
							{expandedUserId === user.id ? 'Zuklappen' : 'Daten'}
						</button>
						<button
							onclick={() => { resetUserId = resetUserId === user.id ? null : user.id; resetPassword = ''; }}
							class="text-xs bg-bg-secondary hover:bg-bg-hover border border-border px-3 py-1.5 rounded-lg text-text-secondary transition-colors cursor-pointer"
						>
							PW Reset
						</button>
							<select
								value={user.role}
								onchange={(e) => setRole(user, (e.target as HTMLSelectElement).value)}
								class="text-xs bg-bg-secondary border border-border px-2 py-1.5 rounded-lg text-text-secondary cursor-pointer focus:outline-none focus:border-accent"
							>
								<option value="admin">Admin</option>
								<option value="spotmanager">Spot-Manager</option>
								<option value="member">Mitglied</option>
							</select>
							{#if user.active}
								<button
									onclick={() => confirmAction = { type: 'deactivate', user }}
									class="text-xs bg-warning/10 hover:bg-warning/20 border border-warning/30 px-3 py-1.5 rounded-lg text-warning transition-colors cursor-pointer"
								>
									Deaktivieren
								</button>
							{:else}
								<button
									onclick={() => confirmAction = { type: 'activate', user }}
									class="text-xs bg-success/10 hover:bg-success/20 border border-success/30 px-3 py-1.5 rounded-lg text-success transition-colors cursor-pointer"
								>
									Aktivieren
								</button>
							{/if}
						</div>
					</div>

				{#if resetUserId === user.id}
					<div class="mt-4 pt-4 border-t border-border flex gap-2">
						<input
							type="text"
							bind:value={resetPassword}
							placeholder="Neues Passwort (mind. 4 Zeichen)"
							class="flex-1 bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
						/>
						<button
							onclick={resetUserPassword}
							disabled={resetPassword.length < 4}
							class="bg-accent hover:bg-accent-hover disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
						>
							Setzen
						</button>
					</div>
				{/if}

				{#if expandedUserId === user.id}
					<div class="mt-4 pt-4 border-t border-border space-y-4">
						{#if loadingUserData}
							<p class="text-text-muted text-sm">Laden...</p>
						{:else if userData}
							{#if userData.spotVotes.length > 0}
								<div>
									<p class="text-text-secondary text-xs font-semibold uppercase tracking-wide mb-2">Spot-Bewertungen ({userData.spotVotes.length})</p>
									<div class="space-y-1">
										{#each userData.spotVotes as v}
											<div class="flex items-center justify-between bg-bg-secondary rounded-lg px-3 py-2">
												<div class="flex items-center gap-2 min-w-0">
													<span class="text-yellow-400 text-sm">{'★'.repeat(v.score)}{'☆'.repeat(5 - v.score)}</span>
													<span class="text-text-primary text-sm truncate">{v.spotName}</span>
													<span class="text-text-muted text-xs">({v.spotCity})</span>
												</div>
												<button onclick={() => deleteUserEntry('spot_vote', v.id)}
													class="text-text-muted hover:text-danger text-xs shrink-0 transition-colors cursor-pointer">×</button>
											</div>
										{/each}
									</div>
								</div>
							{/if}

							{#if userData.trainingVotes.length > 0}
								<div>
									<p class="text-text-secondary text-xs font-semibold uppercase tracking-wide mb-2">Training-Votes ({userData.trainingVotes.length})</p>
									<div class="space-y-1">
										{#each userData.trainingVotes as v}
											<div class="flex items-center justify-between bg-bg-secondary rounded-lg px-3 py-2">
												<div class="text-sm">
													<span class="text-text-primary">{v.spotName}</span>
													<span class="text-text-muted text-xs ml-2">{v.sessionDay} {v.sessionDate}</span>
												</div>
												<button onclick={() => deleteUserEntry('training_vote', v.id)}
													class="text-text-muted hover:text-danger text-xs shrink-0 transition-colors cursor-pointer">×</button>
											</div>
										{/each}
									</div>
								</div>
							{/if}

							{#if userData.absences.length > 0}
								<div>
									<p class="text-text-secondary text-xs font-semibold uppercase tracking-wide mb-2">Abmeldungen ({userData.absences.length})</p>
									<div class="space-y-1">
										{#each userData.absences as a}
											<div class="flex items-center justify-between bg-bg-secondary rounded-lg px-3 py-2">
												<div class="text-sm">
													<span class="text-text-primary">{a.sessionDay} {a.sessionDate}</span>
													{#if a.reason}
														<span class="text-text-muted text-xs ml-2">– {a.reason}</span>
													{/if}
												</div>
												<button onclick={() => deleteUserEntry('absence', a.id)}
													class="text-text-muted hover:text-danger text-xs shrink-0 transition-colors cursor-pointer">×</button>
											</div>
										{/each}
									</div>
								</div>
							{/if}

							{#if userData.spotVotes.length === 0 && userData.trainingVotes.length === 0 && userData.absences.length === 0}
								<p class="text-text-muted text-sm">Keine Daten vorhanden</p>
							{/if}
						{/if}
					</div>
				{/if}
			</div>
			{/each}
		</div>
	{/if}

	{#if activeTab === 'spots'}
		<div class="space-y-3">
			{#each spotList as spot}
				<div class="bg-bg-card rounded-xl border border-border p-4 flex items-center justify-between gap-4">
					<div>
						<a href="/spots/{spot.id}" class="text-text-primary font-medium hover:text-accent transition-colors">{spot.name}</a>
						<p class="text-text-muted text-xs">{spot.city} · von {spot.addedByName}</p>
					</div>
					<div class="flex items-center gap-2">
						<a href="/spots/{spot.id}" class="text-xs bg-bg-secondary hover:bg-bg-hover border border-border px-3 py-1.5 rounded-lg text-text-secondary transition-colors">
							Ansehen
						</a>
						<button
							onclick={() => confirmSpot = { action: 'trash', spot }}
							class="text-xs bg-warning/10 hover:bg-warning/20 border border-warning/30 px-3 py-1.5 rounded-lg text-warning transition-colors cursor-pointer"
						>
							Papierkorb
						</button>
					</div>
				</div>
			{/each}

			{#if spotList.length === 0}
				<p class="text-text-muted text-center py-8">Noch keine Spots vorhanden</p>
			{/if}
		</div>
	{/if}

	{#if activeTab === 'trash'}
		<div class="space-y-3">
			{#if trashedSpots.length === 0}
				<p class="text-text-muted text-center py-8">Papierkorb ist leer</p>
			{:else}
				<p class="text-text-secondary text-sm mb-2">Gelöschte Spots können jederzeit wiederhergestellt werden.</p>
				{#each trashedSpots as spot}
					<div class="bg-bg-card rounded-xl border border-border p-4 flex items-center justify-between gap-4 opacity-70">
						<div>
							<p class="text-text-primary font-medium">{spot.name}</p>
							<p class="text-text-muted text-xs">{spot.city} · von {spot.addedByName}</p>
						</div>
						<button
							onclick={() => confirmSpot = { action: 'restore', spot }}
							class="text-xs bg-success/10 hover:bg-success/20 border border-success/30 px-3 py-1.5 rounded-lg text-success transition-colors cursor-pointer"
						>
							Wiederherstellen
						</button>
					</div>
				{/each}
			{/if}
		</div>
	{/if}

	{#if activeTab === 'invites'}
		<div class="space-y-4">
			<button
				onclick={generateInvite}
				disabled={generatingInvite}
				class="bg-accent hover:bg-accent-hover disabled:opacity-50 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer"
			>
				{generatingInvite ? 'Wird erstellt...' : '+ Einladungslink erstellen'}
			</button>

			<div class="space-y-3">
				{#each invites as invite}
					<div class="bg-bg-card rounded-xl border border-border p-5">
						<div class="flex items-start justify-between gap-4 flex-wrap">
							<div class="min-w-0">
								<div class="flex items-center gap-2 flex-wrap">
									{#if invite.used}
										<span class="text-xs bg-success/15 text-success px-2 py-0.5 rounded-full">Verwendet</span>
									{:else if isExpired(invite.expiresAt)}
										<span class="text-xs bg-danger/15 text-danger px-2 py-0.5 rounded-full">Abgelaufen</span>
									{:else}
										<span class="text-xs bg-accent/15 text-accent px-2 py-0.5 rounded-full">Aktiv</span>
									{/if}
								</div>
								<p class="text-text-muted text-xs mt-2">
									Erstellt: {formatDate(invite.createdAt)} · Gültig bis: {formatDate(invite.expiresAt)}
								</p>
							</div>
							{#if !invite.used && !isExpired(invite.expiresAt)}
								<button
									onclick={() => copyInviteLink(invite.token)}
									class="bg-bg-secondary hover:bg-bg-hover border border-border px-4 py-2 rounded-lg text-sm text-text-primary transition-colors shrink-0 cursor-pointer"
								>
									{copiedToken === invite.token ? 'Kopiert!' : 'Link kopieren'}
								</button>
							{/if}
						</div>
					</div>
				{/each}

				{#if invites.length === 0}
					<p class="text-text-muted text-center py-8">Noch keine Einladungen erstellt</p>
				{/if}
			</div>
		</div>
	{/if}
</div>
