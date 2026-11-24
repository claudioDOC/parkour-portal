import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, StyleSheet, type BoxShadowValue } from 'react-native';
import { getZugAlarm } from './api';
import { getMotion } from './prefs';
import { onDataRefreshed } from './store';

/**
 * Bildschirm-Alarm: Steht das Zug-O-Meter auf „Katastrophe", pulsiert ein
 * roter Rahmen um den ganzen Bildschirm — auf jeder Seite, nicht nur auf der
 * Startseite. Wer ihn sieht, entscheidet der Server (/api/v1/zug-alarm,
 * Probelauf: nur Admins), so lässt er sich ohne App-Update für alle
 * freischalten.
 *
 * Optik wie im Web (.zug-screen-alarm in src/app.css): gleiche Farbe wie
 * der Katastrophe-Balken (#991b1b), aber zurückhaltend — 3-px-Rand plus
 * Schein nach innen in drei Lagen. Nur die Deckkraft atmet (0,4 → 1),
 * langsamer als der Balken: 2 s statt 1,2 s. Der Rand ist hier ein echter
 * Border, der Schein liegt innen daran an. Berührungen gehen durch.
 *
 * Nachgefragt wird beim Start, bei jeder Rückkehr in die App, jede Minute
 * und sofort, wenn die Trainingsdaten frisch geladen wurden (An- oder
 * Abmeldung) — höchstens alle 5 Sekunden.
 */

/** Katastrophe-Farbe des Balkens (#991b1b, LEVEL_COLOR in ZugkraftCard). */
const RED = 'rgba(153, 27, 27, 0.85)';
const GLOW: BoxShadowValue[] = [
	{ offsetX: 0, offsetY: 0, blurRadius: 10, spreadDistance: 3, color: 'rgba(153, 27, 27, 0.55)', inset: true },
	{ offsetX: 0, offsetY: 0, blurRadius: 24, spreadDistance: 8, color: 'rgba(153, 27, 27, 0.32)', inset: true },
	{ offsetX: 0, offsetY: 0, blurRadius: 46, spreadDistance: 14, color: 'rgba(153, 27, 27, 0.14)', inset: true }
];

export function ZugAlarmFrame() {
	const [on, setOn] = useState(false);
	const busy = useRef(false);
	const last = useRef(0);

	const check = useCallback(async (force = false) => {
		if (busy.current) return;
		if (!force && Date.now() - last.current < 5_000) return;
		busy.current = true;
		last.current = Date.now();
		try {
			const r = await getZugAlarm();
			setOn(r.alarm === true);
		} catch {
			// Offline oder ältere Server-Version: letzten Stand behalten.
		} finally {
			busy.current = false;
		}
	}, []);

	useEffect(() => {
		void check(true);
		const interval = setInterval(() => {
			if (AppState.currentState === 'active') void check();
		}, 60_000);
		const sub = AppState.addEventListener('change', (state) => {
			if (state === 'active') void check();
		});
		const off = onDataRefreshed((key) => {
			if (key === 'training') void check();
		});
		return () => {
			clearInterval(interval);
			sub.remove();
			off();
		};
	}, [check]);

	if (!on) return null;
	return <Pulse />;
}

function Pulse() {
	const motion = getMotion();
	const breath = useRef(new Animated.Value(0.85)).current;

	useEffect(() => {
		if (!motion) {
			breath.setValue(0.85);
			return;
		}
		breath.setValue(0.4);
		// 2 s pro Atemzug — ruhiger als der Alarm-Balken (1,2 s).
		const step = (toValue: number) =>
			Animated.timing(breath, {
				toValue,
				duration: 1000,
				easing: Easing.inOut(Easing.sin),
				useNativeDriver: true
			});
		const loop = Animated.loop(Animated.sequence([step(1), step(0.4)]));
		loop.start();
		return () => loop.stop();
	}, [motion, breath]);

	return (
		<Animated.View
			pointerEvents="none"
			// Als Textur zwischenspeichern: Animiert wird nur die Deckkraft, der
			// weiche Schein muss so nicht in jedem Bild neu gezeichnet werden.
			renderToHardwareTextureAndroid
			style={[StyleSheet.absoluteFill, styles.frame, { opacity: breath }]}
		/>
	);
}

const styles = StyleSheet.create({
	frame: {
		zIndex: 1000,
		borderWidth: 3,
		borderColor: RED,
		boxShadow: GLOW
	}
});
