import { fonts } from './theme';

/**
 * Design-Tokens nach Material-3-Typoskala und Dark-Mode-Praxis.
 *
 * Zwei Regeln, die den Unterschied machen:
 *  1. HIERARCHIE ÜBER HELLIGKEIT, nicht über Farbe. Drei Textstufen
 *     (primär 87 %, sekundär 60 %, gedämpft 38 %).
 *  2. AKZENTFARBE IST RATION. Nur für Kennzahlen, den aktiven Tab und
 *     genau eine Hauptaktion je Screen. Titel, Kicker, Abschnitte und
 *     Chips bleiben neutral — sonst hebt sich nichts mehr ab.
 */

/** 4-Punkt-Raster. */
export const space = {
	xs: 4,
	sm: 8,
	md: 12,
	lg: 16,
	xl: 24,
	xxl: 32
} as const;

/** Zwei Radien plus Pille — mehr braucht es nicht. */
export const radius = {
	sm: 10,
	md: 16,
	full: 999
} as const;

/**
 * Typoskala (Material 3): Fliesstext 14sp — nicht 16, das wirkt auf dem
 * Handy schnell aufdringlich. Zeilenhöhen nach M3-Vorgabe.
 */
export const type = {
	/** Bildschirm-Titel, Teko */
	screenTitle: { fontFamily: fonts.display, fontSize: 34, lineHeight: 36, letterSpacing: 0.8 },
	/** Grosse Kennzahl, Teko */
	metric: { fontFamily: fonts.display, fontSize: 30, lineHeight: 32 },
	/** Karten-Überschrift, Teko */
	cardTitle: { fontFamily: fonts.display, fontSize: 24, lineHeight: 26, letterSpacing: 0.5 },
	/** Zeilentitel in Listen */
	title: { fontFamily: fonts.sansSemi, fontSize: 16, lineHeight: 22 },
	/** Fliesstext — der Standard */
	body: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 20 },
	/** Fliesstext hervorgehoben */
	bodyStrong: { fontFamily: fonts.sansSemi, fontSize: 14, lineHeight: 20 },
	/** Metazeilen, Hilfstexte */
	caption: { fontFamily: fonts.sans, fontSize: 12, lineHeight: 16 },
	/** Beschriftungen in Grossbuchstaben (Kicker, Abschnitte, Kacheln) */
	label: { fontFamily: fonts.sansSemi, fontSize: 11, lineHeight: 14, letterSpacing: 1.2 }
} as const;

/**
 * Textstufen als Deckkraft auf der Vordergrundfarbe — die verlässlichste
 * Art, Hierarchie im Dunkeln zu bauen (M3: 87 / 60 / 38 %).
 */
export const textAlpha = {
	primary: 'de', // 87 %
	secondary: '99', // 60 %
	muted: '61' // 38 %
} as const;

/** Mindesthöhe für alles Antippbare. */
export const TOUCH_MIN = 48;
