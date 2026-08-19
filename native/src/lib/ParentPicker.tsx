import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { fonts, type ThemeColors } from './theme';
import { textAlpha } from './tokens';
import { useTheme, useThemedStyles } from './themeContext';
import { Input } from './ui';

/**
 * Hauptspot für einen Microspot wählen.
 *
 * Vorher stand jeder Spot als eigener Knopf da — bei über fünfzig Spots
 * eine Wand aus Schaltflächen, in der niemand etwas findet. Jetzt: tippen,
 * suchen, antippen. Der gewählte Spot steht oben, damit klar ist, was gilt.
 */
export function ParentPicker({
	options,
	value,
	onChange
}: {
	options: { id: number; name: string; city: string }[];
	value: number | null;
	onChange: (id: number | null) => void;
}) {
	const { colors } = useTheme();
	const styles = useThemedStyles(makeStyles);
	const [query, setQuery] = useState('');

	const chosen = options.find((o) => o.id === value) ?? null;
	const q = query.trim().toLowerCase();
	const hits = (q ? options.filter((o) => `${o.name} ${o.city}`.toLowerCase().includes(q)) : options)
		.slice(0, 30);

	return (
		<View style={{ gap: 8 }}>
			{chosen ? (
				<View style={styles.chosen}>
					<Ionicons name="git-merge-outline" size={16} color={colors.accent} />
					<Text style={styles.chosenText}>
						{chosen.name} · {chosen.city}
					</Text>
					<Pressable onPress={() => onChange(null)} hitSlop={8}>
						<Text style={styles.clear}>Entfernen</Text>
					</Pressable>
				</View>
			) : (
				<Text style={styles.hint}>Noch kein Hauptspot gewählt.</Text>
			)}

			<Input
				placeholder="Hauptspot suchen …"
				value={query}
				onChangeText={setQuery}
				autoCapitalize="none"
			/>
			{options.length === 0 ? (
				<Text style={styles.hint}>Spots werden geladen …</Text>
			) : (
				<ScrollView style={{ maxHeight: 210 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
					{hits.map((o) => (
						<Pressable
							key={o.id}
							onPress={() => {
								onChange(o.id === value ? null : o.id);
								setQuery('');
							}}
							style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
						>
							<Ionicons
								name={o.id === value ? 'radio-button-on' : 'radio-button-off'}
								size={16}
								color={o.id === value ? colors.accent : colors.textMuted}
							/>
							<Text style={styles.name}>{o.name}</Text>
							<Text style={styles.city}>{o.city}</Text>
						</Pressable>
					))}
					{hits.length === 0 ? <Text style={styles.hint}>Nichts gefunden.</Text> : null}
				</ScrollView>
			)}
		</View>
	);
}

const makeStyles = (colors: ThemeColors) =>
	StyleSheet.create({
		chosen: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: 8,
			backgroundColor: colors.hover,
			borderRadius: 12,
			paddingHorizontal: 12,
			paddingVertical: 10
		},
		chosenText: {
			flex: 1,
			color: colors.fg + textAlpha.primary,
			fontSize: 14,
			lineHeight: 20,
			fontFamily: fonts.sansSemi
		},
		clear: { color: colors.danger, fontSize: 13, lineHeight: 18, fontFamily: fonts.sans },
		hint: { color: colors.fg + textAlpha.muted, fontSize: 13, lineHeight: 18, fontFamily: fonts.sans },
		row: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: 8,
			paddingVertical: 9,
			borderBottomWidth: StyleSheet.hairlineWidth,
			borderBottomColor: colors.border
		},
		name: {
			flex: 1,
			color: colors.fg + textAlpha.primary,
			fontSize: 14,
			lineHeight: 20,
			fontFamily: fonts.sans
		},
		city: { color: colors.fg + textAlpha.muted, fontSize: 12, lineHeight: 17 }
	});
