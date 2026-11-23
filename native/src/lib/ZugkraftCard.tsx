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
 * Die Stufe hängt am Schnitt der Köpfe pro Training (Grenzen auf dem
 * Server). Jede Stufe hat ihre Farbe (dunkelrot … starkes Grün). Farbe und
 * Leuchten stecken NUR im Balken — der Block drumherum bleibt ruhig.
 *
 * Das Glühen ist ein echter weicher Schein über `boxShadow` (React Native
 * 0.76+, in der installierten APK nativ vorhanden — im Dex nachgeprüft),
 * in mehreren Lagen mit wachsendem Weichzeichner und fallender Deckkraft.
 *
 * Fade: `boxShadow` selbst lässt sich nicht animieren. Darum liegt der Schein
 * auf einer eigenen Ebene, deren Deckkraft atmet — und zwar bei ALLEN Stufen
 * (vorher nur bei drei von sechs, im Alltag also nie). Ruhig und langsam im
 * Normalfall, schnell und kräftig bei den zwei schlechtesten Stufen.
 *
 * „Grossartig": Balken bleibt grün, dazu grüne Flammenzungen, die aus der
 * Oberkante züngeln — wie im Web. Jede Zunge ist ein um 45° gedrehtes
 * Quadrat mit einer spitzen Ecke (Tropfen, Spitze oben) in einer Hülle, die
 * per scaleY von unten her flackert. Alles über den nativen Treiber.
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

/**
 * Flammenzungen: Position (% der Füllung), Höhe, halbe Flacker-Dauer (ms)
 * und Startphase. Feste Werte, damit es ruhig und gleichmässig wirkt.
 */
const FLAMES = [
	{ x: 3, h: 0.8, d: 310, p: 0 },
	{ x: 12, h: 1.15, d: 370, p: 0.5 },
	{ x: 21, h: 0.9, d: 290, p: 0.8 },
	{ x: 30, h: 1.3, d: 400, p: 0.2 },
	{ x: 39, h: 1, d: 330, p: 0.65 },
	{ x: 48, h: 1.4, d: 385, p: 0.1 },
	{ x: 57, h: 0.95, d: 300, p: 0.9 },
	{ x: 66, h: 1.25, d: 350, p: 0.35 },
	{ x: 75, h: 1.05, d: 420, p: 0.7 },
	{ x: 84, h: 1.35, d: 315, p: 0.15 },
	{ x: 93, h: 0.9, d: 360, p: 0.55 },
	{ x: 99, h: 1.1, d: 295, p: 0.85 }
];
const TONGUE = 9;

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

export function ZugkraftCard({
	data,
	preview = false
}: {
	/** Nur Füllung und Stufe zählen — so passt auch das Vorschau-Muster. */
	data: Pick<Zugkraft, 'percent' | 'level'> & { fill?: number };
	/** Vorschau: kein Sprung in die Statistik. */
	preview?: boolean;
}) {
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
	// Flackern der Flammenzungen (nur „Grossartig").
	const tongues = useRef(FLAMES.map((f) => new Animated.Value(f.p))).current;

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
			tongues.forEach((t) => t.setValue(0.5));
			return;
		}
		const loops = tongues.map((t, i) =>
			Animated.loop(
				Animated.sequence([
					Animated.timing(t, {
						toValue: 1,
						duration: FLAMES[i].d,
						easing: Easing.inOut(Easing.sin),
						useNativeDriver: true
					}),
					Animated.timing(t, {
						toValue: 0,
						duration: FLAMES[i].d,
						easing: Easing.inOut(Easing.sin),
						useNativeDriver: true
					})
				])
			)
		);
		loops.forEach((l) => l.start());
		return () => loops.forEach((l) => l.stop());
	}, [motion, flame, tongues]);

	// Untergrenze des Atmens: Im Normalfall bleibt immer ein Rest sichtbar.
	const glowOpacity = breath.interpolate({
		inputRange: [0, 1],
		outputRange: strong ? [0.25, 1] : [0.4, 1]
	});

	// Schein-Lagen nur neu bauen, wenn sich die Farbe ändert — nicht bei jedem Frame.
	const glow = useMemo(() => glowLayers(tone, strong), [tone, strong]);
	const width: `${number}%` = `${Math.max(data.fill ?? data.percent, 3)}%`;

	return (
		<Pressable
			onPress={preview ? undefined : () => router.push('/stats')}
			disabled={preview}
			accessibilityRole={preview ? 'summary' : 'button'}
			accessibilityLabel={`Zug-O-Meter: ${data.level.label}. ${data.level.blurb}`}
			style={({ pressed }) => [styles.box, pressed && { opacity: 0.7 }]}
		>
			{/* Titel links, rechts Emoji · Stufe · Spruch in EINER Zeile. Auf
			    schmalen Handys schrumpft die Schrift (adjustsFontSizeToFit —
			    Android skaliert dabei alle Teilstücke gleichmässig), statt
			    umzubrechen. */}
			<View style={styles.head}>
				<Text style={styles.kicker}>ZUG-O-METER</Text>
				<Text style={styles.right} numberOfLines={1} adjustsFontSizeToFit>
					<Text style={styles.emoji}>{data.level.emoji} </Text>
					<Text style={[styles.label, { color: tone }]}>{data.level.label}</Text>
					<Text style={styles.blurb}>{` · ${data.level.blurb}`}</Text>
				</Text>
			</View>

			<View style={[styles.barBox, flame && styles.barBoxFire]}>
				{/* Flammen VOR dem Balken: Die grüne Füllung deckt ihre Wurzeln ab,
				    sichtbar bleibt nur, was oben herauszüngelt. */}
				{flame ? (
					<View pointerEvents="none" style={[styles.flames, { width }]}>
						{FLAMES.map((f, i) => (
							<Animated.View
								key={f.x}
								style={[
									styles.tongue,
									{
										left: `${f.x}%`,
										opacity: tongues[i].interpolate({ inputRange: [0, 1], outputRange: [0.75, 1] }),
										transform: [
											{
												scaleY: tongues[i].interpolate({
													inputRange: [0, 1],
													outputRange: [1.1 * f.h, 2 * f.h]
												})
											},
											{
												scaleX: tongues[i].interpolate({ inputRange: [0, 1], outputRange: [1.05, 0.85] })
											}
										]
									}
								]}
							>
								<View style={styles.drop}>
									<View style={styles.core} />
								</View>
							</Animated.View>
						))}
					</View>
				) : null}
				{/* Schein-Ebene hinter dem Balken: gleiche Grösse, atmende Deckkraft.
				    Android schneidet die eigene Fläche aus dem Schatten aus — sichtbar
				    bleibt also nur der Schein ausserhalb, genau wie gewollt. */}
				<Animated.View
					pointerEvents="none"
					style={[styles.glow, { width, opacity: glowOpacity, boxShadow: glow }]}
				/>
				<View style={styles.track}>
					<View style={[styles.fill, { width, backgroundColor: tone }]} />
				</View>
			</View>

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
		/* Nimmt den Rest der Zeile, Text rechtsbündig. */
		right: { flex: 1, textAlign: 'right', fontSize: 13, lineHeight: 18 },
		emoji: { fontSize: 14 },
		label: { fontFamily: fonts.sansSemi, fontSize: 13 },
		/* Höhe für den Schein lassen, damit er oben/unten nicht abgeschnitten wirkt. */
		barBox: { justifyContent: 'center', paddingVertical: 6 },
		/* Platz nach oben für die Flammen. */
		barBoxFire: { paddingTop: 18 },
		/* Unterkante auf der Balkenmitte (6 Abstand + 5 halbe Balkenhöhe). */
		flames: { position: 'absolute', left: 0, bottom: 11, height: 20 },
		tongue: {
			position: 'absolute',
			bottom: 0,
			width: TONGUE,
			height: TONGUE,
			marginLeft: -TONGUE / 2,
			transformOrigin: 'bottom'
		},
		/* Tropfen: Quadrat, eine spitze Ecke, 45° gedreht → Spitze oben. */
		drop: {
			width: TONGUE,
			height: TONGUE,
			borderTopLeftRadius: 0,
			borderTopRightRadius: TONGUE / 2,
			borderBottomLeftRadius: TONGUE / 2,
			borderBottomRightRadius: TONGUE / 2,
			backgroundColor: '#2ee98a',
			transform: [{ rotate: '45deg' }],
			boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 4, spreadDistance: 0, color: '#00e676cc' }],
			alignItems: 'flex-end',
			justifyContent: 'flex-end'
		},
		/* Heller Kern unten (vor der Drehung: Ecke unten rechts). */
		core: {
			width: TONGUE * 0.55,
			height: TONGUE * 0.55,
			borderRadius: TONGUE,
			backgroundColor: '#d9ffe9'
		},
		glow: { position: 'absolute', left: 0, height: 10, borderRadius: 999 },
		track: {
			height: 10,
			borderRadius: 999,
			overflow: 'hidden',
			backgroundColor: colors.fg + '12'
		},
		fill: { height: '100%', borderRadius: 999 },
		blurb: { color: colors.fg + textAlpha.muted, fontFamily: fonts.sans, fontSize: 12 }
	});
