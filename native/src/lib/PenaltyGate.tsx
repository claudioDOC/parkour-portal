import { useEffect, useState } from 'react';
import { AppState, Modal, View, Text, StyleSheet, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { fonts } from './theme';
import { getMyPenalty, type ActivePenalty } from './api';

/**
 * Strafrunde: Wer ohne Abmeldung gefehlt hat, sieht bei jedem Kaltstart
 * diesen Hinweis — 20 Sekunden lang ohne Ausweg. Bewusst kein Snooze und
 * kein gespeicherter Zustand: Die Strafe soll nerven, bis das nächste
 * Training beginnt (Phase „warning"). Der Text ist auf jeder Stufe derselbe
 * und droht nur vage „weitere Konsequenzen" an — ob der falsche Spot kommt
 * (Stufe 2), verrät er nicht.
 */
const HOLD_SECONDS = 20;

function prettyDate(d: string): string {
	return new Date(`${d}T12:00:00`).toLocaleDateString('de-CH', {
		weekday: 'long',
		day: 'numeric',
		month: 'long'
	});
}

export function PenaltyGate() {
	const [penalty, setPenalty] = useState<ActivePenalty | null>(null);
	const [left, setLeft] = useState(HOLD_SECONDS);
	const [dismissed, setDismissed] = useState(false);

	useEffect(() => {
		let alive = true;
		const load = () => {
			void getMyPenalty()
				.then((res) => {
					if (alive && res.penalty && res.penalty.phase === 'warning') setPenalty(res.penalty);
				})
				.catch(() => undefined);
		};
		load();
		// Die Strafe kann entstehen, während die App im Hintergrund liegt —
		// dann kommt der Push, aber kein Kaltstart. Darum auch beim Zurückkehren
		// prüfen; einmal weggeklickt bleibt sie bis zum nächsten Kaltstart weg.
		const sub = AppState.addEventListener('change', (state) => {
			if (state === 'active') load();
		});
		return () => {
			alive = false;
			sub.remove();
		};
	}, []);

	useEffect(() => {
		if (!penalty || dismissed || left <= 0) return;
		const t = setTimeout(() => setLeft((n) => n - 1), 1000);
		return () => clearTimeout(t);
	}, [penalty, dismissed, left]);

	if (!penalty || dismissed) return null;
	const ready = left <= 0;

	return (
		<Modal visible transparent={false} animationType="fade" onRequestClose={() => undefined}>
			<View style={styles.screen}>
				<Ionicons name="warning" size={96} color="#ffd166" />
				<Text style={styles.title}>Nicht abgemeldet!</Text>
				<Text style={styles.body}>
					Am {prettyDate(penalty.missed.date)} warst du nicht im Training und hast dich nicht
					abgemeldet.
				</Text>
				<Text style={styles.body}>
					Bis {prettyDate(penalty.penalty.date)} siehst du bei „Wer zieht" nur Fragezeichen. Beim
					nächsten Mal drohen weitere Konsequenzen.
				</Text>
				<Text style={styles.hint}>Nächstes Mal: abmelden. Dauert zehn Sekunden.</Text>
				<Pressable
					disabled={!ready}
					onPress={() => setDismissed(true)}
					style={({ pressed }) => [styles.button, !ready && styles.buttonLocked, pressed && ready && { opacity: 0.8 }]}
				>
					<Text style={styles.buttonText}>{ready ? 'Verstanden' : `Verstanden (${left})`}</Text>
				</Pressable>
			</View>
		</Modal>
	);
}

const styles = StyleSheet.create({
	screen: {
		flex: 1,
		backgroundColor: '#5a0f14',
		alignItems: 'center',
		justifyContent: 'center',
		paddingHorizontal: 28,
		gap: 16
	},
	title: {
		color: '#ffffff',
		fontFamily: fonts.sansBold,
		fontSize: 34,
		lineHeight: 40,
		textAlign: 'center',
		letterSpacing: 0.5
	},
	body: {
		color: '#ffffffe6',
		fontFamily: fonts.sans,
		fontSize: 17,
		lineHeight: 25,
		textAlign: 'center'
	},
	hint: {
		color: '#ffd166',
		fontFamily: fonts.sansSemi,
		fontSize: 14,
		lineHeight: 20,
		textAlign: 'center',
		marginTop: 4
	},
	button: {
		marginTop: 20,
		backgroundColor: '#ffd166',
		borderRadius: 14,
		paddingHorizontal: 28,
		paddingVertical: 14,
		minWidth: 200,
		alignItems: 'center'
	},
	buttonLocked: { backgroundColor: '#ffffff33' },
	buttonText: { color: '#1a0508', fontFamily: fonts.sansBold, fontSize: 16 }
});
