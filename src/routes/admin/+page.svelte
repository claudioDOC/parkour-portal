<script lang="ts">
	import { onMount } from 'svelte';
	import { MIN_PASSWORD_LENGTH } from '$lib/passwordPolicy';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

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
		trainingAttendance: 'implicit' | 'opt_in';
		autoAbsentWeekdays: string[];
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
		absences: { id: number | null; userId: number; username: string; reason: string | null; virtual?: boolean }[];
		attending: { id: number; username: string }[];
		spotVotes: { id: number; spotName: string; spotCity: string; username: string; userId: number }[];
		guests: { id: number; sessionId: number; name: string }[];
		hiddenUsers: { id: number; userId: number; username: string }[];
	};

	let trainingSessions = $state<TrainingSession[]>([]);
	let loadingTrainings = $state(false);
	let trainingMessage = $state('');
	let trainingError = $state('');
	let guestName = $state<Record<number, string>>({});
	/** Admin: User für nachträgliche Abmeldung pro Session (User-ID als String) */
	let adminAbsencePick = $state<Record<number, string>>({});
	let adminAbsenceNote = $state<Record<number, string>>({});

	let spotList = $state<Spot[]>([]);
	let trashedSpots = $state<Spot[]>([]);
	let trashedUserList = $state<User[]>([]);
	type TrashedChallenge = {
		id: number;
		title: string;
		description: string | null;
		spotId: number;
		spotName: string;
		createdByName: string;
		deletedAt: string | null;
	};
	let trashedChallenges = $state<TrashedChallenge[]>([]);
	let spotMessage = $state('');
	let confirmSpot = $state<{ action: string; spot: Spot } | null>(null);
	let userBinModal = $state<null | { mode: 'to_trash' | 'restore' | 'purge'; user: User }>(null);

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
		'admin.user.training_attendance': 'Admin: Trainingsliste-Modus geändert',
		'admin.user.auto_absent_weekdays': 'Admin: Standard-Abmeldung Wochentage geändert',
		'admin.user.trash': 'Admin: User → Papierkorb',
		'admin.user.restore': 'Admin: User wiederhergestellt',
		'admin.user.purge': 'Admin: User endgültig gelöscht',
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
		'admin.training.add_absence': 'Admin: nachträglich abgemeldet / nicht erschienen',
		'admin.training.remove_guest': 'Admin: Gast entfernt',
		'spot.create': 'Spot vorgeschlagen',
		'spot.vote.create': 'Spot-Bewertung abgegeben',
		'spot.vote.update': 'Spot-Bewertung geändert',
		'spot.vote.remove': 'Spot-Bewertung entfernt',
		'spot.image.upload': 'Spot-Bild hochgeladen',
		'spot.image.delete': 'Spot-Bild gelöscht',
		'spot.challenge.create': 'Spot-Challenge erstellt',
		'spot.challenge.complete': 'Spot-Challenge erledigt',
		'spot.challenge.uncomplete': 'Spot-Challenge Erledigung zurückgenommen',
		'spot.challenge.delete': 'Spot-Challenge in Papierkorb',
		'spot.challenge.restore': 'Spot-Challenge wiederhergestellt',
		'training.absence': 'Training: Zieht nicht',
		'training.absence.cancel': 'Training: Abmeldung zurückgenommen',
		'training.rsvp_yes': 'Training: Zusage',
		'training.rsvp_no': 'Training: Zusage zurückgenommen',
		'training.weekday_override_yes': 'Training: trotz Standard-Regel dabei',
		'training.weekday_override_no': 'Training: Standard-Abmeldung wieder aktiv',
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
		loadTrashedUsers();
		loadTrashedChallenges();
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
				credentials: 'include',
				headers: { Accept: 'application/json' }
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				const d = data as { message?: string; error?: string; detail?: string };
				const main =
					(typeof d.message === 'string' && d.message) ||
					(typeof d.error === 'string' && d.error) ||
					`Erstellen fehlgeschlagen (${res.status})`;
				const extra = typeof d.detail === 'string' && d.detail ? ` — ${d.detail}` : '';
				inviteError = main + extra;
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

	async function loadTrashedUsers() {
		const res = await fetch('/api/admin/users?trashed=true');
		if (!res.ok) return;
		const d = await res.json();
		trashedUserList = d.users ?? [];
	}

	async function userTrashAction(user: User, action: 'trash_user' | 'restore_user' | 'purge_user') {
		userMessage = '';
		userError = '';
		const res = await fetch('/api/admin/users', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ userId: user.id, action })
		});
		const d = await res.json();
		if (!res.ok) {
			userError = d.error ?? 'Fehler';
			return;
		}
		userMessage = d.message ?? 'OK';
		await loadUsers();
		await loadTrashedUsers();
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

	async function setAutoAbsentWeekdays(user: User, days: string[]) {
		userMessage = '';
		userError = '';
		const res = await fetch('/api/admin/users', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				userId: user.id,
				action: 'set_auto_absent_weekdays',
				autoAbsentWeekdays: days
			})
		});
		const data = await res.json();
		if (!res.ok) {
			userError = data.error;
			return;
		}
		userMessage = data.message;
		await loadUsers();
	}

	async function toggleAutoAbsentDay(user: User, day: 'Dienstag' | 'Donnerstag') {
		if (user.trainingAttendance === 'opt_in') return;
		const has = user.autoAbsentWeekdays.includes(day);
		const next = has ? user.autoAbsentWeekdays.filter((d) => d !== day) : [...user.autoAbsentWeekdays, day];
		await setAutoAbsentWeekdays(user, next);
	}

	async function setTrainingAttendance(user: User, mode: 'implicit' | 'opt_in') {
		if (mode === user.trainingAttendance) return;
		userMessage = '';
		userError = '';
		const res = await fetch('/api/admin/users', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				userId: user.id,
				action: 'set_training_attendance',
				trainingAttendance: mode
			})
		});
		const data = await res.json();
		if (!res.ok) {
			userError = data.error;
			return;
		}
		userMessage = data.message;
		await loadUsers();
	}

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
		trainingError = '';
		try {
			const res = await fetch('/api/admin/training', { credentials: 'include' });
			if (res.ok) {
				const data = await res.json();
				trainingSessions = data.sessions || [];
			} else {
				let data: Record<string, unknown> = {};
				try {
					data = await res.json();
				} catch {
					/* ignore */
				}
				const err = typeof data.error === 'string' ? data.error : `Laden fehlgeschlagen (${res.status})`;
				const det = typeof data.detail === 'string' ? ` ${data.detail}` : '';
				trainingError = err + det;
			}
		} finally {
			loadingTrainings = false;
		}
	}

	function setTrainingErrorFromResponse(res: Response, data: Record<string, unknown>) {
		if (res.status === 403) {
			trainingError =
				'Zugriff verweigert (CSRF/Session). Seite neu laden. Auf dem Server: ORIGIN muss exakt die öffentliche HTTPS-URL sein (siehe README).';
			return;
		}
		const err = typeof data.error === 'string' ? data.error : `Anfrage fehlgeschlagen (${res.status})`;
		const det = typeof data.detail === 'string' ? ` ${data.detail}` : '';
		trainingError = err + det;
	}

	async function deleteTrainingEntry(type: string, payload: Record<string, unknown>) {
		trainingMessage = '';
		trainingError = '';
		const res = await fetch('/api/admin/training', {
			method: 'DELETE',
			credentials: 'include',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ type, ...payload })
		});
		let data: Record<string, unknown> = {};
		try {
			data = await res.json();
		} catch {
			trainingError = `Antwort ungültig (${res.status})`;
			return;
		}
		if (!res.ok) {
			setTrainingErrorFromResponse(res, data);
			return;
		}
		trainingMessage = 'Erfolgreich';
		await loadTrainingSessions();
		setTimeout(() => (trainingMessage = ''), 2000);
	}

	function trainingDayIsPast(dateStr: string): boolean {
		return dateStr < new Date().toISOString().split('T')[0];
	}

	function canAddAdminAbsence(session: TrainingSession, userId: number): boolean {
		return !session.absences.some((a) => a.userId === userId && a.id != null);
	}

	function setAdminAbsencePick(sessionId: number, value: string) {
		adminAbsencePick = { ...adminAbsencePick, [sessionId]: value };
	}

	function setAdminAbsenceNote(sessionId: number, value: string) {
		adminAbsenceNote = { ...adminAbsenceNote, [sessionId]: value };
	}

	async function submitAdminAbsence(sessionId: number) {
		const uid = Number(adminAbsencePick[sessionId]);
		if (!Number.isFinite(uid) || uid <= 0) return;
		trainingMessage = '';
		trainingError = '';
		const note = adminAbsenceNote[sessionId]?.trim();
		const res = await fetch('/api/admin/training', {
			method: 'POST',
			credentials: 'include',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				type: 'add_absence',
				sessionId: Number(sessionId),
				userId: uid,
				...(note ? { reason: note } : {})
			})
		});
		let data: Record<string, unknown> = {};
		try {
			data = await res.json();
		} catch {
			trainingError = `Antwort ungültig (${res.status})`;
			return;
		}
		if (!res.ok) {
			setTrainingErrorFromResponse(res, data);
			return;
		}
		trainingMessage = 'Abwesenheit eingetragen';
		adminAbsencePick = { ...adminAbsencePick, [sessionId]: '' };
		adminAbsenceNote = { ...adminAbsenceNote, [sessionId]: '' };
		await loadTrainingSessions();
		setTimeout(() => (trainingMessage = ''), 2500);
	}

	async function addGuest(sessionId: number) {
		const name = guestName[sessionId]?.trim();
		if (!name) return;
		trainingMessage = '';
		trainingError = '';
		const res = await fetch('/api/admin/training', {
			method: 'POST',
			credentials: 'include',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ type: 'add_guest', sessionId: Number(sessionId), name })
		});
		let data: Record<string, unknown> = {};
		try {
			data = await res.json();
		} catch {
			trainingError = `Antwort ungültig (${res.status})`;
			return;
		}
		if (!res.ok) {
			setTrainingErrorFromResponse(res, data);
			return;
		}
		guestName[sessionId] = '';
		trainingMessage = `${name} hinzugefügt`;
		await loadTrainingSessions();
		setTimeout(() => (trainingMessage = ''), 2000);
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

	async function loadTrashedChallenges() {
		const res = await fetch('/api/admin/challenges?trashed=true');
		if (res.ok) {
			const data = await res.json();
			trashedChallenges = data.challenges || [];
		}
	}

	async function restoreTrashedChallenge(challengeId: number) {
		userMessage = '';
		userError = '';
		const res = await fetch('/api/spots/challenges', {
			method: 'PUT',
			credentials: 'include',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ challengeId })
		});
		const data = await res.json().catch(() => ({}));
		if (!res.ok) {
			userError = typeof data.error === 'string' ? data.error : `Fehler ${res.status}`;
			return;
		}
		userMessage = 'Challenge wiederhergestellt.';
		await loadTrashedChallenges();
		setTimeout(() => (userMessage = ''), 3000);
	}

	async function spotAction(spot: Spot, action: string) {
		confirmSpot = null;
		spotMessage = '';

		const res = await fetch('/api/admin/spots', {
			method: 'PATCH',
			credentials: 'include',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ spotId: Number(spot.id), action })
		});

		let data: Record<string, unknown> = {};
		try {
			data = await res.json();
		} catch {
			spotMessage = `Antwort ungültig (${res.status})`;
			await loadSpots();
			await loadTrashedSpots();
			return;
		}
		if (!res.ok) {
			const err = typeof data.error === 'string' ? data.error : `Fehler ${res.status}`;
			const det = typeof data.detail === 'string' ? ` — ${data.detail}` : '';
			spotMessage = err + det;
		} else {
			spotMessage = (typeof data.message === 'string' ? data.message : '') || '';
		}
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
				<h3 class="text-lg font-semibold text-text-primary mb-4">„{confirmSpot.spot.name}“ löschen?</h3>
				<div class="flex gap-2 justify-end">
					<button onclick={() => confirmSpot = null}
						class="px-4 py-2 rounded-lg text-sm text-text-secondary bg-bg-secondary hover:bg-bg-hover border border-border transition-colors cursor-pointer">
						Abbrechen
					</button>
					<button onclick={() => confirmSpot && spotAction(confirmSpot.spot, 'trash')}
						class="px-4 py-2 rounded-lg text-sm font-medium text-white bg-warning hover:bg-warning/80 transition-colors cursor-pointer">
						Löschen
					</button>
				</div>
			{:else}
				<h3 class="text-lg font-semibold text-text-primary mb-4">„{confirmSpot.spot.name}“ wiederherstellen?</h3>
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

{#if userBinModal}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="fixed inset-0 z-[100] flex items-center justify-center bg-black/70" onclick={() => (userBinModal = null)}>
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div class="bg-bg-card border border-border rounded-xl p-6 max-w-sm mx-4 shadow-2xl" onclick={(e) => e.stopPropagation()}>
			{#if userBinModal.mode === 'to_trash'}
				<h3 class="text-lg font-semibold text-text-primary mb-4">
					User „{userBinModal.user.username}“ löschen?
				</h3>
				<div class="flex gap-2 justify-end">
					<button
						onclick={() => (userBinModal = null)}
						class="px-4 py-2 rounded-lg text-sm text-text-secondary bg-bg-secondary hover:bg-bg-hover border border-border transition-colors cursor-pointer"
					>
						Abbrechen
					</button>
					<button
						onclick={async () => {
							const u = userBinModal!.user;
							userBinModal = null;
							await userTrashAction(u, 'trash_user');
						}}
						class="px-4 py-2 rounded-lg text-sm font-medium text-white bg-warning hover:bg-warning/80 transition-colors cursor-pointer"
					>
						Löschen
					</button>
				</div>
			{:else if userBinModal.mode === 'restore'}
				<h3 class="text-lg font-semibold text-text-primary mb-4">
					User „{userBinModal.user.username}“ wiederherstellen?
				</h3>
				<div class="flex gap-2 justify-end">
					<button
						onclick={() => (userBinModal = null)}
						class="px-4 py-2 rounded-lg text-sm text-text-secondary bg-bg-secondary hover:bg-bg-hover border border-border transition-colors cursor-pointer"
					>
						Abbrechen
					</button>
					<button
						onclick={async () => {
							const u = userBinModal!.user;
							userBinModal = null;
							await userTrashAction(u, 'restore_user');
						}}
						class="px-4 py-2 rounded-lg text-sm font-medium text-white bg-success hover:bg-success/80 transition-colors cursor-pointer"
					>
						Wiederherstellen
					</button>
				</div>
			{:else}
				<h3 class="text-lg font-semibold text-text-primary mb-2">
					User „{userBinModal.user.username}“ endgültig löschen?
				</h3>
				<p class="text-danger text-xs font-medium mb-4">Unwiderruflich — alle zugehörigen Daten gehen verloren.</p>
				<div class="flex gap-2 justify-end">
					<button
						onclick={() => (userBinModal = null)}
						class="px-4 py-2 rounded-lg text-sm text-text-secondary bg-bg-secondary hover:bg-bg-hover border border-border transition-colors cursor-pointer"
					>
						Abbrechen
					</button>
					<button
						onclick={async () => {
							const u = userBinModal!.user;
							userBinModal = null;
							await userTrashAction(u, 'purge_user');
						}}
						class="px-4 py-2 rounded-lg text-sm font-medium text-white bg-danger hover:bg-danger/80 transition-colors cursor-pointer"
					>
						Endgültig löschen
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
			{
				id: 'trash' as const,
				label: 'Papierkorb',
				count: trashedSpots.length + trashedUserList.length + trashedChallenges.length
			},
			{ id: 'invites' as const, label: 'Einladungen', count: invites.length },
			{ id: 'server' as const, label: 'Server', count: null as number | null },
			{ id: 'audit' as const, label: 'Protokoll', count: null as number | null }
		] as tab}
			<button
				onclick={() => {
					activeTab = tab.id;
					if (tab.id === 'audit') loadAudit(false);
					if (tab.id === 'trash') {
						loadTrashedSpots();
						loadTrashedUsers();
						loadTrashedChallenges();
					}
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
							<select
								value={user.trainingAttendance}
								onchange={(e) =>
									setTrainingAttendance(user, (e.target as HTMLSelectElement).value as 'implicit' | 'opt_in')}
								title="Trainingsliste: Standard = zieht mit; Opt-in = nur mit Zusage"
								class="text-xs bg-bg-secondary border border-border px-2 py-1.5 rounded-lg text-text-secondary cursor-pointer focus:outline-none focus:border-accent max-w-[11rem]"
							>
								<option value="implicit">Training: wie alle</option>
								<option value="opt_in">Training: nur Zusage</option>
							</select>
							<div
								class="flex flex-wrap items-center gap-2 text-xs text-text-muted"
								title="Nur bei „wie alle“: fest automatisch unter Zieht nicht an diesem Wochentag (Person kann pro Termin „Diesmal doch dabei“ wählen)"
							>
								<span class="shrink-0">Auto-Abmeldung</span>
								<label class="flex items-center gap-1 cursor-pointer {user.trainingAttendance === 'opt_in' ? 'opacity-40' : ''}">
									<input
										type="checkbox"
										checked={user.autoAbsentWeekdays.includes('Dienstag')}
										disabled={user.trainingAttendance === 'opt_in'}
										onchange={() => toggleAutoAbsentDay(user, 'Dienstag')}
										class="rounded border-border"
									/>
									Di
								</label>
								<label class="flex items-center gap-1 cursor-pointer {user.trainingAttendance === 'opt_in' ? 'opacity-40' : ''}">
									<input
										type="checkbox"
										checked={user.autoAbsentWeekdays.includes('Donnerstag')}
										disabled={user.trainingAttendance === 'opt_in'}
										onchange={() => toggleAutoAbsentDay(user, 'Donnerstag')}
										class="rounded border-border"
									/>
									Do
								</label>
							</div>
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
							{#if user.id !== data.viewerId}
								<button
									onclick={() => (userBinModal = { mode: 'to_trash', user })}
									class="text-xs bg-danger/10 hover:bg-danger/20 border border-danger/30 px-3 py-1.5 rounded-lg text-danger transition-colors cursor-pointer"
								>
									Löschen
								</button>
							{/if}
						</div>
					</div>

				{#if resetUserId === user.id}
					<div class="mt-4 pt-4 border-t border-border flex gap-2">
						<input
							type="text"
							bind:value={resetPassword}
							placeholder="Neues Passwort (mind. {MIN_PASSWORD_LENGTH} Zeichen)"
							class="flex-1 bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
						/>
						<button
							onclick={resetUserPassword}
							disabled={resetPassword.length < MIN_PASSWORD_LENGTH}
							class="cursor-pointer rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-[#0c0c0e] transition-colors hover:bg-accent-hover disabled:opacity-50"
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
							Löschen
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
			{#if trainingError}
				<div class="bg-danger/10 border border-danger/30 text-danger rounded-lg p-3 text-sm whitespace-pre-wrap">{trainingError}</div>
			{/if}
			{#if trainingMessage}
				<div class="bg-success/10 border border-success/30 text-success rounded-lg p-3 text-sm">{trainingMessage}</div>
			{/if}

			{#if loadingTrainings}
				<p class="text-text-muted text-center py-8">Laden...</p>
			{:else if trainingSessions.length === 0}
				<p class="text-text-muted text-center py-8">Keine Trainings im gewählten Zeitraum</p>
			{:else}
				<p class="text-text-secondary text-sm">
					Zeitraum: letzte 3 Wochen bis inkl. kommende Termine. Nachträgliche Abmeldungen wirken auf die
					<a href="/statistik" class="text-accent hover:underline">Statistik</a> wie eine normale Abmeldung;
					„Aufheben“ entfernt den Eintrag wieder.
				</p>
				{#each trainingSessions as session}
					{@const sessionDate = new Date(session.date + 'T00:00:00')}
					{@const sessionPast = trainingDayIsPast(session.date)}
					<div class="bg-bg-card rounded-xl border border-border overflow-hidden {sessionPast ? 'opacity-90' : ''}">
						<div class="p-5">
							<div class="flex flex-wrap items-center gap-2 mb-1">
								<h3 class="font-semibold text-text-primary">{session.dayOfWeek}</h3>
								<span class="text-text-muted text-sm">
									{sessionDate.toLocaleDateString('de-CH', { day: 'numeric', month: 'long', year: 'numeric' })}
								</span>
								<span class="text-text-muted text-xs">{session.timeStart} – {session.timeEnd}</span>
								{#if sessionPast}
									<span class="text-xs rounded-full bg-bg-hover px-2 py-0.5 text-text-muted">Vergangen</span>
								{/if}
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
										class="cursor-pointer rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-[#0c0c0e] transition-colors hover:bg-accent-hover disabled:opacity-50"
									>+</button>
								</div>

								<div class="mt-4 rounded-lg border border-dashed border-accent/25 bg-bg-secondary/40 p-3">
									<p class="text-text-secondary text-xs font-semibold uppercase tracking-wide">
										Nachträglich abmelden
									</p>
									<p class="text-text-muted text-xs mt-1 mb-2">
										Wenn jemand nicht kam (auch am Tag danach): als abwesend eintragen — zählt in der Statistik.
										Nicht möglich, wenn schon ein Abwesenheits-Eintrag existiert.
									</p>
									<div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
										<select
											value={adminAbsencePick[session.id] ?? ''}
											onchange={(e) => setAdminAbsencePick(session.id, e.currentTarget.value)}
											class="min-w-[10rem] flex-1 rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
										>
											<option value="">User wählen …</option>
											{#each userList as u}
												{#if canAddAdminAbsence(session, u.id)}
													<option value={String(u.id)}>{u.username}</option>
												{/if}
											{/each}
										</select>
										<input
											type="text"
											value={adminAbsenceNote[session.id] ?? ''}
											oninput={(e) => setAdminAbsenceNote(session.id, e.currentTarget.value)}
											placeholder="Grund (optional)"
											class="min-w-[8rem] flex-1 rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
										/>
										<button
											type="button"
											onclick={() => submitAdminAbsence(session.id)}
											disabled={!adminAbsencePick[session.id]}
											class="cursor-pointer rounded-lg bg-accent/90 px-4 py-2 text-sm font-semibold text-[#0c0c0e] transition-colors hover:bg-accent disabled:opacity-50"
										>
											Eintragen
										</button>
									</div>
								</div>
							</div>

							{#if session.absences.length > 0}
								<div class="mt-4">
									<p class="text-danger text-xs font-semibold uppercase tracking-wide mb-2">
										Zieht nicht ({session.absences.length})
									</p>
									<div class="space-y-1">
										{#each session.absences as absence}
											<div class="flex items-center justify-between bg-bg-secondary rounded-lg px-3 py-2">
												<div class="text-sm">
													<span class="text-text-primary">{absence.username}</span>
													{#if absence.reason}
														<span class="text-text-muted text-xs ml-2">– {absence.reason}</span>
													{/if}
													{#if absence.virtual}
														<span class="text-text-muted text-xs ml-2">(User-Regel)</span>
													{/if}
												</div>
												{#if absence.virtual}
													<span class="text-text-muted text-xs shrink-0">User bearbeiten</span>
												{:else if absence.id != null}
													<button onclick={() => deleteTrainingEntry('remove_absence', { id: absence.id })}
														class="text-text-muted hover:text-success text-xs shrink-0 transition-colors cursor-pointer">Aufheben</button>
												{/if}
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
		<div class="space-y-8">
			{#if userMessage}
				<div class="bg-success/10 border border-success/30 text-success rounded-lg p-3 text-sm">{userMessage}</div>
			{/if}
			{#if userError}
				<div class="bg-danger/10 border border-danger/30 text-danger rounded-lg p-3 text-sm">{userError}</div>
			{/if}

			<div>
				<h3 class="text-sm font-semibold text-text-primary uppercase tracking-wide mb-3">User</h3>
				{#if trashedUserList.length === 0}
					<p class="text-text-muted text-sm">Keine User im Papierkorb.</p>
				{:else}
					<p class="text-text-secondary text-sm mb-3">
						Wiederherstellen bringt den User zurück in die Liste (Login bleibt aus bis Aktivieren). Endgültig löschen entfernt alle zugehörigen Daten.
					</p>
					<div class="space-y-2">
						{#each trashedUserList as u}
							<div class="bg-bg-card rounded-xl border border-border p-4 flex items-center justify-between gap-4 flex-wrap opacity-90">
								<div>
									<p class="text-text-primary font-medium">{u.username}</p>
									<p class="text-text-muted text-xs">
										{roleLabels[u.role] || u.role} · seit {formatDate(u.createdAt)}
									</p>
								</div>
								<div class="flex items-center gap-2">
									<button
										onclick={() => (userBinModal = { mode: 'restore', user: u })}
										class="text-xs bg-success/10 hover:bg-success/20 border border-success/30 px-3 py-1.5 rounded-lg text-success transition-colors cursor-pointer"
									>
										Wiederherstellen
									</button>
									<button
										onclick={() => (userBinModal = { mode: 'purge', user: u })}
										class="text-xs bg-danger/10 hover:bg-danger/20 border border-danger/30 px-3 py-1.5 rounded-lg text-danger transition-colors cursor-pointer"
									>
										Endgültig löschen
									</button>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<div>
				<h3 class="text-sm font-semibold text-text-primary uppercase tracking-wide mb-3">Spots</h3>
				{#if trashedSpots.length === 0}
					<p class="text-text-muted text-sm">Keine Spots im Papierkorb.</p>
				{:else}
					<p class="text-text-secondary text-sm mb-2">Gelöschte Spots können jederzeit wiederhergestellt werden.</p>
					<div class="space-y-2">
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
					</div>
				{/if}
			</div>

			<div>
				<h3 class="text-sm font-semibold text-text-primary uppercase tracking-wide mb-3">Spot-Challenges</h3>
				{#if trashedChallenges.length === 0}
					<p class="text-text-muted text-sm">Keine Challenges im Papierkorb.</p>
				{:else}
					<p class="text-text-secondary text-sm mb-3">
						Gelöschte Challenges sind weiterhin im Protokoll nachvollziehbar. Wiederherstellen blendet sie am Spot wieder ein (Erledigungen bleiben erhalten).
					</p>
					<div class="space-y-2">
						{#each trashedChallenges as ch}
							<div class="bg-bg-card rounded-xl border border-border p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 opacity-90">
								<div class="min-w-0">
									<p class="text-text-primary font-medium">{ch.title}</p>
									<p class="text-text-muted text-xs mt-0.5">
										<a href="/spots/{ch.spotId}" class="text-accent hover:underline">{ch.spotName}</a>
										· von {ch.createdByName}
										{#if ch.deletedAt}
											· {formatLogTime(ch.deletedAt)}
										{/if}
									</p>
									{#if ch.description}
										<p class="text-text-secondary text-xs mt-2 line-clamp-2">{ch.description}</p>
									{/if}
								</div>
								<button
									onclick={() => restoreTrashedChallenge(ch.id)}
									class="shrink-0 text-xs bg-success/10 hover:bg-success/20 border border-success/30 px-3 py-1.5 rounded-lg text-success transition-colors cursor-pointer"
								>
									Wiederherstellen
								</button>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			{#if trashedUserList.length === 0 && trashedSpots.length === 0 && trashedChallenges.length === 0}
				<p class="text-text-muted text-center py-4 text-sm">Papierkorb ist leer.</p>
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
				class="cursor-pointer rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-[#0c0c0e] transition-colors hover:bg-accent-hover disabled:opacity-50"
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
