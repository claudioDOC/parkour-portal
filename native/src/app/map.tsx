import { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
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

	const spots = data?.spots ?? [];
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

	const selected: SpotListItem | null = spots.find((s) => s.id === selectedId) ?? null;

	return (
		<View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 12 }}>
			<View style={{ paddingHorizontal: 20 }}>
				<TopBar back kicker={`${markers.length} Spots`} title="Karte" />
			</View>
			<View style={{ flex: 1, marginTop: 12, marginHorizontal: 12, marginBottom: insets.bottom + 12 }}>
				{markers.length > 0 ? (
					<NativeMap
						markers={markers}
						fill
						zoom={11}
						onMarkerPress={(m) => setSelectedId(m.id)}
					/>
				) : (
					<Text style={{ color: colors.fg, padding: 20 }}>
						Für keinen Spot sind Koordinaten hinterlegt.
					</Text>
				)}

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
			borderRadius: 12,
			paddingVertical: 11,
			alignItems: 'center',
			justifyContent: 'center'
		},
		ghostBtn: { backgroundColor: colors.hover, borderWidth: 1, borderColor: colors.border },
		actionText: { fontSize: 14, lineHeight: 20, fontFamily: fonts.sansSemi }
	});
