import { useEffect, useRef } from 'react';
import { View, Text, Animated, Easing, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { fonts, type ThemeColors } from './theme';

/**
 * Startanimation in EINEM Guss: Sie beginnt exakt im Zustand des nativen
 * Splashs (Logo 120px, mittig, gleicher Hintergrund) — dadurch ist der
 * Übergang unsichtbar und es wirkt wie ein einziger Splash. Danach:
 * Wortmarke gleitet unter dem Logo herein, Akzentstrich zieht durch,
 * alles blendet aus. Gesamt ≈ 0,9 Sekunden.
 *
 * Wichtig: Die Wortmarke ist absolut positioniert, damit das Logo beim
 * Einblenden des Texts keinen Millimeter springt.
 */
export function Splash({ colors, onDone }: { colors: ThemeColors; onDone: () => void }) {
	const word = useRef(new Animated.Value(0)).current;
	const line = useRef(new Animated.Value(0)).current;
	const breathe = useRef(new Animated.Value(1)).current;
	const fade = useRef(new Animated.Value(1)).current;

	useEffect(() => {
		// Sicherung: nie hängen bleiben, falls das System die Animation stoppt.
		const failsafe = setTimeout(onDone, 2600);
		Animated.parallel([
			Animated.timing(breathe, {
				toValue: 1.05,
				duration: 500,
				easing: Easing.out(Easing.cubic),
				useNativeDriver: true
			}),
			Animated.timing(word, {
				toValue: 1,
				duration: 300,
				delay: 60,
				easing: Easing.out(Easing.cubic),
				useNativeDriver: true
			}),
			Animated.timing(line, {
				toValue: 1,
				duration: 360,
				delay: 140,
				easing: Easing.out(Easing.cubic),
				useNativeDriver: true
			}),
			Animated.timing(fade, {
				toValue: 0,
				duration: 240,
				delay: 1640,
				easing: Easing.in(Easing.cubic),
				useNativeDriver: true
			})
		]).start(({ finished }) => {
			clearTimeout(failsafe);
			if (finished) onDone();
		});
		return () => clearTimeout(failsafe);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return (
		<Animated.View style={[styles.root, { opacity: fade }]}>
			{/* Logo exakt wie der native Splash: 120px, mittig, keine Verschiebung. */}
			<View style={styles.center}>
				<Animated.View style={{ transform: [{ scale: breathe }] }}>
					<Image
						source={require('../../assets/images/icon.png')}
						style={{ width: 120, height: 120 }}
						contentFit="contain"
					/>
				</Animated.View>
			</View>

			<Animated.View
				style={[
					styles.wordWrap,
					{
						opacity: word,
						transform: [
							{ translateY: word.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }
						]
					}
				]}
			>
				<Text style={styles.word}>PARKOUR</Text>
				{/* Einzelbuchstaben mit echtem Abstand — letterSpacing schnitt auf
				    manchen Geräten den letzten Buchstaben ab. */}
				<View style={styles.subRow}>
					{'PORTAL'.split('').map((c, i) => (
						<Text key={i} style={[styles.sub, { color: colors.accent }]}>
							{c}
						</Text>
					))}
				</View>
				<Animated.View
					style={[
						styles.line,
						{ backgroundColor: colors.accent, opacity: line, transform: [{ scaleX: line }] }
					]}
				/>
			</Animated.View>
		</Animated.View>
	);
}

const styles = StyleSheet.create({
	root: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		backgroundColor: '#0d0d0f'
	},
	center: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		alignItems: 'center',
		justifyContent: 'center'
	},
	wordWrap: {
		position: 'absolute',
		top: '50%',
		left: 0,
		right: 0,
		marginTop: 76,
		alignItems: 'center'
	},
	word: {
		color: '#f5f5f7',
		fontFamily: fonts.display,
		fontSize: 34,
		letterSpacing: 2,
		lineHeight: 38,
		textAlign: 'center',
		paddingLeft: 2
	},
	subRow: { flexDirection: 'row', gap: 5, marginTop: 2 },
	sub: {
		// Bewusst Systemschrift: Plus Jakarta meldet Android zu schmale
		// Buchstabenbreiten — erst fehlte das L, dann war das O angeschnitten.
		fontWeight: '700',
		fontSize: 12,
		lineHeight: 16,
		paddingHorizontal: 1
	},
	line: { width: 110, height: 3, borderRadius: 1.5, marginTop: 8 }
});
