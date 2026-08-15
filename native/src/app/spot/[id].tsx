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
import { fonts, type ThemeColors } from '../../lib/theme';
import { textAlpha } from '../../lib/tokens';
import { useTheme, useThemedStyles } from '../../lib/themeContext';
import {
	Card,
	TopBar,
	Screen,
	Stars,
	Pill,
	ProgressBar,
	SectionTitle,
	ErrorCard,
	InitialsRow,
	Sheet,
	Input,
	Button
} from '../../lib/ui';
import { useData } from '../../lib/store';
import { NativeMap } from '../../lib/NativeMap';
import {
	getSpot,
	voteSpot,
	removeSpotVote,
	setChallengeDone,
	createChallenge,
	uploadSpotImage,
	deleteSpotImage,
	voteSpotForTraining,
	editSpot,
	trashSpot,
	mediaUrl
} from '../../lib/api';
import { getImagePicker } from '../../lib/nativeModules';
import { useAuth } from '../_layout';

const { width: SCREEN_W } = Dimensions.get('window');

/** Farbpunkt mit Beschriftung für die Kartenlegende. */
function Legend({ color, label }: { color: string; label: string }) {
	const { colors } = useTheme();
	return (
		<View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
			<View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
			<Text style={{ color: colors.fg + textAlpha.muted, fontSize: 12, lineHeight: 16 }}>
				{label}
			</Text>
		</View>
	);
}

export default function SpotDetailScreen() {
	const { colors } = useTheme();
	const styles = useThemedStyles(makeStyles);
	const { id } = useLocalSearchParams<{ id: string }>();
	const spotId = Number(id);
	const { me } = useAuth();
	const router = useRouter();
	const { data, error, refresh, refreshing, onRefresh } = useData(`spot-${spotId}`, () =>
		getSpot(spotId)
	);
	const [viewer, setViewer] = useState<number | null>(null);
	// Neue Challenge an diesem Spot
	const [challengeOpen, setChallengeOpen] = useState(false);
	const [chForm, setChForm] = useState({ title: '', description: '' });
	// Spot bearbeiten (admin/spotmanager)
	const [editOpen, setEditOpen] = useState(false);
	const [editForm, setEditForm] = useState({ name: '', city: '', description: '' });
	const canEdit = me?.role === 'admin' || me?.role === 'spotmanager';

	const base = data?.spot ?? null;

	/** Bewertung zurückziehen (Stern erneut antippen entfernt sie nicht). */
	const clearVote = async () => {
		try {
			await removeSpotVote(spotId);
			await refresh();
		} catch (e) {
			Alert.alert('Fehler', e instanceof Error ? e.message : 'Fehlgeschlagen');
		}
	};

	const addPhoto = async () => {
		const ImagePicker = getImagePicker();
		if (!ImagePicker) {
			Alert.alert('Neue App-Version nötig', 'Bilder hochladen geht ab App-Version 1.1.0.');
			return;
		}
		const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
		if (!perm.granted) {
			Alert.alert('Kein Zugriff', 'Bitte den Galerie-Zugriff erlauben.');
			return;
		}
		const picked = await ImagePicker.launchImageLibraryAsync({
			mediaTypes: ['images'],
			quality: 0.85
		});
		if (picked.canceled || !picked.assets?.[0]) return;
		const a = picked.assets[0];
		try {
			await uploadSpotImage(spotId, a.uri, a.fileName ?? 'spot.jpg', a.mimeType ?? 'image/jpeg');
			await refresh();
		} catch (e) {
			Alert.alert('Upload fehlgeschlagen', e instanceof Error ? e.message : 'Unbekannt');
		}
	};

	const removePhoto = (imageId: number) =>
		Alert.alert('Bild löschen?', 'Das lässt sich nicht rückgängig machen.', [
			{ text: 'Abbrechen', style: 'cancel' },
			{
				text: 'Löschen',
				style: 'destructive',
				onPress: async () => {
					try {
						await deleteSpotImage(imageId);
						await refresh();
					} catch (e) {
						Alert.alert('Fehler', e instanceof Error ? e.message : 'Fehlgeschlagen');
					}
				}
			}
		]);

	const voteForTraining = async () => {
		if (!data?.nextOpenSessionId) return;
		try {
			await voteSpotForTraining(data.nextOpenSessionId, spotId);
			Alert.alert('Gestimmt', 'Der Spot ist fürs nächste Training vorgeschlagen.');
		} catch (e) {
			Alert.alert('Fehler', e instanceof Error ? e.message : 'Abstimmen fehlgeschlagen');
		}
	};

	const submitEdit = async () => {
		if (!base) return;
		if (!editForm.name.trim() || !editForm.city.trim()) {
			Alert.alert('Unvollständig', 'Name und Ort sind Pflicht.');
			return;
		}
		setEditOpen(false);
		try {
			await editSpot(spotId, {
				name: editForm.name.trim(),
				city: editForm.city.trim(),
				latitude: base.latitude,
				longitude: base.longitude,
				lighting: base.lighting ?? 'teilweise',
				techniques: (base.techniques ?? '').split(',').map((t) => t.trim()).filter(Boolean),
				goodWeather: (base.goodWeather ?? 'trocken').split(',').map((t) => t.trim()).filter(Boolean),
				description: editForm.description.trim(),
				isMicro: false,
				parentSpotId: null,
				parkingLocations: (data?.parkingLocations ?? []).map((p) => ({
					name: p.name,
					latitude: p.latitude,
					longitude: p.longitude
				}))
			});
			await refresh();
		} catch (e) {
			Alert.alert('Fehler', e instanceof Error ? e.message : 'Speichern fehlgeschlagen');
		}
	};

	const submitChallenge = async () => {
		if (!chForm.title.trim()) {
			Alert.alert('Titel fehlt', 'Gib der Challenge einen Namen.');
			return;
		}
		setChallengeOpen(false);
		try {
			await createChallenge(spotId, chForm.title.trim(), chForm.description.trim());
			setChForm({ title: '', description: '' });
			await refresh();
		} catch (e) {
			Alert.alert('Fehler', e instanceof Error ? e.message : 'Erstellen fehlgeschlagen');
		}
	};

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
								<Pressable
									onPress={() => setViewer(index)}
									onLongPress={() => removePhoto(item.id)}
								>
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

						</View>
						<View style={styles.myRate}>
							<Text style={styles.myRateLabel}>Deine Wertung:</Text>
							<Stars value={data.userVote ?? 0} size={20} onRate={rate} />
							{data.userVote ? (
								<Pressable onPress={clearVote} hitSlop={8}>
									<Text style={styles.clearVote}>entfernen</Text>
								</Pressable>
							) : null}
						</View>
						<View style={styles.actionBar}>
							<Button label="Foto hinzufügen" kind="ghost" small onPress={addPhoto} />
							{data.nextOpenSessionId ? (
								<Button label="Fürs Training vorschlagen" small onPress={voteForTraining} />
							) : null}
							{canEdit ? (
								<Button
									label="Bearbeiten"
									kind="ghost"
									small
									onPress={() => {
										setEditForm({
											name: base.name,
											city: base.city,
											description: base.description ?? ''
										});
										setEditOpen(true);
									}}
								/>
							) : null}
							{me?.role === 'admin' ? (
								<Button
									label="Löschen"
									kind="danger"
									small
									onPress={() =>
										Alert.alert('Spot in den Papierkorb?', base.name, [
											{ text: 'Abbrechen', style: 'cancel' },
											{
												text: 'Verschieben',
												style: 'destructive',
												onPress: async () => {
													await trashSpot(spotId);
													router.back();
												}
											}
										])
									}
								/>
							) : null}
						</View>
					</Card>

					{data.mapMarkers?.length ? (
						<View style={{ gap: 8 }}>
							<SectionTitle>Karte</SectionTitle>
							<NativeMap markers={data.mapMarkers} height={240} />
							<View style={styles.legendRow}>
								<Legend color={colors.accent} label="Spot" />
								<Legend color="#47c5ff" label="Parkplatz" />
								{data.parkingLocations?.length ? (
									<Text style={styles.legendMeta}>
										{data.parkingLocations.length} Parkplätze
									</Text>
								) : null}
								<Pressable
									onPress={() =>
										base.latitude && base.longitude
											? Linking.openURL(
													`geo:${base.latitude},${base.longitude}?q=${base.latitude},${base.longitude}(${encodeURIComponent(base.name)})`
												)
											: null
									}
									style={({ pressed }) => [styles.navBtn, pressed && { opacity: 0.7 }]}
								>
									<Ionicons name="navigate" size={14} color={colors.accent} />
									<Text style={styles.navBtnText}>Navigation starten</Text>
								</Pressable>
							</View>
						</View>
					) : null}

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

					<View style={styles.challengeHead}>
						<SectionTitle>{`Challenges · ${data.challenges.length}`}</SectionTitle>
						<Pressable
							onPress={() => setChallengeOpen(true)}
							hitSlop={8}
							style={({ pressed }) => [styles.addSmall, pressed && { opacity: 0.8 }]}
						>
							<Ionicons name="add" size={19} color={colors.onAccent} />
						</Pressable>
					</View>
					{data.challenges.length > 0 ? (
						<>
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
									<Pressable key={ch.id} onPress={() => router.push(`/challenge/${ch.id}?spot=${spotId}`)}>
									<Card style={{ gap: 8 }}>
										{ch.images?.[0] ? (
											<Image
												source={{ uri: mediaUrl(ch.images[0].url) ?? undefined }}
												style={styles.challengeImage}
												contentFit="cover"
												transition={150}
											/>
										) : null}
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
									</Pressable>
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

					<Sheet visible={editOpen} onClose={() => setEditOpen(false)} title="Spot bearbeiten">
						<Input
							placeholder="Name"
							value={editForm.name}
							onChangeText={(v) => setEditForm({ ...editForm, name: v })}
						/>
						<Input
							placeholder="Ort"
							value={editForm.city}
							onChangeText={(v) => setEditForm({ ...editForm, city: v })}
						/>
						<Input
							placeholder="Beschreibung"
							multiline
							value={editForm.description}
							onChangeText={(v) => setEditForm({ ...editForm, description: v })}
						/>
						<View style={styles.sheetActions}>
							<Button label="Abbrechen" kind="ghost" onPress={() => setEditOpen(false)} />
							<Button label="Speichern" onPress={submitEdit} />
						</View>
					</Sheet>

					{/* Neue Challenge */}
					<Sheet
						visible={challengeOpen}
						onClose={() => setChallengeOpen(false)}
						title={`Neue Challenge — ${base.name}`}
					>
						<Input
							placeholder="Titel (z. B. Kong über die Mauer)"
							value={chForm.title}
							onChangeText={(v) => setChForm({ ...chForm, title: v })}
						/>
						<Input
							placeholder="Beschreibung (optional)"
							multiline
							value={chForm.description}
							onChangeText={(v) => setChForm({ ...chForm, description: v })}
						/>
						<View style={styles.sheetActions}>
							<Button label="Abbrechen" kind="ghost" onPress={() => setChallengeOpen(false)} />
							<Button label="Erstellen" onPress={submitChallenge} />
						</View>
					</Sheet>

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

const makeStyles = (colors: ThemeColors) =>
	StyleSheet.create({
	rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
	galleryImage: { width: SCREEN_W * 0.72, height: SCREEN_W * 0.48, borderRadius: 12, backgroundColor: colors.hover },
	rateLabel: { color: colors.fg + textAlpha.muted, fontSize: 12, lineHeight: 16, fontFamily: fonts.sansBold, letterSpacing: 1.5 },
	scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
	scoreText: { color: colors.fg + textAlpha.secondary, fontSize: 12, lineHeight: 16 },
	mapBtn: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
		backgroundColor: colors.accent,
		borderRadius: 999,
		paddingHorizontal: 12,
		paddingVertical: 8
	},
	mapBtnText: { color: colors.onAccent, fontSize: 12, lineHeight: 16, fontFamily: fonts.sansBold },
	myRate: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
	myRateLabel: { color: colors.fg + textAlpha.secondary, fontSize: 12, lineHeight: 16 },
	description: { color: colors.fg + textAlpha.secondary, fontSize: 14, lineHeight: 20 },
	infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
	infoText: { color: colors.fg + textAlpha.secondary, fontSize: 12, lineHeight: 16, flex: 1 },
	progressText: { color: colors.fg + textAlpha.muted, fontSize: 12, lineHeight: 16 },
	challengeTitle: { color: colors.fg + textAlpha.primary, fontSize: 14, lineHeight: 20, fontFamily: fonts.sansBold, flex: 1 },
	challengeDesc: { color: colors.fg + textAlpha.secondary, fontSize: 12, lineHeight: 16 },
	doneRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
	doneText: { color: colors.fg + textAlpha.muted, fontSize: 12, lineHeight: 16 },
	doneBtn: {
		backgroundColor: colors.accent,
		borderRadius: 999,
		paddingVertical: 12,
		alignItems: 'center'
	},
	doneBtnText: { color: colors.onAccent, fontSize: 14, lineHeight: 20, fontFamily: fonts.sansBold },
	undoBtn: {
		backgroundColor: colors.hover,
		borderRadius: 999,
		paddingVertical: 12,
		alignItems: 'center'
	},
	undoBtnText: { color: colors.fg + textAlpha.muted, fontSize: 12, lineHeight: 16, fontFamily: fonts.sansSemi },
	challengeHead: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingRight: 2
	},
	addSmall: {
		width: 32,
		height: 32,
		borderRadius: 12,
		backgroundColor: colors.accent,
		alignItems: 'center',
		justifyContent: 'center',
		marginTop: 8
	},
	sheetActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
	clearVote: {
		color: colors.fg + textAlpha.muted,
		fontSize: 12,
		lineHeight: 16,
		textDecorationLine: 'underline'
	},
	actionBar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
	challengeImage: { width: '100%', height: 150, borderRadius: 12, backgroundColor: colors.hover },
	legendRow: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
	legendMeta: { color: colors.fg + textAlpha.muted, fontSize: 12, lineHeight: 16 },
	navBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
	navBtnText: { color: colors.accent, fontSize: 12, lineHeight: 16, fontFamily: fonts.sansSemi },
	nearbyRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
		backgroundColor: colors.card,
		borderRadius: 12,
		paddingHorizontal: 16,
		paddingVertical: 12
	},
	nearbyName: { color: colors.fg + textAlpha.primary, fontSize: 14, lineHeight: 20, fontFamily: fonts.sansSemi, flex: 1 },
	nearbyCity: { color: colors.fg + textAlpha.muted, fontSize: 12, lineHeight: 16 },
	viewerBackdrop: {
		flex: 1,
		backgroundColor: 'rgba(0,0,0,0.95)',
		alignItems: 'center',
		justifyContent: 'center'
	},
	viewerImage: { width: '100%', height: '80%' },
	viewerClose: { position: 'absolute', top: 54, right: 20 }
});
