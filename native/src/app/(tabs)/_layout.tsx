import { Tabs } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { fonts, type ThemeColors } from '../../lib/theme';
import { textAlpha } from '../../lib/tokens';
import { useTheme, useThemedStyles } from '../../lib/themeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** App öffnet immer auf „Start", egal wo man zuletzt war. */
export const unstable_settings = { initialRouteName: 'index' };

/** Reihenfolge, Icons und Beschriftung der fünf Tabs. */
const TAB_META: Record<
	string,
	{ label: string; active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }
> = {
	finder: { label: 'Finder', active: 'search', inactive: 'search-outline' },
	spots: { label: 'Spots', active: 'location', inactive: 'location-outline' },
	index: { label: 'Start', active: 'calendar', inactive: 'calendar-outline' },
	stats: { label: 'Stats', active: 'stats-chart', inactive: 'stats-chart-outline' },
	more: { label: 'Mehr', active: 'menu', inactive: 'menu' }
};

/**
 * Ein normaler Tab: Icon in weicher Pille (nur aktiv), Label darunter,
 * federt beim Antippen ein und schnappt zurück.
 */
function TabItem({
	label,
	icon,
	focused,
	onPress
}: {
	label: string;
	icon: keyof typeof Ionicons.glyphMap;
	focused: boolean;
	onPress: () => void;
}) {
	const { colors } = useTheme();
	const styles = useThemedStyles(makeStyles);
	const scale = useRef(new Animated.Value(1)).current;
	const springTo = (v: number) =>
		Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 10 }).start();
	return (
		<Pressable
			onPress={onPress}
			onPressIn={() => springTo(0.85)}
			onPressOut={() => springTo(1)}
			android_ripple={{ color: colors.accent + '22', borderless: true, radius: 44 }}
			style={styles.slot}
		>
			<Animated.View style={[styles.item, { transform: [{ scale }] }]}>
				<View style={[styles.iconPill, focused && { backgroundColor: colors.accent + '1f' }]}>
					<Ionicons name={icon} size={22} color={focused ? colors.accent : colors.textMuted} />
				</View>
				<Text style={[styles.label, focused && { color: colors.accent }]}>{label}</Text>
			</Animated.View>
		</Pressable>
	);
}

/** Der erhöhte Start-Kreis in der Mitte — hüpft kurz, wenn er aktiv wird. */
function CenterItem({ focused, onPress }: { focused: boolean; onPress: () => void }) {
	const { colors } = useTheme();
	const styles = useThemedStyles(makeStyles);
	const scale = useRef(new Animated.Value(1)).current;
	const springTo = (v: number, bounce = 10) =>
		Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness: bounce }).start();
	useEffect(() => {
		if (focused) {
			scale.setValue(0.85);
			springTo(1, 14);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [focused]);
	return (
		<Pressable
			onPress={onPress}
			onPressIn={() => springTo(0.88)}
			onPressOut={() => springTo(1)}
			style={styles.slot}
		>
			<Animated.View
				style={[
					styles.center,
					{ transform: [{ scale }] },
					focused
						? { backgroundColor: colors.accent, shadowColor: colors.accent }
						: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }
				]}
			>
				<Ionicons
					name={focused ? 'calendar' : 'calendar-outline'}
					size={25}
					color={focused ? colors.onAccent : colors.textMuted}
				/>
			</Animated.View>
			<Text style={[styles.label, styles.centerLabel, focused && { color: colors.accent }]}>
				Start
			</Text>
		</Pressable>
	);
}

/** Nur die Felder, die die Tab-Bar wirklich braucht. */
type TabBarProps = {
	state: { index: number; routes: { key: string; name: string }[] };
	navigation: {
		emit: (e: { type: 'tabPress'; target?: string; canPreventDefault: true }) => {
			defaultPrevented: boolean;
		};
		navigate: (name: string) => void;
	};
};

/**
 * Komplett selbst gezeichnete Tab-Bar: schwebende Karte mit runden
 * oberen Ecken, aktiver Tab mit Farbpille, Start erhöht in der Mitte.
 * Kein Standard-Navigator-Zeichnen mehr — was hier steht, ist was man sieht.
 */
function TabBar({ state, navigation }: TabBarProps) {
	const styles = useThemedStyles(makeStyles);
	const insets = useSafeAreaInsets();
	return (
		<View style={[styles.bar, { paddingBottom: insets.bottom + 8 }]}>
			{state.routes.map((route, i) => {
				const meta = TAB_META[route.name];
				if (!meta) return null;
				const focused = state.index === i;
				const onPress = () => {
					const event = navigation.emit({
						type: 'tabPress',
						target: route.key,
						canPreventDefault: true
					});
					if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
				};
				return route.name === 'index' ? (
					<CenterItem key={route.key} focused={focused} onPress={onPress} />
				) : (
					<TabItem
						key={route.key}
						label={meta.label}
						icon={focused ? meta.active : meta.inactive}
						focused={focused}
						onPress={onPress}
					/>
				);
			})}
		</View>
	);
}

export default function TabsLayout() {
	return (
		<Tabs
			initialRouteName="index"
			tabBar={(props) => <TabBar {...props} />}
			screenOptions={{ headerShown: false }}
		>
			<Tabs.Screen name="finder" />
			<Tabs.Screen name="spots" />
			<Tabs.Screen name="index" />
			<Tabs.Screen name="stats" />
			<Tabs.Screen name="more" />
		</Tabs>
	);
}

const makeStyles = (colors: ThemeColors) =>
	StyleSheet.create({
		bar: {
			flexDirection: 'row',
			alignItems: 'flex-end',
			backgroundColor: colors.card,
			borderTopLeftRadius: 26,
			borderTopRightRadius: 26,
			paddingTop: 10,
			paddingHorizontal: 6,
			elevation: 20,
			shadowColor: '#000',
			shadowOpacity: 0.18,
			shadowRadius: 16,
			shadowOffset: { width: 0, height: -4 }
		},
		slot: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
		item: { alignItems: 'center', gap: 3 },
		iconPill: {
			paddingHorizontal: 16,
			paddingVertical: 4,
			borderRadius: 999,
			backgroundColor: 'transparent'
		},
		label: {
			color: colors.fg + textAlpha.muted,
			fontSize: 11,
			lineHeight: 14,
			fontFamily: fonts.sansSemi
		},
		center: {
			width: 58,
			height: 58,
			borderRadius: 999,
			marginTop: -34,
			alignItems: 'center',
			justifyContent: 'center',
			elevation: 10,
			shadowColor: '#000',
			shadowOpacity: 0.3,
			shadowRadius: 10,
			shadowOffset: { width: 0, height: 4 }
		},
		centerLabel: { marginTop: 4 }
	});
