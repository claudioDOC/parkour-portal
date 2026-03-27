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

	let activeTab = $state<'invites' | 'users' | 'spots' | 'trash' | 'trainings' | 'server' | 'audit'>('users');

	let invites = $state<Invite[]>([]);
	let generatingInvite = $state(false);
	let inviteError = $state('');
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

	type TrainingSession = {
		id: number;
		date: string;
		dayOfWeek: string;
		timeStart: string;
		timeEnd: string;
		absences: { id: number; userId: number; username: string; reason: string | null }[];
		attending: { id: number; username: string; active: boolean }[];
		spotVotes: { id: number; spotName: string; spotCity: string; username: string; userId: number }[];
		guests: { id: number; sessionId: number; name: string }[];
		hiddenUsers: { id: number; userId: number; username: string }[];
	};

	let trainingSessions = $state<TrainingSession[]>([]);
	let loadingTrainings = $state(false);
	let trainingMessage = $state('');
	let guestName = $state<Record<number, string>>({});

	let spotList = $state<Spot[]>([]);
	let trashedSpots = $state<Spot[]>([]);
	let spotMessage = $state('');
	let confirmSpot = $state<{ action: string; spot: Spot } | null>(null);

	type SystemStats = {
		hostname: string;
		platform: string;
		uptimeSeconds: number;
		memory: { total: number; free: number; used: number; usedPercent: number };
		process: { rss: number; heapUsed: number };
		load: { avg1: number; avg5: number; avg15: number; cpus: number };
		disk: { path: string; total: number; free: number; used: number; usedPercent: number } | null;
	};
	let systemStats = $state<SystemStats | null>(null);
	let loadingSystem = $state(false);

	type AuditEntry = {
		id: number;
		createdAt: string;
		action: string;
		actorUserId: number | null;
		actorUsername: string | null;
		targetUserId: number | null;
		ip: string | null;
		detail: unknown;
	};
	let auditLogs = $state<AuditEntry[]>([]);
	let auditTotal = $state(0);
	let auditOffset = $state(0);
	let loadingAudit = $state(false);
	const AUDIT_PAGE = 80;

	const ACTION_LABELS: Record<string, string> = {
		'auth.login.success': 'Anmeldung OK',
		'auth.login.failed': 'Anmeldung fehlgeschlagen',
		'auth.logout': 'Abmeldung',
		'auth.register': 'Registrierung',
		'auth.password_change': 'Passwort geändert',
		'auth.password_change.failed': 'Passwortänderung fehlgeschlagen',
		'admin.user.password_reset': 'Admin: Passwort zurückgesetzt',
		'admin.user.role_change': 'Admin: Rolle geändert',
		'admin.user.toggle_active': 'Admin: User aktiviert/deaktiviert',
		'admin.invite.created': 'Admin: Einladung erstellt',
		'admin.spot.trash': 'Admin: Spot → Papierkorb',
		'admin.spot.restore': 'Admin: Spot wiederhergestellt',
		'admin.spot.edit': 'Admin: Spot bearbeitet',
		'admin.userdata.delete': 'Admin: User-Daten gelöscht',
		'admin.training.guest_add': 'Admin: Gast hinzugefügt',
		'admin.training.spot_vote_remove': 'Admin: Training-Vote entfernt',
		'admin.training.hide_user': 'Admin: User aus „Zieht" entfernt',
		'admin.training.unhide_user': 'Admin: User wieder sichtbar',
		'admin.training.remove_absence': 'Admin: Abmeldung aufgehoben',
		'admin.training.remove_guest': 'Admin: Gast entfernt',
		'spot.create': 'Spot vorgeschlagen',
		'spot.vote.create': 'Spot-Bewertung abgegeben',
		'spot.vote.update': 'Spot-Bewertung geändert',
		'spot.vote.remove': 'Spot-Bewertung entfernt',
		'spot.image.upload': 'Spot-Bild hochgeladen',
		'spot.image.delete': 'Spot-Bild gelöscht',
		'training.absence': 'Training: Abgemeldet',
		'training.absence.cancel': 'Training: Abmeldung zurückgenommen',
		'training.spot_vote': 'Training: Spot gevotet',
		'training.spot_vote.change': 'Training: Spot-Vote geändert',
		'training.spot_vote.remove': 'Training: Spot-Vote zurückgezogen'
	};

	function actionLabel(action: string): string {
		return ACTION_LABELS[action] ?? action;
	}

	function formatLogDetail(detail: unknown): string {
		if (detail == null) return '';
		if (typeof detail === 'string') return detail;
		try {
			return JSON.stringify(detail);
		} catch {
			return String(detail);
		}
	}

	function formatLogTime(iso: string): string {
		const d = new Date(iso.replace(' ', 'T'));
		if (Number.isNaN(d.getTime())) return iso;
		return d.toLocaleString('de-CH', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
	}

	async function loadAudit(append = false) {
		loadingAudit = true;
		try {
			const off = append ? auditOffset : 0;
			const res = await fetch(`/api/admin/audit?limit=${AUDIT_PAGE}&offset=${off}`);
			if (!res.ok) return;
			const data = await res.json();
			auditTotal = data.total;
			if (append) {
				auditLogs = [...auditLogs, ...data.logs];
			} else {
				auditLogs = data.logs;
			}
			auditOffset = off + data.logs.length;
		} finally {
			loadingAudit = false;
		}
	}

	onMount(() => {
		loadUsers();
		loadInvites();
		loadSpots();
		loadTrashedSpots();
		loadTrainingSessions();
		loadSystem();
	});

	function formatBytes(n: number): string {
		if (n < 1024) return `${Math.round(n)} B`;
		const units = ['KB', 'MB', 'GB', 'TB'];
		let v = n;
		let i = 0;
		while (v >= 1024 && i < units.length - 1) {
			v /= 1024;
			i++;
		}
		return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
	}

	function formatUptime(sec: number): string {
		const d = Math.floor(sec / 86400);
		const h = Math.floor((sec % 86400) / 3600);
		const m = Math.floor((sec % 3600) / 60);
		if (d > 0) return `${d} Tg. ${h} Std.`;
		if (h > 0) return `${h} Std. ${m} Min.`;
		return `${m} Min.`;
	}

	async function loadSystem() {
		loadingSystem = true;
		try {
			const res = await fetch('/api/admin/system');
			if (res.ok) systemStats = await res.json();
		} finally {
			loadingSystem = false;
		}
	}

	async function loadInvites() {
		const res = await fetch('/api/admin/invites', { credentials: 'include' });
		const data = await res.json();
		if (!res.ok) {
			inviteError = data.message || data.error || `Laden fehlgeschlagen (${res.status})`;
			invites = [];
			return;
		}
		inviteError = '';
		invites = data.invites ?? [];
	}

	async function generateInvite() {
		inviteError = '';
		generatingInvite = true;
		try {
			const res = await fetch('/api/admin/invites', {
				method: 'POST',
				credentials: 'include'
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				const d = data as { message?: string; error?: string };
				inviteError =
					(typeof d.message === 'string' && d.message) ||
					(typeof d.error === 'string' && d.error) ||
					`Erstellen fehlgeschlagen (${res.status})`;
				return;
			}
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

	async function loadTrainingSessions() {
		loadingTrainings = true;
		try {
			const res = await fetch('/api/admin/training');
			if (res.ok) {
				const data = await res.json();
				trainingSessions = data.sessions || [];
			}
		} finally {
			loadingTrainings = false;
		}
	}

	async function deleteTrainingEntry(type: string, payload: Record<string, unknown>) {
		trainingMessage = '';
		const res = await fetch('/api/admin/training', {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ type, ...payload })
		});
		if (res.ok) {
			trainingMessage = 'Erfolgreich';
			await loadTrainingSessions();
			setTimeout(() => trainingMessage = '', 2000);
		}
	}

	async function addGuest(sessionId: number) {
		const name = guestName[sessionId]?.trim();
		if (!name) return;
		trainingMessage = '';
		const res = await fetch('/api/admin/training', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ type: 'add_guest', sessionId, name })
		});
		if (res.ok) {
			guestName[sessionId] = '';
			trainingMessage = `${name} hinzugefügt`;
			await loadTrainingSessions();
			setTimeout(() => trainingMessage = '', 2000);
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

	<div class="flex gap-1 bg-bg-secondary rounded-lg p-1 overflow-x-auto">
		{#each [
			{ id: 'users' as const, label: 'User', count: userList.length },
			{ id: 'trainings' as const, label: 'Trainings', count: trainingSessions.length },
			{ id: 'spots' as const, label: 'Spots', count: spotList.length },
			{ id: 'trash' as const, label: 'Papierkorb', count: trashedSpots.length },
			{ id: 'invites' as const, label: 'Einladungen', count: invites.length },
			{ id: 'server' as const, label: 'Server', count: null as number | null },
			{ id: 'audit' as const, label: 'Protokoll', count: null as number | null }
		] as tab}
			<button
				onclick={() => {
					activeTab = tab.id;
					if (tab.id === 'audit') loadAudit(false);
				}}
				class="flex-1 px-3 py-2.5 rounded-md text-sm font-medium transition-colors cursor-pointer {activeTab === tab.id ? 'bg-bg-card text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'}"
			>
				{tab.label}{#if tab.count !== null} <span class="text-text-muted">({tab.count})</span>{/if}
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

	{#if activeTab === 'trainings'}
		<div class="space-y-4">
			{#if trainingMessage}
				<div class="bg-success/10 border border-success/30 text-success rounded-lg p-3 text-sm">{trainingMessage}</div>
			{/if}

			{#if loadingTrainings}
				<p class="text-text-muted text-center py-8">Laden...</p>
			{:else if trainingSessions.length === 0}
				<p class="text-text-muted text-center py-8">Keine kommenden Trainings</p>
			{:else}
				{#each trainingSessions as session}
					{@const sessionDate = new Date(session.date + 'T00:00:00')}
					<div class="bg-bg-card rounded-xl border border-border overflow-hidden">
						<div class="p-5">
							<div class="flex items-center gap-2 mb-1">
								<h3 class="font-semibold text-text-primary">{session.dayOfWeek}</h3>
								<span class="text-text-muted text-sm">
									{sessionDate.toLocaleDateString('de-CH', { day: 'numeric', month: 'long', year: 'numeric' })}
								</span>
								<span class="text-text-muted text-xs">{session.timeStart} – {session.timeEnd}</span>
							</div>

							{#if session.spotVotes.length > 0}
								<div class="mt-4">
									<p class="text-text-secondary text-xs font-semibold uppercase tracking-wide mb-2">
										Spot-Votes ({session.spotVotes.length})
									</p>
									<div class="space-y-1">
										{#each session.spotVotes as vote}
											<div class="flex items-center justify-between bg-bg-secondary rounded-lg px-3 py-2">
												<div class="text-sm">
													<span class="text-text-primary font-medium">{vote.username}</span>
													<span class="text-text-muted mx-1">→</span>
													<span class="text-accent">{vote.spotName}</span>
													<span class="text-text-muted text-xs ml-1">({vote.spotCity})</span>
												</div>
												<button onclick={() => deleteTrainingEntry('spot_vote', { id: vote.id })}
													class="text-text-muted hover:text-danger text-sm shrink-0 transition-colors cursor-pointer px-2">×</button>
											</div>
										{/each}
									</div>
								</div>
							{/if}

							<div class="mt-4">
								<div class="flex items-center justify-between mb-2">
									<p class="text-success text-xs font-semibold uppercase tracking-wide">
										Zieht ({session.attending.length + (session.guests?.length || 0)})
									</p>
								</div>
								<div class="space-y-1">
									{#each session.attending as user}
										<div class="flex items-center justify-between bg-bg-secondary rounded-lg px-3 py-2">
											<span class="text-text-primary text-sm">{user.username}</span>
											<button onclick={() => deleteTrainingEntry('hide_user', { userId: user.id, sessionId: session.id })}
												class="text-text-muted hover:text-danger text-xs shrink-0 transition-colors cursor-pointer">Entfernen</button>
										</div>
									{/each}
									{#each session.guests || [] as guest}
										<div class="flex items-center justify-between bg-bg-secondary rounded-lg px-3 py-2">
											<span class="text-amber-400 text-sm">{guest.name} <span class="text-text-muted text-xs">(Gast)</span></span>
											<button onclick={() => deleteTrainingEntry('remove_guest', { id: guest.id })}
												class="text-text-muted hover:text-danger text-xs shrink-0 transition-colors cursor-pointer">Entfernen</button>
										</div>
									{/each}
									{#if session.attending.length === 0 && !(session.guests?.length)}
										<p class="text-text-muted text-sm">Niemand</p>
									{/if}
								</div>
								<div class="flex gap-2 mt-2">
									<input
										type="text"
										bind:value={guestName[session.id]}
										placeholder="Gast hinzufügen (z.B. Max – Probetraining)"
										class="flex-1 bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
										onkeydown={(e) => { if (e.key === 'Enter') addGuest(session.id); }}
									/>
									<button
										onclick={() => addGuest(session.id)}
										disabled={!guestName[session.id]?.trim()}
										class="bg-accent hover:bg-accent-hover disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
									>+</button>
								</div>
							</div>

							{#if session.absences.length > 0}
								<div class="mt-4">
									<p class="text-danger text-xs font-semibold uppercase tracking-wide mb-2">
										Abgemeldet ({session.absences.length})
									</p>
									<div class="space-y-1">
										{#each session.absences as absence}
											<div class="flex items-center justify-between bg-bg-secondary rounded-lg px-3 py-2">
												<div class="text-sm">
													<span class="text-text-primary">{absence.username}</span>
													{#if absence.reason}
														<span class="text-text-muted text-xs ml-2">– {absence.reason}</span>
													{/if}
												</div>
												<button onclick={() => deleteTrainingEntry('remove_absence', { id: absence.id })}
													class="text-text-muted hover:text-success text-xs shrink-0 transition-colors cursor-pointer">Aufheben</button>
											</div>
										{/each}
									</div>
								</div>
							{/if}

							{#if session.hiddenUsers?.length > 0}
								<div class="mt-4">
									<p class="text-text-muted text-xs font-semibold uppercase tracking-wide mb-2">
										Entfernt ({session.hiddenUsers.length})
									</p>
									<div class="space-y-1">
										{#each session.hiddenUsers as hidden}
											<div class="flex items-center justify-between bg-bg-secondary rounded-lg px-3 py-2 opacity-60">
												<span class="text-text-primary text-sm">{hidden.username}</span>
												<button onclick={() => deleteTrainingEntry('unhide_user', { id: hidden.id })}
													class="text-text-muted hover:text-success text-xs shrink-0 transition-colors cursor-pointer">Wiederherstellen</button>
											</div>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					</div>
				{/each}
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

	{#if activeTab === 'audit'}
		<div class="space-y-4">
			<p class="text-text-secondary text-sm">
				Anmeldungen, Admin-Aktionen und relevante Änderungen (Spots, Training, Bilder). Neueste zuerst.
			</p>
			<div class="flex gap-2 flex-wrap">
				<button
					onclick={() => loadAudit(false)}
					disabled={loadingAudit}
					class="bg-bg-secondary hover:bg-bg-hover border border-border px-4 py-2 rounded-lg text-sm text-text-primary transition-colors cursor-pointer disabled:opacity-50"
				>
					{loadingAudit ? 'Laden…' : 'Aktualisieren'}
				</button>
				<span class="text-text-muted text-sm self-center">{auditTotal} Einträge gesamt</span>
			</div>

			{#if loadingAudit && auditLogs.length === 0}
				<p class="text-text-muted text-center py-8">Laden…</p>
			{:else if auditLogs.length === 0}
				<p class="text-text-muted text-center py-8">Noch keine Einträge</p>
			{:else}
				<div class="rounded-xl border border-border overflow-hidden">
					<div class="overflow-x-auto">
						<table class="w-full text-sm">
							<thead class="bg-bg-secondary text-text-muted text-left text-xs uppercase tracking-wide">
								<tr>
									<th class="px-3 py-2 font-medium">Zeit</th>
									<th class="px-3 py-2 font-medium">Aktion</th>
									<th class="px-3 py-2 font-medium">Wer</th>
									<th class="px-3 py-2 font-medium">IP</th>
									<th class="px-3 py-2 font-medium">Details</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-border">
								{#each auditLogs as row}
									<tr class="bg-bg-card hover:bg-bg-secondary/50">
										<td class="px-3 py-2 text-text-secondary whitespace-nowrap align-top">{formatLogTime(row.createdAt)}</td>
										<td class="px-3 py-2 text-text-primary align-top">
											<span title={row.action}>{actionLabel(row.action)}</span>
										</td>
										<td class="px-3 py-2 text-text-secondary align-top">
											{#if row.actorUsername}
												{row.actorUsername}{#if row.actorUserId}<span class="text-text-muted text-xs"> #{row.actorUserId}</span>{/if}
											{:else}
												<span class="text-text-muted">–</span>
											{/if}
										</td>
										<td class="px-3 py-2 text-text-muted align-top whitespace-nowrap">{row.ip ?? '–'}</td>
										<td class="px-3 py-2 text-text-muted align-top max-w-xs break-all font-mono text-xs">
											{formatLogDetail(row.detail) || '–'}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
				{#if auditLogs.length < auditTotal}
					<button
						onclick={() => loadAudit(true)}
						disabled={loadingAudit}
						class="w-full bg-bg-secondary hover:bg-bg-hover border border-border py-2.5 rounded-lg text-sm text-text-primary transition-colors cursor-pointer disabled:opacity-50"
					>
						{loadingAudit ? 'Laden…' : 'Weitere laden'}
					</button>
				{/if}
			{/if}
		</div>
	{/if}

	{#if activeTab === 'server'}
		<div class="space-y-4">
			<div class="flex items-center justify-between gap-4 flex-wrap">
				<p class="text-text-secondary text-sm">
					Werte beziehen sich auf den Rechner, auf dem die App läuft (VPS oder dein PC bei lokalem Test).
				</p>
				<button
					onclick={loadSystem}
					disabled={loadingSystem}
					class="bg-bg-secondary hover:bg-bg-hover border border-border px-4 py-2 rounded-lg text-sm text-text-primary transition-colors cursor-pointer disabled:opacity-50"
				>
					{loadingSystem ? 'Laden…' : 'Aktualisieren'}
				</button>
			</div>

			{#if loadingSystem && !systemStats}
				<p class="text-text-muted text-center py-8">Laden…</p>
			{:else if systemStats}
				<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
					<div class="bg-bg-card rounded-xl border border-border p-5">
						<p class="text-text-muted text-xs font-semibold uppercase tracking-wide mb-3">Arbeitsspeicher (RAM)</p>
						<p class="text-text-primary text-2xl font-bold">{systemStats.memory.usedPercent}%</p>
						<p class="text-text-secondary text-sm mt-2">
							{formatBytes(systemStats.memory.used)} von {formatBytes(systemStats.memory.total)} belegt
						</p>
						<p class="text-text-muted text-xs mt-1">{formatBytes(systemStats.memory.free)} frei</p>
					</div>

					<div class="bg-bg-card rounded-xl border border-border p-5">
						<p class="text-text-muted text-xs font-semibold uppercase tracking-wide mb-3">Festplatte</p>
						{#if systemStats.disk}
							<p class="text-text-primary text-2xl font-bold">{systemStats.disk.usedPercent}%</p>
							<p class="text-text-secondary text-sm mt-2">
								{formatBytes(systemStats.disk.used)} von {formatBytes(systemStats.disk.total)} belegt
							</p>
							<p class="text-text-muted text-xs mt-1 break-all">{systemStats.disk.path}</p>
						{:else}
							<p class="text-text-muted text-sm">Keine Angabe (Plattform unterstützt kein statfs)</p>
						{/if}
					</div>

					<div class="bg-bg-card rounded-xl border border-border p-5">
						<p class="text-text-muted text-xs font-semibold uppercase tracking-wide mb-3">CPU-Last</p>
						<p class="text-text-primary text-2xl font-bold">{systemStats.load.avg1}</p>
						<p class="text-text-secondary text-sm mt-2">
							Durchschnitt 1 / 5 / 15 Min.: {systemStats.load.avg1} · {systemStats.load.avg5} · {systemStats.load.avg15}
						</p>
						<p class="text-text-muted text-xs mt-1">
							{systemStats.load.cpus} Kerne · grob: Last geteilt durch Kerne unter 1 = entspannt
						</p>
					</div>

					<div class="bg-bg-card rounded-xl border border-border p-5">
						<p class="text-text-muted text-xs font-semibold uppercase tracking-wide mb-3">Node-Prozess</p>
						<p class="text-text-primary text-lg font-semibold">{formatBytes(systemStats.process.rss)} RSS</p>
						<p class="text-text-secondary text-sm mt-2">Heap: {formatBytes(systemStats.process.heapUsed)}</p>
					</div>

					<div class="bg-bg-card rounded-xl border border-border p-5 sm:col-span-2 lg:col-span-2">
						<p class="text-text-muted text-xs font-semibold uppercase tracking-wide mb-3">System</p>
						<p class="text-text-primary text-sm">
							<span class="font-medium">{systemStats.hostname}</span>
							<span class="text-text-muted"> · {systemStats.platform}</span>
						</p>
						<p class="text-text-secondary text-sm mt-2">Laufzeit seit Boot: {formatUptime(systemStats.uptimeSeconds)}</p>
					</div>
				</div>
			{:else}
				<p class="text-text-muted text-center py-8">Konnte keine Daten laden</p>
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
			{#if inviteError}
				<p class="text-danger text-sm">{inviteError}</p>
			{/if}

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
