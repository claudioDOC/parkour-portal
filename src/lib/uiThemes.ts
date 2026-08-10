/** Gespeichert in `users.ui_theme`, per `data-theme` auf `<html>` angewendet. */
export const UI_THEME_IDS = [
	'mate',
	'night',
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

export const UI_THEME_OPTIONS: {
	id: UiThemeId;
	label: string;
	hint: string;
	/** Vorschau in den Einstellungen: [Hintergrund, Akzent, Zweitakzent]. */
	swatch: [string, string, string];
}[] = [
	{ id: 'mate', label: 'PK / Mate', hint: 'Neon-Gelb, Original-Stil', swatch: ['#0d0d0f', '#e8ff47', '#ff9947'] },
	{ id: 'night', label: 'Night', hint: 'Kühles Blau-Violett — passend zum Logo', swatch: ['#0e1015', '#8ba2ff', '#a78bfa'] },
	{ id: 'dark', label: 'Klassisch Dunkel', hint: 'Grautöne, dezentes Blau — ohne Neon', swatch: ['#121212', '#8ab4f8', '#c58af9'] },
	{ id: 'light', label: 'Klassisch Hell', hint: 'Helles UI, dunkler Text', swatch: ['#f3f4f6', '#2563eb', '#3b82f6'] },
	{ id: 'urban', label: 'Urban', hint: 'Warmes Dunkel, Petrol-Akzent', swatch: ['#1a1a18', '#5eb5a6', '#7ec9cf'] },
	{ id: 'nord', label: 'Nord', hint: 'Polar Night, Frost-Blau', swatch: ['#2e3440', '#88c0d0', '#81a1c1'] },
	{ id: 'noir', label: 'Noir', hint: 'Tiefschwarz, Violett-Akzent', swatch: ['#0a0a0c', '#9b8fd9', '#c4b8f0'] },
	{ id: 'ocean', label: 'Ocean', hint: 'Tiefblau, türkiser Akzent', swatch: ['#0c1520', '#2dd4bf', '#67e8f9'] }
];
