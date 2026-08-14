import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { colors } from '../../lib/theme';

import type { ColorValue } from 'react-native';

function Icon({ glyph, color }: { glyph: string; color: ColorValue }) {
	return <Text style={{ fontSize: 20, color }}>{glyph}</Text>;
}

export default function TabsLayout() {
	return (
		<Tabs
			screenOptions={{
				headerShown: false,
				tabBarStyle: {
					backgroundColor: colors.bgSecondary,
					borderTopColor: colors.border,
					height: 62,
					paddingBottom: 8,
					paddingTop: 6
				},
				tabBarActiveTintColor: colors.accent,
				tabBarInactiveTintColor: colors.textMuted,
				tabBarLabelStyle: { fontSize: 11, fontWeight: '600' }
			}}
		>
			<Tabs.Screen
				name="index"
				options={{
					title: 'Heute',
					tabBarIcon: ({ color }) => <Icon glyph="⌂" color={color} />
				}}
			/>
			<Tabs.Screen
				name="training"
				options={{
					title: 'Training',
					tabBarIcon: ({ color }) => <Icon glyph="◎" color={color} />
				}}
			/>
		</Tabs>
	);
}
