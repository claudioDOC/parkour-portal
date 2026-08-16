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
 * Ein Tab: schmaler Indikator-Strich oben, Icon, Label. Der aktive Tab
 * ist über Farbe und Strich markiert — bewusst KEINE gefüllte Fläche
 * hinter dem Icon: übergrosse Rundungen zeichnen manche Android-
 * Renderer als hartes Rechteck (genau das war die eckige Markierung).
 * Der Strich ist 3 Pixel hoch mit Radius 1.5 — das rundet überall.
 */
function TabItem({
	label,
	meta,
	focused,
	onPress
}: {
	label: string;
	meta: { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap };
	focused: boolean;
	onPress: () => void;
}) {
	const { colors } = useTheme();
	const styles = useThemedStyles(makeStyles);
	const scale = useRef(new Animated.Value(1)).current;
	const indicator = useRef(new Animated.Value(focused ? 1 : 0)).current;
	const springTo = (v: number, bounce = 8) =>
		Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness: bounce }).start();
	useEffect(() => {
		Animated.spring(indicator, {
			toValue: focused ? 1 : 0,
			useNativeDriver: true,
			speed: 30,
			bounciness: 8
		}).start();
		if (focused) {
			scale.setValue(0.88);
			springTo(1, 12);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [focused]);

	return (
		<Pressable
			onPress={onPress}
			onPressIn={() => springTo(0.9)}
			onPressOut={() => springTo(1)}
			style={styles.slot}
		>
			<Animated.View
				style={[
					styles.indicator,
					{
						backgroundColor: colors.accent,
						opacity: indicator,
						transform: [{ scaleX: indicator }]
					}
				]}
			/>
			<Animated.View style={[styles.item, { transform: [{ scale }] }]}>
				<Ionicons
					name={focused ? meta.active : meta.inactive}
					size={23}
					color={focused ? colors.accent : colors.textMuted}
				/>
				<Text
					style={[styles.label, focused && { color: colors.accent, fontFamily: fonts.sansBold }]}
				>
					{label}
				</Text>
			</Animated.View>
		</Pressable>
	);
}

/**
 * Geschlossene, ruhige Leiste: Karte mit runden oberen Ecken, fünf
 * gleich breite Knöpfe, keine Überlappungen — Trefffläche = Knopf.
 */
function TabBar({ state, navigation }: TabBarProps) {
	const styles = useThemedStyles(makeStyles);
	const insets = useSafeAreaInsets();
	return (
		<View style={[styles.bar, { paddingBottom: insets.bottom + 10 }]}>
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
			borderTopLeftRadius: 20,
			borderTopRightRadius: 20,
			paddingHorizontal: 8,
			elevation: 16,
			shadowColor: '#000',
			shadowOpacity: 0.15,
			shadowRadius: 14,
			shadowOffset: { width: 0, height: -3 }
		},
		slot: { flex: 1, alignItems: 'center' },
		indicator: {
			width: 22,
			height: 3,
			borderRadius: 1.5,
			marginBottom: 9
		},
		item: { alignItems: 'center', gap: 4 },
		label: {
			color: colors.fg + textAlpha.muted,
			fontSize: 10,
			lineHeight: 13,
			fontFamily: fonts.sansSemi
		}
	});
