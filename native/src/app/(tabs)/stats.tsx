import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { fonts, type ThemeColors } from '../../lib/theme';
import { textAlpha } from '../../lib/tokens';
import { useTheme, useThemedStyles } from '../../lib/themeContext';
import { Card, TopBar, Screen, SectionTitle, ErrorCard, ProgressBar, Stat, StatGrid } from '../../lib/ui';
import { useData } from '../../lib/store';
import { getStats } from '../../lib/api';
import { useAuth } from '../_layout';

export default function Stats() {
	const { colors } = useTheme();
	const styles = useThemedStyles(makeStyles);
	const { me } = useAuth();
	const { data, error, refreshing, onRefresh } = useData('stats', getStats);

	const lb = data?.stats.leaderboard ?? [];

	return (
		<Screen refreshing={refreshing} onRefresh={onRefresh}>
			<TopBar back kicker="Zahlen" title="Statistik" />
			{error && !data ? <ErrorCard message={error} /> : null}

			{data ? (
				<StatGrid>
					<Stat
						value={data.stats.group.pastSessionCount}
						label="Trainings"
						tint={colors.accent}
						hint="bisher durch"
					/>
					<Stat
						value={data.stats.group.totalAbsences}
						label="Abmeldungen"
						tint={colors.warning}
						hint="insgesamt gemeldet"
					/>
					<Stat
						value={data.stats.group.avgPulledPerSession}
						label="Ø pro Training"
						tint={colors.text}
						hint="im Schnitt dabei"
					/>
					<Stat
						value={data.stats.group.memberCount}
						label="Mitglieder"
						tint={colors.text}
						hint="in der Wertung"
					/>
				</StatGrid>
			) : null}

			<SectionTitle>Hall of Fame</SectionTitle>
			<Card style={{ gap: 12 }}>
				{lb.map((row, i) => (
					<View key={row.userId} style={{ gap: 4 }}>
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
					<SectionTitle>Solo-Training</SectionTitle>
					<Card style={{ gap: 8 }}>
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
					<SectionTitle>Zuletzt solo</SectionTitle>
					<Card style={{ gap: 8 }}>
						{data.solo.recent.map((r, i) => (
							<View key={i} style={styles.recentRow}>
								<Ionicons name="flash-outline" size={14} color={colors.accent} />
								<Text style={styles.recentText} numberOfLines={1}>
									<Text style={{ fontFamily: fonts.sansBold, color: colors.text }}>{r.username}</Text>
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

const makeStyles = (colors: ThemeColors) =>
	StyleSheet.create({
	statsRow: { flexDirection: 'row', gap: 8 },
	statBox: {
		flex: 1,
		backgroundColor: colors.card,
		borderRadius: 20,
		paddingVertical: 12,
		alignItems: 'center'
	},
	statNum: { color: colors.fg + textAlpha.primary, fontFamily: fonts.display, fontSize: 30, lineHeight: 32 },
	statLabel: { color: colors.fg + textAlpha.muted, fontSize: 12, lineHeight: 16, marginTop: 4 },
	lbRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
	lbRank: { color: colors.fg + textAlpha.muted, fontSize: 12, lineHeight: 16, fontFamily: fonts.sansBold, width: 18 },
	lbName: { color: colors.fg + textAlpha.primary, fontSize: 14, lineHeight: 20, fontFamily: fonts.sansSemi, flex: 1 },
	lbPercent: { color: colors.fg + textAlpha.secondary, fontSize: 12, lineHeight: 16, fontFamily: fonts.sansBold },
	streak: { flexDirection: 'row', alignItems: 'center', gap: 4 },
	streakText: { color: colors.warning, fontSize: 12, lineHeight: 16, fontFamily: fonts.sansBold },
	soloMeta: { color: colors.fg + textAlpha.muted, fontSize: 12, lineHeight: 16 },
	recentRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
	recentText: { color: colors.fg + textAlpha.secondary, fontSize: 12, lineHeight: 16, flex: 1 }
});
