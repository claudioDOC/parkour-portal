import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { fonts, type ThemeColors } from '../../lib/theme';
import { useTheme, useThemedStyles } from '../../lib/themeContext';
import { TopBar, Screen, ErrorCard, EmptyState } from '../../lib/ui';
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
							) : null}
							<View style={styles.rowBody}>
								<View style={{ flex: 1, gap: 4 }}>
									<Text style={styles.name} numberOfLines={1}>
										{s.name}
									</Text>
									<Text style={styles.city}>{s.city}</Text>
									{s.isMicro ? (
										<View style={styles.tagRow}>
											<View style={styles.tag}>
												<Text style={styles.tagText}>Microspot</Text>
											</View>
										</View>
									) : null}
								</View>
								<View style={{ alignItems: 'flex-end' }}>
									<Text style={styles.score}>
										{s.voteCount > 0 ? s.avgScore.toFixed(1) : '—'}
									</Text>
									<Text style={styles.votes}>
										{s.voteCount > 0 ? `${s.voteCount} Votes` : 'keine Votes'}
									</Text>
								</View>
							</View>
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
		borderRadius: 12,
		paddingHorizontal: 12
	},
	searchInput: { flex: 1, color: colors.text, paddingVertical: 12, fontSize: 15, lineHeight: 21, fontFamily: fonts.sans },
	row: {
		backgroundColor: colors.card,
		borderRadius: 20,
		borderWidth: 1,
		borderColor: colors.border,
		overflow: 'hidden'
	},
	rowBody: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 16 },
	thumb: { width: '100%', height: 150, backgroundColor: colors.hover },
	name: { color: colors.text, fontSize: 16, lineHeight: 21, fontFamily: fonts.sansBold },
	city: { color: colors.textMuted, fontSize: 13, lineHeight: 18, fontFamily: fonts.sans },
	tagRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
	tag: {
		backgroundColor: colors.accentBlue + '1a',
		borderRadius: 999,
		paddingHorizontal: 12,
		paddingVertical: 4
	},
	tagText: { color: colors.accentBlue, fontSize: 13, lineHeight: 18, fontFamily: fonts.sansMedium },
	score: { color: colors.accent, fontFamily: fonts.display, fontSize: 28, lineHeight: 30 },
	votes: { color: colors.textMuted, fontSize: 13, lineHeight: 18, fontFamily: fonts.sans }
});
