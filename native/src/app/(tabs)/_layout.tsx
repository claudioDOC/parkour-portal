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
 * Normaler Tab in der Pille: Icon, darunter ein kleines Label. Aktiv
 * rutscht das Icon in einen gefüllten Akzent-Kreis. Antippen federt.
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
	const springTo = (v: number) =>
		Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 10 }).start();
	useEffect(() => {
		if (focused) {
			scale.setValue(0.8);
			springTo(1);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [focused]);
	return (
		<Pressable
			onPress={onPress}
			onPressIn={() => springTo(0.85)}
			onPressOut={() => springTo(1)}
			android_ripple={{ color: colors.accent + '22', borderless: true, radius: 40 }}
			style={styles.slot}
		>
			<Animated.View style={[styles.item, { transform: [{ scale }] }]}>
				<View style={[styles.iconDot, focused && { backgroundColor: colors.accent }]}>
					<Ionicons
						name={focused ? meta.active : meta.inactive}
						size={20}
						color={focused ? colors.onAccent : colors.textMuted}
					/>
				</View>
				<Text style={[styles.label, focused && { color: colors.accent }]}>{label}</Text>
			</Animated.View>
		</Pressable>
	);
}

/**
 * Frei schwebende Pillen-Leiste: löst sich mit Abstand vom Rand, volle
 * Rundung, weicher Schatten. Der Start-Kreis thront mittig darüber —
 * absolut positioniert, damit Android nichts wegschneiden kann.
 */
function TabBar({ state, navigation }: TabBarProps) {
	const { colors } = useTheme();
	const styles = useThemedStyles(makeStyles);
	const insets = useSafeAreaInsets();
	const startScale = useRef(new Animated.Value(1)).current;
	const startSpring = (v: number, bounce = 10) =>
		Animated.spring(startScale, {
			toValue: v,
			useNativeDriver: true,
			speed: 40,
			bounciness: bounce
		}).start();

	const startRoute = state.routes.find((r) => r.name === 'index');
	const startFocused = startRoute ? state.index === state.routes.indexOf(startRoute) : false;
	useEffect(() => {
		if (startFocused) {
			startScale.setValue(0.82);
			startSpring(1, 14);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [startFocused]);

	const pressRoute = (route: { key: string; name: string }, focused: boolean) => {
		const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
		if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
	};

	return (
		<View style={[styles.wrap, { paddingBottom: insets.bottom + 10 }]}>
			<View style={styles.bar}>
				{state.routes.map((route, i) => {
					const meta = TAB_META[route.name];
					if (!meta) return null;
					const focused = state.index === i;
					if (route.name === 'index') {
						// Platzhalter — der Kreis selbst schwebt darüber.
						return <View key={route.key} style={styles.centerGap} />;
					}
					return (
						<TabItem
							key={route.key}
							label={meta.label}
							meta={meta}
							focused={focused}
							onPress={() => pressRoute(route, focused)}
						/>
					);
				})}
			</View>

			{startRoute ? (
				<Pressable
					onPress={() => pressRoute(startRoute, startFocused)}
					onPressIn={() => startSpring(0.88)}
					onPressOut={() => startSpring(1)}
					style={styles.centerWrap}
				>
					<Animated.View
						style={[
							styles.center,
							{ transform: [{ scale: startScale }] },
							startFocused
								? { backgroundColor: colors.accent, shadowColor: colors.accent }
								: {
										backgroundColor: colors.card,
										borderWidth: 1,
										borderColor: colors.border
									}
						]}
					>
						<Ionicons
							name={startFocused ? 'calendar' : 'calendar-outline'}
							size={25}
							color={startFocused ? colors.onAccent : colors.textMuted}
						/>
					</Animated.View>
				</Pressable>
			) : null}
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
		wrap: {
			backgroundColor: 'transparent',
			paddingHorizontal: 14,
			paddingTop: 30
		},
		bar: {
			flexDirection: 'row',
			alignItems: 'center',
			backgroundColor: colors.card,
			borderRadius: 999,
			height: 66,
			paddingHorizontal: 6,
			elevation: 18,
			shadowColor: '#000',
			shadowOpacity: 0.22,
			shadowRadius: 18,
			shadowOffset: { width: 0, height: 6 }
		},
		slot: { flex: 1, alignItems: 'center', justifyContent: 'center', height: '100%' },
		item: { alignItems: 'center', gap: 2 },
		iconDot: {
			width: 34,
			height: 34,
			borderRadius: 17,
			alignItems: 'center',
			justifyContent: 'center',
			backgroundColor: 'transparent'
		},
		label: {
			color: colors.fg + textAlpha.muted,
			fontSize: 10,
			lineHeight: 13,
			fontFamily: fonts.sansSemi
		},
		centerGap: { flex: 1 },
		centerWrap: {
			position: 'absolute',
			left: 0,
			right: 0,
			top: 0,
			alignItems: 'center'
		},
		center: {
			width: 60,
			height: 60,
			borderRadius: 999,
			alignItems: 'center',
			justifyContent: 'center',
			elevation: 14,
			shadowColor: '#000',
			shadowOpacity: 0.3,
			shadowRadius: 10,
			shadowOffset: { width: 0, height: 4 }
		}
	});
