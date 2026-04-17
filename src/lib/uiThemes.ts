/** Gespeichert in `users.ui_theme`, per `data-theme` auf `<html>` angewendet. */
export const UI_THEME_IDS = [
	'mate',
	'dark',
	'light',
	'urban',
	'nord',
	'noir',
	'ocean'
] as const;
export type UiThemeId = (typeof UI_THEME_IDS)[number];

export const UI_THEME_DEFAULT: UiThemeId = 'mate';

export function isUiThemeId(v: unknown): v is UiThemeId {
	return typeof v === 'string' && (UI_THEME_IDS as readonly string[]).includes(v);
}

export const UI_THEME_OPTIONS: { id: UiThemeId; label: string; hint: string }[] = [
	{ id: 'mate', label: 'PK / Mate', hint: 'Neon-Gelb, Original-Stil' },
	{ id: 'dark', label: 'Klassisch Dunkel', hint: 'Grautöne, dezentes Blau — ohne Neon' },
	{ id: 'light', label: 'Klassisch Hell', hint: 'Helles UI, dunkler Text' },
	{ id: 'urban', label: 'Urban', hint: 'Warmes Dunkel, Petrol-Akzent' },
	{ id: 'nord', label: 'Nord', hint: 'Polar Night, Frost-Blau' },
	{ id: 'noir', label: 'Noir', hint: 'Tiefschwarz, Violett-Akzent' },
	{ id: 'ocean', label: 'Ocean', hint: 'Tiefblau, türkiser Akzent' }
];
