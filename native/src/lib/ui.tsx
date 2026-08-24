import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
	View,
	Text,
	StyleSheet,
	Pressable,
	ScrollView,
	RefreshControl,
	Modal,
	TextInput,
	Dimensions,
	Keyboard,
	Platform,
	type TextInputProps
} from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, type ThemeColors } from './theme';
import { type as T, textAlpha, radius, space } from './tokens';
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
	const { colors, markColor } = useTheme();
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
			{/* Logo antippen = zurück zur Startseite, egal wie tief man steckt. */}
			<Pressable
				onPress={() => {
					try {
						if (router.canDismiss()) router.dismissAll();
					} catch {
						/* kein Stack offen */
					}
					router.navigate('/');
				}}
				style={({ pressed }) => [
					{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
					pressed && { opacity: 0.7 }
				]}
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
					{/* Einfärbbares Mark: passt sich jedem Theme an (statt fixer Kachel). */}
					<Image
						source={require('../../assets/images/mark-mono.png')}
						style={{ width: 24, height: 24 }}
						contentFit="contain"
						tintColor={markColor ?? colors.text}
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
							fontSize: 11,
							lineHeight: 13,
							letterSpacing: 3.5
						}}
					>
						PORTAL
					</Text>
				</View>
			</Pressable>
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
/**
 * Lässt eingebettete Gesten-Flächen (Karte!) das Scrollen der Seite
 * vorübergehend sperren. Ohne das kämpfen Karte und ScrollView um jede
 * vertikale Bewegung — die Karte lässt sich nicht schieben, und Wischen
 * nach unten löst den Seiten-Refresh aus.
 */
const ScrollLockContext = createContext<(enabled: boolean) => void>(() => {});
export const useScrollLock = () => useContext(ScrollLockContext);

/**
 * Zwei- oder dreifacher Umschalter im Stil eines Schiebereglers.
 * Für Ansichten desselben Inhalts (Liste ⇄ Karte) — ein Knopf, der seine
 * Beschriftung wechselt, lässt nicht erkennen, wo man gerade steht.
 */
export function Segmented<T extends string>({
	value,
	options,
	onChange
}: {
	value: T;
	options: { key: T; label: string; icon?: keyof typeof Ionicons.glyphMap }[];
	onChange: (key: T) => void;
}) {
	const { colors } = useTheme();
	return (
		<View
			style={{
				flexDirection: 'row',
				backgroundColor: colors.hover,
				borderRadius: 999,
				padding: 3
			}}
		>
			{options.map((o) => {
				const active = o.key === value;
				return (
					<Pressable
						key={o.key}
						onPress={() => onChange(o.key)}
						hitSlop={6}
						style={({ pressed }) => [
							{
								flexDirection: 'row',
								alignItems: 'center',
								gap: 4,
								paddingHorizontal: 10,
								paddingVertical: 5,
								borderRadius: 999,
								backgroundColor: active ? colors.accent : 'transparent'
							},
							pressed && { opacity: 0.75 }
						]}
					>
						{o.icon ? (
							<Ionicons
								name={o.icon}
								size={14}
								color={active ? colors.onAccent : colors.fg + textAlpha.muted}
							/>
						) : null}
						<Text
							style={{
								fontFamily: fonts.sansSemi,
								fontSize: 12,
								lineHeight: 16,
								color: active ? colors.onAccent : colors.fg + textAlpha.secondary
							}}
						>
							{o.label}
						</Text>
					</Pressable>
				);
			})}
		</View>
	);
}

export function Screen({
	children,
	refreshing,
	onRefresh,
	header = true,
	scroll = true
}: {
	children: ReactNode;
	refreshing?: boolean;
	onRefresh?: () => void;
	/** Feste Kopfleiste mit Logo — auf Unterseiten abschaltbar. */
	header?: boolean;
	/**
	 * Bringt der Bildschirm seine eigene Scrollfläche mit (lange Liste)?
	 * Dann zeichnet er hier KEINE — sonst entstünde jede Zeile sofort,
	 * auch die unsichtbaren.
	 */
	scroll?: boolean;
}) {
	const { colors } = useTheme();
	const insets = useSafeAreaInsets();
	const bg = useMemo(() => bgTexture(colors), [colors]);
	const [scrollEnabled, setScrollEnabled] = useState(true);
	return (
		<View style={{ flex: 1, backgroundColor: colors.bg }}>
			<Image source={{ uri: bg }} style={StyleSheet.absoluteFill} contentFit="cover" />
			{header ? <AppHeader /> : null}
			{!scroll ? (
				<View
					style={{
						flex: 1,
						paddingHorizontal: 20,
						paddingTop: header ? 18 : insets.top + 16,
						// Gleicher Abstand wie in der scrollenden Fassung — ohne ihn
						// kleben Suchfeld und Filterzeile aneinander.
						gap: 12
					}}
				>
					<ScrollLockContext.Provider value={setScrollEnabled}>
						{children}
					</ScrollLockContext.Provider>
				</View>
			) : (
			<ScrollView
				style={{ flex: 1 }}
				scrollEnabled={scrollEnabled}
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
				<ScrollLockContext.Provider value={setScrollEnabled}>
					{children}
				</ScrollLockContext.Provider>
			</ScrollView>
			)}
		</View>
	);
}

const makeTopBar = (colors: ThemeColors) =>
	StyleSheet.create({
		row: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.xs },
		kicker: { ...T.label, color: colors.fg + textAlpha.muted },
		title: { ...T.screenTitle, color: colors.fg + textAlpha.primary },
		sub: { ...T.body, color: colors.fg + textAlpha.secondary, marginTop: space.sm },
		circleBtn: {
			width: 40,
			height: 40,
			borderRadius: radius.full,
			backgroundColor: colors.hover,
			alignItems: 'center',
			justifyContent: 'center'
		},
		dot: {
			position: 'absolute',
			top: 9,
			right: 9,
			width: 8,
			height: 8,
			borderRadius: radius.full,
			backgroundColor: colors.danger,
			borderWidth: 2,
			borderColor: colors.hover
		}
	});

/**
 * Seitenkopf: kleiner gedämpfter Kicker, kräftiger neutraler Titel.
 * Bewusst OHNE Akzentfarbe — die bleibt Kennzahlen und Aktionen vorbehalten.
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
	plainTitle?: boolean;
}) {
	const router = useRouter();
	const { colors } = useTheme();
	const t = useThemedStyles(makeTopBar);
	return (
		<View style={t.row}>
			{back ? (
				<Pressable
					onPress={() => router.back()}
					hitSlop={8}
					style={({ pressed }) => [t.circleBtn, pressed && { opacity: 0.7 }]}
				>
					<Ionicons name="chevron-back" size={22} color={colors.fg} />
				</Pressable>
			) : null}
			<View style={{ flex: 1 }}>
				<Text style={t.kicker}>{kicker.toUpperCase()}</Text>
				<Text style={t.title} numberOfLines={1}>
					{title.toUpperCase()}
				</Text>
				{sub ? typeof sub === 'string' ? <Text style={t.sub}>{sub}</Text> : sub : null}
			</View>
			{right}
		</View>
	);
}

/**
 * Karte: Höhe wird im Dunkeln über eine hellere Fläche gezeigt, nicht
 * über Schatten (die sind auf Dunkel praktisch unsichtbar).
 */
export function Card({ children, style }: { children: ReactNode; style?: object }) {
	const { colors } = useTheme();
	return (
		<View
			style={[
				{
					backgroundColor: colors.card,
					borderRadius: radius.md,
					padding: space.lg
				},
				style
			]}
		>
			{children}
		</View>
	);
}

/** Status-Pille: neutrale Fläche, Bedeutung allein über die Textfarbe. */
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
				borderRadius: radius.full,
				paddingHorizontal: space.md,
				paddingVertical: 5,
				alignSelf: 'flex-start',
				backgroundColor: filled ? color : colors.hover
			}}
		>
			<Text style={{ ...T.label, color: filled ? colors.onAccent : color }}>
				{label.toUpperCase()}
			</Text>
		</View>
	);
}

/**
 * Namens-Chip: neutrale Fläche mit farbigem Punkt. Vorher war die ganze
 * Fläche eingefärbt — bei zehn Namen wurde die Karte zur Farbwand.
 */
export function NameChip({
	name,
	tone,
	avatar,
	userId,
	index = 0
}: {
	name: string;
	tone?: string;
	avatar?: string | null;
	/** Gesetzt = Chip führt aufs Profil. */
	userId?: number;
	index?: number;
}) {
	const { colors } = useTheme();
	const router = useRouter();
	const dot = tone ?? colors.success;
	const body = (
		<View
			style={{
				flexDirection: 'row',
				alignItems: 'center',
				gap: space.sm,
				borderRadius: radius.full,
				paddingLeft: 4,
				paddingRight: space.md,
				paddingVertical: 4,
				backgroundColor: colors.hover
			}}
		>
			{avatar !== undefined ? (
				<Avatar username={name} avatar={avatar} size={26} index={index} />
			) : (
				<View
					style={{
						width: 26,
						height: 26,
						borderRadius: 13,
						backgroundColor: dot + '33',
						alignItems: 'center',
						justifyContent: 'center'
					}}
				>
					<Text style={{ color: dot, fontSize: 12, lineHeight: 16, fontFamily: fonts.sansBold }}>
						{name.slice(0, 1).toUpperCase()}
					</Text>
				</View>
			)}
			<Text style={{ ...T.body, color: colors.fg + textAlpha.primary }}>{name}</Text>
		</View>
	);
	if (!userId) return body;
	return (
		<Pressable
			onPress={() => router.push(`/profile/${userId}`)}
			style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
		>
			{body}
		</Pressable>
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
	// Profilbilder erscheinen nirgends grösser als ~120 px — die kleine
	// Fassung genügt und spart bei Listen ein Vielfaches an Daten.
	const url = mediaUrl(avatar, 120);
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

/**
 * Überlappende Avatar-Reihe („wer ist dabei"), max. 7 + Rest.
 * Nimmt Personen MIT Profilbild — nie wieder nur Initialen, wenn ein
 * Bild existiert. `names` bleibt als Rückfall für reine Namenslisten.
 */
export function InitialsRow({
	names,
	people
}: {
	names?: string[];
	people?: { username: string; avatar?: string | null }[];
}) {
	const { colors } = useTheme();
	const list = people ?? (names ?? []).map((n) => ({ username: n, avatar: undefined }));
	const shown = list.slice(0, 7);
	const rest = list.length - shown.length;
	return (
		<View style={{ flexDirection: 'row', alignItems: 'center' }}>
			{shown.map((p, i) => (
				<View
					key={`${p.username}-${i}`}
					style={{
						borderRadius: 999,
						borderWidth: 2,
						borderColor: colors.card,
						marginLeft: i === 0 ? 0 : -8
					}}
				>
					<Avatar username={p.username} avatar={p.avatar} size={30} index={i} />
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

/** Fortschrittsbalken — dünn, einfarbig, ohne Aufmerksamkeit zu stehlen. */
export function ProgressBar({
	percent,
	color,
	height = 4
}: {
	percent: number;
	color?: string;
	height?: number;
}) {
	const { colors } = useTheme();
	return (
		<View
			style={{
				height,
				borderRadius: height / 2,
				backgroundColor: colors.hover,
				overflow: 'hidden'
			}}
		>
			<View
				style={{
					height,
					borderRadius: height / 2,
					width: `${Math.min(100, Math.max(0, percent))}%`,
					backgroundColor: color ?? colors.accent
				}}
			/>
		</View>
	);
}

/**
 * Kennzahl-Kachel: grosse Zahl in der Metrik-Farbe, darunter eine kleine
 * gedämpfte Beschriftung. Zahlen sind der einzige Ort, an dem Farbe
 * grossflächig auftauchen darf.
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
				flexGrow: 1,
				flexBasis: '46%',
				minWidth: 140,
				backgroundColor: colors.card,
				borderRadius: radius.md,
				paddingVertical: space.lg,
				paddingHorizontal: space.md,
				alignItems: 'center',
				gap: 2
			}}
		>
			<Text style={{ ...T.metric, color: tint ?? colors.fg + textAlpha.primary }}>
				{String(value)}
			</Text>
			<Text style={{ ...T.label, color: colors.fg + textAlpha.secondary, textAlign: 'center' }}>
				{label.toUpperCase()}
			</Text>
			{hint ? (
				<Text style={{ ...T.caption, color: colors.fg + textAlpha.muted, textAlign: 'center' }}>
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

/** Gruppenbeschriftung („ZIEHT (6)") — klein, gedämpft, farbiger Punkt. */
export function GroupLabel({ children, color }: { children: string; color: string }) {
	const { colors } = useTheme();
	return (
		<View
			style={{
				flexDirection: 'row',
				alignItems: 'center',
				gap: space.sm,
				marginTop: space.sm
			}}
		>
			<View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
			<Text style={{ ...T.label, color: colors.fg + textAlpha.secondary }}>
				{children.toUpperCase()}
			</Text>
		</View>
	);
}

/**
 * Abschnittstitel: klein und gedämpft. Vorher stand hier ein zweiter
 * grosser Titel samt Farbbalken — das hat mit dem Seitentitel konkurriert.
 */
export function SectionTitle({ children }: { children: string }) {
	const { colors } = useTheme();
	return (
		<Text
			style={{
				...T.label,
				color: colors.fg + textAlpha.secondary,
				marginTop: space.md,
				marginBottom: -space.xs
			}}
		>
			{children.toUpperCase()}
		</Text>
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
 * Buttons: `accent` ist die EINE Hauptaktion je Ansicht, alles andere
 * `ghost` (neutrale Fläche). Höhe 48 — bequemes Daumenziel.
 */
export function Button({
	label,
	onPress,
	kind = 'accent',
	small = false,
	wide = false,
	disabled = false
}: {
	label: string;
	onPress: () => void;
	kind?: 'accent' | 'ghost' | 'danger';
	small?: boolean;
	wide?: boolean;
	/** Während einer laufenden Aktion — verhindert Doppel-Absenden. */
	disabled?: boolean;
}) {
	const { colors } = useTheme();
	const textColor =
		kind === 'accent'
			? colors.onAccent
			: kind === 'danger'
				? colors.danger
				: colors.fg + textAlpha.primary;
	return (
		<Pressable
			style={({ pressed }) => [
				{
					borderRadius: radius.sm,
					paddingHorizontal: small ? space.lg : space.xl,
					minHeight: small ? 38 : 48,
					justifyContent: 'center',
					alignSelf: wide ? 'stretch' : 'flex-start',
					alignItems: 'center',
					backgroundColor: kind === 'accent' ? colors.accent : colors.hover
				},
				pressed && { opacity: 0.8 },
				disabled && { opacity: 0.5 }
			]}
			onPress={onPress}
			disabled={disabled}
		>
			<Text style={{ ...T.bodyStrong, color: textColor }}>{label}</Text>
		</Pressable>
	);
}

/** Bottom-Sheet mit Griff und Backdrop — für alle Dialoge der App. */
export function Sheet({
	visible,
	onClose,
	title,
	children,
	scroll = true
}: {
	visible: boolean;
	onClose: () => void;
	title: string;
	children: ReactNode;
	/**
	 * Scrollen ist der Normalfall — jede Liste kann länger werden als der
	 * Bildschirm. Nur ausschalten, wenn der Inhalt selbst schon scrollt
	 * (verschachtelte Scrollflächen streiten sich um die Geste).
	 */
	scroll?: boolean;
}) {
	const { colors } = useTheme();
	const insets = useSafeAreaInsets();
	/**
	 * Das Sheet klebt am unteren Rand — die Tastatur legt sich also genau
	 * darüber, und man sieht nicht, was man tippt. Modale Fenster weichen
	 * unter Android nicht von selbst aus, darum wird hier gemessen und
	 * angehoben.
	 */
	const [keyboard, setKeyboard] = useState(0);
	/** Karte höchstens 90 % des Bildschirms; davon gehen Griff, Titel und Ränder ab. */
	const sheetMaxHeight = Dimensions.get('window').height * 0.9 - keyboard;
	const scrollMaxHeight = Math.max(180, sheetMaxHeight - 130 - Math.max(insets.bottom, 14));
	useEffect(() => {
		const fullHeight = Dimensions.get('window').height;
		const show = Keyboard.addListener(
			Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
			(e) => {
				const height = e.endCoordinates?.height ?? 0;
				// Manche Geräte verkleinern das Fenster bereits selbst. Dann
				// noch einmal anzuheben, schöbe das Sheet aus dem Bild — also
				// nur anheben, wenn das Fenster gleich hoch geblieben ist.
				const shrunk = fullHeight - Dimensions.get('window').height > height * 0.5;
				setKeyboard(shrunk ? 0 : height);
			}
		);
		const hide = Keyboard.addListener(
			Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
			() => setKeyboard(0)
		);
		return () => {
			show.remove();
			hide.remove();
		};
	}, []);
	return (
		<Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
			{/*
			 * Die Karte ist bewusst KEIN Druckbereich mehr.
			 *
			 * Vorher lag sie in einem Pressable (damit Tippen daneben schliesst).
			 * Beginnt eine Wischgeste dann auf einem Eingabefeld oder Chip,
			 * streiten sich Druckbereich und Scrollfläche um die Geste — mal
			 * scrollt es, mal nicht. Jetzt liegt der schliessende Bereich als
			 * eigene Fläche HINTER der Karte.
			 */}
			<View style={{ flex: 1, justifyContent: 'flex-end' }}>
				<Pressable
					style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.75)' }]}
					onPress={onClose}
				/>
				<View
					style={{
						backgroundColor: colors.card,
						borderTopLeftRadius: 28,
						borderTopRightRadius: 28,
						borderTopWidth: 1,
						borderTopColor: colors.dark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.06)',
						padding: 20,
						paddingBottom: keyboard > 0 ? 20 : 20 + Math.max(insets.bottom, 14),
						gap: 12,
						// Anheben, solange die Tastatur offen ist.
						marginBottom: keyboard,
						// Ohne Deckel wächst die Karte über den Bildschirm hinaus —
						// dann sind die untersten Felder schlicht nicht erreichbar.
						maxHeight: sheetMaxHeight
					}}
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
					{scroll ? (
						<ScrollView
							/**
							 * HARTE Höhe, nicht nur flexShrink.
							 *
							 * Im Browser reicht Flexbox, um die Fläche auf die Karte zu
							 * begrenzen — auf dem Gerät nicht: Dort bekommt eine
							 * Scrollfläche ohne eigene Höhe schlicht die Höhe ihres
							 * Inhalts, wächst über die Karte hinaus und scrollt gar
							 * nicht. Darum hier ausgerechnet, was nach Griff, Titel und
							 * Rändern übrig bleibt.
							 */
							style={{ flexShrink: 1, maxHeight: scrollMaxHeight }}
							contentContainerStyle={{ gap: 12, paddingBottom: 4 }}
							keyboardShouldPersistTaps="handled"
							keyboardDismissMode="on-drag"
							// Balken sichtbar lassen — sonst sieht niemand, dass da mehr ist.
							showsVerticalScrollIndicator
						>
							{children}
						</ScrollView>
					) : (
						children
					)}
				</View>
			</View>
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
