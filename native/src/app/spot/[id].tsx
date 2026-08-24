import { useEffect, useRef, useState } from 'react';
import {
	View,
	Text,
	StyleSheet,
	Pressable,
	Alert,
	Modal,
	Dimensions,
	FlatList,
	Linking,
	InteractionManager,
	ActivityIndicator
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
import { ParentPicker } from '../../lib/ParentPicker';
import { ZoomableImage } from '../../lib/ZoomableImage';
import { report } from '../../lib/report';
import {
	getSpot,
	voteSpot,
	removeSpotVote,
	setChallengeDone,
	createChallenge,
	uploadChallengeMedia,
	uploadSpotImage,
	deleteSpotImage,
	voteSpotForTraining,
	editSpot,
	trashSpot,
	mediaUrl,
	isVideoUrl
} from '../../lib/api';
import { getImagePicker, getLocation } from '../../lib/nativeModules';
import { useAuth } from '../_layout';

const { width: SCREEN_W } = Dimensions.get('window');

/** Gleiche Liste wie das Web-Portal — sonst passen Filter und Finder nicht. */
const EDIT_TECHNIQUES = [
	'Präzisionssprung', 'Schwingen', 'Flow', 'Armsprung',
	'Klettern', 'Tic-Tac', 'Vault', 'Balance',
	'Drops', 'Katz', 'Roofgap'
];

/** Antippbarer Auswahl-Chip fürs Bearbeiten-Formular. */
function EditChip({
	label,
	active,
	onPress
}: {
	label: string;
	active: boolean;
	onPress: () => void;
}) {
	const { colors } = useTheme();
	return (
		<Pressable
			onPress={onPress}
			style={({ pressed }) => [
				{
					borderRadius: 16,
					borderWidth: 1,
					borderColor: active ? colors.accent : colors.border,
					backgroundColor: active ? colors.accent : colors.hover,
					paddingHorizontal: 13,
					paddingVertical: 7
				},
				pressed && { opacity: 0.8 }
			]}
		>
			<Text
				style={{
					color: active ? colors.onAccent : colors.fg + textAlpha.primary,
					fontSize: 13,
					lineHeight: 18,
					fontFamily: fonts.sansMedium
				}}
			>
				{label}
			</Text>
		</Pressable>
	);
}

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
	/** Karte erst zeichnen, wenn die Seite steht (siehe unten). */
	const [mapReady, setMapReady] = useState(false);
	useEffect(() => {
		const task = InteractionManager.runAfterInteractions(() => setMapReady(true));
		return () => task.cancel();
	}, []);

	/**
	 * Messen statt raten: Wie lange dauert das Öffnen, und was liegt auf der
	 * Seite? Wird einmal je Öffnen gemeldet, sobald die Daten da sind.
	 */
	const openedAt = useRef(Date.now());
	const measured = useRef(false);
	useEffect(() => {
		if (!data || measured.current) return;
		measured.current = true;
		const ms = Date.now() - openedAt.current;
		void report('schritt', `Spot-Seite geöffnet in ${ms} ms`, {
			spotId,
			ms,
			bilder: data.images.length,
			challenges: data.challenges.length,
			challengeBilder: data.challenges.filter((c) => c.images?.length).length,
			kartenpunkte: data.mapMarkers?.length ?? 0,
			parkplaetze: data.parkingLocations?.length ?? 0,
			nachbarn: data.nearbySpots?.length ?? 0
		});
	}, [data, spotId]);
	// Neue Challenge an diesem Spot
	const [challengeOpen, setChallengeOpen] = useState(false);
	const [chForm, setChForm] = useState({ title: '', description: '' });
	// Wie auf der Website: Bild vorher wählen, hochladen nach dem Anlegen —
	// die Challenge-ID gibt es erst dann.
	const [chMedia, setChMedia] = useState<{ uri: string; name: string; type: string } | null>(null);
	const [chBusy, setChBusy] = useState(false);
	// Spot bearbeiten (admin/spotmanager) — ALLE Felder wie im Web.
	const [editOpen, setEditOpen] = useState(false);
	const [editForm, setEditForm] = useState({
		name: '',
		city: '',
		description: '',
		coords: '',
		lighting: 'teilweise',
		techniques: [] as string[],
		weather: [] as string[],
		isMicro: false,
		parentSpotId: null as number | null,
		parking: [] as { name: string; coords: string }[]
	});
	const canEdit = me?.role === 'admin' || me?.role === 'spotmanager';
	const [parkingBusy, setParkingBusy] = useState<number | null>(null);

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

	/** „46.75123, 7.62345" → Koordinaten; leere Eingabe = keine. */
	const parseCoords = (text: string): { lat: number; lon: number } | null | 'invalid' => {
		const t = text.trim();
		if (!t) return null;
		const m = t.split(/[,;\s]+/).filter(Boolean);
		const lat = Number(m[0]);
		const lon = Number(m[1]);
		if (m.length !== 2 || !Number.isFinite(lat) || !Number.isFinite(lon)) return 'invalid';
		if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return 'invalid';
		return { lat, lon };
	};

	// Koordinaten von Hand tippen will niemand — Standort direkt übernehmen.
	const useHereForParking = async (index: number) => {
		const Location = getLocation();
		if (!Location) {
			Alert.alert('Neue App-Version nötig', 'Der Standort geht ab App-Version 1.1.');
			return;
		}
		setParkingBusy(index);
		try {
			const perm = await Location.requestForegroundPermissionsAsync();
			if (!perm.granted) {
				Alert.alert('Kein Zugriff', 'Für den Standort braucht die App die Ortungsberechtigung.');
				return;
			}
			const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
			const coords = `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`;
			setEditForm((prev) => ({
				...prev,
				parking: prev.parking.map((x, k) => (k === index ? { ...x, coords } : x))
			}));
		} catch (e) {
			Alert.alert('Fehler', e instanceof Error ? e.message : 'Standort nicht verfügbar');
		} finally {
			setParkingBusy(null);
		}
	};

	const startEdit = () => {
		if (!base) return;
		setEditForm({
			name: base.name,
			city: base.city,
			description: base.description ?? '',
			coords:
				base.latitude != null && base.longitude != null
					? `${base.latitude}, ${base.longitude}`
					: '',
			lighting: base.lighting ?? 'teilweise',
			techniques: (base.techniques ?? '').split(',').map((t) => t.trim()).filter(Boolean),
			weather: (base.goodWeather ?? 'trocken').split(',').map((t) => t.trim()).filter(Boolean),
			isMicro: Boolean(base.isMicro),
			parentSpotId: base.parentSpotId ?? null,
			parking: (data?.parkingLocations ?? []).map((p) => ({
				name: p.name ?? '',
				coords: `${p.latitude}, ${p.longitude}`
			}))
		});
		setEditOpen(true);
	};

	const submitEdit = async () => {
		if (!base) return;
		if (!editForm.name.trim() || !editForm.city.trim()) {
			Alert.alert('Unvollständig', 'Name und Ort sind Pflicht.');
			return;
		}
		if (editForm.weather.length === 0) {
			Alert.alert('Wetter fehlt', 'Mindestens eine Wetter-Eignung wählen (trocken/nass).');
			return;
		}
		const coords = parseCoords(editForm.coords);
		if (coords === 'invalid') {
			Alert.alert('Koordinaten ungültig', 'Format: 46.75123, 7.62345 — oder Feld leer lassen.');
			return;
		}
		const parking: { name: string | null; latitude: number; longitude: number }[] = [];
		for (const p of editForm.parking) {
			const pc = parseCoords(p.coords);
			if (pc === 'invalid' || pc === null) {
				Alert.alert(
					'Parkplatz unvollständig',
					`„${p.name || 'Parkplatz'}" braucht Koordinaten (Format: 46.75, 7.62) — oder Zeile mit × entfernen.`
				);
				return;
			}
			parking.push({ name: p.name.trim() || null, latitude: pc.lat, longitude: pc.lon });
		}
		try {
			await editSpot(spotId, {
				name: editForm.name.trim(),
				city: editForm.city.trim(),
				latitude: coords?.lat ?? null,
				longitude: coords?.lon ?? null,
				lighting: editForm.lighting,
				techniques: editForm.techniques,
				goodWeather: editForm.weather,
				description: editForm.description.trim(),
				isMicro: editForm.isMicro,
				parentSpotId: editForm.isMicro ? editForm.parentSpotId : null,
				parkingLocations: parking
			});
			// Erst nach Erfolg schliessen — bei Fehlern bleiben die Eingaben erhalten.
			setEditOpen(false);
			await refresh();
		} catch (e) {
			Alert.alert('Fehler', e instanceof Error ? e.message : 'Speichern fehlgeschlagen');
		}
	};

	const pickChallengeMedia = async () => {
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
			mediaTypes: ['images', 'videos'],
			quality: 0.85
		});
		if (picked.canceled || !picked.assets?.[0]) return;
		const a = picked.assets[0];
		setChMedia({
			uri: a.uri,
			name: a.fileName ?? (a.type === 'video' ? 'challenge.mp4' : 'challenge.jpg'),
			type: a.mimeType ?? (a.type === 'video' ? 'video/mp4' : 'image/jpeg')
		});
	};

	const submitChallenge = async () => {
		if (!chForm.title.trim()) {
			Alert.alert('Titel fehlt', 'Gib der Challenge einen Namen.');
			return;
		}
		setChBusy(true);
		try {
			const res = await createChallenge(spotId, chForm.title.trim(), chForm.description.trim());
			const newId = res.challenge?.id;
			if (chMedia && newId) {
				try {
					await uploadChallengeMedia(newId, chMedia.uri, chMedia.name, chMedia.type);
				} catch (e) {
					// Challenge steht bereits — nur der Upload ging schief.
					Alert.alert(
						'Challenge angelegt, Bild nicht',
						e instanceof Error ? e.message : 'Upload fehlgeschlagen'
					);
				}
			}
			// Erst nach Erfolg schliessen — sonst wären die Eingaben weg.
			setChallengeOpen(false);
			setChForm({ title: '', description: '' });
			setChMedia(null);
			await refresh();
		} catch (e) {
			Alert.alert('Fehler', e instanceof Error ? e.message : 'Erstellen fehlgeschlagen');
		} finally {
			setChBusy(false);
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
							renderItem={({ item, index }) => {
								// Löschen war nur über langes Drücken erreichbar — das
								// findet niemand. Jetzt ein sichtbares ✕ für alle, die
								// dürfen: Admin, Spotmanager oder wer es hochgeladen hat.
								const mayDelete =
									me?.role === 'admin' ||
									me?.role === 'spotmanager' ||
									(item.uploadedBy != null && item.uploadedBy === me?.id);
								return (
									<View>
										<Pressable
											onPress={() => setViewer(index)}
											onLongPress={() => (mayDelete ? removePhoto(item.id) : undefined)}
										>
											<Image
												source={{ uri: mediaUrl(item.url, 480) ?? undefined }}
												style={styles.galleryImage}
												contentFit="cover"
												transition={150}
											/>
										</Pressable>
										{mayDelete ? (
											<Pressable
												onPress={() => removePhoto(item.id)}
												hitSlop={8}
												style={({ pressed }) => [styles.imageDelete, pressed && { opacity: 0.7 }]}
											>
												<Ionicons name="close" size={15} color="#fff" />
											</Pressable>
										) : null}
									</View>
								);
							}}
						/>
					) : null}

					<Card>
						{/* Eine Zeile für alles: Sterne zeigen den Schnitt, Antippen wertet. */}
						<View style={styles.rateRow}>
							<Stars value={data.avgScore} size={22} onRate={rate} />
							<View style={{ flex: 1 }}>
								<Text style={styles.scoreText}>
									{data.voteCount > 0
										? `Ø ${data.avgScore.toFixed(1)} · ${data.voteCount} Stimme${data.voteCount === 1 ? '' : 'n'}`
										: 'Noch keine Bewertung'}
								</Text>
								<Text style={styles.myVoteText}>
									{data.userVote
										? `Deine Wertung: ${data.userVote}`
										: 'Sterne antippen zum Bewerten'}
								</Text>
							</View>
							{data.userVote ? (
								<Pressable onPress={clearVote} hitSlop={10}>
									<Ionicons name="close-circle-outline" size={20} color={colors.textMuted} />
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
									onPress={startEdit}
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
							{/*
							 * Die Karte kommt bewusst NACH dem ersten Zeichnen. Sie ist
							 * mit Abstand der teuerste Teil der Seite; hängt sie sofort
							 * mit drin, ruckelt das Öffnen und die ersten Wischer.
							 */}
							{mapReady ? (
							<NativeMap
								markers={data.mapMarkers}
								height={240}
								defaultSatellite
								onMarkerPress={(m) => {
									// Ein anderer Spot auf der Karte gehört geöffnet, nicht
									// navigiert — die Navigation steht auf der Spot-Seite.
									// Parkplätze und der Spot selbst führen weiterhin zur Route.
									if ((m.kind === 'micro' || m.kind === 'parent' || m.kind === 'nearby') && m.id > 0) {
										router.push(`/spot/${m.id}`);
										return;
									}
									Linking.openURL(
										`geo:${m.lat},${m.lon}?q=${m.lat},${m.lon}(${encodeURIComponent(m.name)})`
									);
								}}
							/>
							) : (
								<View style={[styles.mapPlaceholder, { height: 240 }]}>
									<ActivityIndicator color={colors.accent} />
									<Text style={styles.mapPlaceholderText}>Karte wird geladen …</Text>
								</View>
							)}
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
									<Text style={styles.infoText}>
										Geeignet bei: {base.goodWeather.split(',').map((t: string) => t.trim()).filter(Boolean).join(' und ')}
									</Text>
								</View>
							) : null}
							{base.techniques ? (
								<View style={styles.infoRow}>
									<Ionicons name="body-outline" size={15} color={colors.textSecondary} />
									<Text style={styles.infoText}>
										{base.techniques.split(',').map((t: string) => t.trim()).filter(Boolean).join(' · ')}
									</Text>
								</View>
							) : null}
							{base.addedByName ? (
								<View style={styles.infoRow}>
									<Ionicons name="person-add-outline" size={15} color={colors.textSecondary} />
									<Text style={styles.infoText}>Hinzugefügt von {base.addedByName}</Text>
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
											isVideoUrl(ch.images[0].url) ? (
												// Videos haben kein Standbild — Play-Fläche statt Leere.
												<View style={[styles.challengeImage, styles.challengeVideo]}>
													<Ionicons name="play-circle" size={42} color={colors.onAccent} />
												</View>
											) : (
												<Image
													source={{ uri: mediaUrl(ch.images[0].url, 480) ?? undefined }}
													style={styles.challengeImage}
													contentFit="cover"
													transition={150}
												/>
											)
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
												<InitialsRow people={ch.doneBy} />
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

					{/* Wie auf der Website: Weg zum Hauptspot und zu den Microspots. */}
					{data.parentSpot ? (
						<>
							<SectionTitle>Zugehöriger Hauptspot</SectionTitle>
							<Pressable onPress={() => router.push(`/spot/${data.parentSpot!.id}`)}>
								{({ pressed }) => (
									<View style={[styles.nearbyRow, pressed && { opacity: 0.8 }]}>
										<Ionicons name="git-merge-outline" size={16} color={colors.accent} />
										<Text style={styles.nearbyName}>{data.parentSpot!.name}</Text>
										<Text style={styles.nearbyCity}>{data.parentSpot!.city}</Text>
										<Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
									</View>
								)}
							</Pressable>
						</>
					) : null}

					{data.childMicroSpots?.length ? (
						<>
							<SectionTitle>{`Zugehörige Microspots · ${data.childMicroSpots.length}`}</SectionTitle>
							{data.childMicroSpots.map((m) => (
								<Pressable key={m.id} onPress={() => router.push(`/spot/${m.id}`)}>
									{({ pressed }) => (
										<View style={[styles.nearbyRow, pressed && { opacity: 0.8 }]}>
											<Ionicons name="albums-outline" size={16} color={colors.accentBlue} />
											<Text style={styles.nearbyName}>{m.name}</Text>
											<Text style={styles.nearbyCity}>{m.city}</Text>
											<Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
										</View>
									)}
								</Pressable>
							))}
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

					<Sheet
						visible={editOpen}
						onClose={() => setEditOpen(false)}
						title="Spot bearbeiten"
					>
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
						<Text style={styles.editLabel}>Koordinaten (Breite, Länge)</Text>
						<Input
							placeholder="46.75123, 7.62345"
							autoCapitalize="none"
							value={editForm.coords}
							onChangeText={(v) => setEditForm({ ...editForm, coords: v })}
						/>
						<Text style={styles.editLabel}>Beleuchtung</Text>
						<View style={styles.editChipRow}>
							{[
								{ key: 'ja', label: 'Beleuchtet' },
								{ key: 'teilweise', label: 'Teilweise' },
								{ key: 'nein', label: 'Dunkel' }
							].map((l) => (
								<EditChip
									key={l.key}
									label={l.label}
									active={editForm.lighting === l.key}
									onPress={() => setEditForm({ ...editForm, lighting: l.key })}
								/>
							))}
						</View>
						<Text style={styles.editLabel}>Geeignet bei</Text>
						<View style={styles.editChipRow}>
							{['trocken', 'nass'].map((w) => (
								<EditChip
									key={w}
									label={w === 'trocken' ? 'Trocken' : 'Auch bei Nässe'}
									active={editForm.weather.includes(w)}
									onPress={() =>
										setEditForm({
											...editForm,
											weather: editForm.weather.includes(w)
												? editForm.weather.filter((x) => x !== w)
												: [...editForm.weather, w]
										})
									}
								/>
							))}
						</View>
						<Text style={styles.editLabel}>Techniken</Text>
						<View style={styles.editChipRow}>
							{EDIT_TECHNIQUES.map((t) => (
								<EditChip
									key={t}
									label={t}
									active={editForm.techniques.includes(t)}
									onPress={() =>
										setEditForm({
											...editForm,
											techniques: editForm.techniques.includes(t)
												? editForm.techniques.filter((x) => x !== t)
												: [...editForm.techniques, t]
										})
									}
								/>
							))}
						</View>
						<Text style={styles.editLabel}>Microspot</Text>
						<View style={styles.editChipRow}>
							<EditChip
								label={editForm.isMicro ? 'Ist ein Microspot ✓' : 'Kein Microspot'}
								active={editForm.isMicro}
								onPress={() => setEditForm({ ...editForm, isMicro: !editForm.isMicro })}
							/>
						</View>
						{editForm.isMicro ? (
							// Suchfeld statt Knopf-Wand: bei über fünfzig Spots war das
							// Zuordnen sonst reine Sucherei.
							<ParentPicker
								options={(data.parentCandidates ?? []).filter((c) => c.id !== spotId)}
								value={editForm.parentSpotId}
								onChange={(id) => setEditForm({ ...editForm, parentSpotId: id })}
							/>
						) : null}
						<Text style={styles.editLabel}>{`Parkplätze · ${editForm.parking.length}`}</Text>
						<Text style={styles.parkingHint}>
							Am einfachsten: vor Ort „Ich stehe hier" tippen — sonst Koordinaten
							als „46.75, 7.62" eintragen.
						</Text>
						{editForm.parking.map((p, i) => (
							<View key={i} style={styles.parkingRow}>
								<View style={{ flex: 1, gap: 6 }}>
									<Input
										placeholder={`Parkplatz ${i + 1} — Name (optional)`}
										value={p.name}
										onChangeText={(v) =>
											setEditForm({
												...editForm,
												parking: editForm.parking.map((x, k) => (k === i ? { ...x, name: v } : x))
											})
										}
									/>
									<Input
										placeholder="46.75, 7.62"
										autoCapitalize="none"
										value={p.coords}
										onChangeText={(v) =>
											setEditForm({
												...editForm,
												parking: editForm.parking.map((x, k) => (k === i ? { ...x, coords: v } : x))
											})
										}
									/>
									<Button
										label={parkingBusy === i ? 'Ortet …' : '📍 Ich stehe hier'}
										kind="ghost"
										small
										onPress={() => useHereForParking(i)}
									/>
								</View>
								<Pressable
									onPress={() =>
										setEditForm({
											...editForm,
											parking: editForm.parking.filter((_, k) => k !== i)
										})
									}
									hitSlop={10}
								>
									<Ionicons name="close-circle" size={22} color={colors.danger} />
								</Pressable>
							</View>
						))}
						<Button
							label="+ Parkplatz"
							kind="ghost"
							small
							onPress={() =>
								setEditForm({
									...editForm,
									parking: [...editForm.parking, { name: '', coords: '' }]
								})
							}
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
						{chMedia ? (
							<View style={styles.chMediaRow}>
								<Image
									source={{ uri: chMedia.uri }}
									style={styles.chMediaThumb}
									contentFit="cover"
								/>
								<Text style={styles.chMediaName} numberOfLines={2}>
									{chMedia.name}
								</Text>
								<Button label="Entfernen" kind="ghost" small onPress={() => setChMedia(null)} />
							</View>
						) : null}
						<Button
							label={chMedia ? 'Anderes Bild wählen' : '📷 Bild oder Video wählen'}
							kind="ghost"
							small
							onPress={pickChallengeMedia}
						/>
						<View style={styles.sheetActions}>
							<Button
								label="Abbrechen"
								kind="ghost"
								onPress={() => {
									setChallengeOpen(false);
									setChMedia(null);
								}}
							/>
							<Button
								label={chBusy ? 'Wird angelegt …' : 'Erstellen'}
								onPress={submitChallenge}
								disabled={chBusy}
							/>
						</View>
					</Sheet>

					{/* Vollbild-Viewer für Spot-Bilder */}
					<Modal visible={viewer !== null} transparent animationType="fade">
						<View style={styles.viewerBackdrop}>
							{/* Hintergrund schliesst; das Bild selbst nimmt die Gesten. */}
							<Pressable
								style={StyleSheet.absoluteFill}
								onPress={() => setViewer(null)}
							/>
							{viewer !== null && data.images[viewer] ? (
								<ZoomableImage
									/* Vollansicht in 1600 px statt Original: bis 8 MB weniger. */
									uri={mediaUrl(data.images[viewer].url, 1600) ?? ''}
									onSingleTap={() => setViewer(null)}
								/>
							) : null}
							<Pressable style={styles.viewerClose} onPress={() => setViewer(null)}>
								<Ionicons name="close" size={28} color="#fff" />
							</Pressable>
						</View>
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
	rateRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
	scoreText: {
		color: colors.fg + textAlpha.primary,
		fontSize: 13,
		lineHeight: 18,
		fontFamily: fonts.sansSemi
	},
	myVoteText: { color: colors.fg + textAlpha.muted, fontSize: 11, lineHeight: 15 },
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
	challengeVideo: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.hover },
	mapPlaceholder: {
		alignItems: 'center',
		justifyContent: 'center',
		gap: 8,
		borderRadius: 16,
		backgroundColor: colors.bgSecondary
	},
	mapPlaceholderText: { color: colors.fg + textAlpha.muted, fontSize: 13, lineHeight: 18 },
	imageDelete: {
		position: 'absolute',
		top: 6,
		right: 6,
		width: 26,
		height: 26,
		borderRadius: 13,
		backgroundColor: 'rgba(0,0,0,0.55)',
		alignItems: 'center',
		justifyContent: 'center'
	},
	chMediaRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
	chMediaThumb: { width: 54, height: 54, borderRadius: 10, backgroundColor: colors.bgSecondary },
	chMediaName: { flex: 1, color: colors.fg + textAlpha.secondary, fontSize: 12, lineHeight: 17, fontFamily: fonts.sans },
	editLabel: {
		color: colors.fg + textAlpha.muted,
		fontSize: 12,
		lineHeight: 16,
		fontFamily: fonts.sansBold,
		letterSpacing: 1,
		marginTop: 4
	},
	editChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
	parkingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
	parkingHint: { color: colors.fg + textAlpha.muted, fontSize: 12, lineHeight: 17 },
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
	viewerHint: {
		position: 'absolute',
		bottom: 34,
		alignSelf: 'center',
		color: 'rgba(255,255,255,0.65)',
		fontSize: 12,
		lineHeight: 17
	},
	viewerClose: { position: 'absolute', top: 54, right: 20 }
});
