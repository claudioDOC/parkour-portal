import type { ReactNode } from 'react';
import {
	View,
	Text,
	StyleSheet,
	Pressable,
	ScrollView,
	RefreshControl,
	Modal,
	TextInput,
	type TextInputProps
} from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { colors } from './theme';
import { mediaUrl } from './api';
import { useActivity } from './activity';

/**
 * UI-Bausteine v2 — Flächen statt Rahmen, grosse ruhige Typografie,
 * Akzentfarbe sparsam. Alles Runde ist eine Pille, alles Eckige 20+ Radius.
 */

/** Scroll-Seite mit Standard-Innenabstand und Pull-to-refresh. */
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
	content: { padding: 20, paddingTop: 64, paddingBottom: 44, gap: 14 }
});

/** Seitenkopf: Kicker + grosser Titel (letztes Wort im Akzent) + Glocke. */
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
				<Pressable
					onPress={() => router.back()}
					hitSlop={8}
					style={({ pressed }) => [t.circleBtn, pressed && { opacity: 0.7 }]}
				>
					<Ionicons name="chevron-back" size={22} color={colors.text} />
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
			<Pressable
				onPress={() => router.push('/activity')}
				hitSlop={8}
				style={({ pressed }) => [t.circleBtn, pressed && { opacity: 0.7 }]}
			>
				<Ionicons name="notifications-outline" size={21} color={colors.textSecondary} />
				{unread > 0 ? <View style={t.dot} /> : null}
			</Pressable>
		</View>
	);
}

const t = StyleSheet.create({
	row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
	kicker: { color: colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 2.5 },
	title: {
		color: colors.text,
		fontSize: 30,
		fontWeight: '800',
		marginTop: 2,
		letterSpacing: -0.8
	},
	accent: { color: colors.accent },
	circleBtn: {
		width: 40,
		height: 40,
		borderRadius: 20,
		backgroundColor: colors.card,
		alignItems: 'center',
		justifyContent: 'center'
	},
	dot: {
		position: 'absolute',
		top: 9,
		right: 9,
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
	card: { backgroundColor: colors.card, borderRadius: 22, padding: 20 }
});

/** Getönte Status-Pille — Fläche statt Rahmen. */
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
		<View style={[p.pill, { backgroundColor: filled ? color : color + '1f' }]}>
			<Text style={[p.text, { color: filled ? colors.onAccent : color }]}>{label}</Text>
		</View>
	);
}

const p = StyleSheet.create({
	pill: { borderRadius: 999, paddingHorizontal: 11, paddingVertical: 4, alignSelf: 'flex-start' },
	text: { fontSize: 11, fontWeight: '800', letterSpacing: 0.2 }
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
				backgroundColor: color + '2b',
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

/** Überlappende Avatar-Reihe („wer ist dabei"), max. 7 + Rest. */
export function InitialsRow({ names }: { names: string[] }) {
	const shown = names.slice(0, 7);
	const rest = names.length - shown.length;
	return (
		<View style={a.row}>
			{shown.map((n, i) => (
				<View key={`${n}-${i}`} style={[a.wrap, { marginLeft: i === 0 ? 0 : -8 }]}>
					<Avatar username={n} size={30} index={i} />
				</View>
			))}
			{rest > 0 ? (
				<View style={[a.wrap, a.more, { marginLeft: -8 }]}>
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
		<View style={{ flexDirection: 'row', gap: 3 }}>
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
					<Pressable key={i} onPress={() => onRate(i)} hitSlop={5}>
						{star}
					</Pressable>
				) : (
					star
				);
			})}
		</View>
	);
}

/** Fortschrittsbalken (Challenges, Trip-Mehrheit …). */
export function ProgressBar({
	percent,
	color = colors.accent
}: {
	percent: number;
	color?: string;
}) {
	return (
		<View style={b.track}>
			<View
				style={[
					b.fill,
					{ width: `${Math.min(100, Math.max(0, percent))}%`, backgroundColor: color }
				]}
			/>
		</View>
	);
}

const b = StyleSheet.create({
	track: { height: 5, borderRadius: 3, backgroundColor: colors.hover, overflow: 'hidden' },
	fill: { height: 5, borderRadius: 3 }
});

/** Kennzahl-Kachel (Statistik-Reihen oben auf Screens). */
export function Stat({ value, label, tint }: { value: string | number; label: string; tint?: string }) {
	return (
		<View style={sb.box}>
			<Text style={[sb.value, tint ? { color: tint } : null]}>{value}</Text>
			<Text style={sb.label}>{label}</Text>
		</View>
	);
}

const sb = StyleSheet.create({
	box: {
		flex: 1,
		backgroundColor: colors.card,
		borderRadius: 18,
		paddingVertical: 14,
		alignItems: 'center',
		gap: 2
	},
	value: { color: colors.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
	label: { color: colors.textMuted, fontSize: 11 }
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
		marginTop: 12,
		marginBottom: -4,
		marginLeft: 4
	}
});

export function EmptyState({ icon, text }: { icon: string; text: string }) {
	return (
		<View style={e.wrap}>
			<View style={e.iconCircle}>
				<Ionicons name={icon as 'help'} size={26} color={colors.textMuted} />
			</View>
			<Text style={e.text}>{text}</Text>
		</View>
	);
}

const e = StyleSheet.create({
	wrap: { alignItems: 'center', gap: 12, paddingVertical: 38 },
	iconCircle: {
		width: 56,
		height: 56,
		borderRadius: 28,
		backgroundColor: colors.card,
		alignItems: 'center',
		justifyContent: 'center'
	},
	text: { color: colors.textMuted, fontSize: 14, textAlign: 'center', maxWidth: 240 }
});

/** Fehlerkarte für gescheiterte Ladevorgänge. */
export function ErrorCard({ message }: { message: string }) {
	return (
		<Card style={{ backgroundColor: colors.danger + '14' }}>
			<Text style={{ color: colors.danger, fontSize: 14 }}>{message}</Text>
		</Card>
	);
}

/** Buttons: accent (eine Hauptaktion pro Screen), ghost (Fläche), danger. */
export function Button({
	label,
	onPress,
	kind = 'accent',
	small = false,
	wide = false
}: {
	label: string;
	onPress: () => void;
	kind?: 'accent' | 'ghost' | 'danger';
	small?: boolean;
	wide?: boolean;
}) {
	const base =
		kind === 'accent'
			? { backgroundColor: colors.accent }
			: kind === 'danger'
				? { backgroundColor: colors.danger + '1f' }
				: { backgroundColor: colors.hover };
	const textColor =
		kind === 'accent' ? colors.onAccent : kind === 'danger' ? colors.danger : colors.text;
	return (
		<Pressable
			style={({ pressed }) => [
				bt.btn,
				base,
				small && bt.small,
				wide && { alignSelf: 'stretch', alignItems: 'center' },
				pressed && { opacity: 0.8 }
			]}
			onPress={onPress}
		>
			<Text style={[bt.text, { color: textColor }, small && { fontSize: 13 }]}>{label}</Text>
		</Pressable>
	);
}

const bt = StyleSheet.create({
	btn: { borderRadius: 999, paddingHorizontal: 22, paddingVertical: 13, alignSelf: 'flex-start' },
	small: { paddingHorizontal: 15, paddingVertical: 9 },
	text: { fontSize: 14.5, fontWeight: '800' }
});

/** Bottom-Sheet mit Griff und Backdrop — für alle Dialoge der App. */
export function Sheet({
	visible,
	onClose,
	title,
	children
}: {
	visible: boolean;
	onClose: () => void;
	title: string;
	children: ReactNode;
}) {
	return (
		<Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
			<Pressable style={sh.backdrop} onPress={onClose}>
				<Pressable style={sh.sheet} onPress={() => {}}>
					<View style={sh.handle} />
					<Text style={sh.title}>{title}</Text>
					{children}
				</Pressable>
			</Pressable>
		</Modal>
	);
}

const sh = StyleSheet.create({
	backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
	sheet: {
		backgroundColor: colors.card,
		borderTopLeftRadius: 28,
		borderTopRightRadius: 28,
		padding: 22,
		paddingBottom: 36,
		gap: 12
	},
	handle: {
		alignSelf: 'center',
		width: 36,
		height: 4,
		borderRadius: 2,
		backgroundColor: colors.hover,
		marginBottom: 6
	},
	title: { color: colors.text, fontSize: 18, fontWeight: '800', letterSpacing: -0.3 }
});

/** Eingabefeld — Fläche, kein Rahmen. */
export function Input(props: TextInputProps) {
	return (
		<TextInput
			placeholderTextColor={colors.textMuted}
			{...props}
			style={[inp.input, props.multiline && inp.multiline, props.style]}
		/>
	);
}

const inp = StyleSheet.create({
	input: {
		backgroundColor: colors.hover,
		borderRadius: 14,
		color: colors.text,
		paddingHorizontal: 16,
		paddingVertical: 13,
		fontSize: 15.5
	},
	multiline: { minHeight: 84, textAlignVertical: 'top' }
});
