import { Tabs } from 'expo-router';
import { useRef } from 'react';
import {
	Animated,
	Pressable,
	View,
	type ColorValue,
	type GestureResponderEvent
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { fonts } from '../../lib/theme';
import { useTheme } from '../../lib/themeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Untere Navigation — identisch zur Website: Finder · Spots · Start
 * (mittig, erhöhter Kreis) · Stats · Mehr.
 */
/** App öffnet immer auf „Start", egal wo man zuletzt war. */
export const unstable_settings = { initialRouteName: 'index' };

/**
 * Federnder Tab-Knopf: drückt sich beim Antippen sichtbar ein und
 * schnappt zurück — plus Android-Ripple. Ersetzt den starren Standard.
 */
function SpringTabButton({
	children,
	onPress,
	onLongPress,
	accessibilityState,
	rippleColor
}: {
	children: React.ReactNode;
	onPress?: (e: GestureResponderEvent) => void;
	onLongPress?: (e: GestureResponderEvent) => void;
	accessibilityState?: { selected?: boolean };
	rippleColor: string;
}) {
	const scale = useRef(new Animated.Value(1)).current;
	const springTo = (v: number) =>
		Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 9 }).start();
	return (
		<Pressable
			onPress={onPress}
			onLongPress={onLongPress}
			onPressIn={() => springTo(0.86)}
			onPressOut={() => springTo(1)}
			accessibilityState={accessibilityState}
			android_ripple={{ color: rippleColor, borderless: true, radius: 46 }}
			style={{ flex: 1 }}
		>
			<Animated.View
				style={{ flex: 1, alignItems: 'center', justifyContent: 'center', transform: [{ scale }] }}
			>
				{children}
			</Animated.View>
		</Pressable>
	);
}

/** Icon in einer weichen Pille — die Pille erscheint nur beim aktiven Tab. */
function TabIcon({
	active,
	inactive,
	focused,
	color,
	pill
}: {
	active: keyof typeof Ionicons.glyphMap;
	inactive: keyof typeof Ionicons.glyphMap;
	focused: boolean;
	color: ColorValue;
	pill: string;
}) {
	return (
		<View
			style={{
				paddingHorizontal: 16,
				paddingVertical: 4,
				borderRadius: 999,
				backgroundColor: focused ? pill : 'transparent'
			}}
		>
			<Ionicons name={focused ? active : inactive} size={22} color={color} />
		</View>
	);
}

export default function TabsLayout() {
	const { colors } = useTheme();
	const insets = useSafeAreaInsets();
	return (
		<Tabs
			initialRouteName="index"
			screenOptions={{
				headerShown: false,
				tabBarButton: (props) => (
					<SpringTabButton
						onPress={props.onPress ?? undefined}
						onLongPress={props.onLongPress ?? undefined}
						accessibilityState={props.accessibilityState}
						rippleColor={colors.accent + '24'}
					>
						{props.children}
					</SpringTabButton>
				),
				tabBarStyle: {
					backgroundColor: colors.card,
					borderTopWidth: 0,
					borderTopLeftRadius: 24,
					borderTopRightRadius: 24,
					// Android-Navigationsleiste (Gesten/Buttons) nicht überlappen.
					height: 80 + insets.bottom,
					paddingBottom: insets.bottom + 12,
					paddingTop: 10,
					elevation: 20,
					shadowColor: '#000',
					shadowOpacity: 0.18,
					shadowRadius: 16,
					shadowOffset: { width: 0, height: -4 }
				},
				tabBarActiveTintColor: colors.accent,
				tabBarInactiveTintColor: colors.textMuted,
				tabBarLabelStyle: { fontSize: 11, lineHeight: 14, fontFamily: fonts.sansSemi, marginTop: 3 }
			}}
		>
			<Tabs.Screen
				name="finder"
				options={{
					title: 'Finder',
					tabBarIcon: ({ color, focused }) => (
						<TabIcon
							active="search"
							inactive="search-outline"
							focused={focused}
							color={color}
							pill={colors.accent + '1c'}
						/>
					)
				}}
			/>
			<Tabs.Screen
				name="spots"
				options={{
					title: 'Spots',
					tabBarIcon: ({ color, focused }) => (
						<TabIcon
							active="location"
							inactive="location-outline"
							focused={focused}
							color={color}
							pill={colors.accent + '1c'}
						/>
					)
				}}
			/>
			<Tabs.Screen
				name="index"
				options={{
					title: 'Start',
					// Erhöhter Kreis in der Mitte — wie auf der Website.
					tabBarIcon: ({ color, focused }) => (
						<View
							style={{
								width: 58,
								height: 58,
								borderRadius: 999,
								marginTop: -30,
								backgroundColor: focused ? colors.accent : colors.card,
								borderWidth: focused ? 0 : 1,
								borderColor: colors.border,
								alignItems: 'center',
								justifyContent: 'center',
								elevation: 10,
								shadowColor: focused ? colors.accent : '#000',
								shadowOpacity: 0.35,
								shadowRadius: 10,
								shadowOffset: { width: 0, height: 4 }
							}}
						>
							<Ionicons
								name={focused ? 'calendar' : 'calendar-outline'}
								size={24}
								color={focused ? colors.onAccent : color}
							/>
						</View>
					)
				}}
			/>
			<Tabs.Screen
				name="stats"
				options={{
					title: 'Stats',
					tabBarIcon: ({ color, focused }) => (
						<TabIcon
							active="stats-chart"
							inactive="stats-chart-outline"
							focused={focused}
							color={color}
							pill={colors.accent + '1c'}
						/>
					)
				}}
			/>
			<Tabs.Screen
				name="more"
				options={{
					title: 'Mehr',
					tabBarIcon: ({ color, focused }) => (
						<TabIcon
							active="menu"
							inactive="menu"
							focused={focused}
							color={color}
							pill={colors.accent + '1c'}
						/>
					)
				}}
			/>
		</Tabs>
	);
}
