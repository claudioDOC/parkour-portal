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
import { colors } from '../../lib/theme';
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

	// Bei jedem Fokus aktualisieren — Daten sind da, bevor man hinschaut.
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
	const iAmIn =
		next && me ? next.attending.some((a) => a.id === me.id) : false;

	return (
		<ScrollView
			style={styles.screen}
			contentContainerStyle={styles.content}
			refreshControl={
				<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
			}
		>
			<View style={styles.headerRow}>
				<View>
					<Text style={styles.kicker}>PARKOUR PORTAL</Text>
					<Text style={styles.title}>Hey {me?.username} 👋</Text>
				</View>
				<Pressable onPress={signOut} hitSlop={10}>
					<Text style={styles.logout}>Abmelden</Text>
				</Pressable>
			</View>

			{error ? <Text style={styles.error}>{error}</Text> : null}

			{next ? (
				<Pressable style={styles.card} onPress={() => router.push('/training')}>
					<Text style={styles.cardKicker}>
						{isToday ? 'HEUTE' : 'NÄCHSTES TRAINING'}
					</Text>
					<Text style={styles.cardTitle}>{formatDate(next.date)}</Text>
					<Text style={styles.cardMeta}>
						{next.timeStart}–{next.timeEnd} Uhr
					</Text>

					{next.cancelled ? (
						<Text style={styles.cancelled}>Abgesagt</Text>
					) : (
						<>
							{spot ? (
								<View style={styles.spotRow}>
									<Text style={styles.spotLabel}>
										{spot.fixed ? 'Spot steht fest' : 'Spot'}
									</Text>
									<Text style={styles.spotName}>
										{spot.name} · {spot.city}
									</Text>
								</View>
							) : (
								<Text style={styles.spotOpen}>
									Spot-Voting läuft — stimm ab!
								</Text>
							)}
							<View style={styles.attendRow}>
								<Text style={styles.attendCount}>
									{next.attending.length} dabei
								</Text>
								<Text style={styles.attendNames} numberOfLines={2}>
									{next.attending.map((a) => a.username).join(', ') || '—'}
								</Text>
							</View>
							<Text style={[styles.myStatus, { color: iAmIn ? colors.success : colors.warning }]}>
								{iAmIn ? '✓ Du bist dabei' : 'Du bist nicht angemeldet'}
							</Text>
						</>
					)}
				</Pressable>
			) : (
				<View style={styles.card}>
					<Text style={styles.cardMeta}>Kein Training geplant.</Text>
				</View>
			)}

			{data?.trainingForecast?.summary ? (
				<View style={styles.forecast}>
					<Text style={styles.forecastText}>{data.trainingForecast.summary}</Text>
				</View>
			) : null}

			<View style={styles.soloCard}>
				<Text style={styles.soloTitle}>Solo-Training</Text>
				<Text style={styles.soloText}>
					{data?.mySolo.countMonth ?? 0} diesen Monat
					{data?.mySolo.todayLogged ? ' · heute eingetragen ✓' : ''}
				</Text>
			</View>
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	screen: { flex: 1, backgroundColor: colors.bg },
	content: { padding: 20, paddingTop: 56, gap: 14 },
	headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
	kicker: { color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 2 },
	title: { color: colors.text, fontSize: 24, fontWeight: '800', marginTop: 2 },
	logout: { color: colors.textMuted, fontSize: 13 },
	error: { color: colors.danger, fontSize: 14 },
	card: {
		backgroundColor: colors.card,
		borderColor: colors.border,
		borderWidth: 1,
		borderRadius: 16,
		padding: 18
	},
	cardKicker: { color: colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 2 },
	cardTitle: { color: colors.text, fontSize: 20, fontWeight: '800', marginTop: 6 },
	cardMeta: { color: colors.textSecondary, fontSize: 14, marginTop: 2 },
	cancelled: { color: colors.danger, fontSize: 16, fontWeight: '800', marginTop: 12 },
	spotRow: { marginTop: 14 },
	spotLabel: { color: colors.textMuted, fontSize: 12 },
	spotName: { color: colors.text, fontSize: 16, fontWeight: '700', marginTop: 2 },
	spotOpen: { color: colors.accentBlue, fontSize: 14, fontWeight: '600', marginTop: 14 },
	attendRow: { marginTop: 12 },
	attendCount: { color: colors.text, fontSize: 14, fontWeight: '700' },
	attendNames: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
	myStatus: { fontSize: 14, fontWeight: '700', marginTop: 12 },
	forecast: {
		backgroundColor: colors.bgSecondary,
		borderRadius: 12,
		padding: 14,
		borderColor: colors.border,
		borderWidth: 1
	},
	forecastText: { color: colors.textSecondary, fontSize: 13 },
	soloCard: {
		backgroundColor: colors.bgSecondary,
		borderRadius: 12,
		padding: 14,
		borderColor: colors.border,
		borderWidth: 1
	},
	soloTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
	soloText: { color: colors.textSecondary, fontSize: 13, marginTop: 2 }
});
