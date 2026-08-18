import { readToken, writeToken } from './tokenStore';

/**
 * App-Einstellungen (Startseite, Schriftgrösse) — lokal auf dem Gerät,
 * einmal beim Start geladen, danach synchron abrufbar.
 */
export type StartTab = 'index' | 'finder' | 'spots' | 'challenges' | 'more';

let startTab: StartTab = 'index';
let fontScale = 1;
/** Eigene Logo-Farbe; null = folgt dem Theme. */
let markColor: string | null = null;
/** Weiche Seitenwechsel — wie „Animationen" in den Web-Einstellungen. */
let motion = true;

const VALID_TABS: StartTab[] = ['index', 'finder', 'spots', 'challenges', 'more'];

/** Vor dem ersten Render aufrufen (Root-Layout wartet ohnehin auf Fonts). */
export async function loadPrefs(): Promise<void> {
	try {
		const t = await readToken('pref-start-tab');
		if (t && (VALID_TABS as string[]).includes(t)) startTab = t as StartTab;
		const f = Number(await readToken('pref-font-scale'));
		if (f === 1 || f === 1.1 || f === 1.2) fontScale = f;
		const c = await readToken('pref-mark-color');
		if (c && /^#[0-9a-f]{6}$/i.test(c)) markColor = c;
		motion = (await readToken('pref-motion')) !== 'aus';
	} catch {
		/* Standardwerte behalten */
	}
}

export const getStartTab = () => startTab;
export async function setStartTab(tab: StartTab): Promise<void> {
	startTab = tab;
	await writeToken('pref-start-tab', tab);
}

export const getMarkColor = () => markColor;
export async function setMarkColor(color: string | null): Promise<void> {
	markColor = color;
	await writeToken('pref-mark-color', color);
}

export const getMotion = () => motion;
export async function setMotion(on: boolean): Promise<void> {
	motion = on;
	await writeToken('pref-motion', on ? 'an' : 'aus');
}

export const getFontScale = () => fontScale;
export async function setFontScale(scale: number): Promise<void> {
	fontScale = scale;
	await writeToken('pref-font-scale', String(scale));
}
