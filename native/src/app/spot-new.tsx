import { useEffect, useRef, useState } from 'react';
import { useData } from '../lib/store';
import { loadDraft, saveDraft, clearDraft } from '../lib/draft';
import { ParentPicker } from '../lib/ParentPicker';
import { View, Text, StyleSheet, Alert, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { getLocation, getImagePicker } from '../lib/nativeModules';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { fonts, type ThemeColors } from '../lib/theme';
import { textAlpha } from '../lib/tokens';
import { useTheme, useThemedStyles } from '../lib/themeContext';
import { Card, TopBar, Screen, Button, Input, SectionTitle } from '../lib/ui';
import { createSpot, uploadSpotImage, geocode, getSpots } from '../lib/api';

const LIGHTING = [
	{ key: 'ja', label: 'Beleuchtet' },
	{ key: 'teilweise', label: 'Teilweise' },
	{ key: 'nein', label: 'Dunkel' }
];
const WEATHER = [
	{ key: 'trocken', label: 'Trocken' },
	{ key: 'nass', label: 'Auch bei Nässe' }
];
// Gleiche Liste wie im Web-Portal — sonst passen Filter und Finder nicht zusammen.
const TECHNIQUES = [
	'Präzisionssprung', 'Schwingen', 'Flow', 'Armsprung',
	'Klettern', 'Tic-Tac', 'Vault', 'Balance',
	'Drops', 'Katz', 'Roofgap'
];

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
	const [addressQuery, setAddressQuery] = useState('');
	const [addressResults, setAddressResults] = useState<
		{ lat: number; lon: number; displayName: string }[]
	>([]);
	const [searching, setSearching] = useState(false);
	const [photos, setPhotos] = useState<{ uri: string; fileName?: string | null; mimeType?: string | null }[]>([]);
	const [busy, setBusy] = useState(false);
	// Microspot samt Hauptspot — wie „Spot vorschlagen" auf der Website.
	const [isMicro, setIsMicro] = useState(false);
	const [parentSpotId, setParentSpotId] = useState<number | null>(null);

	/**
	 * Eingaben überleben jetzt den Wechsel in eine andere App: Sie werden
	 * fortlaufend gesichert und beim Öffnen wieder eingesetzt. Vorher war
	 * alles weg, sobald Android die App im Hintergrund beendete — genau
	 * dann, wenn man kurz Koordinaten holen wollte.
	 */
	const draftLoaded = useRef(false);
	useEffect(() => {
		(async () => {
			const d = await loadDraft<{
				name: string;
				city: string;
				description: string;
				lighting: string;
				weather: string[];
				techniques: string[];
				coords: { lat: number; lon: number } | null;
				isMicro: boolean;
				parentSpotId: number | null;
			}>('spot-new');
			if (d) {
				setName(d.name ?? '');
				setCity(d.city ?? '');
				setDescription(d.description ?? '');
				setLighting(d.lighting ?? 'teilweise');
				setWeather(d.weather ?? ['trocken']);
				setTechniques(d.techniques ?? []);
				setCoords(d.coords ?? null);
				setIsMicro(Boolean(d.isMicro));
				setParentSpotId(d.parentSpotId ?? null);
			}
			draftLoaded.current = true;
		})();
	}, []);

	useEffect(() => {
		// Erst nach dem Laden sichern — sonst überschriebe der leere
		// Anfangszustand den gemerkten Entwurf.
		if (!draftLoaded.current) return;
		const empty =
			!name.trim() && !city.trim() && !description.trim() && !coords && techniques.length === 0;
		if (empty) return;
		void saveDraft('spot-new', {
			name,
			city,
			description,
			lighting,
			weather,
			techniques,
			coords,
			isMicro,
			parentSpotId
		});
	}, [name, city, description, lighting, weather, techniques, coords, isMicro, parentSpotId]);
	const { data: spotList } = useData('spots-for-parent', getSpots);
	const parentOptions = (spotList?.spots ?? []).filter((sp) => !sp.isMicro);

	const useMyLocation = async () => {
		const Location = getLocation();
		if (!Location) {
			Alert.alert('Neue App-Version nötig', 'Der Standort geht ab App-Version 1.1.0.');
			return;
		}
		const perm = await Location.requestForegroundPermissionsAsync();
		if (!perm.granted) {
			Alert.alert('Kein Zugriff', 'Für den Standort braucht die App die Ortungsberechtigung.');
			return;
		}
		const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
		setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
	};

	const searchAddress = async () => {
		const q = addressQuery.trim();
		if (q.length < 2) return;
		setSearching(true);
		try {
			const res = await geocode(q);
			setAddressResults(res.results);
			if (!res.results.length) Alert.alert('Nichts gefunden', `Keine Treffer für „${q}".`);
		} catch (e) {
			Alert.alert('Fehler', e instanceof Error ? e.message : 'Suche fehlgeschlagen');
		} finally {
			setSearching(false);
		}
	};

	const addPhoto = async (fromCamera: boolean) => {
		const ImagePicker = getImagePicker();
		if (!ImagePicker) {
			Alert.alert('Neue App-Version nötig', 'Fotos gehen ab App-Version 1.1.0.');
			return;
		}
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
		// Ohne Koordinaten fehlt der Spot auf jeder Karte und im Finder —
		// das darf einem nicht erst hinterher auffallen.
		if (!coords) {
			Alert.alert(
				'Kein Standort gesetzt',
				'Ohne Koordinaten erscheint der Spot auf keiner Karte und der Finder findet ihn schlechter. Trotzdem speichern?',
				[
					{ text: 'Zurück', style: 'cancel' },
					{ text: 'Trotzdem speichern', style: 'destructive', onPress: () => void save() }
				]
			);
			return;
		}
		await save();
	};

	const save = async () => {
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
				description: description.trim(),
				isMicro,
				parentSpotId: isMicro ? parentSpotId : null
			});
			const newId = res.spot?.id;
			if (!newId) throw new Error('Server hat keine Spot-ID zurückgegeben.');

			// Fehlgeschlagene Uploads dürfen nicht stillschweigend verschwinden.
			const failed: string[] = [];
			for (const photo of photos) {
				try {
					await uploadSpotImage(
						newId,
						photo.uri,
						photo.fileName ?? `spot-${newId}.jpg`,
						photo.mimeType ?? 'image/jpeg'
					);
				} catch (e) {
					failed.push(e instanceof Error ? e.message : 'Unbekannter Fehler');
				}
			}
			await clearDraft('spot-new');
			Alert.alert(
				failed.length ? 'Spot angelegt — Fotos unvollständig' : 'Gespeichert',
				failed.length
					? `„${name.trim()}" steht, aber ${failed.length} von ${photos.length} Fotos konnten nicht hochgeladen werden:\n${failed[0]}\n\nDu kannst sie auf der Spot-Seite nachträglich hinzufügen.`
					: `„${name.trim()}" wurde angelegt${photos.length ? ` — ${photos.length} Foto(s) hochgeladen` : ''}.`
			);
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
				<View style={styles.searchRow}>
					<View style={{ flex: 1 }}>
						<Input
							placeholder="Oder Adresse suchen …"
							value={addressQuery}
							onChangeText={setAddressQuery}
							onSubmitEditing={searchAddress}
							returnKeyType="search"
						/>
					</View>
					<Button label={searching ? '…' : 'Suchen'} kind="ghost" onPress={searchAddress} />
				</View>
				{addressResults.map((r, i) => (
					<Pressable
						key={i}
						onPress={() => {
							setCoords({ lat: r.lat, lon: r.lon });
							setAddressResults([]);
						}}
						style={({ pressed }) => [styles.resultRow, pressed && { opacity: 0.7 }]}
					>
						<Ionicons name="location-outline" size={16} color={colors.accent} />
						<Text style={styles.resultText} numberOfLines={2}>
							{r.displayName}
						</Text>
					</Pressable>
				))}
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

			<SectionTitle>Microspot</SectionTitle>
			<Card style={{ gap: 10 }}>
				<Text style={styles.microHint}>
					Für kurze Sessions oder kleine Gruppen — ein Microspot hängt an einem
					Hauptspot.
				</Text>
				<View style={styles.chipRow}>
					<Chip label="Normaler Spot" active={!isMicro} onPress={() => setIsMicro(false)} />
					<Chip label="Microspot" active={isMicro} onPress={() => setIsMicro(true)} />
				</View>
				{isMicro ? (
					<ParentPicker
						options={parentOptions}
						value={parentSpotId}
						onChange={setParentSpotId}
					/>
				) : null}
			</Card>

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
		microHint: {
			color: colors.fg + textAlpha.secondary,
			fontSize: 13,
			lineHeight: 18,
			fontFamily: fonts.sans
		},
		searchRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
		resultRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
		resultText: {
			color: colors.fg + textAlpha.secondary,
			fontSize: 13,
			lineHeight: 18,
			fontFamily: fonts.sans,
			flex: 1
		},
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
