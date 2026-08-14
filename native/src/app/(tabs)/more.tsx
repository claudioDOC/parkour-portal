import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import * as Updates from 'expo-updates';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../../lib/theme';
import { Card, TopBar, Screen, Avatar } from '../../lib/ui';
import { useData } from '../../lib/store';
import { getProfile } from '../../lib/api';
import { useAuth } from '../_layout';

const MENU = [
	{ route: '/trips', icon: 'airplane-outline', label: 'Trips', hint: 'Ausflüge & Abstimmungen' },
	{ route: '/stats', icon: 'stats-chart-outline', label: 'Statistik', hint: 'Anwesenheit & Solo' },
	{ route: '/profile/me', icon: 'person-outline', label: 'Profil & Mitglieder', hint: 'Dein Profil, alle Leute' },
	{ route: '/activity', icon: 'notifications-outline', label: 'Aktivität', hint: 'Was zuletzt passiert ist' }
] as const;

export default function More() {
	const { me, signOut } = useAuth();
	const router = useRouter();
	const profile = useData('profile-me', () => getProfile());

	const checkUpdate = async () => {
		try {
			const result = await Updates.checkForUpdateAsync();
			if (result.isAvailable) {
				await Updates.fetchUpdateAsync();
				await Updates.reloadAsync();
			} else {
				Alert.alert('Aktuell', 'Du hast bereits die neueste Version.');
			}
		} catch {
			Alert.alert('Offline', 'Update-Server gerade nicht erreichbar.');
		}
	};

	return (
		<Screen refreshing={profile.refreshing} onRefresh={profile.onRefresh}>
			<TopBar kicker="Alles Weitere" title="Mehr" />

			<Pressable onPress={() => router.push('/profile/me')}>
				{({ pressed }) => (
					<Card style={[styles.profileCard, pressed && { opacity: 0.85 }]}>
						<Avatar
							username={me?.username ?? '?'}
							avatar={profile.data?.profile.avatar}
							size={54}
						/>
						<View style={{ flex: 1 }}>
							<Text style={styles.profileName}>{me?.username}</Text>
							<Text style={styles.profileHint}>Profil ansehen</Text>
						</View>
						<Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
					</Card>
				)}
			</Pressable>

			<Card style={{ padding: 6 }}>
				{MENU.map((item, i) => (
					<Pressable key={item.route} onPress={() => router.push(item.route)}>
						{({ pressed }) => (
							<View
								style={[
									styles.menuRow,
									i < MENU.length - 1 && styles.menuDivider,
									pressed && { opacity: 0.7 }
								]}
							>
								<View style={styles.menuIcon}>
									<Ionicons name={item.icon as 'menu'} size={19} color={colors.accent} />
								</View>
								<View style={{ flex: 1 }}>
									<Text style={styles.menuLabel}>{item.label}</Text>
									<Text style={styles.menuHint}>{item.hint}</Text>
								</View>
								<Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
							</View>
						)}
					</Pressable>
				))}
			</Card>

			<Card style={{ padding: 6 }}>
				<Pressable onPress={checkUpdate}>
					{({ pressed }) => (
						<View style={[styles.menuRow, styles.menuDivider, pressed && { opacity: 0.7 }]}>
							<View style={styles.menuIcon}>
								<Ionicons name="refresh-outline" size={19} color={colors.accentBlue} />
							</View>
							<View style={{ flex: 1 }}>
								<Text style={styles.menuLabel}>Nach Update suchen</Text>
								<Text style={styles.menuHint}>
									Updates kommen sonst automatisch beim Start
								</Text>
							</View>
						</View>
					)}
				</Pressable>
				<Pressable
					onPress={() =>
						Alert.alert('Abmelden?', 'Du musst dich danach neu einloggen.', [
							{ text: 'Abbrechen', style: 'cancel' },
							{ text: 'Abmelden', style: 'destructive', onPress: signOut }
						])
					}
				>
					{({ pressed }) => (
						<View style={[styles.menuRow, pressed && { opacity: 0.7 }]}>
							<View style={styles.menuIcon}>
								<Ionicons name="log-out-outline" size={19} color={colors.danger} />
							</View>
							<Text style={[styles.menuLabel, { color: colors.danger }]}>Abmelden</Text>
						</View>
					)}
				</Pressable>
			</Card>

			<Text style={styles.footer}>
				Parkour Portal · matetraining.duckdns.org{'\n'}Web und App teilen denselben Stand.
			</Text>
		</Screen>
	);
}

const styles = StyleSheet.create({
	profileCard: { flexDirection: 'row', alignItems: 'center', gap: 14 },
	profileName: { color: colors.text, fontSize: 17, fontWeight: '800' },
	profileHint: { color: colors.textMuted, fontSize: 12.5, marginTop: 1 },
	menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
	menuDivider: { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
	menuIcon: {
		width: 36,
		height: 36,
		borderRadius: 12,
		backgroundColor: colors.bgSecondary,
		alignItems: 'center',
		justifyContent: 'center'
	},
	menuLabel: { color: colors.text, fontSize: 15, fontWeight: '700' },
	menuHint: { color: colors.textMuted, fontSize: 12, marginTop: 1 },
	footer: { color: colors.textMuted, fontSize: 11.5, textAlign: 'center', marginTop: 14, lineHeight: 17 }
});
