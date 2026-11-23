import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { fonts, type ThemeColors } from './theme';
import { textAlpha } from './tokens';
import { useTheme, useThemedStyles } from './themeContext';
import { getMotion } from './prefs';
import type { Zugkraft, ZugkraftLevelKey } from './api';

/**
 * Zugkraft-Barometer auf der Startseite — absichtlich klein.
 *
 * Eine Zeile Kopf, ein Balken, ein Satz. Die Stufe hängt an KÖPFEN, nicht
 * an Prozent: drei von sechs sind eben nur „geht so". Der Balken ist fest
 * von rot nach grün gefärbt, die Füllung zeigt den Stand — so sagt schon
 * die Farbe, wo die Gruppe steht. An den Extremen glüht er pulsierend.
 */

/** Farbe für Zahl und Glühen — der Balken selbst trägt den Verlauf. */
function colorFor(key: ZugkraftLevelKey, colors: ThemeColors): string {
	switch (key) {
		case 'grossartig':
		case 'super':
		case 'gut':
			return colors.success;
		case 'ok':
			return colors.warning;
		default:
			return colors.danger;
	}
}

/**
 * Fester Verlauf rot → grün. RN 0.86 kann native Verläufe über
 * `experimental_backgroundImage`; `backgroundImage` ist der Web-Fallback
 * (Expo-Web-Export).
 */
function gradientStyle(): ViewStyle {
	const gradient =
		'linear-gradient(90deg, #ef4444 0%, #f97316 25%, #eab308 45%, #84cc16 70%, #22c55e 100%)';
	return { experimental_backgroundImage: gradient, backgroundImage: gradient } as ViewStyle;
}

export function ZugkraftCard({ data }: { data: Zugkraft }) {
	const { colors } = useTheme();
	const styles = useThemedStyles(makeStyles);
	const router = useRouter();
	const tone = colorFor(data.level.key, colors);
	const bad = data.level.key === 'schwach' || data.level.key === 'katastrophe';
	// Nur die Extreme dürfen zappeln; „Bewegung reduzieren" schlägt alles.
	const animate = data.level.intensity === 2 && getMotion();
	const pulse = useRef(new Animated.Value(0)).current;

	useEffect(() => {
		if (!animate) {
			pulse.setValue(0);
			return;
		}
		const dur = bad ? 700 : 1100;
		const loop = Animated.loop(
			Animated.sequence([
				Animated.timing(pulse, {
					toValue: 1,
					duration: dur,
					easing: Easing.inOut(Easing.quad),
					useNativeDriver: false
				}),
				Animated.timing(pulse, {
					toValue: 0,
					duration: dur,
					easing: Easing.inOut(Easing.quad),
					useNativeDriver: false
				})
			])
		);
		loop.start();
		return () => loop.stop();
	}, [animate, bad, pulse]);

	// Glühen über einen farbigen Halo hinter dem Balken: funktioniert auf
	// Android zuverlässig, anders als Schatten.
	const haloOpacity = animate
		? pulse.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.75] })
		: 0.14;
	const haloScale = animate
		? pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] })
		: 1;

	const restPercent = Math.max(0, 100 - Math.max(data.percent, 2));

	return (
		<Pressable
			onPress={() => router.push('/stats')}
			style={({ pressed }) => [styles.wrap, pressed && { opacity: 0.7 }]}
			accessibilityRole="button"
			accessibilityLabel={`Zugkraft: im Schnitt ${data.avgAll} von ${data.memberCount} dabei, ${data.level.label}`}
		>
			<View style={styles.head}>
				<Text style={styles.emoji}>{data.level.emoji}</Text>
				<Text style={[styles.value, { color: tone }]}>{data.avgAll}</Text>
				<Text style={styles.of}>von {data.memberCount}</Text>
				<Text style={styles.label} numberOfLines={1}>
					· {data.level.label}
				</Text>
				{data.trend !== 0 ? (
					<Text style={[styles.trend, { color: data.trend > 0 ? colors.success : colors.danger }]}>
						{data.trend > 0 ? '↑' : '↓'}
						{Math.abs(data.trend)}
					</Text>
				) : null}
				<Text style={styles.kicker}>ZUGKRAFT</Text>
			</View>

			<View style={styles.barBox}>
				<Animated.View
					pointerEvents="none"
					style={[
						styles.halo,
						{ backgroundColor: tone, opacity: haloOpacity, transform: [{ scaleX: haloScale }] }
					]}
				/>
				<View style={[styles.track, gradientStyle()]}>
					{/* Was die Gruppe nicht erreicht, wird rechts abgedeckt —
					    so bleibt der Verlauf ortsfest. */}
					<View style={[styles.rest, { width: `${restPercent}%`, backgroundColor: colors.hover }]} />
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
		wrap: { gap: 5, paddingVertical: 2 },
		head: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
		emoji: { fontSize: 15 },
		value: { fontFamily: fonts.sansBold, fontSize: 16, lineHeight: 21 },
		of: { color: colors.fg + textAlpha.muted, fontFamily: fonts.sans, fontSize: 11, lineHeight: 16 },
		label: {
			color: colors.fg + textAlpha.secondary,
			fontFamily: fonts.sans,
			fontSize: 13,
			lineHeight: 18,
			flexShrink: 1
		},
		trend: { fontFamily: fonts.sansSemi, fontSize: 12, lineHeight: 16 },
		kicker: {
			marginLeft: 'auto',
			color: colors.fg + textAlpha.muted,
			fontFamily: fonts.sansSemi,
			fontSize: 9,
			lineHeight: 16,
			letterSpacing: 1.6
		},
		barBox: { justifyContent: 'center' },
		halo: { position: 'absolute', left: 0, right: 0, height: 16, borderRadius: 999 },
		track: { height: 10, borderRadius: 999, overflow: 'hidden', backgroundColor: colors.hover },
		rest: { position: 'absolute', top: 0, bottom: 0, right: 0 },
		blurb: { color: colors.fg + textAlpha.muted, fontFamily: fonts.sans, fontSize: 11, lineHeight: 15 }
	});
