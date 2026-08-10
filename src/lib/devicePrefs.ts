/**
 * Geräte-Einstellungen — bewusst lokal (localStorage), nicht am Account:
 * Schriftgrösse und Animationen sind Geräteeigenschaften (Handy ≠ Desktop),
 * die Start-Seite betrifft nur die installierte App auf diesem Gerät.
 *
 * Angewendet werden sie als `data-*`-Attribute auf `<html>`,
 * das CSS dazu steht in `app.css`.
 */
import { browser } from '$app/environment';

export type FontSizeId = 'klein' | 'normal' | 'gross';
export type MotionId = 'an' | 'aus';

export type DevicePrefs = {
	fontSize: FontSizeId;
	motion: MotionId;
	/** Seite, mit der die installierte App startet. */
	startPage: string;
};

export const DEVICE_PREF_DEFAULTS: DevicePrefs = {
	fontSize: 'normal',
	motion: 'an',
	startPage: '/'
};

export const FONT_SIZE_OPTIONS: { id: FontSizeId; label: string; hint: string }[] = [
	{ id: 'klein', label: 'Kompakt', hint: 'Mehr Inhalt auf einen Blick' },
	{ id: 'normal', label: 'Normal', hint: 'Standard' },
	{ id: 'gross', label: 'Gross', hint: 'Besser lesbar, z. B. draussen' }
];

export const START_PAGE_OPTIONS: { id: string; label: string }[] = [
	{ id: '/', label: 'Dashboard' },
	{ id: '/training', label: 'Training' },
	{ id: '/spots', label: 'Spots' },
	{ id: '/finder', label: 'Spot-Finder' },
	{ id: '/challenges', label: 'Challenges' }
];

const KEY = 'device-prefs';

export function loadDevicePrefs(): DevicePrefs {
	if (!browser) return { ...DEVICE_PREF_DEFAULTS };
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return { ...DEVICE_PREF_DEFAULTS };
		const parsed = JSON.parse(raw) as Partial<DevicePrefs>;
		return {
			fontSize: ['klein', 'normal', 'gross'].includes(parsed.fontSize as string)
				? (parsed.fontSize as FontSizeId)
				: 'normal',
			motion: parsed.motion === 'aus' ? 'aus' : 'an',
			startPage: START_PAGE_OPTIONS.some((o) => o.id === parsed.startPage)
				? (parsed.startPage as string)
				: '/'
		};
	} catch {
		return { ...DEVICE_PREF_DEFAULTS };
	}
}

export function saveDevicePrefs(prefs: DevicePrefs): void {
	if (!browser) return;
	try {
		localStorage.setItem(KEY, JSON.stringify(prefs));
	} catch {
		/* Speicher voll oder blockiert — Einstellungen gelten dann nur bis Reload. */
	}
	applyDevicePrefs(prefs);
}

/** Setzt die `data-*`-Attribute; CSS in app.css übernimmt den Rest. */
export function applyDevicePrefs(prefs: DevicePrefs): void {
	if (!browser) return;
	const root = document.documentElement;
	if (prefs.fontSize === 'normal') delete root.dataset.fontsize;
	else root.dataset.fontsize = prefs.fontSize;
	if (prefs.motion === 'aus') root.dataset.motion = 'aus';
	else delete root.dataset.motion;
}

/** Animationen aus — entweder per Einstellung oder Systemvorgabe. */
export function motionDisabled(): boolean {
	if (!browser) return false;
	if (document.documentElement.dataset.motion === 'aus') return true;
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
