import { StyleSheet, type TextStyle } from 'react-native';
import { fonts } from './theme';

/**
 * Design-Tokens — die verbindliche Grundlage für alle Screens.
 *
 * Regel: KEINE freien Zahlen in Screens. Nur diese Werte. Genau daran
 * erkennt man professionelle von zusammengewürfelter Oberfläche: wenige,
 * konsequente Grössen statt zwei Dutzend Zufallswerte.
 */

/** 4-Punkt-Raster — alle Abstände sind Vielfache davon. */
export const space = {
	xs: 4,
	sm: 8,
	md: 12,
	lg: 16,
	xl: 20,
	xxl: 24,
	xxxl: 32
} as const;

/** Genau drei Radien: klein (Zeilen/Felder), gross (Karten), Pille. */
export const radius = {
	sm: 12,
	lg: 20,
	full: 999
} as const;

/**
 * Typo-Skala — sieben Rollen, sechs Grössen. Display-Rollen nutzen Teko
 * (gesperrt, Grossbuchstaben), Text-Rollen Plus Jakarta Sans.
 */
export const type = StyleSheet.create({
	/** Seitentitel („DASHBOARD") */
	display: { fontFamily: fonts.display, fontSize: 40, lineHeight: 42, letterSpacing: 1 },
	/** Karten-Überschrift und grosse Kennzahlen („DIENSTAG", „87%") */
	headline: { fontFamily: fonts.display, fontSize: 28, lineHeight: 30, letterSpacing: 0.8 },
	/** Kicker und Abschnittsbeschriftungen — immer Grossbuchstaben */
	label: { fontFamily: fonts.displayMedium, fontSize: 14, lineHeight: 16, letterSpacing: 2.5 },
	/** Zeilentitel in Listen und Karten */
	title: { fontFamily: fonts.sansBold, fontSize: 16, lineHeight: 21 },
	/** Fliesstext */
	body: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 21 },
	/** Fliesstext hervorgehoben */
	bodyStrong: { fontFamily: fonts.sansSemi, fontSize: 15, lineHeight: 21 },
	/** Metazeilen, Hilfstexte */
	caption: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 18 },
	/** Metazeilen hervorgehoben (Werte rechts in Listen) */
	captionStrong: { fontFamily: fonts.sansSemi, fontSize: 13, lineHeight: 18 }
}) as Record<
	'display' | 'headline' | 'label' | 'title' | 'body' | 'bodyStrong' | 'caption' | 'captionStrong',
	TextStyle
>;

/** Mindesthöhe für alles Antippbare (Daumen-Ziel). */
export const TOUCH_MIN = 48;
