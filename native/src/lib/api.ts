import { readToken, writeToken } from './tokenStore';

/**
 * API-Client der nativen App. Spricht dieselben Endpunkte wie das Web
 * (docs/API.md): Login liefert ein Bearer-JWT, das sicher im Gerätespeicher
 * liegt (Android Keystore via SecureStore).
 */
import { Platform } from 'react-native';

/**
 * Server-Adresse. Im Browser (Design-Vorschau beim Entwickeln) relativ,
 * damit derselbe Ursprung genutzt wird; auf dem Gerät die echte Domain.
 */
export const BASE_URL = Platform.OS === 'web' ? '' : 'https://matetraining.duckdns.org';

/** Relative Upload-Pfade (/uploads/…) zu vollen URLs machen. */
export function mediaUrl(path: string | null | undefined): string | null {
	if (!path) return null;
	if (path.startsWith('http')) return path;
	return `${BASE_URL || 'https://matetraining.duckdns.org'}${path}`;
}

const TOKEN_KEY = 'parkour-token';

let cachedToken: string | null = null;

export async function getToken(): Promise<string | null> {
	if (cachedToken) return cachedToken;
	cachedToken = await readToken(TOKEN_KEY);
	return cachedToken;
}

export async function setToken(token: string | null): Promise<void> {
	cachedToken = token;
	await writeToken(TOKEN_KEY, token);
}

export class ApiError extends Error {
	status: number;
	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
	const token = await getToken();
	const res = await fetch(`${BASE_URL}${path}`, {
		...init,
		headers: {
			'content-type': 'application/json',
			...(token ? { authorization: `Bearer ${token}` } : {}),
			...(init.headers ?? {})
		}
	});
	if (!res.ok) {
		let message = `Fehler ${res.status}`;
		try {
			const body = await res.json();
			if (body?.error) message = body.error;
		} catch {
			// Fehlerbody optional
		}
		throw new ApiError(res.status, message);
	}
	return res.json() as Promise<T>;
}

const get = <T>(path: string) => request<T>(path);
const post = <T>(path: string, body: object) =>
	request<T>(path, { method: 'POST', body: JSON.stringify(body) });
const patch = <T>(path: string, body: object) =>
	request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });

// --- Auth ---

export type Me = {
	id: number;
	username: string;
	role: string;
	trainingAttendance: string | null;
	uiTheme?: string;
};

export async function login(username: string, password: string): Promise<Me> {
	const data = await request<{ token?: string; user?: Me } & Me>('/api/auth/login', {
		method: 'POST',
		body: JSON.stringify({ username, password, includeToken: true })
	});
	if (!data.token) throw new ApiError(500, 'Kein Token erhalten');
	await setToken(data.token);
	return (data.user ?? data) as Me;
}

export async function logout(): Promise<void> {
	await setToken(null);
}

/** Antwort ist in { user: … } verpackt — auspacken, sonst fehlen id/rolle/theme. */
export const getMe = async (): Promise<Me> => {
	const data = await get<{ user: Me }>('/api/v1/me');
	return data.user;
};

// --- Training (Payload identisch zur Web-Seite, /api/v1/training) ---

export type SpotVote = {
	spotId: number;
	spotName: string;
	spotCity: string;
	voteCount: number;
	voterList: string[];
};

export type TrainingSession = {
	id: number;
	date: string;
	dayOfWeek: string;
	timeStart: string;
	timeEnd: string;
	cancelled?: boolean | number | null;
	/** Erstes Bild des gewählten Spots — Kopfbild der Trainingskarte. */
	spotThumbnail?: string | null;
	overrideSpot: { spotId: number; name: string; city: string } | null;
	attending: { id: number; username: string; avatar?: string | null }[];
	absences: {
		id: number | null;
		userId: number;
		username: string;
		reason: string | null;
		virtual?: boolean;
		avatar?: string | null;
	}[];
	guests: { id: number; name: string }[];
	userDbAbsent: boolean;
	userVirtualAbsent: boolean;
	userHasRsvp: boolean;
	totalMembers: number;
	spotVotes: SpotVote[];
	userVotedSpotId: number | null;
	votingClosed: boolean;
	winnerSpot: { name: string; city: string; spotId: number; votes: number } | null;
	autoSpot: { name: string; city: string; spotId: number } | null;
};

export type TrainingPayload = {
	sessions: TrainingSession[];
	allSpots: { id: number; name: string; city: string }[];
	trainingForecast: { summaryLine?: string; isWet?: boolean; temperatureInWindow?: number | null } | null;
	viewerTrainingAttendance: string | null;
	mySolo: { todayLogged: boolean; countMonth: number };
	calendarToday: string;
};

export const getTraining = () => get<TrainingPayload>('/api/v1/training');

export type TrainingAction =
	| 'absence'
	| 'cancel_absence'
	| 'rsvp_yes'
	| 'rsvp_no'
	| 'vote_spot'
	| 'remove_vote'
	| 'weekday_override_yes'
	| 'weekday_override_no';

export const trainingAction = (
	action: TrainingAction,
	sessionId: number,
	extra: { reason?: string; spotId?: number } = {}
) => post<{ success?: boolean }>('/api/training', { action, sessionId, ...extra });

/** Admin: Training absagen/reaktivieren, Spot festlegen (spotId null = zurück). */
export const adminTraining = (
	type: 'cancel_session' | 'uncancel_session' | 'set_spot',
	sessionId: number,
	extra: { spotId?: number | null; reason?: string } = {}
) => post<{ success?: boolean }>('/api/admin/training', { type, sessionId, ...extra });

// --- Solo-Training ---

export const logSolo = (note?: string) => post<{ success?: boolean }>('/api/solo', { note });

// --- Spots ---

export type SpotListItem = {
	id: number;
	name: string;
	city: string;
	avgScore: number;
	voteCount: number;
	thumbnail: string | null;
	isMicro?: boolean;
	parentSpotName?: string | null;
	lighting?: string | null;
	techniques?: string | null;
	goodWeather?: string | null;
	latitude?: number | null;
	longitude?: number | null;
	challengeCount?: number;
};

export const getSpots = () =>
	get<{ spots: SpotListItem[]; nextTrainingSpotId?: number | null }>('/api/v1/spots');

export type NewSpot = {
	name: string;
	city: string;
	latitude?: number | null;
	longitude?: number | null;
	lighting?: string;
	techniques?: string[];
	goodWeather?: string[];
	description?: string;
	isMicro?: boolean;
	parentSpotId?: number | null;
};

export const createSpot = (spot: NewSpot) =>
	post<{ id?: number; success?: boolean }>('/api/spots', spot);

/** Bild an einen Spot hängen. */
export async function uploadSpotImage(
	spotId: number,
	uri: string,
	name: string,
	type: string
): Promise<void> {
	const token = await getToken();
	const form = new FormData();
	form.append('spotId', String(spotId));
	form.append('image', { uri, name, type } as unknown as Blob);
	const res = await fetch(`${BASE_URL || 'https://matetraining.duckdns.org'}/api/spots/images`, {
		method: 'POST',
		headers: token ? { authorization: `Bearer ${token}` } : undefined,
		body: form
	});
	if (!res.ok) throw new ApiError(res.status, `Upload fehlgeschlagen (${res.status})`);
}

/** Avatar hochladen (Profilbild). */
export async function uploadAvatar(uri: string, name: string, type: string): Promise<void> {
	const token = await getToken();
	const form = new FormData();
	form.append('image', { uri, name, type } as unknown as Blob);
	const res = await fetch(`${BASE_URL || 'https://matetraining.duckdns.org'}/api/profile/avatar`, {
		method: 'POST',
		headers: token ? { authorization: `Bearer ${token}` } : undefined,
		body: form
	});
	if (!res.ok) throw new ApiError(res.status, `Avatar-Upload fehlgeschlagen (${res.status})`);
}

export const changePassword = (currentPassword: string, newPassword: string) =>
	post<{ success?: boolean }>('/api/auth/change-password', { currentPassword, newPassword });

export const removeAvatar = () =>
	request<{ ok?: boolean }>('/api/profile/avatar', { method: 'DELETE' });

// --- Admin ---

export type AdminUser = {
	id: number;
	username: string;
	avatar?: string | null;
	role: 'admin' | 'spotmanager' | 'member';
	active: boolean;
	trainingAttendance: 'implicit' | 'opt_in';
	autoAbsentWeekdays: string[];
	createdAt: string;
	spotCount: number;
	voteCount: number;
};

export const getAdminUsers = (trashed = false) =>
	get<{ users: AdminUser[] }>(`/api/admin/users${trashed ? '?trashed=true' : ''}`);

export const adminUserAction = (userId: number, action: string, extra: object = {}) =>
	request<{ success?: boolean; message?: string }>('/api/admin/users', {
		method: 'PATCH',
		body: JSON.stringify({ userId, action, ...extra })
	});

export const getInvites = () =>
	get<{ invites: { id: number; token: string; used: boolean; expiresAt: string }[] }>(
		'/api/admin/invites'
	);

export const createInvite = () =>
	post<{ invite: { token: string; expiresAt: string } }>('/api/admin/invites', {});

export const getSystemInfo = () =>
	get<{
		hostname: string;
		platform: string;
		uptimeSeconds: number;
		memory: { total: number; free: number; used: number; usedPercent: number };
		disk: { total: number; free: number; used: number; usedPercent: number } | null;
		load: { avg1: number; cpus: number };
	}>('/api/admin/system');

export const getAuditLog = (limit = 60) =>
	get<{
		logs: { id: number; createdAt: string; action: string; actorUsername: string | null }[];
		total: number;
	}>(`/api/admin/audit?limit=${limit}`);

export const getAdminSolo = () =>
	get<{ entries: { id: number; userId: number; username: string; date: string; note: string | null }[] }>(
		'/api/admin/solo'
	);

export const addAdminSolo = (userId: number, date?: string, note?: string) =>
	post<{ ok?: boolean }>('/api/admin/solo', { userId, ...(date ? { date } : {}), ...(note ? { note } : {}) });

// Papierkorb
export const getTrashedSpots = () =>
	get<{ spots: { id: number; name: string; city: string }[] }>('/api/admin/spots?deleted=true');

export const restoreSpot = (spotId: number) =>
	request<{ success?: boolean }>('/api/admin/spots', {
		method: 'PATCH',
		body: JSON.stringify({ spotId, action: 'restore' })
	});

export const getTrashedChallenges = () =>
	get<{ challenges: { id: number; title: string; spotName: string }[] }>(
		'/api/admin/challenges?trashed=true'
	);

export const restoreChallenge = (challengeId: number) =>
	request<{ success?: boolean }>('/api/spots/challenges', {
		method: 'PUT',
		body: JSON.stringify({ challengeId })
	});

export const purgeChallenge = (challengeId: number) =>
	request<{ success?: boolean }>('/api/admin/challenges', {
		method: 'DELETE',
		body: JSON.stringify({ challengeId })
	});

export const getTrashedTrips = () =>
	get<{ trips: { id: number; title: string; startDate: string }[] }>('/api/admin/trips?trashed=1');

export const restoreTrip = (tripId: number) =>
	request<{ success?: boolean }>('/api/admin/trips', {
		method: 'PATCH',
		body: JSON.stringify({ tripId, action: 'restore' })
	});

// Trainings-Verwaltung
export type AdminSession = {
	id: number;
	date: string;
	dayOfWeek: string;
	timeStart: string;
	timeEnd: string;
	cancelled: boolean;
	absences: { id: number | null; userId: number; username: string; reason: string; virtual?: boolean }[];
	attending: { id: number; username: string }[];
	guests: { id: number; name: string }[];
	hiddenUsers: { id: number; userId: number; username: string }[];
};

export const getAdminSessions = () =>
	get<{ sessions: AdminSession[] }>('/api/admin/training');

export const adminSessionAction = (type: string, body: object) =>
	post<{ success?: boolean; sent?: number }>('/api/admin/training', { type, ...body });

export const adminSessionDelete = (type: string, body: object) =>
	request<{ success?: boolean }>('/api/admin/training', {
		method: 'DELETE',
		body: JSON.stringify({ type, ...body })
	});

export const deleteAdminSolo = (id: number) =>
	request<{ ok?: boolean }>('/api/admin/solo', { method: 'DELETE', body: JSON.stringify({ id }) });

export type SpotChallenge = {
	id: number;
	title: string;
	description: string | null;
	images: { id: number; url: string }[];
	doneCount: number;
	openCount: number;
	doneBy: { userId: number; username: string; avatar?: string | null }[];
	openBy: { id: number; username: string; avatar?: string | null }[];
};

/** Basisdaten liegen unter `spot`, Bewertung/Bilder/Challenges daneben. */
export type SpotDetailPayload = {
	spot: {
		id: number;
		name: string;
		city: string;
		latitude: number | null;
		longitude: number | null;
		lighting: string | null;
		techniques: string | null;
		goodWeather: string | null;
		description: string | null;
		addedByName: string;
		isMicro?: boolean;
		parentSpotId?: number | null;
	};
	avgScore: number;
	voteCount: number;
	userVote: number | null;
	images: { id: number; url: string; filename: string }[];
	challenges: SpotChallenge[];
	nearbySpots: { id: number; name: string; city: string; distanceKm?: number }[];
	mapMarkers: { id: number; name: string; city?: string; lat: number; lon: number; kind: string }[];
	parkingLocations: { id: number; name: string | null; latitude: number; longitude: number }[];
	childMicroSpots?: { id: number; name: string; city: string }[];
	parentSpot?: { id: number; name: string; city: string } | null;
	/** Mögliche Hauptspots für einen Microspot — fürs Bearbeiten. */
	parentCandidates?: { id: number; name: string; city: string }[];
	nextOpenSessionId?: number | null;
};

/** Bild oder Video an eine Challenge hängen. */
export async function uploadChallengeMedia(
	challengeId: number,
	uri: string,
	name: string,
	type: string
): Promise<void> {
	const token = await getToken();
	const form = new FormData();
	form.append('challengeId', String(challengeId));
	// React Native erwartet dieses Objekt-Format für Datei-Uploads.
	form.append('image', { uri, name, type } as unknown as Blob);
	const res = await fetch(`${BASE_URL || 'https://matetraining.duckdns.org'}/api/spots/challenges/images`, {
		method: 'POST',
		headers: token ? { authorization: `Bearer ${token}` } : undefined,
		body: form
	});
	if (!res.ok) {
		let message = `Fehler ${res.status}`;
		try {
			const body = await res.json();
			if (body?.error) message = body.error;
		} catch {
			/* ohne Body */
		}
		throw new ApiError(res.status, message);
	}
}

export const getSpot = (id: number) => get<SpotDetailPayload>(`/api/v1/spots/${id}`);

export const voteSpot = (spotId: number, score: number) =>
	post<{ success?: boolean }>('/api/spots/vote', { spotId, score });

/** Eigene Bewertung zurückziehen. */
export const removeSpotVote = (spotId: number) =>
	request<{ success?: boolean }>('/api/spots/vote', {
		method: 'DELETE',
		body: JSON.stringify({ spotId })
	});

export const deleteSpotImage = (imageId: number) =>
	request<{ success?: boolean }>('/api/spots/images', {
		method: 'DELETE',
		body: JSON.stringify({ imageId })
	});

/** Für das nächste offene Training abstimmen (vom Spot aus). */
export const voteSpotForTraining = (sessionId: number, spotId: number) =>
	post<{ success?: boolean }>('/api/training', { action: 'vote_spot', sessionId, spotId });

/** Spot bearbeiten — admin/spotmanager. Parkplätze werden komplett ersetzt. */
export type SpotEdit = {
	name: string;
	city: string;
	latitude: number | null;
	longitude: number | null;
	lighting: string;
	techniques: string[];
	goodWeather: string[];
	description: string;
	isMicro: boolean;
	parentSpotId: number | null;
	parkingLocations: { name: string | null; latitude: number; longitude: number }[];
};

export const editSpot = (spotId: number, edit: SpotEdit) =>
	request<{ success?: boolean }>('/api/admin/spots', {
		method: 'PATCH',
		body: JSON.stringify({ spotId, action: 'edit', ...edit })
	});

export const trashSpot = (spotId: number) =>
	request<{ success?: boolean }>('/api/admin/spots', {
		method: 'PATCH',
		body: JSON.stringify({ spotId, action: 'trash' })
	});

// --- Challenges bearbeiten ---

export const editChallenge = (challengeId: number, title: string, description: string) =>
	request<{ success?: boolean }>('/api/spots/challenges', {
		method: 'PATCH',
		body: JSON.stringify({ challengeId, title, description })
	});

export const deleteChallenge = (challengeId: number) =>
	request<{ success?: boolean }>('/api/spots/challenges', {
		method: 'DELETE',
		body: JSON.stringify({ challengeId })
	});

/** Erledigung bei einem anderen entfernen — admin/spotmanager. */
export const removeChallengeCompletion = (challengeId: number, removeUserId: number) =>
	request<{ success?: boolean }>('/api/spots/challenges', {
		method: 'PATCH',
		body: JSON.stringify({ challengeId, removeUserId })
	});

export const deleteChallengeImage = (imageId: number) =>
	request<{ success?: boolean }>('/api/spots/challenges/images', {
		method: 'DELETE',
		body: JSON.stringify({ imageId })
	});

// --- Trips: Ablauf-Vorschläge, Zwischenstopps, Kartenziel ---

export const proposePlanOption = (tripId: number, text: string) =>
	post<{ success?: boolean }>('/api/trips', { action: 'propose_plan_option', tripId, text });

export const votePlanOption = (tripId: number, destinationId: number) =>
	post<{ success?: boolean }>('/api/trips', { action: 'vote_plan_option', tripId, destinationId });

export const removePlanVote = (tripId: number) =>
	post<{ success?: boolean }>('/api/trips', { action: 'remove_plan_vote', tripId });

export const proposeStopover = (
	tripId: number,
	label: string,
	latitude: number,
	longitude: number
) => post<{ stopoverId?: number }>('/api/trips', {
	action: 'propose_stopover',
	tripId,
	label,
	latitude,
	longitude
});

export const deleteStopover = (tripId: number, stopoverId: number) =>
	post<{ success?: boolean }>('/api/trips', { action: 'delete_stopover', tripId, stopoverId });

export const setTripDestination = (
	tripId: number,
	dest: { latitude: number; longitude: number; label: string } | null
) =>
	post<{ success?: boolean }>('/api/trips', {
		action: 'set_trip_destination',
		tripId,
		...(dest ? dest : { clear: true })
	});

/** Ortssuche für Kartenziel und Zwischenstopps. */
export const geocode = (q: string) =>
	get<{ results: { lat: number; lon: number; displayName: string }[] }>(
		`/api/geocode?q=${encodeURIComponent(q)}`
	);

export const createChallenge = (spotId: number, title: string, description: string) =>
	post<{ success?: boolean }>('/api/spots/challenges', { spotId, title, description });

export const setChallengeDone = (challengeId: number, done: boolean) =>
	request<{ success?: boolean }>('/api/spots/challenges', {
		method: 'PATCH',
		body: JSON.stringify({ challengeId, done })
	});

// --- Challenge-Arena ---

export type ArenaChallenge = {
	id: number;
	title: string;
	description: string | null;
	spotId: number;
	completers: { userId: number; username: string; avatar?: string | null; completedAt?: string }[];
	images: { id: number; url: string }[];
};

export type ArenaPayload = {
	schemaReady: boolean;
	spotsWithChallenges: {
		spotId: number;
		spotName: string;
		spotCity: string;
		isMicro: boolean;
		challenges: ArenaChallenge[];
	}[];
	totalChallenges: number;
	totalClears: number;
	openQuests: number;
	leaderboard: { userId: number; username: string; avatar?: string | null; clears: number }[];
	recentClears: { username: string; avatar?: string | null; challengeTitle?: string; title?: string; spotName: string; spotId: number; at: string }[];
	viewerUsername: string | null;
};

export const getArena = () => get<ArenaPayload>('/api/v1/challenges');

// --- Trips ---

export type TripDateOption = {
	id: number;
	startDate: string;
	endDate: string | null;
	note: string | null;
	proposedByName?: string;
	voteCount: number;
	sameAsPlanned?: boolean;
};

export type Trip = {
	id: number;
	title: string;
	startDate: string;
	endDate: string | null;
	notes: string | null;
	destinationLabel: string | null;
	transportMode: string | null;
	createdByName?: string;
	participants: { userId: number; username: string; transportMode: string | null }[];
	memberStates: {
		userId: number;
		username: string;
		avatar?: string | null;
		status: 'joined' | 'declined' | 'pending';
		transportMode: string | null;
		note: string | null;
	}[];
	dateOptions: TripDateOption[];
	destinations: {
		id: number;
		name: string;
		proposedBy: number;
		proposedByName: string;
		voteCount: number;
	}[];
	stopovers: {
		id: number;
		label: string;
		latitude: number;
		longitude: number;
		proposedBy: number;
		proposedByName: string;
	}[];
	destinationLatitude: number | null;
	destinationLongitude: number | null;
	createdBy: number;
	myVoteDestinationId: number | null;
	eligibleVoters: number;
	votesNeeded: number;
	myParticipation: { userId: number; transportMode: string | null; note?: string | null } | null;
	myVoteDateOptionId: number | null;
	joinedCount: number;
	declinedCount: number;
	pendingCount: number;
};

export type TripsPayload = {
	trips: Trip[];
	activeUsers: { id: number; username: string }[];
	user: { id: number };
	isAdmin: boolean;
};

export const getTrips = () => get<TripsPayload>('/api/v1/trips');

/**
 * Mein Status an einem Trip — der Server speichert ihn im transportMode:
 * keine Zeile = offen, 'abgemeldet' = nicht dabei,
 * 'enthalten'/'unentschlossen' = enthalten, alles andere = dabei.
 */
export function myTripStatus(trip: Trip): 'pending' | 'declined' | 'abstained' | 'joined' {
	const mode = trip.myParticipation?.transportMode;
	if (mode === undefined || trip.myParticipation === null) return 'pending';
	if (mode === 'abgemeldet') return 'declined';
	if (mode === 'enthalten' || mode === 'unentschlossen') return 'abstained';
	return 'joined';
}

/** Erster Trip, zu dem meine Antwort fehlt (inkl. 3-Tage-Wiedervorlage). */
export const getPendingTrip = () =>
	get<{ trip: { id: number; title: string; startDate: string; creatorName: string | null; inCount: number } | null }>(
		'/api/trips/pending'
	);

export const tripAction = (action: string, tripId: number, extra: object = {}) =>
	post<{ success?: boolean; adopted?: boolean }>('/api/trips', { action, tripId, ...extra });

/** Admin: Trip in den Papierkorb (gleicher Weg wie die Web-Seite). */
export const adminTrashTrip = (tripId: number) =>
	patch<{ success?: boolean }>('/api/admin/trips', { tripId, action: 'trash' });

export const createTrip = (title: string, startDate: string, endDate: string, notes: string) =>
	post<{ success?: boolean }>('/api/trips', { action: 'create_trip', title, startDate, endDate, notes });

export const proposeDateOption = (tripId: number, startDate: string, endDate: string, note: string) =>
	post<{ success?: boolean }>('/api/trips', {
		action: 'propose_date_option',
		tripId,
		startDate,
		endDate,
		note
	});

// --- Statistik ---

export type StatsRow = {
	userId: number;
	username: string;
	avatar?: string | null;
	eligiblePastSessions: number;
	absences: number;
	implicitPresent: number;
	showUpPercent: number;
	streakNoAbsence: number;
	spotsSuggested: number;
	challengesCompleted: number;
	totalChallenges: number;
	challengeProgressPercent: number;
};

export type MonthRow = { key: string; label: string; sessionCount: number; absenceCount: number };

export type StatsPayload = {
	stats: {
		today: string;
		group: {
			pastSessionCount: number;
			totalAbsences: number;
			avgPulledPerSession: number;
			memberCount: number;
		};
		leaderboard: StatsRow[];
		monthly: MonthRow[];
		monthDetail: (MonthRow & { leaderboard: StatsRow[] })[];
	};
	solo: {
		leaderboard: { userId: number; username: string; avatar?: string | null; total: number; last90: number }[];
		recent: { username: string; avatar?: string | null; date: string; note: string | null }[];
	};
};

export const getStats = () => get<StatsPayload>('/api/v1/stats');

// --- Profil ---

export type ProfilePayload = {
	profile: { id: number; username: string; avatar: string | null; avatarFull: string | null };
	me: StatsRow | null;
	myRank: number | null;
	totalMembers: number;
	monthly: { key: string; trainings: number; pulled: number; percent: number }[];
	completedChallenges: { title: string; spotName?: string; spotId?: number }[];
	openChallengeCount: number;
	soloCount: number;
	members: { id: number; username: string; avatar: string | null }[];
};

export const getProfile = (userId?: number) =>
	get<ProfilePayload>(userId ? `/api/v1/profile?userId=${userId}` : '/api/v1/profile');

// --- Finder ---

export type FinderResult = {
	id: number;
	name: string;
	city: string;
	lighting: string | null;
	techniques: string | null;
	goodWeather: string | null;
	description: string | null;
	avgScore: number;
	voteCount: number;
	reasons: string[];
};

export type FinderQuery = {
	useAutoWeather: boolean;
	weatherCondition: 'trocken' | 'nass' | 'egal';
	isDark: boolean;
	cities: string[];
	techniques: string[];
	wish: string;
};

export const runFinder = (query: FinderQuery) =>
	post<{
		results: FinderResult[];
		forecastHint: string | null;
		nextOpenSessionId: number | null;
	}>('/api/finder', query);

// --- Benachrichtigungen ---

/** FCM-Geräte-Token der App beim Portal an-/abmelden (ab APK 1.4). */
export const registerFcmDevice = (token: string) =>
	post<{ success?: boolean }>('/api/v1/fcm', { token });

// --- Benachrichtigungen (Google-frei über ntfy) ---

export const getNtfyInfo = () =>
	get<{ base: string; topic: string; url: string }>('/api/v1/ntfy');

// --- Einstellungen ---

export const saveUiTheme = (theme: string) =>
	post<{ success?: boolean }>('/api/user/ui-theme', { theme });

/** Admin: Push-Nachricht an alle Geräte. */
export const adminBroadcast = (title: string, body: string) =>
	post<{ sent?: number }>('/api/admin/push', { title, body });

// --- Aktivität ---

export type FeedEntry = {
	id: number;
	kind: string;
	actorUserId: number | null;
	actorName: string | null;
	title: string;
	body: string | null;
	url: string | null;
	createdAt: string;
};

export const getActivity = () =>
	get<{ entries: FeedEntry[]; unread: number; latestId: number }>('/api/activity');

export const markActivitySeen = (eventId: number) =>
	post<{ success?: boolean }>('/api/activity', { eventId });
