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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, type ThemeColors } from './theme';
import { useTheme, useThemedStyles } from './themeContext';
import { bgTexture, gradientBar, gradientProgress } from './gfx';
import { mediaUrl } from './api';
import { useActivity } from './activity';

/**
 * UI-Bausteine — dieselbe Design-Sprache wie die Website, eingefärbt nach
 * dem Theme aus dem User-Profil: Teko-Display-Titel, Kicker mit weiter
 * Sperrung, Akzent-Verlaufsbalken, Hintergrund-Glow, Karten mit Licht-Kante.
 */

/**
 * Feste Kopfleiste wie auf der Website: Logo-Kachel, Wortmarke „PARKOUR /
 * PORTAL", rechts die Glocke mit rotem Punkt.
 */
export function AppHeader() {
	const { colors } = useTheme();
	const insets = useSafeAreaInsets();
	const router = useRouter();
	const { unread } = useActivity();
	return (
		<View
			style={{
				paddingTop: insets.top + 8,
				paddingBottom: 8,
				paddingHorizontal: 16,
				flexDirection: 'row',
				alignItems: 'center',
				gap: 12,
				backgroundColor: colors.bgSecondary,
				borderBottomWidth: StyleSheet.hairlineWidth,
				borderBottomColor: colors.border
			}}
		>
			<View
				style={{
					width: 40,
					height: 40,
					borderRadius: 12,
					backgroundColor: colors.bg,
					borderWidth: 1,
					borderColor: colors.border,
					alignItems: 'center',
					justifyContent: 'center'
				}}
			>
				<Image
					source={require('../../assets/images/icon.png')}
					style={{ width: 26, height: 26, borderRadius: 12 }}
					contentFit="contain"
				/>
			</View>
			<View style={{ flex: 1 }}>
				<Text
					style={{
						color: colors.text,
						fontFamily: fonts.display,
						fontSize: 28, lineHeight: 30,
						letterSpacing: 1.5,
					}}
				>
					PARKOUR
				</Text>
				<Text
					style={{
						color: colors.accent,
						fontFamily: fonts.displayMedium,
						fontSize: 13,
						lineHeight: 14,
						letterSpacing: 4,
					}}
				>
					PORTAL
				</Text>
			</View>
			<Pressable onPress={() => router.push('/activity')} hitSlop={10} style={{ padding: 4 }}>
				<Ionicons name="notifications-outline" size={23} color={colors.textSecondary} />
				{unread > 0 ? (
					<View
						style={{
							position: 'absolute',
							top: 2,
							right: 2,
							width: 9,
							height: 9,
							borderRadius: 999,
							backgroundColor: colors.danger,
							borderWidth: 1.5,
							borderColor: colors.bgSecondary
						}}
					/>
				) : null}
			</Pressable>
		</View>
	);
}

/** Scroll-Seite mit Theme-Hintergrund (Glows + Punktraster) und Refresh. */
export function Screen({
	children,
	refreshing,
	onRefresh,
	header = true
}: {
	children: ReactNode;
	refreshing?: boolean;
	onRefresh?: () => void;
	/** Feste Kopfleiste mit Logo — auf Unterseiten abschaltbar. */
	header?: boolean;
}) {
	const { colors } = useTheme();
	const insets = useSafeAreaInsets();
	const bg = useMemo(() => bgTexture(colors), [colors]);
	return (
		<View style={{ flex: 1, backgroundColor: colors.bg }}>
			<Image source={{ uri: bg }} style={StyleSheet.absoluteFill} contentFit="cover" />
			{header ? <AppHeader /> : null}
			<ScrollView
				style={{ flex: 1 }}
				contentContainerStyle={{
					paddingHorizontal: 20,
					paddingTop: header ? 18 : insets.top + 16,
					paddingBottom: insets.bottom + 32,
					gap: 12
				}}
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
		row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 8 },
		kicker: {
			color: colors.accentHot,
			fontFamily: fonts.displayMedium,
			fontSize: 15, lineHeight: 21,
			letterSpacing: 4.5,
			marginBottom: -2
		},
		title: {
			color: colors.text,
			fontFamily: fonts.display,
			fontSize: 40, lineHeight: 42,
			letterSpacing: 1.5,
			marginBottom: 4
		},
		accent: { color: colors.accent },
		bar: { width: 64, height: 6, borderRadius: 2 },
		sub: { color: colors.textSecondary, fontFamily: fonts.sans, fontSize: 15, lineHeight: 21, marginTop: 8 },
		circleBtn: {
			width: 40,
			height: 40,
			borderRadius: 20,
			backgroundColor: colors.card,
			borderWidth: 1,
			borderColor: colors.border,
			alignItems: 'center',
			justifyContent: 'center',
			marginTop: 2
		},
		dot: {
			position: 'absolute',
			top: 9,
			right: 9,
			width: 9,
			height: 9,
			borderRadius: 999,
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
	right,
	plainTitle = false
}: {
	kicker: string;
	title: string;
	sub?: ReactNode;
	back?: boolean;
	right?: ReactNode;
	/** Titel ohne Akzentwort — wie das Dashboard der Website. */
	plainTitle?: boolean;
}) {
	const router = useRouter();
	const { colors } = useTheme();
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
					<Text style={plainTitle ? undefined : t.accent}>{last?.toUpperCase()}</Text>
				</Text>
				<Image source={{ uri: bar }} style={t.bar} />
				{sub ? typeof sub === 'string' ? <Text style={t.sub}>{sub}</Text> : sub : null}
			</View>
			{right}
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
					padding: 16,
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
				paddingHorizontal: 12,
				paddingVertical: 4,
				alignSelf: 'flex-start',
				backgroundColor: filled ? color : color + '26'
			}}
		>
			<Text
				style={{
					fontSize: 13, lineHeight: 18,
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
	const color = tone ?? colors.success;
	return (
		<View
			style={{
				borderRadius: 999,
				paddingHorizontal: 16,
				paddingVertical: 8,
				backgroundColor: color + '1a',
				borderWidth: 1,
				borderColor: color + '2e'
			}}
		>
			<Text style={{ color, fontSize: 15, lineHeight: 21, fontFamily: fonts.sansMedium }}>
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
						borderRadius: 999,
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
						borderRadius: 999,
						backgroundColor: colors.hover,
						alignItems: 'center',
						justifyContent: 'center',
						marginLeft: -8,
						borderWidth: 2,
						borderColor: colors.card
					}}
				>
					<Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18, fontFamily: fonts.sansBold }}>
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
		<View style={{ flexDirection: 'row', gap: 4 }}>
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

/** Fortschrittsbalken mit Akzent-Verlauf — wie die Balken der Statistik. */
export function ProgressBar({
	percent,
	color,
	height = 6
}: {
	percent: number;
	color?: string;
	height?: number;
}) {
	const { colors } = useTheme();
	const grad = useMemo(() => gradientProgress(colors), [colors]);
	const width = `${Math.min(100, Math.max(0, percent))}%` as const;
	return (
		<View
			style={{
				height,
				borderRadius: height / 2,
				backgroundColor: colors.hover,
				overflow: 'hidden'
			}}
		>
			{color ? (
				<View style={{ height, borderRadius: height / 2, width, backgroundColor: color }} />
			) : (
				<View style={{ height, width, borderRadius: height / 2, overflow: 'hidden' }}>
					<Image source={{ uri: grad }} style={{ flex: 1 }} contentFit="fill" />
				</View>
			)}
		</View>
	);
}

/**
 * Kennzahl-Kachel wie im Web: grosse Zahl in der Metrik-Farbe, darunter
 * die Beschriftung in gesperrten Grossbuchstaben. In 2×2-Rastern verwendet.
 */
export function Stat({
	value,
	label,
	tint,
	hint
}: {
	value: string | number;
	label: string;
	tint?: string;
	hint?: string;
}) {
	const { colors } = useTheme();
	return (
		<View
			style={{
				// Zwei Kacheln pro Reihe (halbe Breite minus Abstand).
				flexGrow: 1,
				flexBasis: '46%',
				minWidth: 140,
				backgroundColor: colors.bgSecondary,
				borderRadius: 12,
				borderWidth: 1,
				borderColor: colors.border,
				paddingVertical: 16,
				paddingHorizontal: 12,
				alignItems: 'center',
				gap: 4
			}}
		>
			<Text
				style={{
					color: tint ?? colors.accent,
					fontFamily: fonts.display,
					fontSize: 28,
					lineHeight: 30
				}}
			>
				{String(value)}
			</Text>
			<Text
				style={{
					color: colors.textMuted,
					fontSize: 13,
					lineHeight: 15,
					fontFamily: fonts.sansMedium,
					letterSpacing: 0.8,
					textAlign: 'center'
				}}
			>
				{label.toUpperCase()}
			</Text>
			{hint ? (
				<Text
					style={{
						color: colors.textMuted,
						fontSize: 13,
						lineHeight: 18,
						fontFamily: fonts.sans,
						textAlign: 'center'
					}}
				>
					{hint}
				</Text>
			) : null}
		</View>
	);
}

/** 2×2-Raster für vier Kennzahlen — das Layout der Website. */
export function StatGrid({ children }: { children: ReactNode }) {
	return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>{children}</View>;
}

/** Gruppenbeschriftung („ZIEHT (6)") — Sans in der Gruppenfarbe. */
export function GroupLabel({ children, color }: { children: string; color: string }) {
	return (
		<Text
			style={{
				color,
				fontSize: 13,
				lineHeight: 18,
				fontFamily: fonts.sansBold,
				letterSpacing: 1.2,
				marginTop: 4
			}}
		>
			{children.toUpperCase()}
		</Text>
	);
}

/** Abschnittstitel wie im Web: kurzer Verlaufsbalken + Teko, gesperrt. */
export function SectionTitle({ children }: { children: string }) {
	const { colors } = useTheme();
	const bar = useMemo(() => gradientBar(colors), [colors]);
	return (
		<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, marginBottom: -2 }}>
			<Image source={{ uri: bar }} style={{ width: 34, height: 5, borderRadius: 2 }} />
			<Text
				style={{
					color: colors.text,
					fontFamily: fonts.display,
					fontSize: 28, lineHeight: 30,
					letterSpacing: 2.5,
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
					borderRadius: 20,
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
					fontSize: 15, lineHeight: 21,
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
			<Text style={{ color: colors.danger, fontSize: 15, lineHeight: 21, fontFamily: fonts.sansMedium }}>
				{message}
			</Text>
		</Card>
	);
}

/**
 * Buttons wie auf der Website: primär = solide Akzentfläche mit dunklem
 * Text und moderat gerundeten Ecken; ghost = Umrandung; danger = getönt.
 */
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
	const textColor =
		kind === 'accent' ? colors.onAccent : kind === 'danger' ? colors.danger : colors.text;
	return (
		<Pressable
			style={({ pressed }) => [
				{
					borderRadius: 12,
					paddingHorizontal: small ? 16 : 20,
					paddingVertical: small ? 10 : 14,
					minHeight: small ? 40 : 48,
					justifyContent: 'center',
					alignSelf: wide ? 'stretch' : 'flex-start',
					alignItems: 'center'
				},
				kind === 'accent' && { backgroundColor: colors.accent },
				kind === 'ghost' && {
					backgroundColor: 'transparent',
					borderWidth: 1,
					borderColor: colors.border
				},
				kind === 'danger' && { backgroundColor: colors.danger + '1f' },
				pressed && { opacity: 0.82, transform: [{ scale: 0.98 }] }
			]}
			onPress={onPress}
		>
			<Text
				style={{
					fontSize: small ? 13 : 15,
					lineHeight: small ? 18 : 21,
					fontFamily: fonts.sansBold,
					color: textColor
				}}
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
	const insets = useSafeAreaInsets();
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
						padding: 20,
						paddingBottom: 20 + Math.max(insets.bottom, 14),
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
							fontSize: 28, lineHeight: 30,
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
					borderRadius: 12,
					color: colors.text,
					paddingHorizontal: 16,
					paddingVertical: 12,
					fontSize: 15, lineHeight: 21,
					fontFamily: fonts.sans
				},
				props.multiline && { minHeight: 84, textAlignVertical: 'top' },
				props.style
			]}
		/>
	);
}
