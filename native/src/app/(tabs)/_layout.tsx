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
	challenges: { label: 'Arena', active: 'trophy', inactive: 'trophy-outline' },
	more: { label: 'Mehr', active: 'menu', inactive: 'menu' }
};

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
 * Ein Tab: Icon oben, Label darunter, alles in einer Reihe mit den
 * anderen — keine Überlappungen, die Trefffläche ist exakt der Knopf.
 * Aktiv wandert das Icon in eine weiche Akzent-Pille; „Start" trägt
 * seine Pille immer, gefüllt, als ruhige Mitte der Leiste.
 * Feedback nur über die Feder-Animation — bewusst kein Android-Ripple,
 * der zeichnete auf manchen Geräten ein hartes Rechteck.
 */
function TabItem({
	label,
	meta,
	focused,
	isCenter,
	onPress
}: {
	label: string;
	meta: { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap };
	focused: boolean;
	isCenter: boolean;
	onPress: () => void;
}) {
	const { colors } = useTheme();
	const styles = useThemedStyles(makeStyles);
	const scale = useRef(new Animated.Value(1)).current;
	const springTo = (v: number, bounce = 8) =>
		Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness: bounce }).start();
	useEffect(() => {
		if (focused) {
			scale.setValue(0.85);
			springTo(1, 12);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [focused]);

	const filled = isCenter || focused;
	return (
		<Pressable
			onPress={onPress}
			onPressIn={() => springTo(0.88)}
			onPressOut={() => springTo(1)}
			style={styles.slot}
		>
			<Animated.View style={[styles.item, { transform: [{ scale }] }]}>
				<View
					style={[
						styles.pill,
						isCenter && styles.centerPill,
						filled && {
							backgroundColor: focused ? colors.accent : colors.hover
						}
					]}
				>
					<Ionicons
						name={focused ? meta.active : meta.inactive}
						size={isCenter ? 24 : 21}
						color={focused ? colors.onAccent : isCenter ? colors.text : colors.textMuted}
					/>
				</View>
				<Text style={[styles.label, focused && { color: colors.accent, fontFamily: fonts.sansBold }]}>
					{label}
				</Text>
			</Animated.View>
		</Pressable>
	);
}

/**
 * Ruhige, geschlossene Leiste: eine Karte mit runden oberen Ecken,
 * fünf gleich breite Knöpfe, nichts schwebt, nichts überlappt.
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
				return (
					<TabItem
						key={route.key}
						label={meta.label}
						meta={meta}
						focused={focused}
						isCenter={route.name === 'index'}
						onPress={() => {
							const event = navigation.emit({
								type: 'tabPress',
								target: route.key,
								canPreventDefault: true
							});
							if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
						}}
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
			<Tabs.Screen name="challenges" />
			<Tabs.Screen name="more" />
		</Tabs>
	);
}

const makeStyles = (colors: ThemeColors) =>
	StyleSheet.create({
		bar: {
			flexDirection: 'row',
			backgroundColor: colors.card,
			borderTopLeftRadius: 22,
			borderTopRightRadius: 22,
			paddingTop: 10,
			paddingHorizontal: 8,
			elevation: 16,
			shadowColor: '#000',
			shadowOpacity: 0.15,
			shadowRadius: 14,
			shadowOffset: { width: 0, height: -3 }
		},
		slot: { flex: 1, alignItems: 'center', paddingVertical: 2 },
		item: { alignItems: 'center', gap: 3 },
		pill: {
			width: 46,
			height: 30,
			borderRadius: 999,
			alignItems: 'center',
			justifyContent: 'center',
			backgroundColor: 'transparent'
		},
		centerPill: {
			width: 52,
			height: 36,
			marginTop: -4
		},
		label: {
			color: colors.fg + textAlpha.muted,
			fontSize: 10,
			lineHeight: 13,
			fontFamily: fonts.sansSemi
		}
	});
