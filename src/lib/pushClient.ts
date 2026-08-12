/**
 * Push auf DIESEM Gerät einschalten — gemeinsame Logik für Einstellungen
 * und den Aktivierungs-Dialog beim App-Start.
 */
import { browser } from '$app/environment';

export type PushSetupResult = 'ok' | 'denied' | 'unsupported' | 'not-configured' | 'error';

function urlBase64ToBytes(base64String: string): BufferSource {
	const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
	const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
	const raw = atob(base64);
	const output = new Uint8Array(raw.length);
	for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
	return output.buffer as ArrayBuffer;
}

export function pushSupported(): boolean {
	return (
		browser && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
	);
}

/** Bestehendes Abo auf diesem Gerät? (ohne Berechtigungs-Dialog) */
export async function hasLocalSubscription(): Promise<boolean> {
	if (!pushSupported() || Notification.permission !== 'granted') return false;
	try {
		const reg = await navigator.serviceWorker.ready;
		return (await reg.pushManager.getSubscription()) !== null;
	} catch {
		return false;
	}
}

/** Fragt (bei Bedarf) die Berechtigung ab, abonniert und meldet beim Server an. */
export async function enablePushOnThisDevice(): Promise<PushSetupResult> {
	if (!pushSupported()) return 'unsupported';

	let cfg: { enabled?: boolean; publicKey?: string } | null = null;
	try {
		const res = await fetch('/api/push/config', { credentials: 'include' });
		if (res.ok) cfg = await res.json();
	} catch {
		/* unten behandelt */
	}
	if (!cfg?.enabled || !cfg.publicKey) return 'not-configured';

	const permission = await Notification.requestPermission();
	if (permission === 'denied') return 'denied';
	if (permission !== 'granted') return 'error';

	try {
		const reg = await navigator.serviceWorker.ready;
		let sub = await reg.pushManager.getSubscription();
		if (!sub) {
			sub = await reg.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: urlBase64ToBytes(cfg.publicKey)
			});
		}
		const res = await fetch('/api/push/subscribe', {
			method: 'POST',
			credentials: 'include',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(sub.toJSON())
		});
		return res.ok ? 'ok' : 'error';
	} catch {
		return 'error';
	}
}
