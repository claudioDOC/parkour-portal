import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { fonts, type ThemeColors } from './theme';
import { radius, space, textAlpha } from './tokens';
import { useTheme, useThemedStyles } from './themeContext';
import { ProgressBar } from './ui';
import { getMotion } from './prefs';
import type { Zugkraft, ZugkraftLevelKey } from './api';

/**
 * Zugkraft-Barometer auf der Startseite.
 *
 * Zeigt in einer Zahl, wie gut die Gruppe gerade zieht (letzte zwei Wochen
 * plus kommende Woche). Zweck ist nicht Statistik, sondern Druck in die
 * richtige Richtung: Wer sieht, dass es gerade dünn aussieht, soll sich
 * zweimal überlegen, ob er sich auch noch abmeldet. Darum eskaliert die
 * Darstellung — bei „legendär" und bei „schwach/Notstand" bewegt sich die
 * Karte, in der Mitte bleibt sie ruhig.
 */

/** Levelfarbe: eine Farbe trägt die ganze Karte, sonst wird es Kirmes. */
function colorFor(key: ZugkraftLevelKey, colors: ThemeColors): string {
	switch (key) {
		case 'legendaer':
		case 'stark':
			return colors.success;
		case 'solide':
			return colors.accent;
		case 'wackelig':
			return colors.warning;
		default:
			return colors.danger;
	}
}

function formatShortDate(ymd: string): string {
	return new Date(`${ymd}T12:00:00`).toLocaleDateString('de-CH', {
		weekday: 'short',
		day: 'numeric',
		month: 'short'
	});
}

export function ZugkraftCard({ data }: { data: Zugkraft }) {
	const { colors } = useTheme();
	const styles = useThemedStyles(makeStyles);
	const router = useRouter();
	const tone = colorFor(data.level.key, colors);
	// Nur die Extreme dürfen zappeln; „Animationen aus" schlägt alles.
	const animate = data.level.intensity === 2 && getMotion();
	const good = data.level.key === 'legendaer';

	const pulse = useRef(new Animated.Value(0)).current;

	useEffect(() => {
		if (!animate) {
			pulse.setValue(0);
			return;
		}
		// Gute Phase: ruhiges Atmen. Schlechte Phase: schnelleres, unruhiges
		// Pochen — das soll im Augenwinkel stören.
		const dauer = good ? 1400 : 900;
		const loop = Animated.loop(
			Animated.sequence([
				Animated.timing(pulse, {
					toValue: 1,
					duration: dauer,
					easing: Easing.inOut(Easing.ease),
					useNativeDriver: false
				}),
				Animated.timing(pulse, {
					toValue: 0,
					duration: dauer,
					easing: Easing.inOut(Easing.ease),
					useNativeDriver: false
				})
			])
		);
		loop.start();
		return () => loop.stop();
	}, [animate, good, pulse]);

	const emojiStyle = animate
		? {
				opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, good ? 0.55 : 0.4] }),
				transform: [
					{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, good ? 1.18 : 1.08] }) }
				]
			}
		: null;
	// Rahmen und Schleier pulsieren nur in der schlechten Phase.
	const alarmStyle =
		animate && !good
			? {
					borderColor: pulse.interpolate({
						inputRange: [0, 1],
						outputRange: [`${tone}40`, tone]
					}),
					backgroundColor: pulse.interpolate({
						inputRange: [0, 1],
						outputRange: [`${tone}14`, `${tone}2e`]
					})
				}
			: null;

	const trendText = data.trend > 0 ? `↑ ${data.trend}` : data.trend < 0 ? `↓ ${Math.abs(data.trend)}` : '→';
	const trendColor =
		data.trend > 0 ? colors.success : data.trend < 0 ? colors.danger : colors.fg + textAlpha.muted;

	return (
		<Pressable onPress={() => router.push('/stats')}>
			{({ pressed }) => (
				<Animated.View
					style={[
						styles.box,
						{ borderColor: `${tone}40`, backgroundColor: `${tone}14` },
						alarmStyle,
						pressed && { opacity: 0.85 }
					]}
				>
					<View style={styles.head}>
						<Animated.Text style={[styles.emoji, emojiStyle]}>{data.level.emoji}</Animated.Text>
						<View style={{ flex: 1 }}>
							<Text style={styles.kicker}>ZUGKRAFT</Text>
							<View style={styles.valueRow}>
								<Text style={[styles.percent, { color: tone }]}>{data.percent}%</Text>
								<Text style={[styles.label, { color: tone }]}>{data.level.label}</Text>
								<Text style={[styles.trend, { color: trendColor }]}>{trendText}</Text>
							</View>
						</View>
						{/* Feuerwerk nur in der Spitzenphase — sonst nichts. */}
						{animate && good ? (
							<Animated.Text style={[styles.flames, emojiStyle]}>🔥🔥🔥</Animated.Text>
						) : null}
					</View>

					<ProgressBar percent={data.percent} color={tone} height={6} />

					<Text style={styles.blurb}>{data.level.blurb}</Text>
					<Text style={styles.context}>
						{`Letzte 2 Wochen ⌀ ${data.avgPast} von ${data.memberCount} · kommende Woche ⌀ ${data.avgUpcoming}`}
					</Text>

					{data.sessions.length > 0 ? (
						<View style={styles.list}>
							{data.sessions.map((s) => (
								<View key={s.sessionId} style={styles.row}>
									<Text style={[styles.rowDate, s.isPast && styles.rowPast]} numberOfLines={1}>
										{formatShortDate(s.date)}
										{s.isPast ? '' : ' · geplant'}
									</Text>
									<View style={styles.rowBar}>
										<ProgressBar
											percent={s.percent}
											color={s.isPast ? `${tone}99` : tone}
											height={4}
										/>
									</View>
									<Text style={[styles.rowCount, s.isPast && styles.rowPast]}>
										{s.attending}/{s.total}
									</Text>
								</View>
							))}
						</View>
					) : null}
				</Animated.View>
			)}
		</Pressable>
	);
}

const makeStyles = (colors: ThemeColors) =>
	StyleSheet.create({
		box: {
			borderRadius: radius.md,
			borderWidth: 1,
			paddingHorizontal: space.md,
			paddingVertical: space.md,
			gap: 10
		},
		head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
		emoji: { fontSize: 38, lineHeight: 44 },
		flames: { fontSize: 15, lineHeight: 20 },
		kicker: {
			color: colors.fg + textAlpha.muted,
			fontFamily: fonts.sansSemi,
			fontSize: 11,
			lineHeight: 14,
			letterSpacing: 1.2
		},
		valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
		percent: { fontFamily: fonts.displayMedium, fontSize: 40, lineHeight: 44 },
		label: { fontFamily: fonts.sansBold, fontSize: 15, lineHeight: 20 },
		trend: { fontFamily: fonts.sansSemi, fontSize: 13, lineHeight: 18 },
		blurb: {
			color: colors.fg + textAlpha.primary,
			fontFamily: fonts.sansMedium,
			fontSize: 13,
			lineHeight: 18
		},
		context: {
			color: colors.fg + textAlpha.secondary,
			fontFamily: fonts.sans,
			fontSize: 12,
			lineHeight: 16
		},
		list: { gap: 6, marginTop: 2 },
		row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
		rowDate: {
			width: 108,
			color: colors.fg + textAlpha.secondary,
			fontFamily: fonts.sans,
			fontSize: 11,
			lineHeight: 15
		},
		rowBar: { flex: 1 },
		rowCount: {
			minWidth: 34,
			textAlign: 'right',
			color: colors.fg + textAlpha.secondary,
			fontFamily: fonts.sansSemi,
			fontSize: 11,
			lineHeight: 15
		},
		rowPast: { color: colors.fg + textAlpha.muted }
	});
