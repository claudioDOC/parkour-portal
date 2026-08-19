import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { fonts, type ThemeColors } from './theme';
import { textAlpha } from './tokens';
import { useTheme, useThemedStyles } from './themeContext';

/**
 * Datumsfeld mit ausklappbarem Monatsraster.
 *
 * Bewusst in JavaScript statt mit einem nativen Auswahldialog: So kommt
 * es über das normale Update auf jedes Gerät, ohne dass jemand eine neue
 * App-Datei installieren muss — und es sieht in jedem Farbschema gleich
 * aus. Tippen ist ausserdem fehleranfällig („2026-13-45").
 */
const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

/** Montag = 0, Sonntag = 6 — im Gegensatz zu Date.getDay(). */
function firstWeekdayIndex(y: number, m: number): number {
	return (new Date(y, m, 1).getDay() + 6) % 7;
}

function label(value: string): string {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Datum wählen';
	return new Date(`${value}T12:00:00`).toLocaleDateString('de-CH', {
		weekday: 'short',
		day: 'numeric',
		month: 'long',
		year: 'numeric'
	});
}

export function DateField({
	value,
	onChange,
	min,
	max,
	placeholder = 'Datum wählen'
}: {
	value: string;
	onChange: (next: string) => void;
	/** Frühestes wählbares Datum (JJJJ-MM-TT). */
	min?: string;
	max?: string;
	placeholder?: string;
}) {
	const { colors } = useTheme();
	const styles = useThemedStyles(makeStyles);
	const [open, setOpen] = useState(false);

	const base = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date();
	const [view, setView] = useState({ y: base.getFullYear(), m: base.getMonth() });

	const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
	const lead = firstWeekdayIndex(view.y, view.m);
	const cells: (number | null)[] = [
		...Array.from({ length: lead }, () => null),
		...Array.from({ length: daysInMonth }, (_, i) => i + 1)
	];

	const monthName = new Date(view.y, view.m, 1).toLocaleDateString('de-CH', {
		month: 'long',
		year: 'numeric'
	});
	const step = (delta: number) => {
		const next = new Date(view.y, view.m + delta, 1);
		setView({ y: next.getFullYear(), m: next.getMonth() });
	};

	return (
		<View style={{ gap: 8 }}>
			<Pressable
				onPress={() => setOpen(!open)}
				style={({ pressed }) => [styles.field, pressed && { opacity: 0.8 }]}
			>
				<Ionicons name="calendar-outline" size={17} color={colors.textSecondary} />
				<Text style={[styles.fieldText, !value && { color: colors.fg + textAlpha.muted }]}>
					{value ? label(value) : placeholder}
				</Text>
				<Ionicons
					name={open ? 'chevron-up' : 'chevron-down'}
					size={16}
					color={colors.textMuted}
				/>
			</Pressable>

			{open ? (
				<View style={styles.sheet}>
					<View style={styles.head}>
						<Pressable onPress={() => step(-1)} hitSlop={10} style={styles.navBtn}>
							<Ionicons name="chevron-back" size={18} color={colors.fg} />
						</Pressable>
						<Text style={styles.month}>{monthName}</Text>
						<Pressable onPress={() => step(1)} hitSlop={10} style={styles.navBtn}>
							<Ionicons name="chevron-forward" size={18} color={colors.fg} />
						</Pressable>
					</View>

					<View style={styles.grid}>
						{WEEKDAYS.map((w) => (
							<Text key={w} style={styles.weekday}>
								{w}
							</Text>
						))}
						{cells.map((day, i) => {
							if (day === null) return <View key={`x${i}`} style={styles.cell} />;
							const iso = ymd(view.y, view.m, day);
							const disabled = (min && iso < min) || (max && iso > max);
							const active = iso === value;
							return (
								<Pressable
									key={iso}
									disabled={!!disabled}
									onPress={() => {
										onChange(iso);
										setOpen(false);
									}}
									style={({ pressed }) => [
										styles.cell,
										active && { backgroundColor: colors.accent },
										pressed && !active && { backgroundColor: colors.hover }
									]}
								>
									<Text
										style={[
											styles.day,
											active && { color: colors.onAccent, fontFamily: fonts.sansBold },
											disabled && { color: colors.fg + textAlpha.muted }
										]}
									>
										{day}
									</Text>
								</Pressable>
							);
						})}
					</View>
				</View>
			) : null}
		</View>
	);
}

const makeStyles = (colors: ThemeColors) =>
	StyleSheet.create({
		field: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: 10,
			backgroundColor: colors.bgSecondary,
			borderRadius: 12,
			paddingHorizontal: 14,
			paddingVertical: 12
		},
		fieldText: {
			flex: 1,
			color: colors.fg + textAlpha.primary,
			fontSize: 15,
			lineHeight: 20,
			fontFamily: fonts.sans
		},
		sheet: {
			backgroundColor: colors.bgSecondary,
			borderRadius: 14,
			padding: 10,
			gap: 8
		},
		head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
		navBtn: { padding: 4 },
		month: {
			color: colors.fg + textAlpha.primary,
			fontSize: 15,
			lineHeight: 20,
			fontFamily: fonts.sansSemi
		},
		grid: { flexDirection: 'row', flexWrap: 'wrap' },
		weekday: {
			width: `${100 / 7}%`,
			textAlign: 'center',
			color: colors.fg + textAlpha.muted,
			fontSize: 11,
			lineHeight: 18,
			fontFamily: fonts.sansSemi
		},
		cell: {
			width: `${100 / 7}%`,
			height: 38,
			alignItems: 'center',
			justifyContent: 'center',
			borderRadius: 10
		},
		day: {
			color: colors.fg + textAlpha.primary,
			fontSize: 14,
			lineHeight: 20,
			fontFamily: fonts.sans
		}
	});
