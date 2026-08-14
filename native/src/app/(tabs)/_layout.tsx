import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { fonts } from '../../lib/theme';
import { useTheme } from '../../lib/themeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Untere Navigation — identisch zur Website: Finder · Spots · Training
 * (mittig, erhöhter Kreis) · Stats · Mehr.
 */
export default function TabsLayout() {
	const { colors } = useTheme();
	const insets = useSafeAreaInsets();
	return (
		<Tabs
			screenOptions={{
				headerShown: false,
				tabBarStyle: {
					backgroundColor: colors.bgSecondary,
					borderTopColor: colors.border,
					borderTopWidth: StyleSheet.hairlineWidth,
					// Android-Navigationsleiste (Gesten/Buttons) nicht überlappen.
					height: 80 + insets.bottom,
					paddingBottom: insets.bottom + 14,
					paddingTop: 8
				},
				tabBarActiveTintColor: colors.accent,
				tabBarInactiveTintColor: colors.textMuted,
				tabBarLabelStyle: { fontSize: 12, lineHeight: 16, fontFamily: fonts.sansSemi, marginTop: 2 }
			}}
		>
			<Tabs.Screen
				name="finder"
				options={{
					title: 'Finder',
					tabBarIcon: ({ color, focused }) => (
						<Ionicons name={focused ? 'search' : 'search-outline'} size={22} color={color} />
					)
				}}
			/>
			<Tabs.Screen
				name="spots"
				options={{
					title: 'Spots',
					tabBarIcon: ({ color, focused }) => (
						<Ionicons name={focused ? 'location' : 'location-outline'} size={22} color={color} />
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
								width: 54,
								height: 54,
								borderRadius: 999,
								marginTop: -26,
								backgroundColor: colors.card,
								borderWidth: 1,
								borderColor: focused ? colors.accent + '66' : colors.border,
								alignItems: 'center',
								justifyContent: 'center',
								elevation: 8,
								shadowColor: '#000'
							}}
						>
							<Ionicons
								name={focused ? 'calendar' : 'calendar-outline'}
								size={24}
								color={focused ? colors.accent : color}
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
						<Ionicons
							name={focused ? 'stats-chart' : 'stats-chart-outline'}
							size={22}
							color={color}
						/>
					)
				}}
			/>
			<Tabs.Screen
				name="more"
				options={{
					title: 'Mehr',
					tabBarIcon: ({ color }) => <Ionicons name="menu" size={24} color={color} />
				}}
			/>
		</Tabs>
	);
}
