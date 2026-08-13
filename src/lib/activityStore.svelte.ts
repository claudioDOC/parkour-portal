/**
 * Gemeinsamer Zustand für Glocke, roten Punkt und Live-Popups.
 * Wird über die SSE-Verbindung (Layout) aufgefrischt — dadurch erscheinen
 * Ereignisse anderer Nutzer sofort, ohne Neuladen.
 */
import { browser } from '$app/environment';

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

export const activityStore = $state({
	entries: [] as FeedEntry[],
	unread: 0,
	latestId: 0,
	/** Stand beim letzten Öffnen der Glocke — markiert „neu" in der Liste. */
	seenAtOpen: 0,
	/** Frisch eingetroffene Ereignisse, die als Popup gezeigt werden. */
	toasts: [] as FeedEntry[]
});

/** Eigene ID, damit man eigene Aktionen nicht als Popup serviert bekommt. */
let selfUserId: number | null = null;
export function setActivitySelf(userId: number | null) {
	selfUserId = userId;
}

let initialised = false;

export async function refreshActivity(): Promise<void> {
	if (!browser) return;
	try {
		const res = await fetch('/api/activity', { credentials: 'include' });
		if (!res.ok) return;
		const data = (await res.json()) as { entries: FeedEntry[]; unread: number; latestId: number };

		// Neue Ereignisse seit dem letzten Abruf → Popups (nicht beim ersten Laden,
		// und nie für eigene Aktionen).
		if (initialised && data.latestId > activityStore.latestId) {
			const fresh = data.entries.filter(
				(e) => e.id > activityStore.latestId && e.actorUserId !== selfUserId
			);
			if (fresh.length > 0) {
				activityStore.toasts = [...activityStore.toasts, ...fresh].slice(-3);
				for (const t of fresh) {
					setTimeout(() => {
						activityStore.toasts = activityStore.toasts.filter((x) => x.id !== t.id);
					}, 7000);
				}
			}
		}

		activityStore.entries = data.entries;
		activityStore.unread = data.unread;
		activityStore.latestId = data.latestId;
		initialised = true;
	} catch {
		/* Feed ist Beiwerk */
	}
}

export async function markActivitySeen(): Promise<void> {
	if (!browser || activityStore.latestId === 0) return;
	activityStore.seenAtOpen = activityStore.latestId - activityStore.unread;
	activityStore.unread = 0;
	try {
		await fetch('/api/activity', {
			method: 'POST',
			credentials: 'include',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ eventId: activityStore.latestId })
		});
	} catch {
		/* nächster Aufruf korrigiert */
	}
}

export function dismissToast(id: number) {
	activityStore.toasts = activityStore.toasts.filter((t) => t.id !== id);
}
