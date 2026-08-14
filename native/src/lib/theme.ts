/**
 * Design-Tokens der App (v2). Basis bleibt die Portal-Palette, aber ruhiger
 * eingesetzt: tiefes Schwarz, Flächen statt Rahmen, Akzent nur für die
 * jeweils eine Hauptaktion und aktive Zustände.
 */
export const colors = {
	bg: '#0b0b0d',
	bgSecondary: '#111114',
	card: '#17171b',
	hover: '#222229',
	accent: '#e8ff47',
	accentDim: '#5a6228',
	accentBlue: '#47c5ff',
	text: '#f4f4f5',
	textSecondary: '#9d9da6',
	textMuted: '#68686f',
	border: 'rgba(255,255,255,0.07)',
	danger: '#ff5c5c',
	warning: '#ff9947',
	success: '#47ffb3',
	onAccent: '#0c0c0e'
} as const;
