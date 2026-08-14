/**
 * Design-Tokens — exakt die Palette der Website (src/app.css im Portal):
 * dunkles Fundament, Neon-Akzent #e8ff47, Orange #ff9947 als Gegenakzent,
 * Display-Schrift Teko (uppercase) + Plus Jakarta Sans für Text.
 */
export const colors = {
	bg: '#0d0d0f',
	bgSecondary: '#141418',
	card: '#1c1c22',
	hover: '#25252d',
	accent: '#e8ff47',
	accentHot: '#ff9947',
	accentDim: '#5a6228',
	accentBlue: '#47c5ff',
	text: '#f0f0f0',
	textSecondary: '#a3a3ad',
	textMuted: '#777777',
	border: 'rgba(255,255,255,0.09)',
	danger: '#ff5555',
	warning: '#ff9947',
	success: '#47ffb3',
	onAccent: '#0c0c0e'
} as const;

/** Schriftfamilien — identisch zur Website (Google Fonts, via expo-font). */
export const fonts = {
	display: 'Teko_600SemiBold',
	displayMedium: 'Teko_500Medium',
	sans: 'PlusJakartaSans_400Regular',
	sansMedium: 'PlusJakartaSans_500Medium',
	sansSemi: 'PlusJakartaSans_600SemiBold',
	sansBold: 'PlusJakartaSans_700Bold'
} as const;
