import { useEffect } from 'react';
import { Animated, Easing } from 'react-native';

/**
 * Gemeinsamer Alarm-Puls für Zug-O-Meter-Balken und Bildschirm-Rahmen.
 *
 * Beide hängen am SELBEN Wert (0 → 1 → 0 in 1,2 s, nativer Treiber) und
 * pulsieren dadurch exakt im gleichen Takt — auch wenn der Balken erst
 * später erscheint (Startseite) oder nach einem Seitenwechsel neu entsteht.
 * Zwei eigene Schleifen würden versetzt starten und mit der Zeit
 * auseinanderlaufen. Die Schleife läuft nur, solange jemand mitpulst.
 */
const pulse = new Animated.Value(0);
let users = 0;
let loop: Animated.CompositeAnimation | null = null;

const step = (toValue: number) =>
	Animated.timing(pulse, {
		toValue,
		duration: 600,
		easing: Easing.inOut(Easing.sin),
		useNativeDriver: true
	});

/** Liefert den gemeinsamen Puls; `active` = diese Ansicht pulst gerade mit. */
export function useAlarmPulse(active: boolean): Animated.Value {
	useEffect(() => {
		if (!active) return;
		users += 1;
		if (users === 1) {
			pulse.setValue(0);
			loop = Animated.loop(Animated.sequence([step(1), step(0)]));
			loop.start();
		}
		return () => {
			users -= 1;
			if (users === 0) {
				loop?.stop();
				loop = null;
			}
		};
	}, [active]);
	return pulse;
}
