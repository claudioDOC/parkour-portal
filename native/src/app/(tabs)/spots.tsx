import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { fonts, type ThemeColors } from '../../lib/theme';
import { useTheme, useThemedStyles } from '../../lib/themeContext';
import { TopBar, Screen, Stars, ErrorCard, EmptyState } from '../../lib/ui';
import { useData } from '../../lib/store';
import { getSpots, mediaUrl } from '../../lib/api';

export default function Spots() {
	const { colors } = useTheme();
	const styles = useThemedStyles(makeStyles);
	const router = useRouter();
	const { data, error, refreshing, onRefresh } = useData('spots', getSpots);
	const [query, setQuery] = useState('');

	const q = query.trim().toLowerCase();
	const spots = (data?.spots ?? []).filter(
		(s) => !q || s.name.toLowerCase().includes(q) || s.city.toLowerCase().includes(q)
	);

	return (
		<Screen refreshing={refreshing} onRefresh={onRefresh}>
			<TopBar kicker="Orte" title="Spots" />

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

			{spots.map((s) => (
				<Pressable key={s.id} onPress={() => router.push(`/spot/${s.id}`)}>
					{({ pressed }) => (
						<View style={[styles.row, pressed && { opacity: 0.8 }]}>
							{s.thumbnail ? (
								<Image
									source={{ uri: mediaUrl(s.thumbnail) ?? undefined }}
									style={styles.thumb}
									contentFit="cover"
									transition={150}
								/>
							) : (
								<View style={[styles.thumb, styles.thumbEmpty]}>
									<Ionicons name="image-outline" size={20} color={colors.textMuted} />
								</View>
							)}
							<View style={{ flex: 1, gap: 3 }}>
								<Text style={styles.name} numberOfLines={1}>
									{s.name}
									{s.isMicro ? <Text style={styles.micro}>  · Micro</Text> : null}
								</Text>
								<Text style={styles.city}>{s.city}</Text>
								<View style={styles.scoreRow}>
									<Stars value={s.avgScore} size={13} />
									<Text style={styles.voteCount}>
										{s.voteCount > 0 ? `${s.avgScore.toFixed(1)} (${s.voteCount})` : 'Keine Bewertung'}
									</Text>
								</View>
							</View>
							<Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
						</View>
					)}
				</Pressable>
			))}

			{data && spots.length === 0 ? (
				<EmptyState icon="location-outline" text={q ? `Nichts gefunden für „${query}"` : 'Noch keine Spots erfasst.'} />
			) : null}
		</Screen>
	);
}

const makeStyles = (colors: ThemeColors) =>
	StyleSheet.create({
	search: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
		backgroundColor: colors.card,
		borderRadius: 16,
		paddingHorizontal: 14
	},
	searchInput: { flex: 1, color: colors.text, paddingVertical: 11, fontSize: 15, fontFamily: fonts.sans },
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 12,
		backgroundColor: colors.card,
		borderRadius: 20,
		padding: 10,
		paddingRight: 14
	},
	thumb: { width: 70, height: 70, borderRadius: 14, backgroundColor: colors.hover },
	thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
	name: { color: colors.text, fontSize: 15.5, fontFamily: fonts.sansBold },
	micro: { color: colors.accentBlue, fontSize: 12, fontWeight: '700' },
	city: { color: colors.textMuted, fontSize: 13, fontFamily: fonts.sans },
	scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1 },
	voteCount: { color: colors.textMuted, fontSize: 12 }
});
