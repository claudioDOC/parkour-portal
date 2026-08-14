import { useCallback, useState } from 'react';
import {
	View,
	Text,
	ScrollView,
	RefreshControl,
	StyleSheet,
	Pressable
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../../lib/theme';
import { Card, Header, InitialsRow, Pill } from '../../lib/ui';
import { getTraining, type TrainingPayload, type TrainingSession } from '../../lib/api';
import { useAuth } from '../_layout';

/** Effektiver Spot einer Session: Admin-Override schlägt Voting schlägt Auto-Wahl. */
function effectiveSpot(s: TrainingSession) {
	if (s.overrideSpot) return { name: s.overrideSpot.name, city: s.overrideSpot.city, fixed: true };
	if (s.winnerSpot) return { name: s.winnerSpot.name, city: s.winnerSpot.city, fixed: false };
	if (s.autoSpot) return { name: s.autoSpot.name, city: s.autoSpot.city, fixed: false };
	return null;
}

function formatDate(ymd: string): string {
	const d = new Date(`${ymd}T12:00:00`);
	return d.toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long' });
}

export default function Today() {
	const [data, setData] = useState<TrainingPayload | null>(null);
	const [refreshing, setRefreshing] = useState(false);
	const [error, setError] = useState('');
	const { me, signOut } = useAuth();
	const router = useRouter();

	const load = useCallback(async () => {
		try {
			setData(await getTraining());
			setError('');
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Laden fehlgeschlagen');
		}
	}, []);

	useFocusEffect(
		useCallback(() => {
			load();
		}, [load])
	);

	const onRefresh = async () => {
		setRefreshing(true);
		await load();
		setRefreshing(false);
	};

	const next = data?.sessions.find((s) => !s.cancelled) ?? data?.sessions[0] ?? null;
	const isToday = next && data && next.date === data.calendarToday;
	const spot = next ? effectiveSpot(next) : null;
	const iAmIn = next && me ? next.attending.some((a) => a.id === me.id) : false;

	return (
		<ScrollView
			style={styles.screen}
			contentContainerStyle={styles.content}
			refreshControl={
				<RefreshControl
					refreshing={refreshing}
					onRefresh={onRefresh}
					tintColor={colors.accent}
					colors={[colors.accent]}
					progressBackgroundColor={colors.card}
				/>
			}
		>
			<View style={styles.headerRow}>
				<Header kicker="Parkour Portal" title={`Hey ${me?.username ?? ''}`} />
				<Pressable onPress={signOut} hitSlop={10} style={styles.logoutBtn}>
					<Ionicons name="log-out-outline" size={20} color={colors.textMuted} />
				</Pressable>
			</View>

			{error ? (
				<Card style={styles.errorCard}>
					<Text style={styles.errorText}>{error}</Text>
				</Card>
			) : null}

			{next ? (
				<Pressable onPress={() => router.push('/training')}>
					{({ pressed }) => (
						<Card style={pressed ? { opacity: 0.85 } : undefined}>
							<View style={styles.cardTop}>
								<Text style={styles.cardKicker}>
									{isToday ? 'HEUTE' : 'NÄCHSTES TRAINING'}
								</Text>
								{next.cancelled ? (
									<Pill label="Abgesagt" color={colors.danger} />
								) : iAmIn ? (
									<Pill label="✓ Dabei" color={colors.success} />
								) : (
									<Pill label="Nicht angemeldet" color={colors.warning} />
								)}
							</View>
							<Text style={styles.cardTitle}>{formatDate(next.date)}</Text>
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
			) : (
				<Card>
					<Text style={styles.metaText}>Kein Training geplant.</Text>
				</Card>
			)}

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
				</View>
			</Card>
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	screen: { flex: 1, backgroundColor: colors.bg },
	content: { padding: 20, paddingTop: 60, gap: 12 },
	headerRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'flex-start',
		marginBottom: 6
	},
	logoutBtn: { padding: 6, marginTop: 4 },
	errorCard: { borderColor: colors.danger + '55' },
	errorText: { color: colors.danger, fontSize: 14 },
	cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
	cardKicker: { color: colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 2 },
	cardTitle: { color: colors.text, fontSize: 21, fontWeight: '800', marginTop: 10, letterSpacing: -0.3 },
	metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
	metaText: { color: colors.textSecondary, fontSize: 14 },
	divider: {
		height: StyleSheet.hairlineWidth,
		backgroundColor: colors.border,
		marginVertical: 14
	},
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
