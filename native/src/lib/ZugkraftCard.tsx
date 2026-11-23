import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { fonts, type ThemeColors } from './theme';
import { textAlpha } from './tokens';
import { useTheme, useThemedStyles } from './themeContext';
import { getMotion } from './prefs';
import type { Zugkraft, ZugkraftLevelKey } from './api';

/**
 * Zugkraft-Barometer auf der Startseite.
 *
 * Die Stufe hängt an KÖPFEN: drei von sechs sind nur „geht so". Jede Stufe
 * hat ihre Farbe (1 dunkelrot … 6 starkes Grün), und der Rahmen leuchtet in
 * dieser Farbe. Bei sechs flackert er wie Feuer, bei eins und zwei pulsiert
 * er als Alarm. Das soll auffallen — genau darum geht es.
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

/** Flackerfarben für den Feuer-Rahmen bei „Grossartig". */
const FLAME = ['#00e676', '#eab308', '#f97316'];

export function ZugkraftCard({ data }: { data: Zugkraft }) {
	const { colors } = useTheme();
	const styles = useThemedStyles(makeStyles);
	const router = useRouter();
	const tone = LEVEL_COLOR[data.level.key] ?? colors.accent;
	const flame = data.level.key === 'grossartig';
	const alarm = data.level.key === 'schwach' || data.level.key === 'katastrophe';
	// „Bewegung reduzieren" schlägt alles; der ruhige Schein bleibt trotzdem.
	const animate = (flame || alarm) && getMotion();
	const pulse = useRef(new Animated.Value(0)).current;

	useEffect(() => {
		if (!animate) {
			pulse.setValue(0);
			return;
		}
		const dur = alarm ? 650 : 900;
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
	}, [animate, alarm, pulse]);

	// Der Rahmen ist der Blickfang: Farbe und Deckkraft wandern mit.
	const borderColor = animate
		? flame
			? pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: FLAME })
			: pulse.interpolate({ inputRange: [0, 1], outputRange: [tone + '88', tone] })
		: tone + 'b0';
	// Halo hinter der Karte ersetzt den Schatten — auf Android verlässlicher.
	const haloOpacity = animate
		? pulse.interpolate({ inputRange: [0, 1], outputRange: alarm ? [0.12, 0.5] : [0.16, 0.42] })
		: 0.12;

	return (
		<View style={styles.outer}>
			<Animated.View
				pointerEvents="none"
				style={[styles.halo, { backgroundColor: tone, opacity: haloOpacity }]}
			/>
			<Pressable
				onPress={() => router.push('/stats')}
				accessibilityRole="button"
				accessibilityLabel={`Zugkraft: im Schnitt ${data.avgAll} von ${data.memberCount} dabei, ${data.level.label}`}
				style={({ pressed }) => [pressed && { opacity: 0.8 }]}
			>
				<Animated.View style={[styles.box, { borderColor, backgroundColor: tone + '14' }]}>
					<View style={styles.head}>
						<Text style={styles.emoji}>{data.level.emoji}</Text>
						<Text style={[styles.value, { color: tone }]}>{data.avgAll}</Text>
						<Text style={styles.of}>von {data.memberCount}</Text>
						<Text style={[styles.label, { color: tone }]} numberOfLines={1}>
							· {data.level.label}
						</Text>
						{data.trend !== 0 ? (
							<Text
								style={[styles.trend, { color: data.trend > 0 ? colors.success : colors.danger }]}
							>
								{data.trend > 0 ? '↑' : '↓'}
								{Math.abs(data.trend)}
							</Text>
						) : null}
						<Text style={styles.kicker}>ZUGKRAFT</Text>
					</View>

					<View style={styles.track}>
						<View
							style={[
								styles.fill,
								{ backgroundColor: tone, width: `${Math.max(data.percent, 3)}%` }
							]}
						/>
					</View>

					<Text style={styles.blurb} numberOfLines={2}>
						{data.level.blurb}
					</Text>
				</Animated.View>
			</Pressable>
		</View>
	);
}

const makeStyles = (colors: ThemeColors) =>
	StyleSheet.create({
		outer: { justifyContent: 'center' },
		halo: { position: 'absolute', left: 6, right: 6, top: 4, bottom: 4, borderRadius: 18 },
		box: { borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 10, gap: 7 },
		head: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
		emoji: { fontSize: 15 },
		value: { fontFamily: fonts.sansBold, fontSize: 19, lineHeight: 24 },
		of: { color: colors.fg + textAlpha.muted, fontFamily: fonts.sans, fontSize: 11, lineHeight: 16 },
		label: { fontFamily: fonts.sansSemi, fontSize: 13, lineHeight: 18, flexShrink: 1 },
		trend: { fontFamily: fonts.sansSemi, fontSize: 12, lineHeight: 16 },
		kicker: {
			marginLeft: 'auto',
			color: colors.fg + textAlpha.muted,
			fontFamily: fonts.sansSemi,
			fontSize: 9,
			lineHeight: 16,
			letterSpacing: 1.6
		},
		track: {
			height: 10,
			borderRadius: 999,
			overflow: 'hidden',
			backgroundColor: colors.fg + '12'
		},
		fill: { height: '100%', borderRadius: 999 },
		blurb: { color: colors.fg + textAlpha.muted, fontFamily: fonts.sans, fontSize: 11, lineHeight: 15 }
	});
