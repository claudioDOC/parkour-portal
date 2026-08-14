import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import * as Updates from 'expo-updates';
import Ionicons from '@expo/vector-icons/Ionicons';
import { fonts, type ThemeColors } from '../../lib/theme';
import { textAlpha } from '../../lib/tokens';
import { useTheme, useThemedStyles } from '../../lib/themeContext';
import { Card, TopBar, Screen, Avatar, Sheet, Input, Button } from '../../lib/ui';
import { THEMES, THEME_OPTIONS } from '../../lib/theme';
import { useData } from '../../lib/store';
import { getProfile, saveUiTheme, adminBroadcast, BASE_URL } from '../../lib/api';
import { useAuth } from '../_layout';

const MENU = [
	{ route: '/challenges', icon: 'trophy-outline', label: 'Challenges', hint: 'Arena, Leaderboard, offene Quests' },
	{ route: '/trips', icon: 'airplane-outline', label: 'Trips', hint: 'Ausflüge & Abstimmungen' },
	{ route: '/profile/me', icon: 'person-outline', label: 'Profil & Mitglieder', hint: 'Dein Profil, alle Leute' },
	{ route: '/activity', icon: 'notifications-outline', label: 'Aktivität', hint: 'Was zuletzt passiert ist' }
] as const;

export default function More() {
	const { colors, themeId, setThemeId } = useTheme();
	const styles = useThemedStyles(makeStyles);
	const { me, signOut } = useAuth();
	const [themeOpen, setThemeOpen] = useState(false);
	const [pushOpen, setPushOpen] = useState(false);
	const [pushForm, setPushForm] = useState({ title: '', body: '' });

	const pickTheme = async (id: (typeof THEME_OPTIONS)[number]['id']) => {
		setThemeId(id);
		setThemeOpen(false);
		try {
			await saveUiTheme(id);
		} catch {
			Alert.alert('Hinweis', 'Theme lokal aktiv, aber Speichern im Profil schlug fehl.');
		}
	};

	const sendBroadcast = async () => {
		if (!pushForm.title.trim() || !pushForm.body.trim()) {
			Alert.alert('Unvollständig', 'Titel und Text sind Pflicht.');
			return;
		}
		setPushOpen(false);
		try {
			const res = await adminBroadcast(pushForm.title.trim(), pushForm.body.trim());
			setPushForm({ title: '', body: '' });
			Alert.alert('Verschickt', `Push an ${res.sent ?? '?'} Geräte gesendet.`);
		} catch (e) {
			Alert.alert('Fehler', e instanceof Error ? e.message : 'Senden fehlgeschlagen');
		}
	};
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

			<Card style={{ padding: 8 }}>
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

			<Card style={{ padding: 8 }}>
				<Pressable
					onPress={() =>
						WebBrowser.openBrowserAsync(`${BASE_URL}/map`, {
							toolbarColor: colors.bgSecondary,
							controlsColor: colors.accent,
							// Bleibt im App-Fenster: Chrome Custom Tab statt externem Browser.
							showTitle: true,
							enableBarCollapsing: true
						})
					}
				>
					{({ pressed }) => (
						<View style={[styles.menuRow, styles.menuDivider, pressed && { opacity: 0.7 }]}>
							<View style={styles.menuIcon}>
								<Ionicons name="map-outline" size={19} color={colors.accent} />
							</View>
							<View style={{ flex: 1 }}>
								<Text style={styles.menuLabel}>Karte</Text>
								<Text style={styles.menuHint}>Alle Spots auf der Portal-Karte (Browser)</Text>
							</View>
							<Ionicons name="open-outline" size={16} color={colors.textMuted} />
						</View>
					)}
				</Pressable>
				<Pressable onPress={() => setThemeOpen(true)}>
					{({ pressed }) => (
						<View style={[styles.menuRow, styles.menuDivider, pressed && { opacity: 0.7 }]}>
							<View style={styles.menuIcon}>
								<Ionicons name="color-palette-outline" size={19} color={colors.accent} />
							</View>
							<View style={{ flex: 1 }}>
								<Text style={styles.menuLabel}>Design</Text>
								<Text style={styles.menuHint}>
									Aktiv: {THEME_OPTIONS.find((t) => t.id === themeId)?.label}
								</Text>
							</View>
							<Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
						</View>
					)}
				</Pressable>
				{me?.role === 'admin' ? (
					<Pressable onPress={() => setPushOpen(true)}>
						{({ pressed }) => (
							<View style={[styles.menuRow, styles.menuDivider, pressed && { opacity: 0.7 }]}>
								<View style={styles.menuIcon}>
									<Ionicons name="megaphone-outline" size={19} color={colors.warning} />
								</View>
								<View style={{ flex: 1 }}>
									<Text style={styles.menuLabel}>Push an alle</Text>
									<Text style={styles.menuHint}>Admin: Nachricht an alle Geräte</Text>
								</View>
							</View>
						)}
					</Pressable>
				) : null}
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

			{/* Theme-Wahl — wie Einstellungen → Design im Web */}
			<Sheet visible={themeOpen} onClose={() => setThemeOpen(false)} title="Design wählen">
				{THEME_OPTIONS.map((opt) => (
					<Pressable
						key={opt.id}
						onPress={() => pickTheme(opt.id)}
						style={({ pressed }) => [styles.themeRow, pressed && { opacity: 0.7 }]}
					>
						<View style={[styles.swatch, { backgroundColor: THEMES[opt.id].bg }]}>
							<View style={[styles.swatchDot, { backgroundColor: THEMES[opt.id].accent }]} />
							<View style={[styles.swatchDot, { backgroundColor: THEMES[opt.id].accentHot }]} />
						</View>
						<View style={{ flex: 1 }}>
							<Text style={styles.menuLabel}>{opt.label}</Text>
							<Text style={styles.menuHint}>{opt.hint}</Text>
						</View>
						{themeId === opt.id ? (
							<Ionicons name="checkmark-circle" size={20} color={colors.accent} />
						) : null}
					</Pressable>
				))}
			</Sheet>

			{/* Admin: Broadcast-Push */}
			<Sheet visible={pushOpen} onClose={() => setPushOpen(false)} title="Push an alle">
				<Input
					placeholder="Titel"
					value={pushForm.title}
					onChangeText={(v) => setPushForm({ ...pushForm, title: v })}
				/>
				<Input
					placeholder="Nachricht"
					multiline
					value={pushForm.body}
					onChangeText={(v) => setPushForm({ ...pushForm, body: v })}
				/>
				<View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
					<Button label="Abbrechen" kind="ghost" onPress={() => setPushOpen(false)} />
					<Button label="Senden" onPress={sendBroadcast} />
				</View>
			</Sheet>
		</Screen>
	);
}

const makeStyles = (colors: ThemeColors) =>
	StyleSheet.create({
	profileCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
	profileName: { color: colors.fg + textAlpha.primary, fontSize: 16, lineHeight: 22, fontFamily: fonts.sansBold },
	profileHint: { color: colors.fg + textAlpha.muted, fontSize: 12, lineHeight: 16, marginTop: 0 },
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
	menuLabel: { color: colors.fg + textAlpha.primary, fontSize: 14, lineHeight: 20, fontFamily: fonts.sansSemi },
	menuHint: { color: colors.fg + textAlpha.muted, fontSize: 12, lineHeight: 16, marginTop: 0 },
	footer: { color: colors.fg + textAlpha.muted, fontSize: 12, textAlign: 'center', marginTop: 12, lineHeight: 17 },
	themeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
	swatch: {
		width: 46,
		height: 32,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: colors.border,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 4
	},
	swatchDot: { width: 10, height: 10, borderRadius: 999 }
});
