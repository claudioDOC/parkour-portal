import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Modal } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { fonts, type ThemeColors } from './theme';
import { textAlpha } from './tokens';
import { useTheme, useThemedStyles } from './themeContext';

/**
 * Auswahlfeld für Protokoll-Filter.
 *
 * Vorher standen alle Werte als Chip-Reihe da — bei zwanzig Aktionsarten
 * eine unlesbare Wand. Hier: ein Feld mit dem aktuellen Wert, das eine
 * Liste aufklappt. Passt in eine Zeile, egal wie viele Werte es gibt.
 */
export function FilterSelect({
	label,
	value,
	options,
	onChange,
	allLabel = 'Alle'
}: {
	label: string;
	/** Leerer String = keine Einschränkung. */
	value: string;
	options: string[];
	onChange: (next: string) => void;
	allLabel?: string;
}) {
	const { colors } = useTheme();
	const styles = useThemedStyles(makeStyles);
	const [open, setOpen] = useState(false);

	return (
		<View style={styles.wrap}>
			<Text style={styles.label}>{label}</Text>
			<Pressable
				onPress={() => setOpen(true)}
				style={({ pressed }) => [styles.field, pressed && { opacity: 0.8 }]}
			>
				<Text style={styles.value} numberOfLines={1}>
					{value || allLabel}
				</Text>
				<Ionicons name="chevron-down" size={15} color={colors.textMuted} />
			</Pressable>

			<Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
				<Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
					<View style={styles.sheet}>
						<Text style={styles.sheetTitle}>{label}</Text>
						<ScrollView style={{ maxHeight: 360 }}>
							{['', ...options].map((o) => (
								<Pressable
									key={o || '__alle'}
									onPress={() => {
										onChange(o);
										setOpen(false);
									}}
									style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
								>
									<Ionicons
										name={value === o ? 'radio-button-on' : 'radio-button-off'}
										size={16}
										color={value === o ? colors.accent : colors.textMuted}
									/>
									<Text style={styles.rowText}>{o || allLabel}</Text>
								</Pressable>
							))}
						</ScrollView>
					</View>
				</Pressable>
			</Modal>
		</View>
	);
}

const makeStyles = (colors: ThemeColors) =>
	StyleSheet.create({
		wrap: { flex: 1, minWidth: 130, gap: 4 },
		label: {
			color: colors.fg + textAlpha.muted,
			fontSize: 11,
			lineHeight: 15,
			fontFamily: fonts.sansSemi,
			textTransform: 'uppercase',
			letterSpacing: 0.5
		},
		field: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: 6,
			backgroundColor: colors.bgSecondary,
			borderRadius: 10,
			paddingHorizontal: 10,
			paddingVertical: 8
		},
		value: {
			flex: 1,
			color: colors.fg + textAlpha.primary,
			fontSize: 13,
			lineHeight: 18,
			fontFamily: fonts.sans
		},
		backdrop: {
			flex: 1,
			backgroundColor: 'rgba(0,0,0,0.6)',
			justifyContent: 'center',
			padding: 24
		},
		sheet: { backgroundColor: colors.card, borderRadius: 16, padding: 16, gap: 8 },
		sheetTitle: {
			color: colors.fg + textAlpha.primary,
			fontSize: 15,
			lineHeight: 20,
			fontFamily: fonts.sansSemi
		},
		row: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: 10,
			paddingVertical: 10,
			borderBottomWidth: StyleSheet.hairlineWidth,
			borderBottomColor: colors.border
		},
		rowText: {
			flex: 1,
			color: colors.fg + textAlpha.primary,
			fontSize: 14,
			lineHeight: 19,
			fontFamily: fonts.sans
		}
	});
