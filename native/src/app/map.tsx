import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Linking, Alert, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { fonts, type ThemeColors } from '../lib/theme';
import { textAlpha } from '../lib/tokens';
import { useTheme, useThemedStyles } from '../lib/themeContext';
import { TopBar } from '../lib/ui';
import { NativeMap, type MapMarker } from '../lib/NativeMap';
import { useData } from '../lib/store';
import { getSpots, mediaUrl, type SpotListItem } from '../lib/api';
import { getLocation } from '../lib/nativeModules';

/**
 * Karte aller Spots — nativ gezeichnet, keine eingebettete Webseite.
 * Wie auf der Web-Karte: Pin-Blase zeigt die Bewertung, eine Plakette die
 * Anzahl Challenges, der Voting-Leader fürs nächste Training den Zug.
 * Antippen öffnet die Info-Karte mit Links zum Spot und zu den Challenges.
 */

/** Blasenfarbe nach Bewertung — dieselben Schwellen wie die Web-Karte. */
function pinPalette(avgScore: number, voteCount: number): { fill: string; fg: string } {
	if (voteCount === 0) return { fill: '#475569', fg: '#f8fafc' };
	if (avgScore < 2.25) return { fill: '#b91c1c', fg: '#fef2f2' };
	if (avgScore < 3.0) return { fill: '#ea580c', fg: '#fff7ed' };
	if (avgScore < 3.75) return { fill: '#ca8a04', fg: '#fefce8' };
	if (avgScore < 4.35) return { fill: '#65a30d', fg: '#f7fee7' };
	return { fill: '#15803d', fg: '#f0fdf4' };
}
export default function MapScreen() {
	const { colors } = useTheme();
	const styles = useThemedStyles(makeStyles);
	const insets = useSafeAreaInsets();
	const router = useRouter();
	const { data } = useData('spots', getSpots);
	const [selectedId, setSelectedId] = useState<number | null>(null);
	// Filter wie auf der Web-Karte, plus „Mit Challenges" als App-Extra.
	const [filter, setFilter] = useState<'alle' | 'haupt' | 'top' | 'challenges'>('alle');
	// Eigener Standort: blauer Punkt + Karte zentriert darauf.
	const [myPos, setMyPos] = useState<{ lat: number; lon: number } | null>(null);
	const [mapKey, setMapKey] = useState(0);
	const [locating, setLocating] = useState(false);

	const locateMe = async () => {
		const Location = getLocation();
		if (!Location) {
			Alert.alert('Neue App-Version nötig', 'Der Standort geht ab App-Version 1.1.');
			return;
		}
		setLocating(true);
		try {
			const perm = await Location.requestForegroundPermissionsAsync();
			if (!perm.granted) {
				Alert.alert('Kein Zugriff', 'Für den Standort braucht die App die Ortungsberechtigung.');
				return;
			}
			const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
			setMyPos({ lat: pos.coords.latitude, lon: pos.coords.longitude });
			// Karte neu aufsetzen, damit sie auf den Standort zentriert.
			setMapKey((k) => k + 1);
		} catch (e) {
			Alert.alert('Fehler', e instanceof Error ? e.message : 'Standort nicht verfügbar');
		} finally {
			setLocating(false);
		}
	};

	const spots = (data?.spots ?? []).filter((s) => {
		if (filter === 'haupt') return !s.isMicro;
		if (filter === 'top') return s.avgScore >= 4 && s.voteCount > 0;
		if (filter === 'challenges') return (s.challengeCount ?? 0) > 0;
		return true;
	});
	const trainingSpotId = data?.nextTrainingSpotId ?? null;

	// Nur Spots mit Koordinaten können auf der Karte stehen.
	const markers: MapMarker[] = spots
		.filter((s) => typeof s.latitude === 'number' && typeof s.longitude === 'number')
		.map((s) => {
			const palette = pinPalette(s.avgScore, s.voteCount);
			return {
				id: s.id,
				name: s.name,
				city: s.city,
				lat: s.latitude as number,
				lon: s.longitude as number,
				kind: s.id === trainingSpotId ? 'training' : 'main',
				label: s.id === trainingSpotId ? undefined : s.voteCount > 0 ? s.avgScore.toFixed(1) : '–',
				badge: s.challengeCount || undefined,
				color: s.id === trainingSpotId ? undefined : palette.fill,
				fg: s.id === trainingSpotId ? undefined : palette.fg
			};
		});

	if (myPos) {
		markers.push({
			id: -999999,
			name: 'Mein Standort',
			lat: myPos.lat,
			lon: myPos.lon,
			kind: 'me'
		});
	}

	const selected: SpotListItem | null = spots.find((s) => s.id === selectedId) ?? null;

	return (
		<View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 12 }}>
			<View style={{ paddingHorizontal: 20 }}>
				<TopBar back kicker={`${markers.length} Pins`} title="Karte" />
			</View>
			<View style={styles.filterWrap}>
				{(
					[
						{ key: 'alle', label: 'Alle' },
						{ key: 'haupt', label: 'Nur Hauptspots' },
						{ key: 'top', label: '⭐ Top bewertet' },
						{ key: 'challenges', label: '🏆 Mit Challenges' }
					] as const
				).map((f) => (
					<Pressable
						key={f.key}
						onPress={() => setFilter(f.key)}
						style={[
							styles.filterChip,
							filter === f.key && { backgroundColor: colors.accent, borderColor: colors.accent }
						]}
					>
						<Text style={[styles.filterText, filter === f.key && { color: colors.onAccent }]}>
							{f.label}
						</Text>
					</Pressable>
				))}
			</View>
			<View style={{ flex: 1, marginTop: 12, marginHorizontal: 12, marginBottom: insets.bottom + 12 }}>
				{markers.length > 0 ? (
					<NativeMap
						key={`${mapKey}`}
						markers={markers}
						fill
						zoom={myPos ? 13 : 11}
						center={myPos ?? undefined}
						onMarkerPress={(m) => setSelectedId(m.id)}
					/>
				) : (
					<Text style={{ color: colors.fg, padding: 20 }}>
						Für keinen Spot sind Koordinaten hinterlegt.
					</Text>
				)}

				{/* Standort: schwebender Knopf auf der Karte statt in der Filterzeile */}
				{markers.length > 0 ? (
					<Pressable
						onPress={locateMe}
						style={({ pressed }) => [
							styles.locateBtn,
							myPos != null && { backgroundColor: '#2563eb' },
							pressed && { opacity: 0.85 }
						]}
						hitSlop={8}
					>
						<Ionicons
							name={locating ? 'ellipsis-horizontal' : 'locate'}
							size={20}
							color={myPos != null ? '#fff' : '#111'}
						/>
					</Pressable>
				) : null}

				{selected ? (
					<View style={styles.sheet}>
						<Pressable style={styles.close} onPress={() => setSelectedId(null)} hitSlop={10}>
							<Ionicons name="close" size={18} color={colors.fg + textAlpha.secondary} />
						</Pressable>
						<View style={styles.sheetRow}>
							{selected.thumbnail ? (
								<Image
									source={{ uri: mediaUrl(selected.thumbnail) ?? undefined }}
									style={styles.thumb}
									contentFit="cover"
								/>
							) : null}
							<View style={{ flex: 1, gap: 2 }}>
								<Text style={styles.sheetTitle} numberOfLines={1}>
									{selected.name}
								</Text>
								<Text style={styles.sheetCity} numberOfLines={1}>
									{selected.city}
									{selected.isMicro ? ' · Microspot' : ''}
								</Text>
								<View style={styles.ratingRow}>
									<Ionicons name="star" size={13} color={colors.accent} />
									<Text style={styles.ratingText}>
										{selected.voteCount === 0
											? 'Noch keine Bewertung'
											: `Ø ${selected.avgScore.toFixed(1)} · ${selected.voteCount} Stimme${selected.voteCount === 1 ? '' : 'n'}`}
									</Text>
								</View>
								{selected.id === trainingSpotId ? (
									<Text style={styles.trainingNote}>🚂 Führt im Voting fürs nächste Training</Text>
								) : null}
							</View>
						</View>
						<View style={styles.sheetActions}>
							<Pressable
								style={[styles.actionBtn, { backgroundColor: colors.accent }]}
								onPress={() => router.push(`/spot/${selected.id}`)}
							>
								<Text style={[styles.actionText, { color: colors.onAccent }]}>Spot öffnen</Text>
							</Pressable>
							<Pressable
								style={[styles.actionBtn, styles.ghostBtn]}
								onPress={() =>
									Linking.openURL(
										`geo:${selected.latitude},${selected.longitude}?q=${selected.latitude},${selected.longitude}(${encodeURIComponent(selected.name)})`
									)
								}
							>
								<Ionicons name="navigate" size={14} color={colors.fg + textAlpha.primary} />
								<Text style={[styles.actionText, { color: colors.fg + textAlpha.primary }]}>
									Route
								</Text>
							</Pressable>
							{selected.challengeCount ? (
								<Pressable
									style={[styles.actionBtn, styles.ghostBtn]}
									onPress={() =>
										router.push({ pathname: '/challenges', params: { q: selected.name } })
									}
								>
									<Text style={[styles.actionText, { color: colors.fg + textAlpha.primary }]}>
										{selected.challengeCount} Challenge{selected.challengeCount === 1 ? '' : 's'}
									</Text>
								</Pressable>
							) : null}
						</View>
					</View>
				) : null}
			</View>
		</View>
	);
}

const makeStyles = (colors: ThemeColors) =>
	StyleSheet.create({
		filterWrap: {
			flexDirection: 'row',
			flexWrap: 'wrap',
			gap: 8,
			paddingHorizontal: 20,
			marginTop: 8
		},
		locateBtn: {
			position: 'absolute',
			right: 14,
			bottom: 14,
			width: 44,
			height: 44,
			borderRadius: 22,
			backgroundColor: 'rgba(255,255,255,0.94)',
			alignItems: 'center',
			justifyContent: 'center',
			elevation: 4,
			shadowColor: '#000',
			shadowOpacity: 0.22,
			shadowRadius: 6,
			shadowOffset: { width: 0, height: 2 }
		},
		filterChip: {
			borderRadius: 999,
			borderWidth: 1,
			borderColor: colors.border,
			backgroundColor: colors.card,
			paddingHorizontal: 13,
			paddingVertical: 7
		},
		filterText: {
			color: colors.fg + textAlpha.primary,
			fontSize: 12,
			lineHeight: 16,
			fontFamily: fonts.sansMedium
		},
		sheet: {
			position: 'absolute',
			left: 8,
			right: 8,
			bottom: 8,
			backgroundColor: colors.card,
			borderRadius: 20,
			padding: 14,
			gap: 12,
			shadowColor: '#000',
			shadowOpacity: 0.25,
			shadowRadius: 12,
			shadowOffset: { width: 0, height: 4 },
			elevation: 8
		},
		close: { position: 'absolute', top: 10, right: 10, zIndex: 1, padding: 4 },
		sheetRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
		thumb: { width: 72, height: 72, borderRadius: 14, backgroundColor: colors.hover },
		sheetTitle: {
			color: colors.fg + textAlpha.primary,
			fontSize: 16,
			lineHeight: 22,
			fontFamily: fonts.sansBold,
			paddingRight: 24
		},
		sheetCity: { color: colors.fg + textAlpha.muted, fontSize: 13, lineHeight: 18, fontFamily: fonts.sans },
		ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
		ratingText: { color: colors.fg + textAlpha.secondary, fontSize: 13, lineHeight: 18, fontFamily: fonts.sansMedium },
		trainingNote: { color: colors.warning, fontSize: 12, lineHeight: 16, fontFamily: fonts.sansSemi, marginTop: 2 },
		sheetActions: { flexDirection: 'row', gap: 8 },
		actionBtn: {
			flex: 1,
			flexDirection: 'row',
			gap: 6,
			borderRadius: 12,
			paddingVertical: 11,
			alignItems: 'center',
			justifyContent: 'center'
		},
		ghostBtn: { backgroundColor: colors.hover, borderWidth: 1, borderColor: colors.border },
		actionText: { fontSize: 14, lineHeight: 20, fontFamily: fonts.sansSemi }
	});
