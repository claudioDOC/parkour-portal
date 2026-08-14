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
import { colors, fonts } from './theme';
import { BG_TEXTURE, GRADIENT_BAR, GRADIENT_FILL } from './gfx';
import { mediaUrl } from './api';
import { useActivity } from './activity';

/**
 * UI-Bausteine v3 — dieselbe Design-Sprache wie die Website:
 * Teko-Display-Titel in Grossbuchstaben, Orange-Kicker, Gelb→Orange-Verläufe,
 * Hintergrund mit Glow und Punktraster, Karten mit Licht-Kante.
 */

/** Scroll-Seite mit Website-Hintergrund (Glows + Punktraster) und Refresh. */
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
		<View style={s.root}>
			<Image source={{ uri: BG_TEXTURE }} style={StyleSheet.absoluteFill} contentFit="cover" />
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
		</View>
	);
}

const s = StyleSheet.create({
	root: { flex: 1, backgroundColor: colors.bg },
	screen: { flex: 1 },
	content: { padding: 20, paddingTop: 60, paddingBottom: 44, gap: 14 }
});

/**
 * Seitenkopf wie PageHeader der Website: Orange-Kicker mit weiter
 * Sperrung, Teko-Titel in Grossbuchstaben (letztes Wort im Akzent),
 * Verlaufs-Balken darunter. Rechts die Glocke.
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
					{(words.length ? words.join(' ') + ' ' : '').toUpperCase()}
					<Text style={t.accent}>{last?.toUpperCase()}</Text>
				</Text>
				<Image source={{ uri: GRADIENT_BAR }} style={t.bar} />
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
	row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 6 },
	kicker: {
		color: colors.accentHot,
		fontFamily: fonts.displayMedium,
		fontSize: 15,
		letterSpacing: 4.5,
		marginBottom: -2
	},
	title: {
		color: colors.text,
		fontFamily: fonts.display,
		fontSize: 40,
		letterSpacing: 1.5,
		lineHeight: 44,
		marginBottom: 2
	},
	accent: { color: colors.accent },
	bar: { width: 64, height: 6, borderRadius: 2 },
	circleBtn: {
		width: 40,
		height: 40,
		borderRadius: 20,
		backgroundColor: colors.card,
		borderWidth: 1,
		borderColor: colors.border,
		alignItems: 'center',
		justifyContent: 'center',
		marginTop: 8
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

/** Karte wie `card-surface` im Web: Fläche, Licht-Kante oben, tiefer Schatten. */
export function Card({ children, style }: { children: ReactNode; style?: object }) {
	return <View style={[c.card, style]}>{children}</View>;
}

const c = StyleSheet.create({
	card: {
		backgroundColor: colors.card,
		borderRadius: 20,
		padding: 18,
		borderTopWidth: 1,
		borderTopColor: 'rgba(255,255,255,0.07)',
		elevation: 8,
		shadowColor: '#000'
	}
});

/** Getönte Status-Pille. */
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
		<View style={[p.pill, { backgroundColor: filled ? color : color + '22' }]}>
			<Text style={[p.text, { color: filled ? colors.onAccent : color }]}>{label}</Text>
		</View>
	);
}

const p = StyleSheet.create({
	pill: { borderRadius: 999, paddingHorizontal: 11, paddingVertical: 4, alignSelf: 'flex-start' },
	text: { fontSize: 11, fontFamily: fonts.sansBold, letterSpacing: 0.3 }
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
			<Text style={{ color, fontSize: size * 0.4, fontFamily: fonts.sansBold }}>
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
	moreText: { color: colors.textSecondary, fontSize: 11, fontFamily: fonts.sansBold }
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

/** Fortschrittsbalken. */
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

/** Kennzahl-Kachel — Zahl in Teko wie die grossen Ziffern der Website. */
export function Stat({ value, label, tint }: { value: string | number; label: string; tint?: string }) {
	return (
		<View style={sb.box}>
			<Text style={[sb.value, tint ? { color: tint } : null]}>{String(value)}</Text>
			<Text style={sb.label}>{label}</Text>
		</View>
	);
}

const sb = StyleSheet.create({
	box: {
		flex: 1,
		backgroundColor: colors.card,
		borderRadius: 18,
		borderTopWidth: 1,
		borderTopColor: 'rgba(255,255,255,0.07)',
		paddingVertical: 12,
		alignItems: 'center',
		elevation: 6,
		shadowColor: '#000'
	},
	value: { color: colors.text, fontFamily: fonts.display, fontSize: 30, lineHeight: 32 },
	label: { color: colors.textMuted, fontSize: 11, fontFamily: fonts.sansMedium }
});

/** Abschnittstitel — Teko, gesperrt, wie Zwischenüberschriften im Web. */
export function SectionTitle({ children }: { children: string }) {
	return <Text style={st.title}>{children.toUpperCase()}</Text>;
}

const st = StyleSheet.create({
	title: {
		color: colors.textSecondary,
		fontFamily: fonts.displayMedium,
		fontSize: 17,
		letterSpacing: 3,
		marginTop: 10,
		marginBottom: -4,
		marginLeft: 2
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
	text: {
		color: colors.textMuted,
		fontSize: 14,
		fontFamily: fonts.sans,
		textAlign: 'center',
		maxWidth: 240
	}
});

/** Fehlerkarte für gescheiterte Ladevorgänge. */
export function ErrorCard({ message }: { message: string }) {
	return (
		<Card style={{ backgroundColor: colors.danger + '14' }}>
			<Text style={{ color: colors.danger, fontSize: 14, fontFamily: fonts.sansMedium }}>
				{message}
			</Text>
		</Card>
	);
}

/** Buttons: accent = Gelb→Orange-Verlauf (Hauptaktion), ghost, danger. */
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
	const textColor =
		kind === 'accent' ? colors.onAccent : kind === 'danger' ? colors.danger : colors.text;
	return (
		<Pressable
			style={({ pressed }) => [
				bt.btn,
				kind === 'ghost' && { backgroundColor: colors.hover },
				kind === 'danger' && { backgroundColor: colors.danger + '1f' },
				small && bt.small,
				wide && { alignSelf: 'stretch', alignItems: 'center' },
				pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }
			]}
			onPress={onPress}
		>
			{kind === 'accent' ? (
				<Image source={{ uri: GRADIENT_FILL }} style={StyleSheet.absoluteFill} contentFit="fill" />
			) : null}
			<Text style={[bt.text, { color: textColor }, small && { fontSize: 13 }]}>{label}</Text>
		</Pressable>
	);
}

const bt = StyleSheet.create({
	btn: {
		borderRadius: 999,
		paddingHorizontal: 22,
		paddingVertical: 12,
		alignSelf: 'flex-start',
		overflow: 'hidden'
	},
	small: { paddingHorizontal: 15, paddingVertical: 9 },
	text: { fontSize: 14.5, fontFamily: fonts.sansBold }
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
					<Text style={sh.title}>{title.toUpperCase()}</Text>
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
		borderTopWidth: 1,
		borderTopColor: 'rgba(255,255,255,0.09)',
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
		marginBottom: 4
	},
	title: { color: colors.text, fontFamily: fonts.display, fontSize: 24, letterSpacing: 1 }
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
		backgroundColor: colors.bgSecondary,
		borderRadius: 14,
		color: colors.text,
		paddingHorizontal: 16,
		paddingVertical: 13,
		fontSize: 15.5,
		fontFamily: fonts.sans
	},
	multiline: { minHeight: 84, textAlignVertical: 'top' }
});
