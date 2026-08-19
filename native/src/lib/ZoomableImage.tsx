import { useRef } from 'react';
import { Animated, StyleSheet, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import {
	Gesture,
	GestureDetector,
	GestureHandlerRootView
} from 'react-native-gesture-handler';

/**
 * Bild mit Zoom — zwei Finger zum Vergrössern, ziehen zum Verschieben,
 * Doppeltippen wechselt zwischen normal und vergrössert.
 *
 * Warum die Gesten-Bibliothek statt der Rohereignisse: Mit PanResponder
 * kam die Zwei-Finger-Geste auf dem Gerät schlicht nicht an — auf Android
 * liefert die Touch-Liste dort nicht zuverlässig beide Finger. Die native
 * Bibliothek steckt ohnehin in jeder ausgelieferten App-Datei (geprüft in
 * 1.7 und 1.9), es braucht also keine Neuinstallation.
 *
 * Die Rückmeldungen laufen bewusst über runOnJS auf dem JS-Strang: So
 * genügen die eingebauten Animated-Werte, ohne Worklets.
 */
const MAX_SCALE = 5;

export function ZoomableImage({
	uri,
	style,
	onSingleTap
}: {
	uri: string;
	style?: ViewStyle;
	/** Einfacher Tipp ohne Zoom — z. B. zum Schliessen. */
	onSingleTap?: () => void;
}) {
	const scale = useRef(new Animated.Value(1)).current;
	const tx = useRef(new Animated.Value(0)).current;
	const ty = useRef(new Animated.Value(0)).current;
	/** Animated.Value gibt seinen Wert nicht synchron her — darum ein Spiegel. */
	const s = useRef({ scale: 1, tx: 0, ty: 0, baseScale: 1, baseTx: 0, baseTy: 0 }).current;

	const settle = (toScale: number, toTx: number, toTy: number) => {
		s.scale = toScale;
		s.tx = toTx;
		s.ty = toTy;
		Animated.parallel([
			Animated.timing(scale, { toValue: toScale, duration: 160, useNativeDriver: false }),
			Animated.timing(tx, { toValue: toTx, duration: 160, useNativeDriver: false }),
			Animated.timing(ty, { toValue: toTy, duration: 160, useNativeDriver: false })
		]).start();
	};

	const pinch = Gesture.Pinch()
		.runOnJS(true)
		.onStart(() => {
			s.baseScale = s.scale;
		})
		.onUpdate((e) => {
			const next = Math.min(MAX_SCALE, Math.max(0.8, s.baseScale * e.scale));
			s.scale = next;
			scale.setValue(next);
		})
		.onEnd(() => {
			if (s.scale < 1.05) settle(1, 0, 0);
		});

	const pan = Gesture.Pan()
		.runOnJS(true)
		.minPointers(1)
		// Ohne Mindestweg würde schon ein Tipp als Ziehen gelten.
		.minDistance(6)
		.averageTouches(true)
		.onStart(() => {
			s.baseTx = s.tx;
			s.baseTy = s.ty;
		})
		.onUpdate((e) => {
			// Verschieben lohnt nur im vergrösserten Zustand.
			if (s.scale <= 1.01) return;
			s.tx = s.baseTx + e.translationX;
			s.ty = s.baseTy + e.translationY;
			tx.setValue(s.tx);
			ty.setValue(s.ty);
		});

	const doubleTap = Gesture.Tap()
		.runOnJS(true)
		.numberOfTaps(2)
		.maxDuration(300)
		.onEnd(() => settle(s.scale > 1.01 ? 1 : 2.5, 0, 0));

	const singleTap = Gesture.Tap()
		.runOnJS(true)
		.numberOfTaps(1)
		.onEnd(() => {
			if (s.scale <= 1.01 && onSingleTap) onSingleTap();
		});

	/**
	 * Wer zuerst anspricht, gewinnt: Tippen oder Bewegen. Innerhalb der
	 * Tipp-Gesten hat der Doppeltipp Vorrang — sonst schlösse der erste
	 * Tipp das Bild, bevor der zweite ankommt.
	 */
	const gesture = Gesture.Race(
		Gesture.Simultaneous(pinch, pan),
		Gesture.Exclusive(doubleTap, singleTap)
	);

	return (
		<GestureHandlerRootView style={[styles.root, style]}>
			<GestureDetector gesture={gesture}>
				<Animated.View
					style={[
						styles.fill,
						{ transform: [{ translateX: tx }, { translateY: ty }, { scale }] }
					]}
				>
					<Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="contain" />
				</Animated.View>
			</GestureDetector>
		</GestureHandlerRootView>
	);
}

const styles = StyleSheet.create({
	root: { width: '100%', height: '80%' },
	fill: { flex: 1 }
});
