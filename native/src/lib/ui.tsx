import type { ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from './theme';

/**
 * Kleine gemeinsame UI-Bausteine der App — gleiche Formensprache wie das
 * Portal: dunkle Karten, Hairline-Border, Akzent sparsam.
 */

/** Seitenkopf wie PageHeader im Web: Kicker + Titel, letztes Wort im Akzent. */
export function Header({ kicker, title }: { kicker: string; title: string }) {
	const words = title.split(' ');
	const last = words.pop();
	return (
		<View>
			<Text style={h.kicker}>{kicker.toUpperCase()}</Text>
			<Text style={h.title}>
				{words.length ? words.join(' ') + ' ' : ''}
				<Text style={h.accent}>{last}</Text>
			</Text>
		</View>
	);
}

const h = StyleSheet.create({
	kicker: { color: colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 2.5 },
	title: { color: colors.text, fontSize: 26, fontWeight: '800', marginTop: 3, letterSpacing: -0.5 },
	accent: { color: colors.accent }
});

export function Card({ children, style }: { children: ReactNode; style?: object }) {
	return <View style={[c.card, style]}>{children}</View>;
}

const c = StyleSheet.create({
	card: {
		backgroundColor: colors.card,
		borderColor: colors.border,
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 20,
		padding: 18
	}
});

/** Farbige Status-Pille (z. B. „Fix", „✓ dabei", „Abgesagt"). */
export function Pill({
	label,
	color,
	filled = false
}: {
	label: string;
	color: string;
	filled?: boolean;
}) {
	return (
		<View
			style={[
				p.pill,
				filled ? { backgroundColor: color } : { borderColor: color, borderWidth: 1 }
			]}
		>
			<Text style={[p.text, { color: filled ? colors.onAccent : color }]}>{label}</Text>
		</View>
	);
}

const p = StyleSheet.create({
	pill: {
		borderRadius: 999,
		paddingHorizontal: 10,
		paddingVertical: 3,
		alignSelf: 'flex-start'
	},
	text: { fontSize: 11, fontWeight: '800' }
});

const AVATAR_COLORS = ['#47c5ff', '#47ffb3', '#ff9947', '#c58cff', '#ff7ab8', '#7adfff'];

/** Reihe von Initialen-Kreisen wie im Web („wer ist dabei"), max. 7 + Rest. */
export function InitialsRow({ names }: { names: string[] }) {
	const shown = names.slice(0, 7);
	const rest = names.length - shown.length;
	return (
		<View style={a.row}>
			{shown.map((n, i) => (
				<View
					key={`${n}-${i}`}
					style={[
						a.circle,
						{ backgroundColor: AVATAR_COLORS[i % AVATAR_COLORS.length] + '33', marginLeft: i === 0 ? 0 : -7 }
					]}
				>
					<Text style={[a.initial, { color: AVATAR_COLORS[i % AVATAR_COLORS.length] }]}>
						{n.slice(0, 1).toUpperCase()}
					</Text>
				</View>
			))}
			{rest > 0 ? (
				<View style={[a.circle, { backgroundColor: colors.hover, marginLeft: -7 }]}>
					<Text style={[a.initial, { color: colors.textSecondary }]}>+{rest}</Text>
				</View>
			) : null}
		</View>
	);
}

const a = StyleSheet.create({
	row: { flexDirection: 'row', alignItems: 'center' },
	circle: {
		width: 30,
		height: 30,
		borderRadius: 15,
		alignItems: 'center',
		justifyContent: 'center',
		borderWidth: 2,
		borderColor: colors.card
	},
	initial: { fontSize: 12, fontWeight: '800' }
});
