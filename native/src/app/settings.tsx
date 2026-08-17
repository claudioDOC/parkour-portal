import { useState } from 'react';
import { View, Text, StyleSheet, Alert, Pressable, Share } from 'react-native';
import { getImagePicker } from '../lib/nativeModules';
import Ionicons from '@expo/vector-icons/Ionicons';
import { fonts, THEMES, THEME_OPTIONS, type ThemeColors } from '../lib/theme';
import { textAlpha } from '../lib/tokens';
import { useTheme, useThemedStyles } from '../lib/themeContext';
import { getStartTab, setStartTab, setFontScale, setMarkColor, type StartTab } from '../lib/prefs';
import { Card, TopBar, Screen, Button, Input, SectionTitle, Avatar, Sheet } from '../lib/ui';
import { useData } from '../lib/store';
import {
	getProfile,
	uploadAvatar,
	removeAvatar,
	changePassword,
	saveUiTheme,
	getNtfyInfo,
	BASE_URL
} from '../lib/api';
import { Linking } from 'react-native';
import { useAuth } from './_layout';

/**
 * Icon auf dem Startbildschirm umschalten (ab APK 1.5). Auf älteren
 * Installationen fehlt das native Modul — dann bleibt der Abschnitt aus.
 */
function getIconSwitcher() {
	try {
		return require('expo-dynamic-app-icon') as {
			setAppIcon: (name: string | null) => string | false;
			getAppIcon: () => string;
		};
	} catch {
		return null;
	}
}

/** Farben, die es auch als Startbildschirm-Icon gibt. */
const LAUNCHER_ICONS: { label: string; name: string | null; color: string }[] = [
	{ label: 'Standard', name: null, color: '#fafafa' },
	{ label: 'Terracotta', name: 'terracotta', color: '#c05f21' },
	{ label: 'Neon', name: 'neon', color: '#e8ff47' },
	{ label: 'Türkis', name: 'tuerkis', color: '#2dd4bf' },
	{ label: 'Violett', name: 'violett', color: '#a78bfa' },
	{ label: 'Rot', name: 'rot', color: '#ef4444' },
	{ label: 'Blau', name: 'blau', color: '#38bdf8' }
];

/** Auswahl für die Logo-Farbe — bewusst wenige, klare Töne. */
const MARK_COLORS: { label: string; value: string | null }[] = [
	{ label: 'Theme', value: null },
	{ label: 'Terracotta', value: '#c05f21' },
	{ label: 'Neon', value: '#e8ff47' },
	{ label: 'Türkis', value: '#2dd4bf' },
	{ label: 'Violett', value: '#a78bfa' },
	{ label: 'Rot', value: '#ef4444' },
	{ label: 'Blau', value: '#38bdf8' },
	{ label: 'Weiss', value: '#fafafa' },
	{ label: 'Schwarz', value: '#111214' }
];

/** Entspricht der Einstellungen-Seite des Portals. */
export default function Settings() {
	const { colors, themeId, setThemeId } = useTheme();
	const styles = useThemedStyles(makeStyles);
	const { me, signOut } = useAuth();
	const profile = useData('profile-me', () => getProfile());

	const [themeOpen, setThemeOpen] = useState(false);
	const [startTab, setStartTabState] = useState<StartTab>(getStartTab());
	const { fontScale, setFontScaleState, markColor, setMarkColorState } = useTheme();
	const iconSwitcher = getIconSwitcher();
	const [launcherIcon, setLauncherIcon] = useState<string | null>(() => {
		try {
			const current = iconSwitcher?.getAppIcon();
			return current && current !== 'DEFAULT' ? current : null;
		} catch {
			return null;
		}
	});
	const [pwOpen, setPwOpen] = useState(false);
	const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
	const [busy, setBusy] = useState(false);

	const pickAvatar = async () => {
		const ImagePicker = getImagePicker();
		if (!ImagePicker) {
			Alert.alert('Neue App-Version nötig', 'Bilder hochladen geht ab App-Version 1.1.0.');
			return;
		}
		const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
		if (!perm.granted) {
			Alert.alert('Kein Zugriff', 'Bitte den Galerie-Zugriff erlauben.');
			return;
		}
		const picked = await ImagePicker.launchImageLibraryAsync({
			mediaTypes: ['images'],
			allowsEditing: true,
			aspect: [1, 1],
			quality: 0.9
		});
		if (picked.canceled || !picked.assets?.[0]) return;
		setBusy(true);
		try {
			const a = picked.assets[0];
			await uploadAvatar(a.uri, a.fileName ?? 'avatar.jpg', a.mimeType ?? 'image/jpeg');
			await profile.refresh();
		} catch (e) {
			Alert.alert('Fehler', e instanceof Error ? e.message : 'Upload fehlgeschlagen');
		} finally {
			setBusy(false);
		}
	};

	const dropAvatar = async () => {
		try {
			await removeAvatar();
			await profile.refresh();
		} catch (e) {
			Alert.alert('Fehler', e instanceof Error ? e.message : 'Entfernen fehlgeschlagen');
		}
	};

	const pickTheme = async (id: (typeof THEME_OPTIONS)[number]['id']) => {
		setThemeId(id);
		setThemeOpen(false);
		try {
			await saveUiTheme(id);
		} catch {
			Alert.alert('Hinweis', 'Theme lokal aktiv, Speichern im Profil schlug fehl.');
		}
	};

	const submitPassword = async () => {
		if (pw.next.length < 10) {
			Alert.alert('Zu kurz', 'Das neue Passwort braucht mindestens 10 Zeichen.');
			return;
		}
		if (pw.next !== pw.confirm) {
			Alert.alert('Ungleich', 'Die beiden neuen Passwörter stimmen nicht überein.');
			return;
		}
		try {
			await changePassword(pw.current, pw.next);
			setPwOpen(false);
			setPw({ current: '', next: '', confirm: '' });
			Alert.alert('Geändert', 'Du wirst auf allen Geräten neu angemeldet.', [
				{ text: 'OK', onPress: signOut }
			]);
		} catch (e) {
			Alert.alert('Fehler', e instanceof Error ? e.message : 'Ändern fehlgeschlagen');
		}
	};

	return (
		<Screen refreshing={profile.refreshing} onRefresh={profile.onRefresh}>
			<TopBar back kicker="Dein Konto" title="Einstellungen" />

			<SectionTitle>Profilbild</SectionTitle>
			<Card style={styles.avatarCard}>
				<Avatar
					username={me?.username ?? '?'}
					avatar={profile.data?.profile.avatar}
					size={72}
				/>
				<View style={{ flex: 1, gap: 8 }}>
					<Text style={styles.name}>{me?.username}</Text>
					<View style={styles.row}>
						<Button
							label={busy ? 'Lädt …' : 'Bild wählen'}
							kind="ghost"
							small
							onPress={pickAvatar}
						/>
						{profile.data?.profile.avatar ? (
							<Button label="Entfernen" kind="danger" small onPress={dropAvatar} />
						) : null}
					</View>
				</View>
			</Card>

			<SectionTitle>Darstellung</SectionTitle>
			<Card style={{ padding: 6 }}>
				<Row
					icon="color-palette-outline"
					label="Farbschema"
					hint={THEME_OPTIONS.find((t) => t.id === themeId)?.label}
					onPress={() => setThemeOpen(true)}
				/>
			</Card>

			<SectionTitle>Sicherheit</SectionTitle>
			<Card style={{ padding: 6 }}>
				<Row
					icon="key-outline"
					label="Passwort ändern"
					hint="Meldet dich auf allen Geräten neu an"
					onPress={() => setPwOpen(true)}
				/>
			</Card>

			<SectionTitle>App</SectionTitle>
			<Card style={{ gap: 10 }}>
				<Text style={styles.prefLabel}>Startseite beim Öffnen</Text>
				<View style={styles.prefRow}>
					{(
						[
							{ key: 'index', label: 'Start' },
							{ key: 'finder', label: 'Finder' },
							{ key: 'spots', label: 'Spots' },
							{ key: 'challenges', label: 'Arena' },
							{ key: 'more', label: 'Mehr' }
						] as const
					).map((t) => (
						<Pressable
							key={t.key}
							onPress={async () => {
								await setStartTab(t.key);
								setStartTabState(t.key);
							}}
							style={({ pressed }) => [
								styles.prefChip,
								startTab === t.key && { backgroundColor: colors.accent, borderColor: colors.accent },
								pressed && { opacity: 0.8 }
							]}
						>
							<Text style={[styles.prefChipText, startTab === t.key && { color: colors.onAccent }]}>
								{t.label}
							</Text>
						</Pressable>
					))}
				</View>
				<Text style={styles.prefLabel}>Schriftgrösse</Text>
				<View style={styles.prefRow}>
					{(
						[
							{ value: 1, label: 'Normal' },
							{ value: 1.1, label: 'Gross' },
							{ value: 1.2, label: 'Sehr gross' }
						] as const
					).map((f) => (
						<Pressable
							key={f.value}
							onPress={async () => {
								await setFontScale(f.value);
								setFontScaleState(f.value);
							}}
							style={({ pressed }) => [
								styles.prefChip,
								fontScale === f.value && {
									backgroundColor: colors.accent,
									borderColor: colors.accent
								},
								pressed && { opacity: 0.8 }
							]}
						>
							<Text
								style={[styles.prefChipText, fontScale === f.value && { color: colors.onAccent }]}
							>
								{f.label}
							</Text>
						</Pressable>
					))}
				</View>

				<Text style={styles.prefLabel}>Logo-Farbe</Text>
				<Text style={styles.ntfyHint}>
					Gilt nur fürs Logo im Kopf — unabhängig vom Farbschema.
				</Text>
				<View style={styles.prefRow}>
					{MARK_COLORS.map((mc) => {
						const active = markColor === mc.value || (mc.value === null && markColor === null);
						return (
							<Pressable
								key={mc.label}
								onPress={async () => {
									await setMarkColor(mc.value);
									setMarkColorState(mc.value);
								}}
								style={[
									styles.colorChip,
									active && { borderColor: colors.accent, borderWidth: 2 }
								]}
							>
								{mc.value === null ? (
									<Ionicons name="color-palette-outline" size={18} color={colors.text} />
								) : (
									<View style={[styles.colorDot, { backgroundColor: mc.value }]} />
								)}
								<Text style={styles.prefChipText}>{mc.label}</Text>
							</Pressable>
						);
					})}
				</View>
			</Card>

			{iconSwitcher ? (
				<>
					<SectionTitle>Startbildschirm-Icon</SectionTitle>
					<Card style={{ gap: 10 }}>
						<Text style={styles.ntfyHint}>
							Farbe des App-Symbols auf dem Startbildschirm. Android tauscht es
							kurz aus — es kann ein paar Sekunden dauern, bis der Launcher das
							neue Symbol zeigt.
						</Text>
						<View style={styles.prefRow}>
							{LAUNCHER_ICONS.map((ic) => {
								const active = launcherIcon === ic.name;
								return (
									<Pressable
										key={ic.label}
										onPress={() => {
											try {
												const res = iconSwitcher.setAppIcon(ic.name);
												if (res === false) {
													Alert.alert('Nicht möglich', 'Das Icon liess sich nicht wechseln.');
													return;
												}
												setLauncherIcon(ic.name);
											} catch (e) {
												Alert.alert(
													'Neue App-Version nötig',
													'Das Umschalten gibt es ab App-Version 1.5.'
												);
											}
										}}
										style={[
											styles.colorChip,
											active && { borderColor: colors.accent, borderWidth: 2 }
										]}
									>
										<View style={[styles.colorDot, { backgroundColor: ic.color }]} />
										<Text style={styles.prefChipText}>{ic.label}</Text>
									</Pressable>
								);
							})}
						</View>
					</Card>
				</>
			) : null}

			<SectionTitle>Benachrichtigungen</SectionTitle>
			<Card style={{ gap: 10 }}>
				<Text style={styles.prefLabel}>Push ohne Google — über die ntfy-App</Text>
				<Text style={styles.ntfyHint}>
					Einmal einrichten, dann kommen Training-Erinnerungen, Absagen und
					Neuigkeiten auch bei geschlossener App an: 1. ntfy installieren,
					2. deinen Kanal abonnieren.
				</Text>
				<View style={styles.prefRow}>
					<Button
						label="1 · ntfy-App holen"
						kind="ghost"
						small
						onPress={() =>
							Linking.openURL(
								'https://play.google.com/store/apps/details?id=io.heckel.ntfy'
							).catch(() => {})
						}
					/>
					<Button
						label="2 · Meinen Kanal abonnieren"
						small
						onPress={async () => {
							try {
								const info = await getNtfyInfo();
								// ntfy-Deeplink; falls die App fehlt, öffnet der Browser die Kanalseite.
								await Linking.openURL(`ntfy://${info.base.replace(/^https?:\/\//, '')}/${info.topic}`).catch(
									() => Linking.openURL(info.url)
								);
							} catch (e) {
								Alert.alert('Fehler', e instanceof Error ? e.message : 'Kanal nicht abrufbar');
							}
						}}
					/>
					<Button
						label="Kanal teilen/kopieren"
						kind="ghost"
						small
						onPress={async () => {
							try {
								const info = await getNtfyInfo();
								Share.share({ message: info.url }).catch(() => {});
							} catch (e) {
								Alert.alert('Fehler', e instanceof Error ? e.message : 'Kanal nicht abrufbar');
							}
						}}
					/>
				</View>
				<Text style={styles.ntfyHint}>
					Der Kanalname ist dein privates Geheimnis — nicht weitergeben, ausser
					an dein Zweitgerät.
				</Text>
			</Card>

			<SectionTitle>Kalender</SectionTitle>
			<Card style={{ padding: 6 }}>
				<Row
					icon="calendar-outline"
					label="Kalender abonnieren"
					hint="Trainings und Trips im Handy-Kalender"
					onPress={() =>
						Share.share({
							message: `${BASE_URL || 'https://matetraining.duckdns.org'}/calendar.ics`
						}).catch(() => {})
					}
				/>
			</Card>

			<Sheet visible={themeOpen} onClose={() => setThemeOpen(false)} title="Farbschema">
				{THEME_OPTIONS.map((opt) => (
					<Pressable
						key={opt.id}
						onPress={() => pickTheme(opt.id)}
						style={({ pressed }) => [styles.themeRow, pressed && { opacity: 0.7 }]}
					>
						<View style={[styles.swatch, { backgroundColor: THEMES[opt.id].bg }]}>
							<View style={[styles.dot, { backgroundColor: THEMES[opt.id].accent }]} />
							<View style={[styles.dot, { backgroundColor: THEMES[opt.id].accentHot }]} />
						</View>
						<View style={{ flex: 1 }}>
							<Text style={styles.rowLabel}>{opt.label}</Text>
							<Text style={styles.rowHint}>{opt.hint}</Text>
						</View>
						{themeId === opt.id ? (
							<Ionicons name="checkmark-circle" size={20} color={colors.accent} />
						) : null}
					</Pressable>
				))}
			</Sheet>

			<Sheet visible={pwOpen} onClose={() => setPwOpen(false)} title="Passwort ändern">
				<Input
					placeholder="Aktuelles Passwort"
					secureTextEntry
					value={pw.current}
					onChangeText={(v) => setPw({ ...pw, current: v })}
				/>
				<Input
					placeholder="Neues Passwort (mind. 10 Zeichen)"
					secureTextEntry
					value={pw.next}
					onChangeText={(v) => setPw({ ...pw, next: v })}
				/>
				<Input
					placeholder="Neues Passwort wiederholen"
					secureTextEntry
					value={pw.confirm}
					onChangeText={(v) => setPw({ ...pw, confirm: v })}
				/>
				<View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
					<Button label="Abbrechen" kind="ghost" onPress={() => setPwOpen(false)} />
					<Button label="Ändern" onPress={submitPassword} />
				</View>
			</Sheet>
		</Screen>
	);
}

function Row({
	icon,
	label,
	hint,
	onPress
}: {
	icon: string;
	label: string;
	hint?: string;
	onPress: () => void;
}) {
	const { colors } = useTheme();
	const styles = useThemedStyles(makeStyles);
	return (
		<Pressable onPress={onPress} style={({ pressed }) => [styles.row2, pressed && { opacity: 0.7 }]}>
			<View style={styles.rowIcon}>
				<Ionicons name={icon as 'menu'} size={19} color={colors.accent} />
			</View>
			<View style={{ flex: 1 }}>
				<Text style={styles.rowLabel}>{label}</Text>
				{hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
			</View>
			<Ionicons name="chevron-forward" size={17} color={colors.fg + textAlpha.muted} />
		</Pressable>
	);
}

const makeStyles = (colors: ThemeColors) =>
	StyleSheet.create({
		prefLabel: {
			color: colors.fg + textAlpha.muted,
			fontSize: 12,
			lineHeight: 16,
			fontFamily: fonts.sansBold,
			letterSpacing: 1
		},
		prefRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
		colorChip: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: 7,
			borderRadius: 16,
			borderWidth: 1,
			borderColor: colors.border,
			backgroundColor: colors.hover,
			paddingHorizontal: 12,
			paddingVertical: 7
		},
		colorDot: { width: 16, height: 16, borderRadius: 8 },
		ntfyHint: {
			color: colors.fg + textAlpha.secondary,
			fontSize: 12,
			lineHeight: 17,
			fontFamily: fonts.sans
		},
		prefChip: {
			borderRadius: 16,
			borderWidth: 1,
			borderColor: colors.border,
			backgroundColor: colors.hover,
			paddingHorizontal: 13,
			paddingVertical: 7
		},
		prefChipText: {
			color: colors.fg + textAlpha.primary,
			fontSize: 13,
			lineHeight: 18,
			fontFamily: fonts.sansMedium
		},
		avatarCard: { flexDirection: 'row', alignItems: 'center', gap: 16 },
		name: {
			color: colors.fg + textAlpha.primary,
			fontSize: 16,
			lineHeight: 22,
			fontFamily: fonts.sansBold
		},
		row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
		row2: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
		rowIcon: {
			width: 36,
			height: 36,
			borderRadius: 12,
			backgroundColor: colors.hover,
			alignItems: 'center',
			justifyContent: 'center'
		},
		rowLabel: {
			color: colors.fg + textAlpha.primary,
			fontSize: 14,
			lineHeight: 20,
			fontFamily: fonts.sansSemi
		},
		rowHint: {
			color: colors.fg + textAlpha.muted,
			fontSize: 12,
			lineHeight: 16,
			fontFamily: fonts.sans
		},
		themeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
		swatch: {
			width: 46,
			height: 32,
			borderRadius: 10,
			borderWidth: 1,
			borderColor: colors.border,
			flexDirection: 'row',
			alignItems: 'center',
			justifyContent: 'center',
			gap: 4
		},
		dot: { width: 10, height: 10, borderRadius: 5 }
	});
