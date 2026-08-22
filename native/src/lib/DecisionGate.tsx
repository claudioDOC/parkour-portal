import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { fonts, type ThemeColors } from './theme';
import { textAlpha } from './tokens';
import { useTheme, useThemedStyles } from './themeContext';
import { Sheet, Button, Input } from './ui';
import {
	getPendingExtra,
	getPendingTrip,
	trainingAction,
	tripAction,
	type PendingExtra
} from './api';
import { readToken, writeToken } from './tokenStore';

/**
 * Fragt beim App-Start nach offenen Entscheidungen — erst das
 * Zusatztraining, dann der Trip.
 *
 * Beim Zusatztraining zählt nur die ausdrückliche Antwort: Wer nichts sagt,
 * ist weder dabei noch abgemeldet. Ohne Nachfrage geht so ein spontaner
 * Termin schlicht unter. „Später" schiebt die Frage lokal zwei Stunden
 * weg; die Push-Erinnerung kommt ohnehin drei Stunden vor Beginn.
 */
const SNOOZE_KEY = 'gate-snooze';
const SNOOZE_MS = 2 * 60 * 60 * 1000;

type PendingTrip = {
	id: number;
	title: string;
	startDate: string;
	creatorName: string | null;
	inCount: number;
};

async function isSnoozed(key: string): Promise<boolean> {
	try {
		const raw = await readToken(SNOOZE_KEY);
		if (!raw) return false;
		const map = JSON.parse(raw) as Record<string, number>;
		return typeof map[key] === 'number' && Date.now() - map[key] < SNOOZE_MS;
	} catch {
		return false;
	}
}

async function snooze(key: string): Promise<void> {
	try {
		const raw = await readToken(SNOOZE_KEY);
		const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
		map[key] = Date.now();
		await writeToken(SNOOZE_KEY, JSON.stringify(map));
	} catch {
		/* Dialog ist Beiwerk — nie stören */
	}
}

function prettyDate(d: string): string {
	return new Date(`${d}T12:00:00`).toLocaleDateString('de-CH', {
		weekday: 'long',
		day: 'numeric',
		month: 'long'
	});
}

export function DecisionGate({ onDecided }: { onDecided?: () => void }) {
	const { colors } = useTheme();
	const styles = useThemedStyles(makeStyles);
	const [extra, setExtra] = useState<PendingExtra | null>(null);
	const [trip, setTrip] = useState<PendingTrip | null>(null);
	const [reason, setReason] = useState('');
	const [busy, setBusy] = useState(false);
	const [errorMsg, setErrorMsg] = useState('');

	const load = useCallback(async () => {
		try {
			const res = await getPendingExtra();
			if (res.session && !(await isSnoozed(`extra-${res.session.id}`))) {
				setExtra(res.session);
				return;
			}
			setExtra(null);
		} catch {
			setExtra(null);
		}
		try {
			const res = await getPendingTrip();
			if (res.trip && !(await isSnoozed(`trip-${res.trip.id}`))) {
				setTrip(res.trip as PendingTrip);
			} else {
				setTrip(null);
			}
		} catch {
			setTrip(null);
		}
	}, []);

	useEffect(() => {
		// Kurz warten, damit der Start-Bildschirm nicht sofort überdeckt wird.
		const t = setTimeout(() => void load(), 2500);
		return () => clearTimeout(t);
	}, [load]);

	const run = async (fn: () => Promise<unknown>) => {
		setBusy(true);
		setErrorMsg('');
		try {
			await fn();
			setExtra(null);
			setTrip(null);
			setReason('');
			onDecided?.();
			await load(); // ggf. die nächste offene Entscheidung
		} catch (e) {
			setErrorMsg(e instanceof Error ? e.message : 'Hat nicht geklappt — nochmal?');
		} finally {
			setBusy(false);
		}
	};

	if (extra) {
		const len = reason.trim().length;
		return (
			<Sheet
				visible
				onClose={() => {
					void snooze(`extra-${extra.id}`);
					setExtra(null);
				}}
				title="Zusatztraining"
			>
				<Text style={styles.headline}>{prettyDate(extra.date)}</Text>
				<Text style={styles.meta}>
					{extra.timeStart} – {extra.timeEnd}
					{extra.createdByName ? ` · von ${extra.createdByName}` : ''}
				</Text>
				<Text style={styles.meta}>
					{extra.inCount} dabei, {extra.outCount} abgesagt
				</Text>
				{extra.note ? <Text style={styles.note}>{extra.note}</Text> : null}
				<Text style={styles.question}>Bist du dabei? Ohne Antwort zählst du nicht mit.</Text>
				{errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}
				<Input
					placeholder="Grund (optional, nur bei Absage)"
					value={reason}
					onChangeText={setReason}
				/>
				{busy ? <ActivityIndicator color={colors.accent} /> : null}
				<View style={styles.actions}>
					<Button
						label="Ich bin dabei"
						disabled={busy}
						onPress={() => void run(() => trainingAction('rsvp_yes', extra.id))}
					/>
					<Button
						label="Kann nicht"
						kind="ghost"
						disabled={busy || (len > 0 && len < 10)}
						onPress={() =>
							void run(() => trainingAction('absence', extra.id, { reason: reason.trim() }))
						}
					/>
					<Button
						label="Später"
						kind="ghost"
						disabled={busy}
						onPress={() => {
							void snooze(`extra-${extra.id}`);
							setExtra(null);
						}}
					/>
				</View>
			</Sheet>
		);
	}

	if (trip) {
		return (
			<Sheet
				visible
				onClose={() => {
					void snooze(`trip-${trip.id}`);
					setTrip(null);
				}}
				title="Trip-Abstimmung"
			>
				<Text style={styles.headline}>{trip.title}</Text>
				<Text style={styles.meta}>
					{prettyDate(trip.startDate)}
					{trip.creatorName ? ` · von ${trip.creatorName}` : ''}
				</Text>
				<Text style={styles.meta}>{trip.inCount} dabei</Text>
				<Text style={styles.question}>Bist du dabei?</Text>
				{errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}
				{busy ? <ActivityIndicator color={colors.accent} /> : null}
				<View style={styles.actions}>
					<Button
						label="Ich bin dabei"
						disabled={busy}
						onPress={() =>
							void run(() => tripAction('join_trip', trip.id, { transportMode: 'mitfahrt' }))
						}
					/>
					<Button
						label="Nicht dabei"
						kind="ghost"
						disabled={busy}
						onPress={() => void run(() => tripAction('decline_trip', trip.id))}
					/>
					<Button
						label="Weiss noch nicht"
						kind="ghost"
						disabled={busy}
						onPress={() => void run(() => tripAction('abstain_trip', trip.id))}
					/>
				</View>
			</Sheet>
		);
	}

	return null;
}

const makeStyles = (colors: ThemeColors) =>
	StyleSheet.create({
		headline: { color: colors.text, fontFamily: fonts.sansBold, fontSize: 18 },
		meta: { color: colors.fg + textAlpha.secondary, fontSize: 13, lineHeight: 18 },
		note: {
			color: colors.fg + textAlpha.secondary,
			backgroundColor: colors.fg + '0d',
			borderRadius: 10,
			paddingHorizontal: 10,
			paddingVertical: 8,
			fontSize: 13,
			lineHeight: 18
		},
		question: { color: colors.text, fontFamily: fonts.sansBold, fontSize: 14, marginTop: 4 },
		error: { color: colors.danger, fontSize: 13 },
		actions: { gap: 8, marginTop: 4 }
	});
