import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { fonts, type ThemeColors } from '../../lib/theme';
import { textAlpha } from '../../lib/tokens';
import { useTheme, useThemedStyles } from '../../lib/themeContext';
import { Card, TopBar, Screen, SectionTitle, ErrorCard, Avatar, ProgressBar } from '../../lib/ui';
import { useData } from '../../lib/store';
import { getProfile, mediaUrl } from '../../lib/api';
import { useRouter } from 'expo-router';

export default function Profile() {
	const { colors } = useTheme();
	const styles = useThemedStyles(makeStyles);
	const { id } = useLocalSearchParams<{ id: string }>();
	const userId = id === 'me' ? undefined : Number(id);
	const router = useRouter();
	const { data, error, refreshing, onRefresh } = useData(`profile-${id}`, () => getProfile(userId));
	const [showFull, setShowFull] = useState(false);

	const p = data?.profile;

	return (
		<Screen refreshing={refreshing} onRefresh={onRefresh}>
			<TopBar back kicker="Profil" title={p?.username ?? '…'} />
			{error && !data ? <ErrorCard message={error} /> : null}

			{data && p ? (
				<>
					<Card style={styles.headCard}>
						<Pressable onPress={() => p.avatarFull && setShowFull(true)}>
							<Avatar username={p.username} avatar={p.avatar} size={84} />
						</Pressable>
						<View style={{ flex: 1, gap: 4 }}>
							<Text style={styles.username}>{p.username}</Text>
							{data.myRank ? (
								<Text style={styles.rank}>
									Rang {data.myRank} von {data.totalMembers}
								</Text>
							) : null}
						</View>
					</Card>

					<View style={styles.statsRow}>
						<View style={styles.statBox}>
							<Text style={styles.statNum}>{data.me?.showUpPercent ?? 0}%</Text>
							<Text style={styles.statLabel}>Dabei</Text>
						</View>
						<View style={styles.statBox}>
							<Text style={styles.statNum}>{data.me?.streakNoAbsence ?? 0}</Text>
							<Text style={styles.statLabel}>Streak</Text>
						</View>
						<View style={styles.statBox}>
							<Text style={styles.statNum}>{data.completedChallenges.length}</Text>
							<Text style={styles.statLabel}>Challenges</Text>
						</View>
						<View style={styles.statBox}>
							<Text style={styles.statNum}>{data.soloCount + (data.extraCount ?? 0)}</Text>
							<Text style={styles.statLabel}>Extra</Text>
						</View>
					</View>

					{data.monthly?.length ? (
						<>
							<SectionTitle>Monatsverlauf</SectionTitle>
							<Card style={{ gap: 10 }}>
								{data.monthly.map((m) => (
									<View key={m.key} style={{ gap: 4 }}>
										<View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
											<Text style={styles.chText}>
												{new Date(`${m.key}-15T12:00:00`).toLocaleDateString('de-CH', {
													month: 'long',
													year: 'numeric'
												})}
											</Text>
											<Text style={styles.chSpot}>
												{m.pulled}/{m.trainings} gezogen · {m.percent}%
											</Text>
										</View>
										<ProgressBar percent={m.percent} />
									</View>
								))}
							</Card>
						</>
					) : null}

					{data.completedChallenges.length > 0 ? (
						<>
							<SectionTitle>Geschaffte Challenges</SectionTitle>
							<Card style={{ gap: 8 }}>
								{data.completedChallenges.slice(0, 10).map((ch, i) => (
									<View key={i} style={styles.chRow}>
										<Ionicons name="trophy" size={14} color={colors.accent} />
										<Text style={styles.chText} numberOfLines={1}>
											{ch.title}
											{ch.spotName ? <Text style={styles.chSpot}> · {ch.spotName}</Text> : null}
										</Text>
									</View>
								))}
							</Card>
						</>
					) : null}

					<SectionTitle>{`Mitglieder · ${data.members.length}`}</SectionTitle>
					<Card style={{ gap: 4 }}>
						{data.members.map((m, i) => (
							<Pressable
								key={m.id}
								onPress={() => router.push(`/profile/${m.id}`)}
								style={({ pressed }) => [styles.memberRow, pressed && { opacity: 0.7 }]}
							>
								<Avatar username={m.username} avatar={m.avatar} size={34} index={i} />
								<Text style={styles.memberName}>{m.username}</Text>
								<Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
							</Pressable>
						))}
					</Card>

					{/* Avatar in gross */}
					<Modal visible={showFull} transparent animationType="fade">
						<Pressable style={styles.viewerBackdrop} onPress={() => setShowFull(false)}>
							<Image
								source={{ uri: mediaUrl(p.avatarFull ?? p.avatar, 480) ?? undefined }}
								style={styles.viewerImage}
								contentFit="contain"
							/>
						</Pressable>
					</Modal>
				</>
			) : null}
		</Screen>
	);
}

const makeStyles = (colors: ThemeColors) =>
	StyleSheet.create({
	headCard: { flexDirection: 'row', alignItems: 'center', gap: 16 },
	username: { color: colors.fg + textAlpha.primary, fontSize: 30, lineHeight: 32, fontFamily: fonts.sansBold },
	rank: { color: colors.fg + textAlpha.secondary, fontSize: 12, lineHeight: 16 },
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
	chRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
	chText: { color: colors.fg + textAlpha.primary, fontSize: 12, lineHeight: 16, fontFamily: fonts.sansSemi, flex: 1 },
	chSpot: { color: colors.fg + textAlpha.muted, fontFamily: fonts.sans },
	memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
	memberName: { color: colors.fg + textAlpha.primary, fontSize: 14, lineHeight: 20, fontFamily: fonts.sansSemi, flex: 1 },
	viewerBackdrop: {
		flex: 1,
		backgroundColor: 'rgba(0,0,0,0.95)',
		alignItems: 'center',
		justifyContent: 'center'
	},
	viewerImage: { width: '100%', height: '80%' }
});
