import { useState } from 'react';
import { View, Text, StyleSheet, Alert, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { fonts, type ThemeColors } from '../lib/theme';
import { textAlpha } from '../lib/tokens';
import { useTheme, useThemedStyles } from '../lib/themeContext';
import { Card, TopBar, Screen, Button, Input, SectionTitle } from '../lib/ui';
import { createSpot, uploadSpotImage } from '../lib/api';

const LIGHTING = [
	{ key: 'ja', label: 'Beleuchtet' },
	{ key: 'teilweise', label: 'Teilweise' },
	{ key: 'nein', label: 'Dunkel' }
];
const WEATHER = [
	{ key: 'trocken', label: 'Trocken' },
	{ key: 'nass', label: 'Auch bei Nässe' }
];
const TECHNIQUES = ['Präzisionen', 'Kong', 'Wall', 'Rails', 'Klettern', 'Flips', 'Balance'];

/**
 * Neuen Spot anlegen — inklusive Standort vom Gerät und Fotos aus der
 * Galerie oder Kamera. Entspricht der Seite „Spot vorschlagen" im Portal.
 */
export default function NewSpot() {
	const { colors } = useTheme();
	const styles = useThemedStyles(makeStyles);
	const router = useRouter();

	const [name, setName] = useState('');
	const [city, setCity] = useState('');
	const [description, setDescription] = useState('');
	const [lighting, setLighting] = useState('teilweise');
	const [weather, setWeather] = useState<string[]>(['trocken']);
	const [techniques, setTechniques] = useState<string[]>([]);
	const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
	const [photos, setPhotos] = useState<ImagePicker.ImagePickerAsset[]>([]);
	const [busy, setBusy] = useState(false);

	const useMyLocation = async () => {
		const perm = await Location.requestForegroundPermissionsAsync();
		if (!perm.granted) {
			Alert.alert('Kein Zugriff', 'Für den Standort braucht die App die Ortungsberechtigung.');
			return;
		}
		const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
		setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
	};

	const addPhoto = async (fromCamera: boolean) => {
		const perm = fromCamera
			? await ImagePicker.requestCameraPermissionsAsync()
			: await ImagePicker.requestMediaLibraryPermissionsAsync();
		if (!perm.granted) {
			Alert.alert('Kein Zugriff', 'Bitte den Zugriff in den Einstellungen erlauben.');
			return;
		}
		const picked = fromCamera
			? await ImagePicker.launchCameraAsync({ quality: 0.85 })
			: await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
		if (!picked.canceled && picked.assets?.[0]) setPhotos((p) => [...p, picked.assets[0]]);
	};

	const toggle = (list: string[], set: (v: string[]) => void, value: string) =>
		set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

	const submit = async () => {
		if (!name.trim() || !city.trim()) {
			Alert.alert('Unvollständig', 'Name und Ort sind Pflicht.');
			return;
		}
		setBusy(true);
		try {
			const res = await createSpot({
				name: name.trim(),
				city: city.trim(),
				latitude: coords?.lat ?? null,
				longitude: coords?.lon ?? null,
				lighting,
				techniques,
				goodWeather: weather.length ? weather : ['trocken'],
				description: description.trim()
			});
			const newId = res.id;
			if (newId) {
				for (const photo of photos) {
					await uploadSpotImage(
						newId,
						photo.uri,
						photo.fileName ?? `spot-${newId}.jpg`,
						photo.mimeType ?? 'image/jpeg'
					);
				}
			}
			Alert.alert('Gespeichert', `„${name.trim()}" wurde angelegt.`);
			router.back();
		} catch (e) {
			Alert.alert('Fehler', e instanceof Error ? e.message : 'Speichern fehlgeschlagen');
		} finally {
			setBusy(false);
		}
	};

	return (
		<Screen>
			<TopBar back kicker="Neuer Ort" title="Spot anlegen" />

			<Card style={{ gap: 12 }}>
				<Input placeholder="Name des Spots" value={name} onChangeText={setName} />
				<Input placeholder="Ort / Stadt" value={city} onChangeText={setCity} />
				<Input
					placeholder="Beschreibung (optional)"
					multiline
					value={description}
					onChangeText={setDescription}
				/>
			</Card>

			<SectionTitle>Standort</SectionTitle>
			<Card style={{ gap: 12 }}>
				{coords ? (
					<Text style={styles.coords}>
						{coords.lat.toFixed(5)}, {coords.lon.toFixed(5)}
					</Text>
				) : (
					<Text style={styles.muted}>Noch kein Standort — hilft beim Finden auf der Karte.</Text>
				)}
				<Button label="Aktuellen Standort übernehmen" kind="ghost" onPress={useMyLocation} />
			</Card>

			<SectionTitle>Beleuchtung</SectionTitle>
			<View style={styles.chipRow}>
				{LIGHTING.map((l) => (
					<Chip
						key={l.key}
						label={l.label}
						active={lighting === l.key}
						onPress={() => setLighting(l.key)}
					/>
				))}
			</View>

			<SectionTitle>Bei welchem Wetter?</SectionTitle>
			<View style={styles.chipRow}>
				{WEATHER.map((w) => (
					<Chip
						key={w.key}
						label={w.label}
						active={weather.includes(w.key)}
						onPress={() => toggle(weather, setWeather, w.key)}
					/>
				))}
			</View>

			<SectionTitle>Techniken</SectionTitle>
			<View style={styles.chipRow}>
				{TECHNIQUES.map((t) => (
					<Chip
						key={t}
						label={t}
						active={techniques.includes(t)}
						onPress={() => toggle(techniques, setTechniques, t)}
					/>
				))}
			</View>

			<SectionTitle>{`Fotos · ${photos.length}`}</SectionTitle>
			{photos.length > 0 ? (
				<View style={styles.photoRow}>
					{photos.map((p, i) => (
						<Image key={i} source={{ uri: p.uri }} style={styles.photo} contentFit="cover" />
					))}
				</View>
			) : null}
			<View style={styles.chipRow}>
				<Button label="Aus Galerie" kind="ghost" onPress={() => addPhoto(false)} />
				<Button label="Kamera" kind="ghost" onPress={() => addPhoto(true)} />
			</View>

			<Button
				label={busy ? 'Speichert …' : 'Spot anlegen'}
				onPress={submit}
				wide
			/>
		</Screen>
	);
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
	const { colors } = useTheme();
	const styles = useThemedStyles(makeStyles);
	return (
		<Pressable
			onPress={onPress}
			style={({ pressed }) => [
				styles.chip,
				active && { backgroundColor: colors.accent, borderColor: colors.accent },
				pressed && { opacity: 0.8 }
			]}
		>
			<Text style={[styles.chipText, active && { color: colors.onAccent }]}>{label}</Text>
		</Pressable>
	);
}

const makeStyles = (colors: ThemeColors) =>
	StyleSheet.create({
		muted: { color: colors.fg + textAlpha.muted, fontSize: 14, lineHeight: 20, fontFamily: fonts.sans },
		coords: {
			color: colors.fg + textAlpha.primary,
			fontSize: 14,
			lineHeight: 20,
			fontFamily: fonts.sansSemi
		},
		chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
		chip: {
			borderRadius: 999,
			borderWidth: 1,
			borderColor: colors.border,
			backgroundColor: colors.hover,
			paddingHorizontal: 14,
			paddingVertical: 8
		},
		chipText: {
			color: colors.fg + textAlpha.primary,
			fontSize: 13,
			lineHeight: 18,
			fontFamily: fonts.sansMedium
		},
		photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
		photo: { width: 80, height: 80, borderRadius: 12, backgroundColor: colors.hover }
	});
