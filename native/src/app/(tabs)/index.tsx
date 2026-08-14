import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../../lib/theme';
import { Card, TopBar, InitialsRow, Pill, ErrorCard, Button, Screen } from '../../lib/ui';
import { useData } from '../../lib/store';
import { getTraining, getPendingTrip, logSolo, type TrainingSession } from '../../lib/api';
import { useAuth } from '../_layout';

/** Effektiver Spot einer Session: Admin-Override schlägt Voting schlägt Auto-Wahl. */
export function effectiveSpot(s: TrainingSession) {
	if (s.overrideSpot) return { name: s.overrideSpot.name, city: s.overrideSpot.city, fixed: true };
	if (s.winnerSpot) return { name: s.winnerSpot.name, city: s.winnerSpot.city, fixed: false };
	if (s.autoSpot) return { name: s.autoSpot.name, city: s.autoSpot.city, fixed: false };
	return null;
}

function formatDateLong(ymd: string): string {
	const d = new Date(`${ymd}T12:00:00`);
	return d.toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long' });
}

export default function Today() {
	const { me } = useAuth();
	const router = useRouter();
	const training = useData('training', getTraining);
	const pending = useData('trip-pending', getPendingTrip);

	const data = training.data;
	const next = data?.sessions.find((s) => !s.cancelled) ?? data?.sessions[0] ?? null;
	const isToday = next && data && next.date === data.calendarToday;
	const spot = next ? effectiveSpot(next) : null;
	const iAmIn = next && me ? next.attending.some((a) => a.id === me.id) : false;

	// Trip, bei dem meine Antwort fehlt (Server kennt die 3-Tage-Wiedervorlage).
	const pendingTrip = pending.data?.trip ?? null;

	const logSoloToday = async () => {
		try {
			await logSolo();
			await training.refresh();
		} catch (e) {
			Alert.alert('Fehler', e instanceof Error ? e.message : 'Eintragen fehlgeschlagen');
		}
	};

	return (
		<Screen refreshing={training.refreshing} onRefresh={training.onRefresh}>
			<TopBar kicker="Parkour Portal" title={`Hey ${me?.username ?? ''}`} />

			{training.error && !data ? <ErrorCard message={training.error} /> : null}

			{pendingTrip ? (
				<Pressable onPress={() => router.push('/trips')}>
					{({ pressed }) => (
						<Card style={[styles.tripCard, pressed && { opacity: 0.85 }]}>
							<View style={styles.rowBetween}>
								<View style={{ flex: 1 }}>
									<Text style={styles.tripKicker}>TRIP — DEINE ANTWORT FEHLT</Text>
									<Text style={styles.tripTitle}>{pendingTrip.title}</Text>
								</View>
								<Ionicons name="chevron-forward" size={20} color={colors.accentBlue} />
							</View>
						</Card>
					)}
				</Pressable>
			) : null}

			{next ? (
				<Pressable onPress={() => router.push('/training')}>
					{({ pressed }) => (
						<Card style={pressed ? { opacity: 0.85 } : undefined}>
							<View style={styles.rowBetween}>
								<Text style={styles.cardKicker}>{isToday ? 'HEUTE' : 'NÄCHSTES TRAINING'}</Text>
								{next.cancelled ? (
									<Pill label="Abgesagt" color={colors.danger} />
								) : iAmIn ? (
									<Pill label="✓ Dabei" color={colors.success} />
								) : (
									<Pill label="Nicht angemeldet" color={colors.warning} />
								)}
							</View>
							<Text style={styles.cardTitle}>{formatDateLong(next.date)}</Text>
							<View style={styles.metaRow}>
								<Ionicons name="time-outline" size={15} color={colors.textSecondary} />
								<Text style={styles.metaText}>
									{next.timeStart}–{next.timeEnd} Uhr
								</Text>
							</View>

							{!next.cancelled ? (
								<>
									<View style={styles.divider} />
									{spot ? (
										<View style={styles.spotRow}>
											<Ionicons name="location" size={18} color={colors.accent} />
											<View style={{ flex: 1 }}>
												<Text style={styles.spotName}>{spot.name}</Text>
												<Text style={styles.spotCity}>{spot.city}</Text>
											</View>
											{spot.fixed ? <Pill label="Fix" color={colors.accent} filled /> : null}
										</View>
									) : (
										<View style={styles.spotRow}>
											<Ionicons name="megaphone-outline" size={18} color={colors.accentBlue} />
											<Text style={styles.voteHint}>Spot-Voting läuft — stimm ab!</Text>
										</View>
									)}
									<View style={styles.attendRow}>
										<InitialsRow names={next.attending.map((a) => a.username)} />
										<Text style={styles.attendCount}>{next.attending.length} dabei</Text>
									</View>
								</>
							) : null}
						</Card>
					)}
				</Pressable>
			) : data ? (
				<Card>
					<Text style={styles.metaText}>Kein Training geplant.</Text>
				</Card>
			) : null}

			{data?.trainingForecast?.summary ? (
				<Card style={styles.smallCard}>
					<View style={styles.smallRow}>
						<Ionicons
							name={data.trainingForecast.isWet ? 'rainy-outline' : 'partly-sunny-outline'}
							size={18}
							color={colors.accentBlue}
						/>
						<Text style={styles.smallText}>{data.trainingForecast.summary}</Text>
					</View>
				</Card>
			) : null}

			<Card style={styles.smallCard}>
				<View style={styles.smallRow}>
					<Ionicons name="flash-outline" size={18} color={colors.accent} />
					<View style={{ flex: 1 }}>
						<Text style={styles.smallTitle}>Solo-Training</Text>
						<Text style={styles.smallText}>
							{data?.mySolo.countMonth ?? 0} diesen Monat
							{data?.mySolo.todayLogged ? '  ·  heute eingetragen ✓' : ''}
						</Text>
					</View>
					{data && !data.mySolo.todayLogged ? (
						<Button label="Heute eintragen" onPress={logSoloToday} kind="ghost" small />
					) : null}
				</View>
			</Card>
		</Screen>
	);
}


const styles = StyleSheet.create({
	rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
	tripCard: { borderColor: colors.accentBlue + '55' },
	tripKicker: { color: colors.accentBlue, fontSize: 10.5, fontWeight: '800', letterSpacing: 1.5 },
	tripTitle: { color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 3 },
	cardKicker: { color: colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 2 },
	cardTitle: { color: colors.text, fontSize: 21, fontWeight: '800', marginTop: 10, letterSpacing: -0.3 },
	metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
	metaText: { color: colors.textSecondary, fontSize: 14 },
	divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 14 },
	spotRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
	spotName: { color: colors.text, fontSize: 16, fontWeight: '700' },
	spotCity: { color: colors.textMuted, fontSize: 13 },
	voteHint: { color: colors.accentBlue, fontSize: 14, fontWeight: '600', flex: 1 },
	attendRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
	attendCount: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
	smallCard: { paddingVertical: 14 },
	smallRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
	smallTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
	smallText: { color: colors.textSecondary, fontSize: 13, marginTop: 1, flexShrink: 1 }
});
