import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../../lib/theme';
import { Card, TopBar, Screen, SectionTitle, ErrorCard, EmptyState, ProgressBar } from '../../lib/ui';
import { useData } from '../../lib/store';
import { getArena } from '../../lib/api';
import { useAuth } from '../_layout';

export default function Challenges() {
	const { me } = useAuth();
	const router = useRouter();
	const { data, error, refreshing, onRefresh } = useData('arena', getArena);
	const [query, setQuery] = useState('');
	const [onlyMine, setOnlyMine] = useState(false);

	const q = query.trim().toLowerCase();
	const groups = (data?.spotsWithChallenges ?? [])
		.map((g) => ({
			...g,
			challenges: g.challenges.filter((ch) => {
				const matches =
					!q || ch.title.toLowerCase().includes(q) || g.spotName.toLowerCase().includes(q);
				const mineOpen =
					!onlyMine || !ch.completers.some((c) => me && c.userId === me.id);
				return matches && mineOpen;
			})
		}))
		.filter((g) => g.challenges.length > 0);

	return (
		<Screen refreshing={refreshing} onRefresh={onRefresh}>
			<TopBar kicker="Arena" title="Challenges" />
			{error && !data ? <ErrorCard message={error} /> : null}

			{data ? (
				<View style={styles.statsRow}>
					<View style={styles.statBox}>
						<Text style={styles.statNum}>{data.totalChallenges}</Text>
						<Text style={styles.statLabel}>Challenges</Text>
					</View>
					<View style={styles.statBox}>
						<Text style={styles.statNum}>{data.totalClears}</Text>
						<Text style={styles.statLabel}>Clears</Text>
					</View>
					<View style={styles.statBox}>
						<Text style={[styles.statNum, { color: colors.accent }]}>{data.openQuests}</Text>
						<Text style={styles.statLabel}>Offen für dich</Text>
					</View>
				</View>
			) : null}

			<View style={styles.search}>
				<Ionicons name="search" size={17} color={colors.textMuted} />
				<TextInput
					style={styles.searchInput}
					placeholder="Challenge oder Spot suchen …"
					placeholderTextColor={colors.textMuted}
					value={query}
					onChangeText={setQuery}
					autoCorrect={false}
				/>
			</View>
			<View style={styles.filterRow}>
				<Text style={styles.filterLabel}>Nur meine offenen</Text>
				<Switch
					value={onlyMine}
					onValueChange={setOnlyMine}
					trackColor={{ false: colors.hover, true: colors.accentDim }}
					thumbColor={onlyMine ? colors.accent : colors.textMuted}
				/>
			</View>

			{data?.leaderboard.length ? (
				<>
					<SectionTitle>Leaderboard</SectionTitle>
					<Card style={{ gap: 10 }}>
						{data.leaderboard.slice(0, 5).map((row, i) => (
							<View key={row.userId} style={styles.lbRow}>
								<Text style={[styles.lbRank, i === 0 && { color: colors.accent }]}>{i + 1}</Text>
								<Text
									style={[
										styles.lbName,
										me?.id === row.userId && { color: colors.accent }
									]}
								>
									{row.username}
								</Text>
								<Text style={styles.lbClears}>{row.clears} Clears</Text>
							</View>
						))}
					</Card>
				</>
			) : null}

			<SectionTitle>Nach Spot</SectionTitle>
			{groups.map((g) => {
				const doneMine = me
					? g.challenges.filter((ch) => ch.completers.some((c) => c.userId === me.id)).length
					: 0;
				return (
					<Pressable key={g.spotId} onPress={() => router.push(`/spot/${g.spotId}`)}>
						{({ pressed }) => (
							<Card style={[{ gap: 8 }, pressed && { opacity: 0.85 }]}>
								<View style={styles.spotHead}>
									<View style={{ flex: 1 }}>
										<Text style={styles.spotName}>{g.spotName}</Text>
										<Text style={styles.spotCity}>{g.spotCity}</Text>
									</View>
									<Text style={styles.spotCount}>
										{doneMine}/{g.challenges.length}
									</Text>
									<Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
								</View>
								<ProgressBar percent={g.challenges.length ? (doneMine / g.challenges.length) * 100 : 0} />
								<Text style={styles.challengeList} numberOfLines={2}>
									{g.challenges.map((ch) => ch.title).join('  ·  ')}
								</Text>
							</Card>
						)}
					</Pressable>
				);
			})}

			{data && groups.length === 0 ? (
				<EmptyState
					icon="trophy-outline"
					text={onlyMine ? 'Alles erledigt — stark! 🏆' : 'Keine Challenges gefunden.'}
				/>
			) : null}

			{data?.recentClears.length ? (
				<>
					<SectionTitle>Zuletzt geschafft</SectionTitle>
					<Card style={{ gap: 9 }}>
						{data.recentClears.slice(0, 6).map((rc, i) => (
							<View key={i} style={styles.clearRow}>
								<Ionicons name="checkmark-circle" size={15} color={colors.success} />
								<Text style={styles.clearText} numberOfLines={1}>
									<Text style={{ fontWeight: '700', color: colors.text }}>{rc.username}</Text>
									{'  '}
									{rc.challengeTitle ?? rc.title ?? ''} · {rc.spotName}
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
	search: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
		backgroundColor: colors.card,
		borderColor: colors.border,
		borderWidth: 1,
		borderRadius: 14,
		paddingHorizontal: 13
	},
	searchInput: { flex: 1, color: colors.text, paddingVertical: 11, fontSize: 15 },
	filterRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingHorizontal: 4
	},
	filterLabel: { color: colors.textSecondary, fontSize: 14 },
	lbRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
	lbRank: { color: colors.textMuted, fontSize: 14, fontWeight: '800', width: 18 },
	lbName: { color: colors.text, fontSize: 14, fontWeight: '600', flex: 1 },
	lbClears: { color: colors.textSecondary, fontSize: 13 },
	spotHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
	spotName: { color: colors.text, fontSize: 15.5, fontWeight: '700' },
	spotCity: { color: colors.textMuted, fontSize: 12.5 },
	spotCount: { color: colors.accent, fontSize: 14, fontWeight: '800' },
	challengeList: { color: colors.textMuted, fontSize: 12.5, lineHeight: 18 },
	clearRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
	clearText: { color: colors.textSecondary, fontSize: 13, flex: 1 }
});
