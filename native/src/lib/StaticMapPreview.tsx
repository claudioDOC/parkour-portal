import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { fonts, type ThemeColors } from './theme';
import { textAlpha } from './tokens';
import { useTheme, useThemedStyles } from './themeContext';
import type { MapMarker } from './NativeMap';

/**
 * Karten-Vorschau aus einfachen Bildkacheln.
 *
 * Warum nicht die echte Karte: Eine lebende Karte mitten in einer
 * scrollenden Seite reagiert selbst auf jede Wischgeste und rechnet
 * ununterbrochen — genau das liess die Spot-Seite ruckeln. Diese
 * Vorschau besteht aus ein paar statischen Bildern und kostet praktisch
 * nichts; die richtige Karte öffnet sich auf Tippen im Vollbild.
 */
const TILE = 256;
const ZOOM = 16;
const SAT = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile';

const lonToX = (lon: number, z: number) => ((lon + 180) / 360) * 2 ** z;
const latToY = (lat: number, z: number) => {
	const rad = (lat * Math.PI) / 180;
	return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z;
};

export function StaticMapPreview({
	lat,
	lon,
	markers = [],
	width,
	height = 200,
	onPress
}: {
	lat: number;
	lon: number;
	markers?: MapMarker[];
	width: number;
	height?: number;
	onPress: () => void;
}) {
	const { colors } = useTheme();
	const styles = useThemedStyles(makeStyles);

	const centerX = lonToX(lon, ZOOM) * TILE;
	const centerY = latToY(lat, ZOOM) * TILE;
	const left = centerX - width / 2;
	const top = centerY - height / 2;

	const tiles: { key: string; url: string; x: number; y: number }[] = [];
	for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + width) / TILE); tx++) {
		for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + height) / TILE); ty++) {
			tiles.push({
				key: `${tx}-${ty}`,
				url: `${SAT}/${ZOOM}/${ty}/${tx}`,
				x: tx * TILE - left,
				y: ty * TILE - top
			});
		}
	}

	const pins = markers
		.map((m) => ({
			m,
			x: lonToX(m.lon, ZOOM) * TILE - left,
			y: latToY(m.lat, ZOOM) * TILE - top
		}))
		.filter((p) => p.x > -20 && p.x < width + 20 && p.y > -20 && p.y < height + 20);

	return (
		<Pressable onPress={onPress} style={({ pressed }) => [pressed && { opacity: 0.9 }]}>
			<View style={[styles.wrap, { width, height }]}>
				{tiles.map((t) => (
					<Image
						key={t.key}
						source={{ uri: t.url }}
						style={{ position: 'absolute', left: t.x, top: t.y, width: TILE, height: TILE }}
						contentFit="cover"
						transition={0}
						cachePolicy="disk"
					/>
				))}
				{pins.map((p, i) => (
					<View
						key={`${p.m.id}-${i}`}
						style={[
							styles.pin,
							{
								left: p.x - 7,
								top: p.y - 7,
								backgroundColor:
									p.m.kind === 'parking'
										? '#47c5ff'
										: p.m.kind === 'main'
											? colors.accent
											: '#ffffff'
							}
						]}
					/>
				))}
				<View style={styles.hintRow}>
					<Ionicons name="expand-outline" size={14} color="#fff" />
					<Text style={styles.hintText}>Karte öffnen</Text>
				</View>
			</View>
		</Pressable>
	);
}

const makeStyles = (colors: ThemeColors) =>
	StyleSheet.create({
		wrap: {
			overflow: 'hidden',
			borderRadius: 16,
			backgroundColor: colors.bgSecondary
		},
		pin: {
			position: 'absolute',
			width: 14,
			height: 14,
			borderRadius: 7,
			borderWidth: 2,
			borderColor: 'rgba(0,0,0,0.55)'
		},
		hintRow: {
			position: 'absolute',
			right: 8,
			bottom: 8,
			flexDirection: 'row',
			alignItems: 'center',
			gap: 5,
			backgroundColor: 'rgba(0,0,0,0.55)',
			borderRadius: 999,
			paddingHorizontal: 10,
			paddingVertical: 5
		},
		hintText: { color: '#fff', fontSize: 12, lineHeight: 16, fontFamily: fonts.sansSemi }
	});
