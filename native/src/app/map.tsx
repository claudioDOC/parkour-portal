import { View, Text, StyleSheet, Pressable, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../lib/themeContext';
import { TopBar } from '../lib/ui';
import { NativeMap, type MapMarker } from '../lib/NativeMap';
import { useData } from '../lib/store';
import { getSpots } from '../lib/api';

/**
 * Karte aller Spots — nativ gezeichnet, keine eingebettete Webseite.
 * Tippen auf einen Namen führt zum jeweiligen Spot.
 */
export default function MapScreen() {
	const { colors } = useTheme();
	const insets = useSafeAreaInsets();
	const router = useRouter();
	const { data } = useData('spots', getSpots);

	// Nur Spots mit Koordinaten können auf der Karte stehen.
	const markers: MapMarker[] = (data?.spots ?? [])
		.filter((s) => typeof s.latitude === 'number' && typeof s.longitude === 'number')
		.map((s, i) => ({
			id: s.id,
			name: s.name,
			city: s.city,
			lat: s.latitude as number,
			lon: s.longitude as number,
			kind: i === 0 ? 'main' : 'nearby'
		}));

	return (
		<View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 12 }}>
			<View style={{ paddingHorizontal: 20 }}>
				<TopBar back kicker={`${markers.length} Spots`} title="Karte" />
			</View>
			<View style={{ flex: 1, marginTop: 12, marginHorizontal: 12, marginBottom: insets.bottom + 12 }}>
				{markers.length > 0 ? (
					<NativeMap markers={markers} fill zoom={11} />
				) : (
					<Text style={{ color: colors.fg, padding: 20 }}>
						Für keinen Spot sind Koordinaten hinterlegt.
					</Text>
				)}
			</View>
		</View>
	);
}
