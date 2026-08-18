import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Switch } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { fonts, type ThemeColors } from '../../lib/theme';
import { textAlpha } from '../../lib/tokens';
import { useTheme, useThemedStyles } from '../../lib/themeContext';
import {
	Card,
	TopBar,
	Screen,
	SectionTitle,
	ErrorCard,
	EmptyState,
	ProgressBar,
	Stat,
	StatGrid,
	InitialsRow,
	Avatar
} from '../../lib/ui';
import { Image } from 'expo-image';
import { mediaUrl, isVideoUrl } from '../../lib/api';
import { useData } from '../../lib/store';
import { getArena } from '../../lib/api';
import { useAuth } from '../_layout';

export default function Challenges() {
	const { colors } = useTheme();
	const styles = useThemedStyles(makeStyles);
	const { me } = useAuth();
	const router = useRouter();
	const { data, error, refreshing, onRefresh } = useData('arena', getArena);
	// ?q=<Spotname> — z. B. vom Challenge-Link auf der Karte.
	const params = useLocalSearchParams<{ q?: string }>();
	const [query, setQuery] = useState(typeof params.q === 'string' ? params.q : '');
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
			<TopBar kicker="Quest-Board" title="Challenge-Arena" />
			{error && !data ? <ErrorCard message={error} /> : null}

			{data ? (
				<Card style={{ gap: 16 }}>
					<Text style={styles.heroText}>
						Alle aktiven Spot-Quests — wer hat was erlegt? Offene Quests locken, die Rangliste
						ehrt die fleissigsten Legenden.
					</Text>
					<StatGrid>
						<Stat value={data.totalChallenges} label="Aktive Quests" tint={colors.accent} />
						<Stat value={data.totalClears} label="Siege gesamt" tint={colors.success} />
						<Stat value={data.openQuests} label="Noch offen" tint={colors.warning} />
						<Stat
							value={data.spotsWithChallenges.length}
							label="Spots am Start"
							tint={colors.accentBlue}
						/>
					</StatGrid>
				</Card>
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
					<Card style={{ gap: 8 }}>
						{data.leaderboard.slice(0, 15).map((row, i) => (
							<Pressable
								key={row.userId}
								onPress={() => router.push(`/profile/${row.userId}`)}
								style={({ pressed }) => [styles.lbRow, pressed && { opacity: 0.7 }]}
							>
								<Text style={[styles.lbRank, i === 0 && { color: colors.accent }]}>{i + 1}</Text>
								<Avatar username={row.username} avatar={row.avatar} size={26} index={i} />
								<Text
									style={[
										styles.lbName,
										me?.id === row.userId && { color: colors.accent }
									]}
								>
									{row.username}
								</Text>
								<Text style={styles.lbClears}>{row.clears === 1 ? '1 Clear' : `${row.clears} Clears`}</Text>
							</Pressable>
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
					<Card key={g.spotId} style={{ gap: 8 }}>
						<Pressable
							onPress={() => router.push(`/spot/${g.spotId}`)}
							style={({ pressed }) => [styles.spotHead, pressed && { opacity: 0.7 }]}
						>
							<View style={{ flex: 1 }}>
								<Text style={styles.spotName}>{g.spotName}</Text>
								<Text style={styles.spotCity}>{g.spotCity}</Text>
							</View>
							<Text style={styles.spotCount}>
								{doneMine}/{g.challenges.length}
							</Text>
							<Ionicons name="chevron-forward" size={17} color={colors.fg + textAlpha.muted} />
						</Pressable>
						<ProgressBar
							percent={g.challenges.length ? (doneMine / g.challenges.length) * 100 : 0}
						/>
						<View style={{ gap: 12, marginTop: 4 }}>
							{g.challenges.map((ch) => {
								const done = me ? ch.completers.some((c) => c.userId === me.id) : false;
								return (
									<Pressable
										key={ch.id}
										onPress={() => router.push(`/challenge/${ch.id}?spot=${g.spotId}`)}
										style={({ pressed }) => [styles.chRow, pressed && { opacity: 0.7 }]}
									>
										{ch.images?.[0] && !isVideoUrl(ch.images[0].url) ? (
											<Image
												source={{ uri: mediaUrl(ch.images[0].url) ?? undefined }}
												style={styles.chImage}
												contentFit="cover"
												transition={150}
											/>
										) : ch.images?.[0] ? (
											<View style={[styles.chImage, styles.chImageEmpty]}>
												<Ionicons name="play-circle" size={22} color={colors.accent} />
											</View>
										) : (
											<View style={[styles.chImage, styles.chImageEmpty]}>
												<Ionicons
													name="trophy-outline"
													size={18}
													color={colors.fg + textAlpha.muted}
												/>
											</View>
										)}
										<View style={{ flex: 1, gap: 4 }}>
											<Text style={styles.chTitle} numberOfLines={1}>
												{ch.title}
											</Text>
											{ch.completers.length > 0 ? (
												<View style={styles.chDone}>
													<InitialsRow people={ch.completers} />
													<Text style={styles.chDoneText}>
														{ch.completers.length} geschafft
													</Text>
												</View>
											) : (
												<Text style={styles.chDoneText}>Noch niemand geschafft</Text>
											)}
										</View>
										{done ? (
											<Ionicons name="checkmark-circle" size={20} color={colors.success} />
										) : (
											<Ionicons
												name="chevron-forward"
												size={18}
												color={colors.fg + textAlpha.muted}
											/>
										)}
									</Pressable>
								);
							})}
						</View>
					</Card>
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
					<Card style={{ gap: 8 }}>
						{data.recentClears.slice(0, 10).map((rc, i) => (
							<View key={i} style={styles.clearRow}>
								<Avatar username={rc.username} avatar={rc.avatar} size={22} index={i} />
								<Text style={styles.clearText} numberOfLines={1}>
									<Text style={{ fontFamily: fonts.sansBold, color: colors.text }}>{rc.username}</Text>
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

const makeStyles = (colors: ThemeColors) =>
	StyleSheet.create({
	heroText: { color: colors.fg + textAlpha.secondary, fontSize: 14, lineHeight: 20, fontFamily: fonts.sans },
	statBox: {
		flex: 1,
		backgroundColor: colors.card,
		borderRadius: 20,
		paddingVertical: 12,
		alignItems: 'center'
	},
	statNum: { color: colors.fg + textAlpha.primary, fontFamily: fonts.display, fontSize: 30, lineHeight: 32 },
	statLabel: { color: colors.fg + textAlpha.muted, fontSize: 12, lineHeight: 16, marginTop: 4 },
	search: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
		backgroundColor: colors.card,
		borderRadius: 12,
		paddingHorizontal: 12
	},
	searchInput: { flex: 1, color: colors.fg + textAlpha.primary, paddingVertical: 12, fontSize: 14, lineHeight: 20, fontFamily: fonts.sans },
	filterRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingHorizontal: 4
	},
	filterLabel: { color: colors.fg + textAlpha.secondary, fontSize: 14, lineHeight: 20 },
	lbRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
	lbRank: { color: colors.fg + textAlpha.muted, fontSize: 14, lineHeight: 20, fontFamily: fonts.sansBold, width: 18 },
	lbName: { color: colors.fg + textAlpha.primary, fontSize: 14, lineHeight: 20, fontFamily: fonts.sansSemi, flex: 1 },
	lbClears: { color: colors.fg + textAlpha.secondary, fontSize: 12, lineHeight: 16 },
	spotHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
	spotName: { color: colors.fg + textAlpha.primary, fontSize: 14, lineHeight: 20, fontFamily: fonts.sansBold },
	spotCity: { color: colors.fg + textAlpha.muted, fontSize: 12, lineHeight: 16 },
	spotCount: { color: colors.accent, fontSize: 14, lineHeight: 20, fontFamily: fonts.sansBold },
	chRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
	chImage: { width: 52, height: 52, borderRadius: 10, backgroundColor: colors.hover },
	chImageEmpty: { alignItems: 'center', justifyContent: 'center' },
	chTitle: { color: colors.fg + textAlpha.primary, fontSize: 14, lineHeight: 20, fontFamily: fonts.sansSemi },
	chDone: { flexDirection: 'row', alignItems: 'center', gap: 8 },
	chDoneText: { color: colors.fg + textAlpha.muted, fontSize: 12, lineHeight: 16, fontFamily: fonts.sans },
	clearRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
	clearText: { color: colors.fg + textAlpha.secondary, fontSize: 12, lineHeight: 16, flex: 1 }
});
