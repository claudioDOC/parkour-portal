import * as SecureStore from 'expo-secure-store';

/**
 * API-Client der nativen App. Spricht dieselben Endpunkte wie das Web
 * (docs/API.md): Login liefert ein Bearer-JWT, das sicher im Gerätespeicher
 * liegt (Android Keystore via SecureStore).
 */
export const BASE_URL = 'https://matetraining.duckdns.org';

const TOKEN_KEY = 'parkour-token';

let cachedToken: string | null = null;

export async function getToken(): Promise<string | null> {
	if (cachedToken) return cachedToken;
	cachedToken = await SecureStore.getItemAsync(TOKEN_KEY);
	return cachedToken;
}

export async function setToken(token: string | null): Promise<void> {
	cachedToken = token;
	if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
	else await SecureStore.deleteItemAsync(TOKEN_KEY);
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

export type Me = {
	id: number;
	username: string;
	role: string;
	trainingAttendance: string | null;
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

export const getMe = () => request<Me>('/api/v1/me');

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
	overrideSpot: { spotId: number; name: string; city: string } | null;
	attending: { id: number; username: string }[];
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
	trainingForecast: {
		summary?: string;
		isWet?: boolean;
		temperature?: number | null;
	} | null;
	viewerTrainingAttendance: string | null;
	mySolo: { todayLogged: boolean; countMonth: number };
	calendarToday: string;
};

export const getTraining = () => request<TrainingPayload>('/api/v1/training');

export type TrainingAction =
	| 'absence'
	| 'cancel_absence'
	| 'rsvp_yes'
	| 'rsvp_no'
	| 'vote_spot'
	| 'remove_vote'
	| 'weekday_override_yes'
	| 'weekday_override_no';

export function trainingAction(
	action: TrainingAction,
	sessionId: number,
	extra: { reason?: string; spotId?: number } = {}
) {
	return request<{ success?: boolean }>('/api/training', {
		method: 'POST',
		body: JSON.stringify({ action, sessionId, ...extra })
	});
}
