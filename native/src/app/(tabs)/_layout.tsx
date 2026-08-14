import { Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, fonts } from '../../lib/theme';

const TABS = [
	{ name: 'index', title: 'Heute', icon: 'home' },
	{ name: 'training', title: 'Training', icon: 'calendar' },
	{ name: 'spots', title: 'Spots', icon: 'location' },
	{ name: 'challenges', title: 'Challenges', icon: 'trophy' },
	{ name: 'more', title: 'Mehr', icon: 'menu' }
] as const;

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
				tabBarLabelStyle: { fontSize: 10.5, fontFamily: fonts.sansSemi }
			}}
		>
			{TABS.map((tab) => (
				<Tabs.Screen
					key={tab.name}
					name={tab.name}
					options={{
						title: tab.title,
						tabBarIcon: ({ color, focused }) => (
							<Ionicons
								name={(focused ? tab.icon : `${tab.icon}-outline`) as 'home'}
								size={22}
								color={color}
							/>
						)
					}}
				/>
			))}
		</Tabs>
	);
}
