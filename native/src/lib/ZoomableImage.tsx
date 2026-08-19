import { useRef } from 'react';
import { Animated, PanResponder, StyleSheet, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';

/**
 * Bild mit Zoom — zwei Finger zum Vergrössern, danach ziehen zum
 * Verschieben, Doppeltippen wechselt zwischen normal und vergrössert.
 *
 * Bewusst nur mit Bordmitteln (PanResponder + Animated) gebaut: So kommt
 * die Funktion über das normale Update auf jedes Gerät, ohne dass jemand
 * eine neue App-Datei installieren muss.
 */
const MAX_SCALE = 5;
const DOUBLE_TAP_MS = 280;

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

	/**
	 * Animated.Value gibt seinen Wert nicht synchron her — darum ein
	 * Spiegel, aus dem die Gesten rechnen.
	 */
	const s = useRef({
		scale: 1,
		tx: 0,
		ty: 0,
		startDist: 0,
		startScale: 1,
		startTx: 0,
		startTy: 0,
		lastTapAt: 0,
		moved: false,
		/** Zählt jeden Tipp — entwertet den wartenden Einzeltipp beim Doppeltipp. */
		tapSeq: 0
	}).current;

	/**
	 * Bewusst OHNE nativen Antrieb.
	 *
	 * Sobald ein Wert einmal nativ animiert wurde, wirken spätere
	 * setValue-Aufrufe aus der Geste nicht mehr auf die Ansicht — nach dem
	 * ersten Doppeltipp liess sich deshalb weder zurückzoomen noch mit zwei
	 * Fingern etwas bewegen.
	 */
	const reset = (toScale = 1) => {
		s.scale = toScale;
		s.tx = 0;
		s.ty = 0;
		Animated.parallel([
			Animated.timing(scale, { toValue: toScale, duration: 160, useNativeDriver: false }),
			Animated.timing(tx, { toValue: 0, duration: 160, useNativeDriver: false }),
			Animated.timing(ty, { toValue: 0, duration: 160, useNativeDriver: false })
		]).start();
	};

	const responder = useRef(
		PanResponder.create({
			onStartShouldSetPanResponder: () => true,
			// Einfinger-Wischen nur abfangen, wenn wirklich vergrössert ist —
			// sonst bleibt das Schliessen per Tipp erhalten.
			onMoveShouldSetPanResponder: (e, g) =>
				e.nativeEvent.touches.length > 1 || s.scale > 1.01 || Math.abs(g.dx) + Math.abs(g.dy) > 6,
			onPanResponderGrant: () => {
				s.startDist = 0;
				s.startScale = s.scale;
				s.startTx = s.tx;
				s.startTy = s.ty;
				s.moved = false;
			},
			onPanResponderMove: (e, g) => {
				const touches = e.nativeEvent.touches;
				// Finger zittern immer ein wenig. Ohne Schwelle gilt jeder Tipp
				// als Bewegung — dann greift weder Doppeltipp noch Schliessen.
				const wandered = Math.abs(g.dx) + Math.abs(g.dy) > 8;
				if (touches.length > 1) {
					const [a, b] = touches;
					const dist = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
					if (!s.startDist) {
						s.startDist = dist;
						s.startScale = s.scale;
						return;
					}
					const next = Math.min(MAX_SCALE, Math.max(1, (s.startScale * dist) / s.startDist));
					s.scale = next;
					scale.setValue(next);
					if (Math.abs(dist - s.startDist) > 8) s.moved = true;
					return;
				}
				if (s.scale > 1.01 && wandered) {
					s.tx = s.startTx + g.dx;
					s.ty = s.startTy + g.dy;
					tx.setValue(s.tx);
					ty.setValue(s.ty);
					s.moved = true;
				}
			},
			onPanResponderRelease: () => {
				s.startDist = 0;
				const now = Date.now();
				if (!s.moved) {
					// Doppeltippen: rein und wieder raus.
					if (now - s.lastTapAt < DOUBLE_TAP_MS) {
						s.lastTapAt = 0;
						// Entwertet den wartenden Einzeltipp — sonst schloss der
						// Betrachter direkt nach dem Vergrössern wieder.
						s.tapSeq++;
						reset(s.scale > 1.01 ? 1 : 2.5);
						return;
					}
					s.lastTapAt = now;
					if (s.scale <= 1.01 && onSingleTap) {
						// Kurz warten, damit ein Doppeltipp Vorrang hat.
						const token = ++s.tapSeq;
						setTimeout(() => {
							if (s.tapSeq === token && s.scale <= 1.01) onSingleTap();
						}, DOUBLE_TAP_MS);
					}
					return;
				}
				if (s.scale <= 1.05) reset(1);
			}
		})
	).current;

	return (
		<Animated.View
			{...responder.panHandlers}
			style={[
				styles.wrap,
				style,
				{ transform: [{ translateX: tx }, { translateY: ty }, { scale }] }
			]}
		>
			<Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="contain" />
		</Animated.View>
	);
}

const styles = StyleSheet.create({
	wrap: { width: '100%', height: '80%' }
});
