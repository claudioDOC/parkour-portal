import { Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../../lib/theme';

export default function TabsLayout() {
	return (
		<Tabs
			screenOptions={{
				headerShown: false,
				tabBarStyle: {
					backgroundColor: colors.bgSecondary,
					borderTopColor: colors.border,
					borderTopWidth: StyleSheet.hairlineWidth,
					height: 64,
					paddingBottom: 10,
					paddingTop: 8
				},
				tabBarActiveTintColor: colors.accent,
				tabBarInactiveTintColor: colors.textMuted,
				tabBarLabelStyle: { fontSize: 11, fontWeight: '700' }
			}}
		>
			<Tabs.Screen
				name="index"
				options={{
					title: 'Heute',
					tabBarIcon: ({ color, focused }) => (
						<Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={color} />
					)
				}}
			/>
			<Tabs.Screen
				name="training"
				options={{
					title: 'Training',
					tabBarIcon: ({ color, focused }) => (
						<Ionicons name={focused ? 'calendar' : 'calendar-outline'} size={22} color={color} />
					)
				}}
			/>
		</Tabs>
	);
}
