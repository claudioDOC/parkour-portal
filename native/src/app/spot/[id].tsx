import { useState } from 'react';
import {
	View,
	Text,
	StyleSheet,
	Pressable,
	Alert,
	Modal,
	Dimensions,
	FlatList,
	Linking
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../../lib/theme';
import {
	Card,
	TopBar,
	Screen,
	Stars,
	Pill,
	ProgressBar,
	SectionTitle,
	ErrorCard,
	InitialsRow
} from '../../lib/ui';
import { useData } from '../../lib/store';
import { getSpot, voteSpot, setChallengeDone, mediaUrl } from '../../lib/api';
import { useAuth } from '../_layout';

const { width: SCREEN_W } = Dimensions.get('window');

export default function SpotDetailScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const spotId = Number(id);
	const { me } = useAuth();
	const router = useRouter();
	const { data, error, refresh, refreshing, onRefresh } = useData(`spot-${spotId}`, () =>
		getSpot(spotId)
	);
	const [viewer, setViewer] = useState<number | null>(null);

	const base = data?.spot ?? null;

	const rate = async (score: number) => {
		try {
			await voteSpot(spotId, score);
			await refresh();
		} catch (e) {
			Alert.alert('Fehler', e instanceof Error ? e.message : 'Bewerten fehlgeschlagen');
		}
	};

	const toggleChallenge = async (challengeId: number, done: boolean) => {
		try {
			await setChallengeDone(challengeId, done);
			await refresh();
		} catch (e) {
			Alert.alert('Fehler', e instanceof Error ? e.message : 'Aktion fehlgeschlagen');
		}
	};

	const openMap = () => {
		if (!base?.latitude || !base?.longitude) return;
		Linking.openURL(
			`geo:${base.latitude},${base.longitude}?q=${base.latitude},${base.longitude}(${encodeURIComponent(base.name)})`
		).catch(() => Linking.openURL(`https://www.google.com/maps?q=${base.latitude},${base.longitude}`));
	};

	const totalDone = data?.challenges.reduce((sum, ch) => sum + ch.doneCount, 0) ?? 0;
	const totalSlots = data?.challenges.reduce((sum, ch) => sum + ch.doneCount + ch.openCount, 0) ?? 0;

	return (
		<Screen refreshing={refreshing} onRefresh={onRefresh}>
			<TopBar back kicker={base?.city ?? 'Spot'} title={base?.name ?? '…'} />
			{error && !data ? <ErrorCard message={error} /> : null}

			{data && base ? (
				<>
					{data.images.length > 0 ? (
						<FlatList
							horizontal
							pagingEnabled={false}
							showsHorizontalScrollIndicator={false}
							data={data.images}
							keyExtractor={(img) => String(img.id)}
							contentContainerStyle={{ gap: 8 }}
							style={{ marginHorizontal: -20, paddingHorizontal: 20 }}
							renderItem={({ item, index }) => (
								<Pressable onPress={() => setViewer(index)}>
									<Image
										source={{ uri: mediaUrl(item.url) ?? undefined }}
										style={styles.galleryImage}
										contentFit="cover"
										transition={150}
									/>
								</Pressable>
							)}
						/>
					) : null}

					<Card>
						<View style={styles.rowBetween}>
							<View>
								<Text style={styles.rateLabel}>Bewertung</Text>
								<View style={styles.scoreRow}>
									<Stars value={data.avgScore} size={18} />
									<Text style={styles.scoreText}>
										{data.voteCount > 0
											? `${data.avgScore.toFixed(1)} · ${data.voteCount} Stimmen`
											: 'Noch keine'}
									</Text>
								</View>
							</View>
							{base.latitude && base.longitude ? (
								<Pressable onPress={openMap} style={({ pressed }) => [styles.mapBtn, pressed && { opacity: 0.7 }]}>
									<Ionicons name="navigate" size={16} color={colors.onAccent} />
									<Text style={styles.mapBtnText}>Karte</Text>
								</Pressable>
							) : null}
						</View>
						<View style={styles.myRate}>
							<Text style={styles.myRateLabel}>Deine Wertung:</Text>
							<Stars value={data.userVote ?? 0} size={20} onRate={rate} />
						</View>
					</Card>

					{base.description ? (
						<Card>
							<Text style={styles.description}>{base.description}</Text>
						</Card>
					) : null}

					{(base.lighting || base.goodWeather || base.techniques) ? (
						<Card style={{ gap: 8 }}>
							{base.lighting ? (
								<View style={styles.infoRow}>
									<Ionicons name="bulb-outline" size={15} color={colors.textSecondary} />
									<Text style={styles.infoText}>Beleuchtung: {base.lighting}</Text>
								</View>
							) : null}
							{base.goodWeather ? (
								<View style={styles.infoRow}>
									<Ionicons name="cloud-outline" size={15} color={colors.textSecondary} />
									<Text style={styles.infoText}>Geeignet bei: {base.goodWeather}</Text>
								</View>
							) : null}
							{base.techniques ? (
								<View style={styles.infoRow}>
									<Ionicons name="body-outline" size={15} color={colors.textSecondary} />
									<Text style={styles.infoText}>{base.techniques}</Text>
								</View>
							) : null}
						</Card>
					) : null}

					{data.challenges.length > 0 ? (
						<>
							<SectionTitle>{`Challenges · ${data.challenges.length}`}</SectionTitle>
							{totalSlots > 0 ? (
								<View style={{ gap: 4 }}>
									<ProgressBar percent={(totalDone / totalSlots) * 100} />
									<Text style={styles.progressText}>
										{totalDone} von {totalSlots} Erledigungen in der Gruppe
									</Text>
								</View>
							) : null}
							{data.challenges.map((ch) => {
								const mineDone = me ? ch.doneBy.some((d) => d.userId === me.id) : false;
								return (
									<Card key={ch.id} style={{ gap: 8 }}>
										<View style={styles.rowBetween}>
											<Text style={styles.challengeTitle}>{ch.title}</Text>
											{mineDone ? <Pill label="✓ Geschafft" color={colors.success} /> : null}
										</View>
										{ch.description ? (
											<Text style={styles.challengeDesc}>{ch.description}</Text>
										) : null}
										{ch.doneBy.length > 0 ? (
											<View style={styles.doneRow}>
												<InitialsRow names={ch.doneBy.map((d) => d.username)} />
												<Text style={styles.doneText}>{ch.doneBy.length} geschafft</Text>
											</View>
										) : null}
										<Pressable
											onPress={() => toggleChallenge(ch.id, !mineDone)}
											style={({ pressed }) => [
												mineDone ? styles.undoBtn : styles.doneBtn,
												pressed && { opacity: 0.8 }
											]}
										>
											<Text style={mineDone ? styles.undoBtnText : styles.doneBtnText}>
												{mineDone ? 'Doch nicht geschafft' : 'Geschafft!'}
											</Text>
										</Pressable>
									</Card>
								);
							})}
						</>
					) : null}

					{data.nearbySpots?.length ? (
						<>
							<SectionTitle>In der Nähe</SectionTitle>
							{data.nearbySpots.slice(0, 5).map((n) => (
								<Pressable key={n.id} onPress={() => router.push(`/spot/${n.id}`)}>
									{({ pressed }) => (
										<View style={[styles.nearbyRow, pressed && { opacity: 0.8 }]}>
											<Ionicons name="location-outline" size={16} color={colors.textSecondary} />
											<Text style={styles.nearbyName}>{n.name}</Text>
											<Text style={styles.nearbyCity}>{n.city}</Text>
											<Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
										</View>
									)}
								</Pressable>
							))}
						</>
					) : null}

					{/* Vollbild-Viewer für Spot-Bilder */}
					<Modal visible={viewer !== null} transparent animationType="fade">
						<Pressable style={styles.viewerBackdrop} onPress={() => setViewer(null)}>
							{viewer !== null && data.images[viewer] ? (
								<Image
									source={{ uri: mediaUrl(data.images[viewer].url) ?? undefined }}
									style={styles.viewerImage}
									contentFit="contain"
								/>
							) : null}
							<View style={styles.viewerClose}>
								<Ionicons name="close" size={28} color="#fff" />
							</View>
						</Pressable>
					</Modal>
				</>
			) : null}
		</Screen>
	);
}

const styles = StyleSheet.create({
	rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
	galleryImage: { width: SCREEN_W * 0.72, height: SCREEN_W * 0.48, borderRadius: 16, backgroundColor: colors.hover },
	rateLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
	scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 },
	scoreText: { color: colors.textSecondary, fontSize: 13 },
	mapBtn: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 6,
		backgroundColor: colors.accent,
		borderRadius: 999,
		paddingHorizontal: 14,
		paddingVertical: 9
	},
	mapBtnText: { color: colors.onAccent, fontSize: 13, fontWeight: '800' },
	myRate: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
	myRateLabel: { color: colors.textSecondary, fontSize: 13 },
	description: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
	infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
	infoText: { color: colors.textSecondary, fontSize: 13, flex: 1 },
	progressText: { color: colors.textMuted, fontSize: 12 },
	challengeTitle: { color: colors.text, fontSize: 15.5, fontWeight: '700', flex: 1 },
	challengeDesc: { color: colors.textSecondary, fontSize: 13.5, lineHeight: 20 },
	doneRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
	doneText: { color: colors.textMuted, fontSize: 12.5 },
	doneBtn: {
		backgroundColor: colors.accent,
		borderRadius: 999,
		paddingVertical: 10,
		alignItems: 'center'
	},
	doneBtnText: { color: colors.onAccent, fontSize: 14, fontWeight: '800' },
	undoBtn: {
		borderColor: colors.border,
		borderWidth: 1,
		borderRadius: 999,
		paddingVertical: 10,
		alignItems: 'center'
	},
	undoBtnText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
	nearbyRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
		backgroundColor: colors.card,
		borderColor: colors.border,
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 14,
		paddingHorizontal: 14,
		paddingVertical: 12
	},
	nearbyName: { color: colors.text, fontSize: 14, fontWeight: '600', flex: 1 },
	nearbyCity: { color: colors.textMuted, fontSize: 12.5 },
	viewerBackdrop: {
		flex: 1,
		backgroundColor: 'rgba(0,0,0,0.95)',
		alignItems: 'center',
		justifyContent: 'center'
	},
	viewerImage: { width: '100%', height: '80%' },
	viewerClose: { position: 'absolute', top: 54, right: 20 }
});
