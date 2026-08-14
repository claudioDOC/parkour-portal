/**
 * Farbpaletten — exakt die 8 Themes der Website (src/app.css + src/lib/
 * themes.css im Portal). Welches aktiv ist, bestimmt der User in seinem
 * Profil (uiTheme aus /api/v1/me), wie im Web über data-theme.
 */
export type ThemeColors = {
	bg: string;
	bgSecondary: string;
	card: string;
	hover: string;
	accent: string;
	accentHot: string;
	accentDim: string;
	accentBlue: string;
	text: string;
	textSecondary: string;
	textMuted: string;
	border: string;
	danger: string;
	warning: string;
	success: string;
	/** Textfarbe auf Akzent-Flächen. */
	onAccent: string;
	/** Heller oder dunkler Modus (Statusbar, Grauwerte). */
	dark: boolean;
	/**
	 * Reine Vordergrundfarbe ohne Deckkraft — Textstufen entstehen daraus
	 * mit den Werten aus tokens.textAlpha (87 / 60 / 38 %).
	 */
	fg: string;
};

export type UiThemeId =
	| 'mate'
	| 'night'
	| 'dark'
	| 'light'
	| 'urban'
	| 'nord'
	| 'noir'
	| 'ocean';

export const THEMES: Record<UiThemeId, ThemeColors> = {
	mate: {
		bg: '#0d0d0f', bgSecondary: '#141418', card: '#1c1c22', hover: '#25252d',
		accent: '#e8ff47', accentHot: '#ff9947', accentDim: '#5a6228', accentBlue: '#47c5ff',
		text: '#f0f0f0', textSecondary: '#a3a3ad', textMuted: '#777777',
		border: 'rgba(255,255,255,0.09)',
		danger: '#ff5555', warning: '#ff9947', success: '#47ffb3',
		onAccent: '#0c0c0e', dark: true, fg: '#f5f5f7'
	},
	urban: {
		bg: '#1a1a18', bgSecondary: '#242320', card: '#2e2c28', hover: '#3a3834',
		accent: '#5eb5a6', accentHot: '#7ec9cf', accentDim: '#3a6b62', accentBlue: '#6a92a8',
		text: '#f2f1ee', textSecondary: '#c4c2bc', textMuted: '#8a8780',
		border: 'rgba(255,255,255,0.11)',
		danger: '#d96a6a', warning: '#d4a85e', success: '#52b892',
		onAccent: '#101413', dark: true, fg: '#f5f4f1'
	},
	night: {
		bg: '#0e1015', bgSecondary: '#14161c', card: '#1a1d24', hover: '#232733',
		accent: '#8ba2ff', accentHot: '#a78bfa', accentDim: '#3b4470', accentBlue: '#38bdf8',
		text: '#eef1f6', textSecondary: '#a8aeba', textMuted: '#767d8a',
		border: 'rgba(255,255,255,0.08)',
		danger: '#f27285', warning: '#e5a960', success: '#5fc99a',
		onAccent: '#0e1015', dark: true, fg: '#f2f4f9'
	},
	dark: {
		bg: '#121212', bgSecondary: '#1a1a1a', card: '#242424', hover: '#2f2f2f',
		accent: '#8ab4f8', accentHot: '#c58af9', accentDim: '#4a5f8a', accentBlue: '#7aa2f7',
		text: '#ececec', textSecondary: '#b0b0b0', textMuted: '#8a8a8a',
		border: 'rgba(255,255,255,0.10)',
		danger: '#f28b82', warning: '#fdd663', success: '#81c995',
		onAccent: '#121212', dark: true, fg: '#f0f0f0'
	},
	light: {
		bg: '#f3f4f6', bgSecondary: '#e5e7eb', card: '#ffffff', hover: '#eef0f3',
		accent: '#2563eb', accentHot: '#3b82f6', accentDim: '#1e3a8a', accentBlue: '#0369a1',
		text: '#111827', textSecondary: '#4b5563', textMuted: '#6b7280',
		border: 'rgba(0,0,0,0.10)',
		danger: '#dc2626', warning: '#d97706', success: '#059669',
		onAccent: '#ffffff', dark: false, fg: '#0b1220'
	},
	nord: {
		bg: '#2e3440', bgSecondary: '#3b4252', card: '#434c5e', hover: '#4c566a',
		accent: '#88c0d0', accentHot: '#81a1c1', accentDim: '#5e81ac', accentBlue: '#81a1c1',
		text: '#eceff4', textSecondary: '#d8dee9', textMuted: '#aeb3c0',
		border: 'rgba(236,239,244,0.12)',
		danger: '#bf616a', warning: '#ebcb8b', success: '#a3be8c',
		onAccent: '#2e3440', dark: true, fg: '#eceff4'
	},
	noir: {
		bg: '#0a0a0c', bgSecondary: '#121218', card: '#1a1a22', hover: '#24242e',
		accent: '#9b8fd9', accentHot: '#c4b8f0', accentDim: '#5c5480', accentBlue: '#7a8fc4',
		text: '#f0eef5', textSecondary: '#b8b4c4', textMuted: '#7a7688',
		border: 'rgba(255,255,255,0.08)',
		danger: '#e07080', warning: '#d9a85e', success: '#6bbe9a',
		onAccent: '#0a0a0c', dark: true, fg: '#f2f0f7'
	},
	ocean: {
		bg: '#0c1520', bgSecondary: '#132535', card: '#1a3045', hover: '#224056',
		accent: '#2dd4bf', accentHot: '#67e8f9', accentDim: '#0f766e', accentBlue: '#38bdf8',
		text: '#f0fdfa', textSecondary: '#a8d4ce', textMuted: '#6b9a94',
		border: 'rgba(165,243,252,0.12)',
		danger: '#fb7185', warning: '#fbbf24', success: '#4ade80',
		onAccent: '#0c1520', dark: true, fg: '#f0fdfa'
	}
};

export const THEME_OPTIONS: { id: UiThemeId; label: string; hint: string }[] = [
	{ id: 'mate', label: 'PK / Mate', hint: 'Neon-Gelb, Original-Stil' },
	{ id: 'night', label: 'Night', hint: 'Kühles Blau-Violett' },
	{ id: 'dark', label: 'Klassisch Dunkel', hint: 'Grautöne, dezentes Blau' },
	{ id: 'light', label: 'Klassisch Hell', hint: 'Helles UI, dunkler Text' },
	{ id: 'urban', label: 'Urban', hint: 'Warmes Dunkel, Petrol' },
	{ id: 'nord', label: 'Nord', hint: 'Polar Night, Frost-Blau' },
	{ id: 'noir', label: 'Noir', hint: 'Tiefschwarz, Violett' },
	{ id: 'ocean', label: 'Ocean', hint: 'Tiefblau, Türkis' }
];

export const DEFAULT_THEME: UiThemeId = 'mate';

export function isThemeId(v: unknown): v is UiThemeId {
	return typeof v === 'string' && v in THEMES;
}

/** Schriftfamilien — identisch zur Website (Google Fonts, via expo-font). */
export const fonts = {
	display: 'Teko_600SemiBold',
	displayMedium: 'Teko_500Medium',
	sans: 'PlusJakartaSans_400Regular',
	sansMedium: 'PlusJakartaSans_500Medium',
	sansSemi: 'PlusJakartaSans_600SemiBold',
	sansBold: 'PlusJakartaSans_700Bold'
} as const;
