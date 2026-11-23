import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, type BoxShadowValue } from 'react-native';
import { useRouter } from 'expo-router';
import { fonts, type ThemeColors } from './theme';
import { textAlpha } from './tokens';
import { useTheme, useThemedStyles } from './themeContext';
import { getMotion } from './prefs';
import type { Zugkraft, ZugkraftLevelKey } from './api';

/**
 * Zug-O-Meter auf der Startseite.
 *
 * Die Stufe hängt an KÖPFEN: drei von sechs sind nur „geht so". Jede Stufe
 * hat ihre Farbe (1 dunkelrot … 6 starkes Grün). Farbe und Leuchten stecken
 * NUR im Balken — der Block drumherum bleibt ruhig.
 *
 * Das Glühen ist ein echter weicher Schein über `boxShadow` (React Native
 * 0.76+, in der installierten APK nativ vorhanden — im Dex nachgeprüft),
 * in mehreren Lagen mit wachsendem Weichzeichner und fallender Deckkraft.
 *
 * Fade: `boxShadow` selbst lässt sich nicht animieren. Darum liegt der Schein
 * auf einer eigenen Ebene, deren Deckkraft atmet — und zwar bei ALLEN Stufen
 * (vorher nur bei drei von sechs, im Alltag also nie). Ruhig und langsam im
 * Normalfall, schnell und kräftig bei 1–2, bei 6 wandert zusätzlich die
 * Farbe wie Feuer. Die Deckkraft läuft über den nativen Treiber, damit das
 * Atmen nicht ruckelt; nur die Feuerfarbe braucht den JS-Treiber.
 */

/** Stufenfarbe. Bewusst feste Werte: Die Skala muss in jedem Farbschema gleich lesbar sein. */
const LEVEL_COLOR: Record<ZugkraftLevelKey, string> = {
	grossartig: '#00e676',
	super: '#22c55e',
	gut: '#eab308',
	ok: '#f97316',
	schwach: '#ef4444',
	katastrophe: '#991b1b'
};

/** Flackerfarben für das Feuer bei „Grossartig". */
const FLAME = ['#00e676', '#eab308', '#f97316'];

/** Weicher Schein: vier Lagen, damit er ausläuft statt als Ring zu kleben. */
function glowLayers(color: string, strong: boolean): BoxShadowValue[] {
	const k = strong ? 1.35 : 1;
	return [
		{ offsetX: 0, offsetY: 0, blurRadius: 5 * k, spreadDistance: 1, color: color + (strong ? 'd9' : 'b3') },
		{ offsetX: 0, offsetY: 0, blurRadius: 14 * k, spreadDistance: 4 * k, color: color + (strong ? '99' : '73') },
		{ offsetX: 0, offsetY: 0, blurRadius: 28 * k, spreadDistance: 9 * k, color: color + (strong ? '4d' : '38') },
		{ offsetX: 0, offsetY: 0, blurRadius: 46 * k, spreadDistance: 15 * k, color: color + (strong ? '1f' : '14') }
	];
}

export function ZugkraftCard({ data }: { data: Zugkraft }) {
	const { colors } = useTheme();
	const styles = useThemedStyles(makeStyles);
	const router = useRouter();
	const tone = LEVEL_COLOR[data.level.key] ?? colors.accent;
	const flame = data.level.key === 'grossartig';
	const alarm = data.level.key === 'schwach' || data.level.key === 'katastrophe';
	const strong = flame || alarm;
	// „Bewegung reduzieren" schlägt alles; der ruhige Schein bleibt sichtbar.
	const motion = getMotion();

	// Atmen der Schein-Ebene (Deckkraft, nativer Treiber).
	const breath = useRef(new Animated.Value(0)).current;
	// Feuerfarbe der Füllung (nur bei 6, JS-Treiber — Farben kann der native nicht).
	const flameT = useRef(new Animated.Value(0)).current;

	useEffect(() => {
		if (!motion) {
			breath.setValue(0.6);
			return;
		}
		// Ruhig im Normalfall, schnell bei Alarm, mittel beim Feuer.
		const half = alarm ? 600 : flame ? 900 : 1700;
		const loop = Animated.loop(
			Animated.sequence([
				Animated.timing(breath, {
					toValue: 1,
					duration: half,
					easing: Easing.inOut(Easing.sin),
					useNativeDriver: true
				}),
				Animated.timing(breath, {
					toValue: 0,
					duration: half,
					easing: Easing.inOut(Easing.sin),
					useNativeDriver: true
				})
			])
		);
		loop.start();
		return () => loop.stop();
	}, [motion, alarm, flame, breath]);

	useEffect(() => {
		if (!motion || !flame) {
			flameT.setValue(0);
			return;
		}
		const loop = Animated.loop(
			Animated.timing(flameT, {
				toValue: 1,
				duration: 1800,
				easing: Easing.inOut(Easing.quad),
				useNativeDriver: false
			})
		);
		loop.start();
		return () => loop.stop();
	}, [motion, flame, flameT]);

	// Untergrenze des Atmens: Im Normalfall bleibt immer ein Rest sichtbar.
	const glowOpacity = breath.interpolate({
		inputRange: [0, 1],
		outputRange: strong ? [0.25, 1] : [0.4, 1]
	});
	const fillColor = flame
		? flameT.interpolate({ inputRange: [0, 0.35, 0.7, 1], outputRange: [...FLAME, FLAME[0]] })
		: tone;

	// Schein-Lagen nur neu bauen, wenn sich die Farbe ändert — nicht bei jedem Frame.
	const glow = useMemo(() => glowLayers(tone, strong), [tone, strong]);
	const width: `${number}%` = `${Math.max(data.percent, 3)}%`;

	return (
		<Pressable
			onPress={() => router.push('/stats')}
			accessibilityRole="button"
			accessibilityLabel={`Zug-O-Meter: ${data.level.label}. ${data.level.blurb}`}
			style={({ pressed }) => [styles.box, pressed && { opacity: 0.7 }]}
		>
			{/* Titel links, Stand rechts — nur Emoji und Stufe, keine Kopfzahlen. */}
			<View style={styles.head}>
				<Text style={styles.kicker}>ZUG-O-METER</Text>
				<Text style={styles.emoji}>{data.level.emoji}</Text>
				<Text style={[styles.label, { color: tone }]} numberOfLines={1}>
					{data.level.label}
				</Text>
			</View>

			<View style={styles.barBox}>
				{/* Schein-Ebene hinter dem Balken: gleiche Grösse, atmende Deckkraft.
				    Android schneidet die eigene Fläche aus dem Schatten aus — sichtbar
				    bleibt also nur der Schein ausserhalb, genau wie gewollt. */}
				<Animated.View
					pointerEvents="none"
					style={[styles.glow, { width, opacity: glowOpacity, boxShadow: glow }]}
				/>
				<View style={styles.track}>
					<Animated.View style={[styles.fill, { width, backgroundColor: fillColor }]} />
				</View>
			</View>

			<Text style={styles.blurb} numberOfLines={2}>
				{data.level.blurb}
			</Text>
		</Pressable>
	);
}

const makeStyles = (colors: ThemeColors) =>
	StyleSheet.create({
		box: { gap: 6, paddingVertical: 2 },
		head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
		kicker: {
			color: colors.fg + textAlpha.muted,
			fontFamily: fonts.sansSemi,
			fontSize: 10,
			lineHeight: 16,
			letterSpacing: 1.6
		},
		/* marginLeft auto schiebt Emoji + Stufe an den rechten Rand. */
		emoji: { fontSize: 15, marginLeft: 'auto' },
		label: { fontFamily: fonts.sansSemi, fontSize: 13, lineHeight: 18, flexShrink: 1 },
		/* Höhe für den Schein lassen, damit er oben/unten nicht abgeschnitten wirkt. */
		barBox: { justifyContent: 'center', paddingVertical: 6 },
		glow: { position: 'absolute', left: 0, height: 10, borderRadius: 999 },
		track: {
			height: 10,
			borderRadius: 999,
			overflow: 'hidden',
			backgroundColor: colors.fg + '12'
		},
		fill: { height: '100%', borderRadius: 999 },
		blurb: { color: colors.fg + textAlpha.muted, fontFamily: fonts.sans, fontSize: 11, lineHeight: 15 }
	});
