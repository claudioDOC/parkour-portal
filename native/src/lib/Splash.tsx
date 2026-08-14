import { useEffect, useRef } from 'react';
import { View, Text, Animated, Easing, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { fonts, type ThemeColors } from './theme';

/**
 * Startanimation: Logo fährt hoch und wird scharf, Wortmarke blendet ein,
 * ein Akzentstrich zieht durch. Läuft rund 1,2 Sekunden und ersetzt den
 * statischen Startbildschirm.
 */
export function Splash({ colors, onDone }: { colors: ThemeColors; onDone: () => void }) {
	const logo = useRef(new Animated.Value(0)).current;
	const word = useRef(new Animated.Value(0)).current;
	const line = useRef(new Animated.Value(0)).current;
	const fade = useRef(new Animated.Value(1)).current;

	useEffect(() => {
		Animated.sequence([
			Animated.timing(logo, {
				toValue: 1,
				duration: 460,
				easing: Easing.out(Easing.back(1.4)),
				useNativeDriver: true
			}),
			Animated.parallel([
				Animated.timing(word, {
					toValue: 1,
					duration: 320,
					easing: Easing.out(Easing.cubic),
					useNativeDriver: true
				}),
				Animated.timing(line, {
					toValue: 1,
					duration: 420,
					easing: Easing.out(Easing.cubic),
					useNativeDriver: true
				})
			]),
			Animated.delay(220),
			Animated.timing(fade, {
				toValue: 0,
				duration: 280,
				easing: Easing.in(Easing.cubic),
				useNativeDriver: true
			})
		]).start(({ finished }) => {
			if (finished) onDone();
		});
	}, []);

	return (
		<Animated.View style={[styles.root, { backgroundColor: colors.bg, opacity: fade }]}>
			<Animated.View
				style={{
					opacity: logo,
					transform: [
						{ translateY: logo.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
						{ scale: logo.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }) }
					]
				}}
			>
				<Image
					source={require('../../assets/images/icon.png')}
					style={styles.logo}
					contentFit="contain"
				/>
			</Animated.View>

			<Animated.View style={{ opacity: word, alignItems: 'center' }}>
				<Text style={[styles.word, { color: colors.fg }]}>PARKOUR</Text>
				<Text style={[styles.sub, { color: colors.accent }]}>PORTAL</Text>
			</Animated.View>

			<Animated.View
				style={[
					styles.line,
					{
						backgroundColor: colors.accent,
						opacity: line,
						transform: [{ scaleX: line }]
					}
				]}
			/>
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
		alignItems: 'center',
		justifyContent: 'center',
		gap: 20
	},
	logo: { width: 96, height: 96, borderRadius: 24 },
	word: { fontFamily: fonts.display, fontSize: 38, letterSpacing: 2, lineHeight: 40 },
	sub: { fontFamily: fonts.sansSemi, fontSize: 12, letterSpacing: 6, lineHeight: 16, marginTop: 2 },
	line: { width: 120, height: 3, borderRadius: 2, marginTop: 4 }
});
