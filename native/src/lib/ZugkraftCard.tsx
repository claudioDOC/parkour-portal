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
 * „Grossartig": Balken ganz voll und grün, dazu grünes Feuer — wie im Web:
 * ein flackerndes Glutband direkt über dem Balken und darauf viele
 * Flammenzungen (Tropfen, Spitze oben, weicher Verlauf über
 * `experimental_backgroundImage`, in der installierten APK vorhanden und
 * auf die runden Ecken beschnitten), die aufsteigen, sich in die Länge
 * ziehen und verlöschen. Alles über den nativen Treiber.
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
 * Flammenzungen — dieselbe Formel wie im Web (src/lib/components/ZugOMeter.svelte).
 * Jede dritte Zunge ist ein kleiner, heller Kern, der tief bleibt.
 * x = Position (% der Füllung), s = Grösse, r = Steighöhe, dx = Drift (px),
 * d = Dauer (ms), p = Phase 0–1.
 */
const frac = (n: number) => n - Math.floor(n);
const r2 = (n: number) => Math.round(n * 100) / 100;
const FIRE = Array.from({ length: 64 }, (_, i) => {
	const core = i % 3 === 0;
	const b = frac(i * 0.754878 + 0.13);
	const c = frac(i * 0.56984 + 0.29);
	const d = frac(i * 0.414214 + 0.07);
	return {
		core,
		x: r2(2 + frac(i * 0.618034) * 96),
		s: Math.round(core ? 8 + b * 5 : 13 + b * 9),
		r: Math.round(core ? 6 + c * 8 : 12 + c * 20),
		dx: Math.round((frac(i * 0.207107 + 0.5) - 0.5) * 8),
		d: Math.round(1000 * r2(core ? 0.7 + d * 0.4 : 0.95 + d * 0.6)),
		p: r2(frac(i * 0.324718 + 0.41))
	};
});
/** Verläufe wie im Web (app.css): heller Kern unten, grüner Körper, Rand durchsichtig. */
const TONGUE_BG =
	'radial-gradient(circle at 70% 70%, rgba(225, 255, 238, 1) 0%, rgba(80, 255, 160, 0.95) 22%, rgba(0, 230, 118, 0.85) 45%, rgba(0, 200, 83, 0.35) 75%, rgba(0, 170, 70, 0) 100%)';
const CORE_BG =
	'radial-gradient(circle at 70% 70%, #ffffff 0%, rgba(220, 255, 235, 1) 35%, rgba(120, 255, 180, 0.7) 70%, rgba(0, 230, 118, 0) 100%)';
const BASE_BG =
	'radial-gradient(ellipse at 50% 100%, rgba(170, 255, 210, 0.9) 0%, rgba(0, 230, 118, 0.7) 40%, rgba(0, 200, 83, 0) 75%)';

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
	// Flammenzungen (nur „Grossartig"): jede läuft 0 → 1 in ihrer Dauer; die
	// Phase kommt per modulo dazu, so starten nicht alle gleichzeitig unten.
	// Ohne Bewegung steht jede an ihrer Phase still. Ablauf wie @keyframes
	// zug-tongue im Web: auftauchen, bei 20 % voll und lang gezogen, dann
	// steigen, schmal werden, verlöschen.
	const sparks = useRef(FIRE.map(() => new Animated.Value(0))).current;
	const baseFlicker = useRef(new Animated.Value(0.5)).current;
	const sparkStyles = useMemo(
		() =>
			FIRE.map((f, i) => {
				const t = Animated.modulo(Animated.add(sparks[i], f.p), 1);
				const k = [0, 0.2, 1];
				return {
					opacity: t.interpolate({ inputRange: [0, 0.2, 0.6, 1], outputRange: [0, 1, 0.85, 0] }),
					transform: [
						{ translateX: t.interpolate({ inputRange: k, outputRange: [0, f.dx * 0.2, f.dx] }) },
						{ translateY: t.interpolate({ inputRange: k, outputRange: [0, -f.r * 0.2, -f.r] }) },
						{ scaleX: t.interpolate({ inputRange: k, outputRange: [0.5, 0.85, 0.2] }) },
						{ scaleY: t.interpolate({ inputRange: k, outputRange: [0.6, 1.6, 1.1] }) }
					]
				};
			}),
		[sparks]
	);

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
			sparks.forEach((v) => v.setValue(0));
			baseFlicker.setValue(0.5);
			return;
		}
		const loops = sparks.map((v, i) =>
			Animated.loop(
				Animated.timing(v, {
					toValue: 1,
					duration: FIRE[i].d,
					easing: Easing.linear,
					useNativeDriver: true
				})
			)
		);
		// Glutband: hin und her wie „alternate" im Web, 0,9 s je Richtung.
		loops.push(
			Animated.loop(
				Animated.sequence([
					Animated.timing(baseFlicker, {
						toValue: 1,
						duration: 900,
						easing: Easing.inOut(Easing.sin),
						useNativeDriver: true
					}),
					Animated.timing(baseFlicker, {
						toValue: 0,
						duration: 900,
						easing: Easing.inOut(Easing.sin),
						useNativeDriver: true
					})
				])
			)
		);
		loops.forEach((l) => l.start());
		return () => loops.forEach((l) => l.stop());
	}, [motion, flame, sparks, baseFlicker]);

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
				{/* Feuer VOR dem Balken: Die grüne Füllung deckt den Ursprung der
				    Zungen ab, sichtbar ist nur, was oben herauslodert. */}
				{flame ? (
					<View pointerEvents="none" style={[styles.flames, { width }]}>
						<Animated.View
							style={[
								styles.base,
								{
									opacity: baseFlicker.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1] }),
									transform: [
										{ scaleY: baseFlicker.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.1] }) }
									]
								}
							]}
						/>
						{FIRE.map((f, i) => (
							<Animated.View
								key={i}
								style={[
									styles.tongue,
									{ left: `${f.x}%`, width: f.s, height: f.s, marginLeft: -f.s / 2, bottom: -0.3 * f.s },
									sparkStyles[i]
								]}
							>
								<View
									style={[
										styles.drop,
										{
											borderTopRightRadius: f.s / 2,
											borderBottomLeftRadius: f.s / 2,
											borderBottomRightRadius: f.s / 2,
											experimental_backgroundImage: f.core ? CORE_BG : TONGUE_BG
										}
									]}
								/>
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
		/* Platz nach oben für das Feuer. */
		barBoxFire: { paddingTop: 40 },
		/* Unterkante auf der Balkenmitte (6 Abstand + 5 halbe Balkenhöhe). */
		flames: { position: 'absolute', left: 0, bottom: 11, height: 40 },
		/* Glutband: durchgehender Feuerkörper direkt über dem Balken. */
		base: {
			position: 'absolute',
			left: '-2%',
			right: '-2%',
			bottom: 0,
			height: 16,
			transformOrigin: 'bottom',
			experimental_backgroundImage: BASE_BG
		},
		/* Hülle einer Zunge: wächst und steigt von unten her. */
		tongue: { position: 'absolute', transformOrigin: 'bottom' },
		/* Tropfen: Quadrat, eine spitze Ecke, 45° gedreht → Spitze oben. */
		drop: { width: '100%', height: '100%', borderTopLeftRadius: 0, transform: [{ rotate: '45deg' }] },
		/* Fest auf dem Balken (unten = Abstand der barBox) — nicht zentriert, sonst
		   rutscht der Schein bei „Grossartig“ (mehr Platz oben) über den Balken. */
		glow: { position: 'absolute', left: 0, bottom: 6, height: 10, borderRadius: 999 },
		track: {
			height: 10,
			borderRadius: 999,
			overflow: 'hidden',
			backgroundColor: colors.fg + '12'
		},
		fill: { height: '100%', borderRadius: 999 },
		blurb: { color: colors.fg + textAlpha.muted, fontFamily: fonts.sans, fontSize: 12 }
	});
