import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { fonts, type ThemeColors } from './theme';
import { textAlpha } from './tokens';
import { useTheme, useThemedStyles } from './themeContext';
import { getMotion } from './prefs';
import type { Zugkraft, ZugkraftLevelKey } from './api';

/**
 * Zugkraft-Barometer auf der Startseite — absichtlich klein.
 *
 * Eine Zeile Kopf, ein farbiger Balken als Blickfang, ein Satz. Mehr würde
 * das Dashboard zudecken; die Details stehen in der Statistik. Der Balken
 * trägt den Effekt: in der guten Phase leuchtet er auf, im Notstand pocht
 * er rot. Dazwischen bleibt alles ruhig.
 */

/** Levelfarbe: eine Farbe trägt die Zeile, sonst wird es Kirmes. */
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

export function ZugkraftCard({ data }: { data: Zugkraft }) {
	const { colors } = useTheme();
	const styles = useThemedStyles(makeStyles);
	const router = useRouter();
	const tone = colorFor(data.level.key, colors);
	// Nur die Extreme dürfen zappeln; „Bewegung reduzieren" schlägt alles.
	const animate = data.level.intensity === 2 && getMotion();
	const good = data.level.key === 'legendaer';
	const pulse = useRef(new Animated.Value(0)).current;

	useEffect(() => {
		if (!animate) {
			pulse.setValue(0);
			return;
		}
		const loop = Animated.loop(
			Animated.sequence([
				Animated.timing(pulse, {
					toValue: 1,
					duration: good ? 1100 : 750,
					easing: Easing.inOut(Easing.quad),
					useNativeDriver: false
				}),
				Animated.timing(pulse, {
					toValue: 0,
					duration: good ? 1100 : 750,
					easing: Easing.inOut(Easing.quad),
					useNativeDriver: false
				})
			])
		);
		loop.start();
		return () => loop.stop();
	}, [animate, good, pulse]);

	// Guter Fall: der Balken wird heller. Schlechter Fall: er pocht kräftig.
	const barOpacity = animate ? pulse.interpolate({ inputRange: [0, 1], outputRange: good ? [0.75, 1] : [0.55, 1] }) : 1;

	return (
		<Pressable
			onPress={() => router.push('/stats')}
			style={({ pressed }) => [styles.wrap, pressed && { opacity: 0.7 }]}
			accessibilityRole="button"
			accessibilityLabel={`Zugkraft ${data.percent} Prozent, ${data.level.label}`}
		>
			<View style={styles.head}>
				<Text style={styles.emoji}>{data.level.emoji}</Text>
				<Text style={[styles.percent, { color: tone }]}>{data.percent}%</Text>
				<Text style={styles.label} numberOfLines={1}>
					Zugkraft · {data.level.label}
				</Text>
				{data.trend !== 0 ? (
					<Text style={[styles.trend, { color: data.trend > 0 ? colors.success : colors.danger }]}>
						{data.trend > 0 ? '↑' : '↓'}
						{Math.abs(data.trend)}
					</Text>
				) : null}
				<Text style={styles.avg}>
					⌀ {data.avgPast}/{data.memberCount}
				</Text>
			</View>

			<View style={styles.track}>
				<Animated.View
					style={[
						styles.fill,
						{
							backgroundColor: tone,
							opacity: barOpacity,
							width: `${Math.max(data.percent, 2)}%`
						}
					]}
				/>
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
		head: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
		emoji: { fontSize: 15 },
		percent: { fontFamily: fonts.sansBold, fontSize: 15, lineHeight: 20 },
		label: { color: colors.fg + textAlpha.secondary, fontFamily: fonts.sans, fontSize: 13, lineHeight: 18 },
		trend: { fontFamily: fonts.sansSemi, fontSize: 12, lineHeight: 16 },
		avg: {
			marginLeft: 'auto',
			color: colors.fg + textAlpha.muted,
			fontFamily: fonts.sans,
			fontSize: 11,
			lineHeight: 16
		},
		track: { height: 10, borderRadius: 999, backgroundColor: colors.fg + '14', overflow: 'hidden' },
		fill: { height: '100%', borderRadius: 999 },
		blurb: { color: colors.fg + textAlpha.muted, fontFamily: fonts.sans, fontSize: 11, lineHeight: 15 }
	});
