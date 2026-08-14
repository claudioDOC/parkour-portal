import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, fonts } from '../../lib/theme';
import { Card, TopBar, Screen, SectionTitle, ErrorCard, Avatar } from '../../lib/ui';
import { useData } from '../../lib/store';
import { getProfile, mediaUrl } from '../../lib/api';
import { useRouter } from 'expo-router';

export default function Profile() {
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
						<View style={{ flex: 1, gap: 3 }}>
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
							<Text style={styles.statNum}>{data.soloCount}</Text>
							<Text style={styles.statLabel}>Solo</Text>
						</View>
					</View>

					{data.completedChallenges.length > 0 ? (
						<>
							<SectionTitle>Geschaffte Challenges</SectionTitle>
							<Card style={{ gap: 9 }}>
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
								source={{ uri: mediaUrl(p.avatarFull ?? p.avatar) ?? undefined }}
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

const styles = StyleSheet.create({
	headCard: { flexDirection: 'row', alignItems: 'center', gap: 16 },
	username: { color: colors.text, fontSize: 21, fontFamily: fonts.sansBold },
	rank: { color: colors.textSecondary, fontSize: 13 },
	statsRow: { flexDirection: 'row', gap: 8 },
	statBox: {
		flex: 1,
		backgroundColor: colors.card,
		borderRadius: 18,
		paddingVertical: 14,
		alignItems: 'center'
	},
	statNum: { color: colors.text, fontFamily: fonts.display, fontSize: 26, lineHeight: 28 },
	statLabel: { color: colors.textMuted, fontSize: 10.5, marginTop: 2 },
	chRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
	chText: { color: colors.text, fontSize: 13.5, fontWeight: '600', flex: 1 },
	chSpot: { color: colors.textMuted, fontWeight: '400' },
	memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 7 },
	memberName: { color: colors.text, fontSize: 14.5, fontFamily: fonts.sansSemi, flex: 1 },
	viewerBackdrop: {
		flex: 1,
		backgroundColor: 'rgba(0,0,0,0.95)',
		alignItems: 'center',
		justifyContent: 'center'
	},
	viewerImage: { width: '100%', height: '80%' }
});
