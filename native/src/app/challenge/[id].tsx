import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, Modal, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getImagePicker } from '../../lib/nativeModules';
import Ionicons from '@expo/vector-icons/Ionicons';
import { fonts, type ThemeColors } from '../../lib/theme';
import { textAlpha } from '../../lib/tokens';
import { useTheme, useThemedStyles } from '../../lib/themeContext';
import { Card, TopBar, Screen, Pill, ErrorCard, Button, SectionTitle, Avatar, Sheet, Input } from '../../lib/ui';
import { useData } from '../../lib/store';
import {
	getSpot,
	setChallengeDone,
	uploadChallengeMedia,
	editChallenge,
	deleteChallenge,
	removeChallengeCompletion,
	deleteChallengeImage,
	mediaUrl
} from '../../lib/api';
import { useAuth } from '../_layout';

const { width: SCREEN_W } = Dimensions.get('window');

/** Videos werden abgespielt, Bilder gross angezeigt. */
const isVideo = (url: string) => /\.(mp4|mov|webm)(\?|$)/i.test(url);

/**
 * Challenge-Detailseite: Beschreibung, Galerie, wer sie geschafft hat und
 * wer noch offen ist, eigener Status und Medien-Upload aus der App.
 */
export default function ChallengeDetail() {
	const { id, spot } = useLocalSearchParams<{ id: string; spot?: string }>();
	const challengeId = Number(id);
	const spotId = Number(spot);
	const { me } = useAuth();
	const { colors } = useTheme();
	const styles = useThemedStyles(makeStyles);
	const router = useRouter();
	const { data, error, refresh, refreshing, onRefresh } = useData(`spot-${spotId}`, () =>
		getSpot(spotId)
	);
	const [viewer, setViewer] = useState<number | null>(null);
	const [busy, setBusy] = useState(false);
	const [editOpen, setEditOpen] = useState(false);
	const [form, setForm] = useState({ title: '', description: '' });
	const canManage = me?.role === 'admin' || me?.role === 'spotmanager';

	const challenge = data?.challenges.find((c) => c.id === challengeId) ?? null;
	const mineDone = challenge && me ? challenge.doneBy.some((d) => d.userId === me.id) : false;

	const toggle = async () => {
		if (!challenge) return;
		try {
			await setChallengeDone(challenge.id, !mineDone);
			await refresh();
		} catch (e) {
			Alert.alert('Fehler', e instanceof Error ? e.message : 'Aktion fehlgeschlagen');
		}
	};

	const addMedia = async () => {
		const ImagePicker = getImagePicker();
		if (!ImagePicker) {
			Alert.alert('Neue App-Version nötig', 'Bilder hochladen geht ab App-Version 1.1.0.');
			return;
		}
		const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
		if (!perm.granted) {
			Alert.alert('Kein Zugriff', 'Für den Upload braucht die App Zugriff auf deine Galerie.');
			return;
		}
		const picked = await ImagePicker.launchImageLibraryAsync({
			mediaTypes: ['images', 'videos'],
			quality: 0.85
		});
		if (picked.canceled || !picked.assets?.[0]) return;
		const asset = picked.assets[0];
		setBusy(true);
		try {
			await uploadChallengeMedia(
				challengeId,
				asset.uri,
				asset.fileName ?? `upload-${challengeId}.jpg`,
				asset.mimeType ?? (asset.type === 'video' ? 'video/mp4' : 'image/jpeg')
			);
			await refresh();
		} catch (e) {
			Alert.alert('Upload fehlgeschlagen', e instanceof Error ? e.message : 'Unbekannter Fehler');
		} finally {
			setBusy(false);
		}
	};

	const saveEdit = async () => {
		if (!form.title.trim()) {
			Alert.alert('Titel fehlt', 'Die Challenge braucht einen Namen.');
			return;
		}
		setEditOpen(false);
		try {
			await editChallenge(challengeId, form.title.trim(), form.description.trim());
			await refresh();
		} catch (e) {
			Alert.alert('Fehler', e instanceof Error ? e.message : 'Speichern fehlgeschlagen');
		}
	};

	const removeChallenge = () =>
		Alert.alert('Challenge löschen?', 'Sie landet im Papierkorb.', [
			{ text: 'Abbrechen', style: 'cancel' },
			{
				text: 'Löschen',
				style: 'destructive',
				onPress: async () => {
					try {
						await deleteChallenge(challengeId);
						router.back();
					} catch (e) {
						Alert.alert('Fehler', e instanceof Error ? e.message : 'Fehlgeschlagen');
					}
				}
			}
		]);

	return (
		<Screen refreshing={refreshing} onRefresh={onRefresh}>
			<TopBar back kicker={data?.spot.name ?? 'Challenge'} title={challenge?.title ?? '…'} />
			{error && !data ? <ErrorCard message={error} /> : null}

			{challenge ? (
				<>
					{challenge.images.length > 0 ? (
						<View style={{ gap: 8 }}>
							{challenge.images.map((img, i) => (
								<Pressable
									key={img.id}
									onPress={() => setViewer(i)}
									onLongPress={() =>
										Alert.alert('Medium löschen?', '', [
											{ text: 'Abbrechen', style: 'cancel' },
											{
												text: 'Löschen',
												style: 'destructive',
												onPress: async () => {
													try {
														await deleteChallengeImage(img.id);
														await refresh();
													} catch (e) {
														Alert.alert('Fehler', e instanceof Error ? e.message : 'Fehlgeschlagen');
													}
												}
											}
										])
									}
								>
									{isVideo(img.url) ? (
										<View style={styles.videoWrap}>
											<Ionicons name="play-circle" size={48} color="#fff" />
											<Text style={styles.videoText}>Video ansehen</Text>
										</View>
									) : (
										<Image
											source={{ uri: mediaUrl(img.url) ?? undefined }}
											style={styles.media}
											contentFit="cover"
											transition={150}
										/>
									)}
								</Pressable>
							))}
						</View>
					) : null}

					<Card style={{ gap: 12 }}>
						{challenge.description ? (
							<Text style={styles.description}>{challenge.description}</Text>
						) : (
							<Text style={styles.descriptionMuted}>Keine Beschreibung hinterlegt.</Text>
						)}
						<View style={styles.actionRow}>
							{mineDone ? <Pill label="✓ Geschafft" color={colors.success} /> : null}
							<Button
								label={mineDone ? 'Doch nicht geschafft' : 'Geschafft!'}
								kind={mineDone ? 'ghost' : 'accent'}
								onPress={toggle}
							/>
							<Button
								label={busy ? 'Lädt hoch …' : 'Foto / Video'}
								kind="ghost"
								onPress={addMedia}
							/>
							{canManage ? (
								<>
									<Button
										label="Bearbeiten"
										kind="ghost"
										onPress={() => {
											setForm({
												title: challenge.title,
												description: challenge.description ?? ''
											});
											setEditOpen(true);
										}}
									/>
									<Button label="Löschen" kind="danger" onPress={removeChallenge} />
								</>
							) : null}
						</View>
					</Card>

					<SectionTitle>{`Geschafft · ${challenge.doneBy.length}`}</SectionTitle>
					<Card style={{ gap: 4 }}>
						{challenge.doneBy.length === 0 ? (
							<Text style={styles.descriptionMuted}>Noch niemand — sei der Erste.</Text>
						) : (
							challenge.doneBy.map((d, i) => (
								<Pressable
									key={d.userId}
									onPress={() => router.push(`/profile/${d.userId}`)}
									style={({ pressed }) => [styles.personRow, pressed && { opacity: 0.7 }]}
								>
									<Avatar username={d.username} avatar={d.avatar} size={32} index={i} />
									<Text style={styles.personName}>{d.username}</Text>
									{canManage && d.userId !== me?.id ? (
										<Pressable
											hitSlop={8}
											onPress={() =>
												Alert.alert('Erledigung entfernen?', `Bei ${d.username}`, [
													{ text: 'Abbrechen', style: 'cancel' },
													{
														text: 'Entfernen',
														style: 'destructive',
														onPress: async () => {
															await removeChallengeCompletion(challengeId, d.userId);
															await refresh();
														}
													}
												])
											}
										>
											<Ionicons name="close-circle" size={19} color={colors.danger} />
										</Pressable>
									) : (
										<Ionicons name="checkmark-circle" size={18} color={colors.success} />
									)}
								</Pressable>
							))
						)}
					</Card>

					{challenge.openBy.length > 0 ? (
						<>
							<SectionTitle>{`Noch offen · ${challenge.openBy.length}`}</SectionTitle>
							<Card style={{ gap: 4 }}>
								{challenge.openBy.map((o, i) => (
									<Pressable
										key={o.id}
										onPress={() => router.push(`/profile/${o.id}`)}
										style={({ pressed }) => [styles.personRow, pressed && { opacity: 0.7 }]}
									>
										<Avatar username={o.username} avatar={o.avatar} size={32} index={i} />
										<Text style={styles.personNameMuted}>{o.username}</Text>
									</Pressable>
								))}
							</Card>
						</>
					) : null}

					<Sheet visible={editOpen} onClose={() => setEditOpen(false)} title="Challenge bearbeiten">
						<Input
							placeholder="Titel"
							value={form.title}
							onChangeText={(v) => setForm({ ...form, title: v })}
						/>
						<Input
							placeholder="Beschreibung"
							multiline
							value={form.description}
							onChangeText={(v) => setForm({ ...form, description: v })}
						/>
						<View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
							<Button label="Abbrechen" kind="ghost" onPress={() => setEditOpen(false)} />
							<Button label="Speichern" onPress={saveEdit} />
						</View>
					</Sheet>

					<Modal visible={viewer !== null} transparent animationType="fade">
						<Pressable style={styles.viewerBackdrop} onPress={() => setViewer(null)}>
							{viewer !== null && challenge.images[viewer] ? (
								<Image
									source={{ uri: mediaUrl(challenge.images[viewer].url) ?? undefined }}
									style={styles.viewerImage}
									contentFit="contain"
								/>
							) : null}
						</Pressable>
					</Modal>
				</>
			) : null}
		</Screen>
	);
}

const makeStyles = (colors: ThemeColors) =>
	StyleSheet.create({
		media: { width: '100%', height: SCREEN_W * 0.6, borderRadius: 16, backgroundColor: colors.hover },
		videoWrap: {
			width: '100%',
			height: SCREEN_W * 0.5,
			borderRadius: 16,
			backgroundColor: colors.hover,
			alignItems: 'center',
			justifyContent: 'center',
			gap: 8
		},
		videoText: { color: colors.fg + textAlpha.secondary, fontSize: 14, lineHeight: 20 },
		description: {
			color: colors.fg + textAlpha.primary,
			fontSize: 14,
			lineHeight: 20,
			fontFamily: fonts.sans
		},
		descriptionMuted: {
			color: colors.fg + textAlpha.muted,
			fontSize: 14,
			lineHeight: 20,
			fontFamily: fonts.sans
		},
		actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
		personRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
		personName: {
			color: colors.fg + textAlpha.primary,
			fontSize: 14,
			lineHeight: 20,
			fontFamily: fonts.sansSemi,
			flex: 1
		},
		personNameMuted: {
			color: colors.fg + textAlpha.secondary,
			fontSize: 14,
			lineHeight: 20,
			fontFamily: fonts.sans,
			flex: 1
		},
		viewerBackdrop: {
			flex: 1,
			backgroundColor: 'rgba(0,0,0,0.95)',
			alignItems: 'center',
			justifyContent: 'center'
		},
		viewerImage: { width: '100%', height: '80%' }
	});
