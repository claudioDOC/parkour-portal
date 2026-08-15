import { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Linking } from 'react-native';
import { useTheme } from './themeContext';
import { getNativeMap } from './nativeModules';
import { SafeRender } from './SafeRender';

/**
 * Nur der TYP des Moduls — wird beim Kompilieren gelöscht, lädt also nichts.
 * Entscheidend: Dadurch prüft TypeScript jede Prop gegen die echte
 * MapLibre-API. Ein falscher Prop-Name ging vorher ungeprüft an die native
 * Seite durch und stürzte dort die ganze App ab (Boundary fängt das nicht).
 */
type MapLibreModule = typeof import('@maplibre/maplibre-react-native');

export type MapMarker = {
	id: number;
	name: string;
	city?: string;
	lat: number;
	lon: number;
	/** 'main' = dieser Spot, 'parking' = Parkplatz, sonst Nachbar-Spot */
	kind: string;
};

/** Freier Vektorkarten-Stil ohne Konto und ohne Schlüssel. */
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

/**
 * Echte native Karte (MapLibre) — die Kacheln zeichnet Android selbst,
 * es läuft keine Webseite im Hintergrund. Fehlt das Modul (ältere
 * Installation), erscheint ein Hinweis mit Download-Link.
 */
export function NativeMap({
	markers,
	height = 240,
	fill = false,
	zoom = 15
}: {
	markers: MapMarker[];
	height?: number;
	/** Füllt den verfügbaren Platz (flex) statt fester Höhe — für Vollbild. */
	fill?: boolean;
	zoom?: number;
}) {
	const { colors } = useTheme();
	const maplibre = getNativeMap() as MapLibreModule | null;
	// Bewusst KEINE Vorab-Erkennung mehr: die hat in beide Richtungen
	// falsch gelegen. Die Karte wird gezeichnet; klappt es nicht, greift
	// die Absturzsicherung und zeigt den Ersatzinhalt.

	// Ungültige Koordinaten dürfen die native Seite nie erreichen.
	const pins = useMemo(
		() =>
			markers
				.filter((m) => Number.isFinite(m.lat) && Number.isFinite(m.lon))
				.map((m) => ({
					...m,
					color: m.kind === 'main' ? colors.accent : m.kind === 'parking' ? '#47c5ff' : '#9ca3af'
				})),
		[markers, colors]
	);
	const main = pins.find((m) => m.kind === 'main') ?? pins[0];

	if (!main) return null;

	const fallback = (
		<View style={[styles.wrap, styles.fallback, { height: 150, backgroundColor: colors.hover }]}>
			<Text style={[styles.title, { color: colors.fg }]}>Native Karte ab App-Version 1.3</Text>
			<Text style={[styles.hint, { color: colors.fg }]}>
				Einmal neu installieren — danach zeichnet die App die Karte selbst.
			</Text>
			<Pressable
				onPress={() => Linking.openURL('https://matetraining.duckdns.org/app')}
				style={[styles.btn, { backgroundColor: colors.accent }]}
			>
				<Text style={{ color: colors.onAccent, fontSize: 14, fontWeight: '700' }}>
					App herunterladen
				</Text>
			</Pressable>
		</View>
	);

	if (!maplibre) return fallback;

	const { Map: LibreMap, Camera, Marker } = maplibre;
	if (!LibreMap || !Marker || !Camera) return fallback;

	return (
		<SafeRender fallback={fallback}>
			<View style={[styles.wrap, fill ? { flex: 1 } : { height }, { backgroundColor: colors.hover }]}>
				<LibreMap style={{ flex: 1 }} mapStyle={MAP_STYLE}>
					<Camera initialViewState={{ center: [main.lon, main.lat], zoom }} />
					{pins.map((p) => (
						<Marker key={`${p.kind}-${p.id}`} lngLat={[p.lon, p.lat]}>
							<View style={[styles.pin, { backgroundColor: p.color }]}>
								<Text style={styles.pinText}>
									{p.kind === 'parking' ? 'P' : p.kind === 'main' ? '★' : '•'}
								</Text>
							</View>
						</Marker>
					))}
				</LibreMap>
			</View>
		</SafeRender>
	);
}

const styles = StyleSheet.create({
	wrap: { borderRadius: 16, overflow: 'hidden' },
	fallback: { alignItems: 'center', justifyContent: 'center', padding: 16, gap: 6 },
	title: { fontSize: 15, fontWeight: '600', textAlign: 'center' },
	hint: { fontSize: 13, opacity: 0.6, textAlign: 'center' },
	btn: { marginTop: 8, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10 },
	pin: {
		width: 28,
		height: 28,
		borderRadius: 14,
		alignItems: 'center',
		justifyContent: 'center',
		borderWidth: 2,
		borderColor: '#fff'
	},
	pinText: { color: '#111', fontSize: 13, fontWeight: '700' }
});
