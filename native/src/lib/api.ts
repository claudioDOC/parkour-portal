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
	absences: { id: number; userId: number; username: string; reason: string; virtual?: boolean }[];
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
};

export const getSpots = () => get<{ spots: SpotListItem[] }>('/api/v1/spots');

export type SpotChallenge = {
	id: number;
	title: string;
	description: string | null;
	images: { id: number; url: string }[];
	doneCount: number;
	openCount: number;
	doneBy: { userId: number; username: string }[];
	openBy: { id: number; username: string }[];
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
	};
	avgScore: number;
	voteCount: number;
	userVote: number | null;
	images: { id: number; url: string; filename: string }[];
	challenges: SpotChallenge[];
	nearbySpots: { id: number; name: string; city: string; distanceKm?: number }[];
};

export const getSpot = (id: number) => get<SpotDetailPayload>(`/api/v1/spots/${id}`);

export const voteSpot = (spotId: number, score: number) =>
	post<{ success?: boolean }>('/api/spots/vote', { spotId, score });

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
	completers: { userId: number; username: string }[];
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
	leaderboard: { userId: number; username: string; clears: number }[];
	recentClears: { username: string; challengeTitle?: string; title?: string; spotName: string; spotId: number; at: string }[];
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
	memberStates: { userId: number; username: string; status: 'joined' | 'declined' | 'pending'; transportMode: string | null }[];
	dateOptions: TripDateOption[];
	eligibleVoters: number;
	votesNeeded: number;
	myParticipation: { userId: number; transportMode: string | null } | null;
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
	eligiblePastSessions: number;
	absences: number;
	showUpPercent: number;
	streakNoAbsence: number;
	spotsSuggested: number;
	challengesCompleted: number;
	totalChallenges: number;
	challengeProgressPercent: number;
};

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
	};
	solo: {
		leaderboard: { userId: number; username: string; total: number; last90: number }[];
		recent: { username: string; date: string; note: string | null }[];
	};
};

export const getStats = () => get<StatsPayload>('/api/v1/stats');

// --- Profil ---

export type ProfilePayload = {
	profile: { id: number; username: string; avatar: string | null; avatarFull: string | null };
	me: StatsRow | null;
	myRank: number | null;
	totalMembers: number;
	monthly: { label: string; present?: number; absences?: number }[];
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
	description: string | null;
	avgScore: number;
	voteCount: number;
	reasons: string[];
};

export const runFinder = (wish: string) =>
	post<{ results: FinderResult[]; forecastHint: string | null }>('/api/finder', { wish });

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
