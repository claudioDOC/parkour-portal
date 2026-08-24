import { useState } from 'react';
import {
	View,
	Text,
	StyleSheet,
	Pressable,
	TextInput,
	FlatList,
	RefreshControl
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { fonts, type ThemeColors } from '../../lib/theme';
import { textAlpha } from '../../lib/tokens';
import { useTheme, useThemedStyles } from '../../lib/themeContext';
import { TopBar, Screen, ErrorCard, EmptyState, SectionTitle, Sheet, Button, Segmented } from '../../lib/ui';
import { useData } from '../../lib/store';
import { SpotsMap } from '../map';
import { getSpots, mediaUrl, type SpotListItem } from '../../lib/api';

export default function Spots() {
	const { colors } = useTheme();
	const styles = useThemedStyles(makeStyles);
	const router = useRouter();
	const { data, error, refreshing, onRefresh } = useData('spots', getSpots);
	const [query, setQuery] = useState('');
	const [city, setCity] = useState('');
	const [technique, setTechnique] = useState('');
	const [filtersOpen, setFiltersOpen] = useState(false);
	const [view, setView] = useState<'liste' | 'karte'>('liste');

	const all = data?.spots ?? [];
	const cities = [...new Set(all.map((s) => s.city))].sort((a, b) => a.localeCompare(b, 'de'));
	const techniques = [
		...new Set(
			all.flatMap((s) => (s.techniques ?? '').split(',').map((t) => t.trim()).filter(Boolean))
		)
	].sort((a, b) => a.localeCompare(b, 'de'));

	const q = query.trim().toLowerCase();
	const filtered = all.filter((s) => {
		if (q) {
			const hay = `${s.name} ${s.city} ${s.parentSpotName ?? ''}`.toLowerCase();
			if (!hay.includes(q)) return false;
		}
		if (city && s.city !== city) return false;
		if (
			technique &&
			!(s.techniques ?? '')
				.split(',')
				.map((t) => t.trim())
				.includes(technique)
		)
			return false;
		return true;
	});
	const mainSpots = filtered.filter((s) => !s.isMicro);
	const microSpots = filtered.filter((s) => s.isMicro);
	const activeFilters = (city ? 1 : 0) + (technique ? 1 : 0);

	/**
	 * Eine Zeile je Eintrag, dazwischen die Abschnittsköpfe — als flache
	 * Liste, damit nur das Sichtbare gezeichnet wird. Vorher entstanden
	 * ALLE Zeilen auf einmal; bei knapp sechzig Spots mit Bild machte das
	 * jedes Scrollen zäh.
	 */
	type ListItem =
		| { kind: 'label'; key: string; text: string }
		| { kind: 'spot'; key: string; spot: SpotListItem };
	const listData: ListItem[] = [
		...(mainSpots.length > 0
			? [{ kind: 'label' as const, key: 'l-main', text: 'Normale Spots' }]
			: []),
		...mainSpots.map((sp) => ({ kind: 'spot' as const, key: `s${sp.id}`, spot: sp })),
		...(microSpots.length > 0
			? [{ kind: 'label' as const, key: 'l-micro', text: 'Microspots' }]
			: []),
		...microSpots.map((sp) => ({ kind: 'spot' as const, key: `m${sp.id}`, spot: sp }))
	];

	return (
		<Screen refreshing={refreshing} onRefresh={onRefresh} scroll={false}>
			<TopBar
				kicker="Orte"
				title="Spots"
				right={
					<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
						{/* Liste und Karte sind zwei Sichten auf dasselbe — der
						    Schieber zeigt dabei mit, wo man gerade steht. */}
						<Segmented
							value={view}
							onChange={setView}
							options={[
								{ key: 'liste', label: 'Liste', icon: 'list-outline' },
								{ key: 'karte', label: 'Karte', icon: 'map-outline' }
							]}
						/>
						<Pressable
							onPress={() => router.push('/spot-new')}
							hitSlop={8}
							style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.8 }]}
						>
							<Ionicons name="add" size={24} color={colors.onAccent} />
						</Pressable>
					</View>
				}
			/>

			{view === 'karte' ? <SpotsMap embedded /> : null}

			{view === 'liste' ? (
				<>
			<View style={styles.search}>
				<Ionicons name="search" size={17} color={colors.textMuted} />
				<TextInput
					style={styles.searchInput}
					placeholder="Spot oder Ort suchen …"
					placeholderTextColor={colors.textMuted}
					value={query}
					onChangeText={setQuery}
					autoCorrect={false}
				/>
				{query ? (
					<Pressable onPress={() => setQuery('')} hitSlop={8}>
						<Ionicons name="close-circle" size={17} color={colors.textMuted} />
					</Pressable>
				) : null}
			</View>

			{error && !data ? <ErrorCard message={error} /> : null}

			<View style={styles.filterBar}>
				<Pressable
					onPress={() => setFiltersOpen(true)}
					style={({ pressed }) => [styles.filterBtn, pressed && { opacity: 0.7 }]}
				>
					<Ionicons name="options-outline" size={16} color={colors.fg + textAlpha.secondary} />
					<Text style={styles.filterBtnText}>
						{activeFilters ? `Filter (${activeFilters})` : 'Filter'}
					</Text>
				</Pressable>
				<Text style={styles.countText}>
					{filtered.length} von {all.length} Spots
				</Text>
			</View>

			<FlatList
				data={listData}
				keyExtractor={(item) => item.key}
				renderItem={({ item }) =>
					item.kind === 'label' ? (
						<SectionTitle>{item.text}</SectionTitle>
					) : (
						<SpotRow spot={item.spot} onPress={() => router.push(`/spot/${item.spot.id}`)} />
					)
				}
				// Fenstergrössen bewusst knapp: Es sind immer nur wenige
				// Zeilen sichtbar, alles andere kostet nur Speicher.
				initialNumToRender={6}
				maxToRenderPerBatch={6}
				windowSize={5}
				removeClippedSubviews
				contentContainerStyle={{ gap: 12, paddingBottom: 32 }}
				showsVerticalScrollIndicator={false}
				refreshControl={
					<RefreshControl
						refreshing={refreshing ?? false}
						onRefresh={onRefresh}
						tintColor={colors.accent}
						colors={[colors.accent]}
					/>
				}
				ListEmptyComponent={
					data ? (
						<EmptyState
							icon="location-outline"
							text={
								q || activeFilters
									? 'Nichts gefunden — Filter zurücksetzen?'
									: 'Noch keine Spots erfasst.'
							}
						/>
					) : null
				}
			/>
				</>
			) : null}

			<Sheet visible={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filter">
				<Text style={styles.filterLabel}>Ort</Text>
				<View style={styles.chipRow}>
					<Chip label="Alle" active={!city} onPress={() => setCity('')} />
					{cities.map((c) => (
						<Chip key={c} label={c} active={city === c} onPress={() => setCity(city === c ? '' : c)} />
					))}
				</View>
				<Text style={styles.filterLabel}>Technik</Text>
				<View style={styles.chipRow}>
					<Chip label="Alle" active={!technique} onPress={() => setTechnique('')} />
					{techniques.map((t) => (
						<Chip
							key={t}
							label={t}
							active={technique === t}
							onPress={() => setTechnique(technique === t ? '' : t)}
						/>
					))}
				</View>
				<View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
					<Button
						label="Zurücksetzen"
						kind="ghost"
						onPress={() => {
							setCity('');
							setTechnique('');
						}}
					/>
					<Button label="Fertig" onPress={() => setFiltersOpen(false)} />
				</View>
			</Sheet>
		</Screen>
	);
}

/** Eine Spot-Zeile: Bild oben, Name/Ort links, Wertung rechts. */
function SpotRow({ spot, onPress }: { spot: SpotListItem; onPress: () => void }) {
	const styles = useThemedStyles(makeStyles);
	return (
		<Pressable onPress={onPress}>
			{({ pressed }) => (
				<View style={[styles.row, pressed && { opacity: 0.8 }]}>
					{spot.thumbnail ? (
						<Image
							// 480 statt 960: Die Zeile ist 150 px hoch — mehr sieht
							// niemand, kostet aber Ladezeit und Speicher.
							source={{ uri: mediaUrl(spot.thumbnail, 480) ?? undefined }}
							style={styles.thumb}
							contentFit="cover"
							// Kein Einblenden und feste Kennung: In einer
							// wiederverwendeten Liste sonst Flackern und Extra-Arbeit.
							transition={0}
							recyclingKey={String(spot.id)}
							cachePolicy="memory-disk"
						/>
					) : null}
					<View style={styles.rowBody}>
						<View style={{ flex: 1, gap: 4 }}>
							<Text style={styles.name} numberOfLines={1}>
								{spot.name}
							</Text>
							<Text style={styles.city}>
								{spot.city}
								{spot.parentSpotName ? ` · zu ${spot.parentSpotName}` : ''}
							</Text>
							{spot.techniques ? (
								<Text style={styles.city} numberOfLines={1}>
									{spot.techniques.split(',').map((t) => t.trim()).filter(Boolean).join(' · ')}
								</Text>
							) : null}
						</View>
						<View style={{ alignItems: 'flex-end' }}>
							<Text style={styles.score}>
								{spot.voteCount > 0 ? spot.avgScore.toFixed(1) : '—'}
							</Text>
							<Text style={styles.votes}>
								{spot.voteCount > 0 ? `${spot.voteCount} Votes` : 'keine Votes'}
							</Text>
						</View>
					</View>
				</View>
			)}
		</Pressable>
	);
}

/** Antippbarer Filter-Chip. */
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
	addBtn: {
		width: 40,
		height: 40,
		borderRadius: 999,
		backgroundColor: colors.accent,
		alignItems: 'center',
		justifyContent: 'center'
	},
	search: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
		backgroundColor: colors.card,
		borderRadius: 12,
		paddingHorizontal: 12
	},
	searchInput: { flex: 1, color: colors.fg + textAlpha.primary, paddingVertical: 12, fontSize: 14, lineHeight: 20, fontFamily: fonts.sans },
	row: {
		backgroundColor: colors.card,
		borderRadius: 20,
		borderWidth: 1,
		borderColor: colors.border,
		overflow: 'hidden'
	},
	rowBody: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 16 },
	thumb: { width: '100%', height: 150, backgroundColor: colors.hover },
	name: { color: colors.fg + textAlpha.primary, fontSize: 16, lineHeight: 22, fontFamily: fonts.sansBold },
	city: { color: colors.fg + textAlpha.muted, fontSize: 12, lineHeight: 16, fontFamily: fonts.sans },
	tagRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
	tag: {
		backgroundColor: colors.accentBlue + '1a',
		borderRadius: 999,
		paddingHorizontal: 12,
		paddingVertical: 4
	},
	tagText: { color: colors.accentBlue, fontSize: 12, lineHeight: 16, fontFamily: fonts.sansMedium },
	score: { color: colors.accent, fontFamily: fonts.display, fontSize: 30, lineHeight: 32 },
	votes: { color: colors.fg + textAlpha.muted, fontSize: 12, lineHeight: 16, fontFamily: fonts.sans },
	filterBar: { flexDirection: 'row', alignItems: 'center', gap: 12 },
	filterBtn: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 6,
		backgroundColor: colors.hover,
		borderRadius: 999,
		paddingHorizontal: 14,
		paddingVertical: 8
	},
	filterBtnText: {
		color: colors.fg + textAlpha.secondary,
		fontSize: 13,
		lineHeight: 18,
		fontFamily: fonts.sansSemi
	},
	countText: { color: colors.fg + textAlpha.muted, fontSize: 12, lineHeight: 16, flex: 1 },
	filterLabel: {
		color: colors.fg + textAlpha.secondary,
		fontSize: 12,
		lineHeight: 16,
		fontFamily: fonts.sansSemi,
		letterSpacing: 1
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
	}
});
