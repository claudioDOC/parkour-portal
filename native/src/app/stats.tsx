import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../lib/theme';
import { Card, TopBar, Screen, SectionTitle, ErrorCard, ProgressBar } from '../lib/ui';
import { useData } from '../lib/store';
import { getStats } from '../lib/api';
import { useAuth } from './_layout';

export default function Stats() {
	const { me } = useAuth();
	const { data, error, refreshing, onRefresh } = useData('stats', getStats);

	const lb = data?.stats.leaderboard ?? [];

	return (
		<Screen refreshing={refreshing} onRefresh={onRefresh}>
			<TopBar back kicker="Zahlen" title="Statistik" />
			{error && !data ? <ErrorCard message={error} /> : null}

			{data ? (
				<View style={styles.statsRow}>
					<View style={styles.statBox}>
						<Text style={styles.statNum}>{data.stats.group.pastSessionCount}</Text>
						<Text style={styles.statLabel}>Trainings</Text>
					</View>
					<View style={styles.statBox}>
						<Text style={styles.statNum}>{data.stats.group.avgPulledPerSession}</Text>
						<Text style={styles.statLabel}>Ø dabei</Text>
					</View>
					<View style={styles.statBox}>
						<Text style={styles.statNum}>{data.stats.group.memberCount}</Text>
						<Text style={styles.statLabel}>Mitglieder</Text>
					</View>
				</View>
			) : null}

			<SectionTitle>Anwesenheit</SectionTitle>
			<Card style={{ gap: 12 }}>
				{lb.map((row, i) => (
					<View key={row.userId} style={{ gap: 5 }}>
						<View style={styles.lbRow}>
							<Text style={[styles.lbRank, i < 3 && { color: colors.accent }]}>{i + 1}</Text>
							<Text style={[styles.lbName, me?.id === row.userId && { color: colors.accent }]}>
								{row.username}
							</Text>
							{row.streakNoAbsence >= 3 ? (
								<View style={styles.streak}>
									<Ionicons name="flame" size={12} color={colors.warning} />
									<Text style={styles.streakText}>{row.streakNoAbsence}</Text>
								</View>
							) : null}
							<Text style={styles.lbPercent}>{row.showUpPercent}%</Text>
						</View>
						<ProgressBar percent={row.showUpPercent} />
					</View>
				))}
			</Card>

			{data?.solo.leaderboard.length ? (
				<>
					<SectionTitle>Solo-Training (getrennt gezählt)</SectionTitle>
					<Card style={{ gap: 10 }}>
						{data.solo.leaderboard.map((row, i) => (
							<View key={row.userId} style={styles.lbRow}>
								<Text style={[styles.lbRank, i === 0 && { color: colors.accent }]}>{i + 1}</Text>
								<Text style={[styles.lbName, me?.id === row.userId && { color: colors.accent }]}>
									{row.username}
								</Text>
								<Text style={styles.soloMeta}>{row.last90} in 90 Tagen</Text>
								<Text style={styles.lbPercent}>{row.total}</Text>
							</View>
						))}
					</Card>
				</>
			) : null}

			{data?.solo.recent.length ? (
				<>
					<SectionTitle>Zuletzt solo trainiert</SectionTitle>
					<Card style={{ gap: 9 }}>
						{data.solo.recent.map((r, i) => (
							<View key={i} style={styles.recentRow}>
								<Ionicons name="flash-outline" size={14} color={colors.accent} />
								<Text style={styles.recentText} numberOfLines={1}>
									<Text style={{ fontWeight: '700', color: colors.text }}>{r.username}</Text>
									{'  '}
									{new Date(`${r.date}T12:00:00`).toLocaleDateString('de-CH', {
										day: 'numeric',
										month: 'short'
									})}
									{r.note ? ` · ${r.note}` : ''}
								</Text>
							</View>
						))}
					</Card>
				</>
			) : null}
		</Screen>
	);
}

const styles = StyleSheet.create({
	statsRow: { flexDirection: 'row', gap: 10 },
	statBox: {
		flex: 1,
		backgroundColor: colors.card,
		borderColor: colors.border,
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 16,
		paddingVertical: 12,
		alignItems: 'center'
	},
	statNum: { color: colors.text, fontSize: 20, fontWeight: '800' },
	statLabel: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
	lbRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
	lbRank: { color: colors.textMuted, fontSize: 13, fontWeight: '800', width: 18 },
	lbName: { color: colors.text, fontSize: 14, fontWeight: '600', flex: 1 },
	lbPercent: { color: colors.textSecondary, fontSize: 13.5, fontWeight: '800' },
	streak: { flexDirection: 'row', alignItems: 'center', gap: 2 },
	streakText: { color: colors.warning, fontSize: 12, fontWeight: '800' },
	soloMeta: { color: colors.textMuted, fontSize: 12 },
	recentRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
	recentText: { color: colors.textSecondary, fontSize: 13, flex: 1 }
});
