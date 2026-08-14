import type { ReactNode } from 'react';
import {
	View,
	Text,
	StyleSheet,
	Pressable,
	ScrollView,
	RefreshControl
} from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { colors } from './theme';
import { mediaUrl } from './api';
import { useActivity } from './activity';

/**
 * Gemeinsame UI-Bausteine der App — gleiche Formensprache wie das Portal:
 * dunkle Karten, Hairline-Border, Akzent sparsam eingesetzt.
 */

/** Scroll-Seite mit Standard-Innenabstand und Pull-to-refresh im Portal-Look. */
export function Screen({
	children,
	refreshing,
	onRefresh
}: {
	children: ReactNode;
	refreshing?: boolean;
	onRefresh?: () => void;
}) {
	return (
		<ScrollView
			style={s.screen}
			contentContainerStyle={s.content}
			refreshControl={
				onRefresh ? (
					<RefreshControl
						refreshing={refreshing ?? false}
						onRefresh={onRefresh}
						tintColor={colors.accent}
						colors={[colors.accent]}
						progressBackgroundColor={colors.card}
					/>
				) : undefined
			}
		>
			{children}
		</ScrollView>
	);
}

const s = StyleSheet.create({
	screen: { flex: 1, backgroundColor: colors.bg },
	content: { padding: 20, paddingTop: 58, paddingBottom: 40, gap: 12 }
});

/**
 * Seitenkopf: Kicker + Titel (letztes Wort im Akzent, wie PageHeader im Web),
 * rechts die Aktivitäts-Glocke mit rotem Punkt — auf jedem Hauptscreen.
 */
export function TopBar({
	kicker,
	title,
	back = false,
	right
}: {
	kicker: string;
	title: string;
	back?: boolean;
	right?: ReactNode;
}) {
	const router = useRouter();
	const { unread } = useActivity();
	const words = title.split(' ');
	const last = words.pop();
	return (
		<View style={t.row}>
			{back ? (
				<Pressable onPress={() => router.back()} hitSlop={10} style={t.backBtn}>
					<Ionicons name="chevron-back" size={24} color={colors.text} />
				</Pressable>
			) : null}
			<View style={{ flex: 1 }}>
				<Text style={t.kicker}>{kicker.toUpperCase()}</Text>
				<Text style={t.title} numberOfLines={1}>
					{words.length ? words.join(' ') + ' ' : ''}
					<Text style={t.accent}>{last}</Text>
				</Text>
			</View>
			{right}
			<Pressable onPress={() => router.push('/activity')} hitSlop={10} style={t.bell}>
				<Ionicons name="notifications-outline" size={23} color={colors.textSecondary} />
				{unread > 0 ? <View style={t.dot} /> : null}
			</Pressable>
		</View>
	);
}

const t = StyleSheet.create({
	row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
	backBtn: { marginLeft: -8, padding: 2 },
	kicker: { color: colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 2.5 },
	title: { color: colors.text, fontSize: 25, fontWeight: '800', marginTop: 2, letterSpacing: -0.5 },
	accent: { color: colors.accent },
	bell: { padding: 6 },
	dot: {
		position: 'absolute',
		top: 5,
		right: 4,
		width: 9,
		height: 9,
		borderRadius: 5,
		backgroundColor: colors.danger,
		borderWidth: 1.5,
		borderColor: colors.bg
	}
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
			style={[p.pill, filled ? { backgroundColor: color } : { borderColor: color, borderWidth: 1 }]}
		>
			<Text style={[p.text, { color: filled ? colors.onAccent : color }]}>{label}</Text>
		</View>
	);
}

const p = StyleSheet.create({
	pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
	text: { fontSize: 11, fontWeight: '800' }
});

const AVATAR_COLORS = ['#47c5ff', '#47ffb3', '#ff9947', '#c58cff', '#ff7ab8', '#7adfff'];

/** Avatar: Bild wenn vorhanden, sonst farbiger Initialen-Kreis. */
export function Avatar({
	username,
	avatar,
	size = 34,
	index = 0
}: {
	username: string;
	avatar?: string | null;
	size?: number;
	index?: number;
}) {
	const color = AVATAR_COLORS[index % AVATAR_COLORS.length];
	const url = mediaUrl(avatar);
	if (url) {
		return (
			<Image
				source={{ uri: url }}
				style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.hover }}
			/>
		);
	}
	return (
		<View
			style={{
				width: size,
				height: size,
				borderRadius: size / 2,
				backgroundColor: color + '33',
				alignItems: 'center',
				justifyContent: 'center'
			}}
		>
			<Text style={{ color, fontSize: size * 0.4, fontWeight: '800' }}>
				{username.slice(0, 1).toUpperCase()}
			</Text>
		</View>
	);
}

/** Reihe von Initialen-Kreisen („wer ist dabei"), max. 7 + Rest. */
export function InitialsRow({ names }: { names: string[] }) {
	const shown = names.slice(0, 7);
	const rest = names.length - shown.length;
	return (
		<View style={a.row}>
			{shown.map((n, i) => (
				<View key={`${n}-${i}`} style={[a.wrap, { marginLeft: i === 0 ? 0 : -7 }]}>
					<Avatar username={n} size={30} index={i} />
				</View>
			))}
			{rest > 0 ? (
				<View style={[a.wrap, a.more, { marginLeft: -7 }]}>
					<Text style={a.moreText}>+{rest}</Text>
				</View>
			) : null}
		</View>
	);
}

const a = StyleSheet.create({
	row: { flexDirection: 'row', alignItems: 'center' },
	wrap: { borderRadius: 17, borderWidth: 2, borderColor: colors.card },
	more: {
		width: 30,
		height: 30,
		borderRadius: 15,
		backgroundColor: colors.hover,
		alignItems: 'center',
		justifyContent: 'center'
	},
	moreText: { color: colors.textSecondary, fontSize: 11, fontWeight: '800' }
});

/** Sterne-Anzeige, optional antippbar (Spot-Bewertung). */
export function Stars({
	value,
	size = 15,
	onRate
}: {
	value: number;
	size?: number;
	onRate?: (score: number) => void;
}) {
	return (
		<View style={{ flexDirection: 'row', gap: 2 }}>
			{[1, 2, 3, 4, 5].map((i) => {
				const icon = value >= i - 0.25 ? 'star' : value >= i - 0.75 ? 'star-half' : 'star-outline';
				const star = (
					<Ionicons
						key={i}
						name={icon}
						size={size}
						color={value >= i - 0.75 ? colors.accent : colors.textMuted}
					/>
				);
				return onRate ? (
					<Pressable key={i} onPress={() => onRate(i)} hitSlop={4}>
						{star}
					</Pressable>
				) : (
					star
				);
			})}
		</View>
	);
}

/** Fortschrittsbalken (Challenges am Spot, Trip-Mehrheit …). */
export function ProgressBar({ percent, color = colors.accent }: { percent: number; color?: string }) {
	return (
		<View style={b.track}>
			<View style={[b.fill, { width: `${Math.min(100, Math.max(0, percent))}%`, backgroundColor: color }]} />
		</View>
	);
}

const b = StyleSheet.create({
	track: { height: 6, borderRadius: 3, backgroundColor: colors.hover, overflow: 'hidden' },
	fill: { height: 6, borderRadius: 3 }
});

export function SectionTitle({ children }: { children: string }) {
	return <Text style={st.title}>{children.toUpperCase()}</Text>;
}

const st = StyleSheet.create({
	title: {
		color: colors.textMuted,
		fontSize: 11,
		fontWeight: '800',
		letterSpacing: 2,
		marginTop: 10,
		marginBottom: -2
	}
});

export function EmptyState({ icon, text }: { icon: string; text: string }) {
	return (
		<View style={e.wrap}>
			<Ionicons name={icon as 'help'} size={30} color={colors.textMuted} />
			<Text style={e.text}>{text}</Text>
		</View>
	);
}

const e = StyleSheet.create({
	wrap: { alignItems: 'center', gap: 8, paddingVertical: 34 },
	text: { color: colors.textMuted, fontSize: 14, textAlign: 'center' }
});

/** Fehlerkarte (rot umrandet) für gescheiterte Ladevorgänge. */
export function ErrorCard({ message }: { message: string }) {
	return (
		<Card style={{ borderColor: colors.danger + '55' }}>
			<Text style={{ color: colors.danger, fontSize: 14 }}>{message}</Text>
		</Card>
	);
}

/** Runde Buttons: Akzent (primär) und Ghost (sekundär). */
export function Button({
	label,
	onPress,
	kind = 'accent',
	small = false
}: {
	label: string;
	onPress: () => void;
	kind?: 'accent' | 'ghost' | 'danger';
	small?: boolean;
}) {
	const base = kind === 'accent' ? bt.accent : kind === 'danger' ? bt.dangerBtn : bt.ghost;
	const textStyle =
		kind === 'accent' ? bt.accentText : kind === 'danger' ? bt.dangerText : bt.ghostText;
	return (
		<Pressable
			style={({ pressed }) => [base, small && bt.small, pressed && { opacity: 0.8 }]}
			onPress={onPress}
		>
			<Text style={[textStyle, small && { fontSize: 13 }]}>{label}</Text>
		</Pressable>
	);
}

const bt = StyleSheet.create({
	accent: {
		backgroundColor: colors.accent,
		borderRadius: 999,
		paddingHorizontal: 20,
		paddingVertical: 11
	},
	accentText: { color: colors.onAccent, fontSize: 14, fontWeight: '800' },
	ghost: {
		borderColor: colors.border,
		borderWidth: 1,
		borderRadius: 999,
		paddingHorizontal: 20,
		paddingVertical: 11
	},
	ghostText: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
	dangerBtn: {
		borderColor: colors.danger + '88',
		borderWidth: 1,
		borderRadius: 999,
		paddingHorizontal: 20,
		paddingVertical: 11
	},
	dangerText: { color: colors.danger, fontSize: 14, fontWeight: '700' },
	small: { paddingHorizontal: 14, paddingVertical: 8 }
});
