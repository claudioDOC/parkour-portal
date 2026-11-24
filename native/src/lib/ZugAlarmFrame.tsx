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
 * der Katastrophe-Balken (#991b1b), KEINE Linie — nur weicher Schein ohne
 * Spread am Rand, der in drei Lagen nach innen ausläuft (Vignette).
 *
 * Puls: 3,2 s pro Atemzug, Deckkraft 0,3 → 1 → 0,3 als Sinus. Bewusst EINE
 * lineare Animation 0 → 1 mit Sinus-Abbildung statt einer Folge
 * hin/zurück: `Animated.loop` kann eine `Animated.sequence` nicht nativ
 * wiederholen und startet sie jede Runde über JavaScript neu — ist JS
 * gerade beschäftigt, stockt der Rahmen am Umkehrpunkt. Eine einzelne
 * Animation läuft nativ endlos, ganz ohne JS.
 * Berührungen gehen durch.
 *
 * Nachgefragt wird beim Start, bei jeder Rückkehr in die App, jede Minute
 * und sofort, wenn die Trainingsdaten frisch geladen wurden (An- oder
 * Abmeldung) — höchstens alle 5 Sekunden.
 */

/** Katastrophe-Farbe des Balkens (#991b1b, LEVEL_COLOR in ZugkraftCard). */
const GLOW: BoxShadowValue[] = [
	{ offsetX: 0, offsetY: 0, blurRadius: 26, spreadDistance: 0, color: 'rgba(153, 27, 27, 0.85)', inset: true },
	{ offsetX: 0, offsetY: 0, blurRadius: 60, spreadDistance: 4, color: 'rgba(153, 27, 27, 0.36)', inset: true },
	{ offsetX: 0, offsetY: 0, blurRadius: 110, spreadDistance: 10, color: 'rgba(153, 27, 27, 0.14)', inset: true }
];

/** Ein Atemzug in ms. */
const PERIOD = 3200;
/** Sinus-Kurve als Stützstellen: t 0 → 1 ergibt Deckkraft 0,3 → 1 → 0,3. */
const STEPS = 32;
const SINE_IN = Array.from({ length: STEPS + 1 }, (_, i) => i / STEPS);
const SINE_OUT = SINE_IN.map((t) => 0.3 + 0.7 * ((1 - Math.cos(2 * Math.PI * t)) / 2));

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
	const t = useRef(new Animated.Value(0)).current;

	useEffect(() => {
		if (!motion) return;
		t.setValue(0);
		// Einzelne Animation → läuft nativ endlos (siehe oben), kein Stocken.
		const loop = Animated.loop(
			Animated.timing(t, {
				toValue: 1,
				duration: PERIOD,
				easing: Easing.linear,
				useNativeDriver: true
			})
		);
		loop.start();
		return () => loop.stop();
	}, [motion, t]);

	const opacity = motion ? t.interpolate({ inputRange: SINE_IN, outputRange: SINE_OUT }) : 0.85;

	return (
		<Animated.View
			pointerEvents="none"
			// Als Textur zwischenspeichern: Animiert wird nur die Deckkraft, der
			// weiche Schein muss so nicht in jedem Bild neu gezeichnet werden.
			renderToHardwareTextureAndroid
			style={[StyleSheet.absoluteFill, styles.frame, { opacity }]}
		/>
	);
}

const styles = StyleSheet.create({
	frame: {
		zIndex: 1000,
		boxShadow: GLOW
	}
});
