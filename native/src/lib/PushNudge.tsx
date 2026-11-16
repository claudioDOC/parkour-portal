import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { fonts, type ThemeColors } from './theme';
import { textAlpha } from './tokens';
import { useTheme, useThemedStyles } from './themeContext';
import { getPushStatus, setupPush, type PushStatus } from './pushSetup';
import { readToken, writeToken } from './tokenStore';

/**
 * Hinweis auf der Startseite, wenn Benachrichtigungen fehlen.
 *
 * Wer die Berechtigung beim ersten Start ablehnt, bekommt nie wieder eine
 * Frage von Android — und merkt nicht, dass ihm Spot fix, Erinnerungen und
 * Abmeldungen entgehen (Marius, November 2026). Darum ein schmaler, nicht
 * blockierender Hinweis: Bei „noch nie gefragt" fragt er erneut, bei
 * „abgelehnt" führt er in die Systemeinstellungen. „Später" verschiebt ihn
 * um drei Tage; er kommt wieder, bis es erledigt ist.
 */
const SNOOZE_KEY = 'push-nudge-snooze';
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;

export function PushNudge() {
	const { colors } = useTheme();
	const styles = useThemedStyles(makeStyles);
	const [status, setStatus] = useState<PushStatus>('granted');
	const [canAskAgain, setCanAskAgain] = useState(false);
	const [hidden, setHidden] = useState(true);

	const check = useCallback(async () => {
		const res = await getPushStatus();
		setStatus(res.status);
		setCanAskAgain(res.canAskAgain);
		if (res.status === 'granted' || res.status === 'unsupported') {
			setHidden(true);
			return;
		}
		try {
			const raw = await readToken(SNOOZE_KEY);
			const until = raw ? Number(raw) : 0;
			setHidden(Date.now() < until);
		} catch {
			setHidden(false);
		}
	}, []);

	useEffect(() => {
		void check();
		// Zurück aus den Systemeinstellungen → sofort neu prüfen, damit der
		// Hinweis verschwindet, sobald es erlaubt ist.
		const sub = AppState.addEventListener('change', (s) => {
			if (s === 'active') void check();
		});
		return () => sub.remove();
	}, [check]);

	if (hidden) return null;

	const enable = async () => {
		if (status === 'undetermined' || canAskAgain) {
			await setupPush(() => {}).catch(() => undefined);
			await check();
			return;
		}
		// Abgelehnt und Android fragt nicht mehr: nur die Einstellungen helfen.
		Linking.openSettings().catch(() => undefined);
	};

	const later = async () => {
		try {
			await writeToken(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
		} catch {
			/* egal */
		}
		setHidden(true);
	};

	return (
		<View style={styles.box}>
			<Ionicons name="notifications-off-outline" size={16} color={colors.accent} />
			<View style={{ flex: 1, gap: 2 }}>
				<Text style={styles.title}>Benachrichtigungen sind aus</Text>
				<Text style={styles.text}>
					Du verpasst Spot fix, Erinnerungen und Abmeldungen. Erlauben dauert zehn Sekunden.
				</Text>
				<View style={styles.actions}>
					<Pressable onPress={() => void enable()} hitSlop={6} style={({ pressed }) => [styles.btn, pressed && { opacity: 0.7 }]}>
						<Text style={styles.btnText}>
							{status === 'undetermined' || canAskAgain ? 'Jetzt erlauben' : 'Einstellungen öffnen'}
						</Text>
					</Pressable>
					<Pressable onPress={() => void later()} hitSlop={6}>
						<Text style={styles.later}>Später</Text>
					</Pressable>
				</View>
			</View>
		</View>
	);
}

const makeStyles = (colors: ThemeColors) =>
	StyleSheet.create({
		box: {
			flexDirection: 'row',
			alignItems: 'flex-start',
			gap: 10,
			paddingHorizontal: 12,
			paddingVertical: 10,
			borderRadius: 12,
			backgroundColor: colors.accent + '14',
			borderWidth: 1,
			borderColor: colors.accent + '40'
		},
		title: { color: colors.text, fontFamily: fonts.sansBold, fontSize: 13, lineHeight: 18 },
		text: {
			color: colors.fg + textAlpha.secondary,
			fontFamily: fonts.sans,
			fontSize: 12,
			lineHeight: 16
		},
		actions: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 6 },
		btn: {
			backgroundColor: colors.accent,
			borderRadius: 8,
			paddingHorizontal: 12,
			paddingVertical: 6
		},
		btnText: { color: colors.onAccent, fontFamily: fonts.sansBold, fontSize: 12 },
		later: { color: colors.fg + textAlpha.muted, fontFamily: fonts.sansSemi, fontSize: 12 }
	});
