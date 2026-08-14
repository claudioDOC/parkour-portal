import { useMemo, type ReactNode } from 'react';
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
import { fonts, type ThemeColors } from './theme';
import { useTheme, useThemedStyles } from './themeContext';
import { bgTexture, gradientBar, gradientFill } from './gfx';
import { mediaUrl } from './api';
import { useActivity } from './activity';

/**
 * UI-Bausteine — dieselbe Design-Sprache wie die Website, eingefärbt nach
 * dem Theme aus dem User-Profil: Teko-Display-Titel, Kicker mit weiter
 * Sperrung, Akzent-Verlaufsbalken, Hintergrund-Glow, Karten mit Licht-Kante.
 */

/** Scroll-Seite mit Theme-Hintergrund (Glows + Punktraster) und Refresh. */
export function Screen({
	children,
	refreshing,
	onRefresh
}: {
	children: ReactNode;
	refreshing?: boolean;
	onRefresh?: () => void;
}) {
	const { colors } = useTheme();
	const bg = useMemo(() => bgTexture(colors), [colors]);
	return (
		<View style={{ flex: 1, backgroundColor: colors.bg }}>
			<Image source={{ uri: bg }} style={StyleSheet.absoluteFill} contentFit="cover" />
			<ScrollView
				style={{ flex: 1 }}
				contentContainerStyle={{ padding: 20, paddingTop: 60, paddingBottom: 44, gap: 14 }}
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

const makeTopBar = (colors: ThemeColors) =>
	StyleSheet.create({
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
		sub: { color: colors.textSecondary, fontFamily: fonts.sans, fontSize: 15, marginTop: 6 },
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

/**
 * Seitenkopf wie PageHeader der Website: Kicker (Zweitakzent, gesperrt),
 * Teko-Titel (letztes Wort im Akzent), Verlaufsbalken, optionale Sub-Zeile.
 */
export function TopBar({
	kicker,
	title,
	sub,
	back = false,
	right
}: {
	kicker: string;
	title: string;
	sub?: ReactNode;
	back?: boolean;
	right?: ReactNode;
}) {
	const router = useRouter();
	const { colors } = useTheme();
	const { unread } = useActivity();
	const t = useThemedStyles(makeTopBar);
	const bar = useMemo(() => gradientBar(colors), [colors]);
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
				<Image source={{ uri: bar }} style={t.bar} />
				{sub ? typeof sub === 'string' ? <Text style={t.sub}>{sub}</Text> : sub : null}
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

/** Karte wie `card-surface` im Web: Fläche, Licht-Kante oben, Schatten. */
export function Card({ children, style }: { children: ReactNode; style?: object }) {
	const { colors } = useTheme();
	return (
		<View
			style={[
				{
					backgroundColor: colors.card,
					borderRadius: 20,
					padding: 18,
					borderWidth: 1,
					borderColor: colors.border,
					borderTopColor: colors.dark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.04)',
					elevation: 6,
					shadowColor: '#000'
				},
				style
			]}
		>
			{children}
		</View>
	);
}

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
	const { colors } = useTheme();
	return (
		<View
			style={{
				borderRadius: 999,
				paddingHorizontal: 11,
				paddingVertical: 4,
				alignSelf: 'flex-start',
				backgroundColor: filled ? color : color + '26'
			}}
		>
			<Text
				style={{
					fontSize: 11.5,
					fontFamily: fonts.sansBold,
					letterSpacing: 0.2,
					color: filled ? colors.onAccent : color
				}}
			>
				{label}
			</Text>
		</View>
	);
}

/** Namens-Chip wie „ZIEHT"-Liste im Web-Dashboard. */
export function NameChip({ name, tone }: { name: string; tone?: string }) {
	const { colors } = useTheme();
	const color = tone ?? colors.accent;
	return (
		<View
			style={{
				borderRadius: 999,
				paddingHorizontal: 13,
				paddingVertical: 6,
				backgroundColor: color + '1c',
				borderWidth: 1,
				borderColor: color + '33'
			}}
		>
			<Text style={{ color: colors.text, fontSize: 13.5, fontFamily: fonts.sansMedium }}>
				{name}
			</Text>
		</View>
	);
}

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
	const { colors } = useTheme();
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
	const { colors } = useTheme();
	const shown = names.slice(0, 7);
	const rest = names.length - shown.length;
	return (
		<View style={{ flexDirection: 'row', alignItems: 'center' }}>
			{shown.map((n, i) => (
				<View
					key={`${n}-${i}`}
					style={{
						borderRadius: 17,
						borderWidth: 2,
						borderColor: colors.card,
						marginLeft: i === 0 ? 0 : -8
					}}
				>
					<Avatar username={n} size={30} index={i} />
				</View>
			))}
			{rest > 0 ? (
				<View
					style={{
						width: 30,
						height: 30,
						borderRadius: 15,
						backgroundColor: colors.hover,
						alignItems: 'center',
						justifyContent: 'center',
						marginLeft: -8,
						borderWidth: 2,
						borderColor: colors.card
					}}
				>
					<Text style={{ color: colors.textSecondary, fontSize: 11, fontFamily: fonts.sansBold }}>
						+{rest}
					</Text>
				</View>
			) : null}
		</View>
	);
}

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
	const { colors } = useTheme();
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
export function ProgressBar({ percent, color }: { percent: number; color?: string }) {
	const { colors } = useTheme();
	return (
		<View style={{ height: 5, borderRadius: 3, backgroundColor: colors.hover, overflow: 'hidden' }}>
			<View
				style={{
					height: 5,
					borderRadius: 3,
					width: `${Math.min(100, Math.max(0, percent))}%`,
					backgroundColor: color ?? colors.accent
				}}
			/>
		</View>
	);
}

/** Kennzahl-Kachel — Zahl in Teko wie die grossen Ziffern der Website. */
export function Stat({ value, label, tint }: { value: string | number; label: string; tint?: string }) {
	const { colors } = useTheme();
	return (
		<View
			style={{
				flex: 1,
				backgroundColor: colors.card,
				borderRadius: 18,
				borderWidth: 1,
				borderColor: colors.border,
				paddingVertical: 12,
				alignItems: 'center',
				elevation: 4,
				shadowColor: '#000'
			}}
		>
			<Text
				style={{
					color: tint ?? colors.text,
					fontFamily: fonts.display,
					fontSize: 30,
					lineHeight: 32
				}}
			>
				{String(value)}
			</Text>
			<Text style={{ color: colors.textMuted, fontSize: 11, fontFamily: fonts.sansMedium }}>
				{label}
			</Text>
		</View>
	);
}

/** Abschnittstitel wie im Web: kurzer Verlaufsbalken + Teko, gesperrt. */
export function SectionTitle({ children }: { children: string }) {
	const { colors } = useTheme();
	const bar = useMemo(() => gradientBar(colors), [colors]);
	return (
		<View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, marginBottom: -2 }}>
			<Image source={{ uri: bar }} style={{ width: 34, height: 5, borderRadius: 2 }} />
			<Text
				style={{
					color: colors.text,
					fontFamily: fonts.display,
					fontSize: 21,
					letterSpacing: 2.5,
					lineHeight: 24
				}}
			>
				{children.toUpperCase()}
			</Text>
		</View>
	);
}

export function EmptyState({ icon, text }: { icon: string; text: string }) {
	const { colors } = useTheme();
	return (
		<View style={{ alignItems: 'center', gap: 12, paddingVertical: 38 }}>
			<View
				style={{
					width: 56,
					height: 56,
					borderRadius: 28,
					backgroundColor: colors.card,
					alignItems: 'center',
					justifyContent: 'center'
				}}
			>
				<Ionicons name={icon as 'help'} size={26} color={colors.textMuted} />
			</View>
			<Text
				style={{
					color: colors.textMuted,
					fontSize: 14,
					fontFamily: fonts.sans,
					textAlign: 'center',
					maxWidth: 240
				}}
			>
				{text}
			</Text>
		</View>
	);
}

/** Fehlerkarte für gescheiterte Ladevorgänge. */
export function ErrorCard({ message }: { message: string }) {
	const { colors } = useTheme();
	return (
		<Card style={{ backgroundColor: colors.danger + '14' }}>
			<Text style={{ color: colors.danger, fontSize: 14, fontFamily: fonts.sansMedium }}>
				{message}
			</Text>
		</Card>
	);
}

/** Buttons: accent = Akzent-Verlauf (Hauptaktion), ghost, danger. */
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
	const { colors } = useTheme();
	const fill = useMemo(() => gradientFill(colors), [colors]);
	const textColor =
		kind === 'accent' ? colors.onAccent : kind === 'danger' ? colors.danger : colors.text;
	return (
		<Pressable
			style={({ pressed }) => [
				{
					borderRadius: 999,
					paddingHorizontal: small ? 15 : 22,
					paddingVertical: small ? 9 : 12,
					alignSelf: wide ? 'stretch' : 'flex-start',
					alignItems: wide ? 'center' : undefined,
					overflow: 'hidden'
				},
				kind === 'ghost' && { backgroundColor: colors.hover },
				kind === 'danger' && { backgroundColor: colors.danger + '1f' },
				pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }
			]}
			onPress={onPress}
		>
			{kind === 'accent' ? (
				<Image source={{ uri: fill }} style={StyleSheet.absoluteFill} contentFit="fill" />
			) : null}
			<Text
				style={{ fontSize: small ? 13 : 14.5, fontFamily: fonts.sansBold, color: textColor }}
			>
				{label}
			</Text>
		</Pressable>
	);
}

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
	const { colors } = useTheme();
	return (
		<Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
			<Pressable
				style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' }}
				onPress={onClose}
			>
				<Pressable
					style={{
						backgroundColor: colors.card,
						borderTopLeftRadius: 28,
						borderTopRightRadius: 28,
						borderTopWidth: 1,
						borderTopColor: colors.dark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.06)',
						padding: 22,
						paddingBottom: 36,
						gap: 12
					}}
					onPress={() => {}}
				>
					<View
						style={{
							alignSelf: 'center',
							width: 36,
							height: 4,
							borderRadius: 2,
							backgroundColor: colors.hover,
							marginBottom: 4
						}}
					/>
					<Text
						style={{
							color: colors.text,
							fontFamily: fonts.display,
							fontSize: 24,
							letterSpacing: 1
						}}
					>
						{title.toUpperCase()}
					</Text>
					{children}
				</Pressable>
			</Pressable>
		</Modal>
	);
}

/** Eingabefeld — Fläche, kein Rahmen. */
export function Input(props: TextInputProps) {
	const { colors } = useTheme();
	return (
		<TextInput
			placeholderTextColor={colors.textMuted}
			{...props}
			style={[
				{
					backgroundColor: colors.bgSecondary,
					borderRadius: 14,
					color: colors.text,
					paddingHorizontal: 16,
					paddingVertical: 13,
					fontSize: 15.5,
					fontFamily: fonts.sans
				},
				props.multiline && { minHeight: 84, textAlignVertical: 'top' },
				props.style
			]}
		/>
	);
}
