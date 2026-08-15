import { useState } from 'react';
import { View, Text, StyleSheet, Alert, Pressable, Share } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { fonts, type ThemeColors } from '../lib/theme';
import { textAlpha } from '../lib/tokens';
import { useTheme, useThemedStyles } from '../lib/themeContext';
import { Card, TopBar, Screen, Button, Input, SectionTitle, Pill, Sheet, Avatar } from '../lib/ui';
import { useData } from '../lib/store';
import {
	getAdminUsers,
	adminUserAction,
	getInvites,
	createInvite,
	getSystemInfo,
	getAuditLog,
	adminBroadcast,
	BASE_URL,
	type AdminUser
} from '../lib/api';
import { useAuth } from './_layout';

type Tab = 'users' | 'invites' | 'system' | 'log';

const TABS: { key: Tab; label: string; icon: string }[] = [
	{ key: 'users', label: 'Benutzer', icon: 'people-outline' },
	{ key: 'invites', label: 'Einladungen', icon: 'mail-outline' },
	{ key: 'system', label: 'Server', icon: 'hardware-chip-outline' },
	{ key: 'log', label: 'Protokoll', icon: 'list-outline' }
];

const ROLES: AdminUser['role'][] = ['member', 'spotmanager', 'admin'];

function bytes(n: number): string {
	if (n > 1e9) return `${(n / 1e9).toFixed(1)} GB`;
	if (n > 1e6) return `${(n / 1e6).toFixed(0)} MB`;
	return `${(n / 1e3).toFixed(0)} KB`;
}

/** Admin-Bereich: Benutzer, Einladungen, Server-Zustand, Protokoll, Broadcast. */
export default function Admin() {
	const { colors } = useTheme();
	const styles = useThemedStyles(makeStyles);
	const { me } = useAuth();
	const [tab, setTab] = useState<Tab>('users');

	const users = useData('admin-users', () => getAdminUsers());
	const invites = useData('admin-invites', getInvites);
	const system = useData('admin-system', getSystemInfo);
	const audit = useData('admin-audit', () => getAuditLog(60));

	const [userFor, setUserFor] = useState<AdminUser | null>(null);
	const [pwOpen, setPwOpen] = useState(false);
	const [newPw, setNewPw] = useState('');
	const [pushOpen, setPushOpen] = useState(false);
	const [pushForm, setPushForm] = useState({ title: '', body: '' });

	if (me?.role !== 'admin') {
		return (
			<Screen>
				<TopBar back kicker="Gesperrt" title="Admin" />
				<Card>
					<Text style={styles.muted}>Dieser Bereich ist Admins vorbehalten.</Text>
				</Card>
			</Screen>
		);
	}

	const act = async (fn: () => Promise<unknown>) => {
		try {
			await fn();
			await users.refresh();
		} catch (e) {
			Alert.alert('Fehler', e instanceof Error ? e.message : 'Aktion fehlgeschlagen');
		}
	};

	const resetPassword = async () => {
		if (!userFor || newPw.length < 10) {
			Alert.alert('Zu kurz', 'Mindestens 10 Zeichen.');
			return;
		}
		const target = userFor;
		setPwOpen(false);
		setUserFor(null);
		await act(() => adminUserAction(target.id, 'reset_password', { newPassword: newPw }));
		setNewPw('');
		Alert.alert('Gesetzt', `Neues Passwort für ${target.username} aktiv.`);
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
			Alert.alert('Verschickt', `An ${res.sent ?? '?'} Geräte gesendet.`);
		} catch (e) {
			Alert.alert('Fehler', e instanceof Error ? e.message : 'Senden fehlgeschlagen');
		}
	};

	return (
		<Screen refreshing={users.refreshing} onRefresh={users.onRefresh}>
			<TopBar back kicker="Verwaltung" title="Admin" />

			<View style={styles.tabRow}>
				{TABS.map((t) => (
					<Pressable
						key={t.key}
						onPress={() => setTab(t.key)}
						style={({ pressed }) => [
							styles.tab,
							tab === t.key && { backgroundColor: colors.accent },
							pressed && { opacity: 0.8 }
						]}
					>
						<Ionicons
							name={t.icon as 'people-outline'}
							size={16}
							color={tab === t.key ? colors.onAccent : colors.fg + textAlpha.secondary}
						/>
						<Text style={[styles.tabText, tab === t.key && { color: colors.onAccent }]}>
							{t.label}
						</Text>
					</Pressable>
				))}
			</View>

			{tab === 'users'
				? (users.data?.users ?? []).map((u, i) => (
						<Card key={u.id} style={{ gap: 12 }}>
							<View style={styles.userHead}>
								<Avatar username={u.username} size={38} index={i} />
								<View style={{ flex: 1 }}>
									<Text style={styles.userName}>{u.username}</Text>
									<Text style={styles.muted}>
										{u.spotCount} Spots · {u.voteCount} Bewertungen
									</Text>
								</View>
								{!u.active ? <Pill label="Inaktiv" color={colors.danger} /> : null}
							</View>

							<View style={styles.chipRow}>
								{ROLES.map((r) => (
									<Pressable
										key={r}
										onPress={() =>
											u.id === me.id
												? Alert.alert('Nicht möglich', 'Die eigene Rolle lässt sich nicht ändern.')
												: act(() => adminUserAction(u.id, 'change_role', { newRole: r }))
										}
										style={({ pressed }) => [
											styles.chip,
											u.role === r && { backgroundColor: colors.accent, borderColor: colors.accent },
											pressed && { opacity: 0.8 }
										]}
									>
										<Text style={[styles.chipText, u.role === r && { color: colors.onAccent }]}>
											{r === 'admin' ? 'Admin' : r === 'spotmanager' ? 'Spotmanager' : 'Mitglied'}
										</Text>
									</Pressable>
								))}
							</View>

							<View style={styles.chipRow}>
								<Button
									label={u.active ? 'Deaktivieren' : 'Aktivieren'}
									kind="ghost"
									small
									onPress={() => act(() => adminUserAction(u.id, 'toggle_active'))}
								/>
								<Button
									label="Passwort setzen"
									kind="ghost"
									small
									onPress={() => {
										setUserFor(u);
										setPwOpen(true);
									}}
								/>
								<Button
									label="Papierkorb"
									kind="danger"
									small
									onPress={() =>
										Alert.alert('In den Papierkorb?', `${u.username} wird deaktiviert.`, [
											{ text: 'Abbrechen', style: 'cancel' },
											{
												text: 'Verschieben',
												style: 'destructive',
												onPress: () => act(() => adminUserAction(u.id, 'trash_user'))
											}
										])
									}
								/>
							</View>
						</Card>
					))
				: null}

			{tab === 'invites' ? (
				<>
					<Button
						label="Neue Einladung erstellen"
						wide
						onPress={async () => {
							try {
								const res = await createInvite();
								await invites.refresh();
								const link = `${BASE_URL || 'https://matetraining.duckdns.org'}/register/${res.invite.token}`;
								Share.share({ message: `Komm ins Parkour Portal: ${link}` }).catch(() => {});
							} catch (e) {
								Alert.alert('Fehler', e instanceof Error ? e.message : 'Fehlgeschlagen');
							}
						}}
					/>
					{(invites.data?.invites ?? []).map((inv) => {
						const expired = new Date(inv.expiresAt) < new Date();
						return (
							<Card key={inv.id} style={{ gap: 8 }}>
								<View style={styles.userHead}>
									<View style={{ flex: 1 }}>
										<Text style={styles.userName}>
											{inv.used ? 'Verwendet' : expired ? 'Abgelaufen' : 'Aktiv'}
										</Text>
										<Text style={styles.muted}>
											Gültig bis {new Date(inv.expiresAt).toLocaleDateString('de-CH')}
										</Text>
									</View>
									{!inv.used && !expired ? (
										<Button
											label="Teilen"
											kind="ghost"
											small
											onPress={() =>
												Share.share({
													message: `${BASE_URL || 'https://matetraining.duckdns.org'}/register/${inv.token}`
												}).catch(() => {})
											}
										/>
									) : null}
								</View>
							</Card>
						);
					})}
				</>
			) : null}

			{tab === 'system' ? (
				<>
					<Button label="Push an alle senden" wide onPress={() => setPushOpen(true)} />
					{system.data ? (
						<Card style={{ gap: 12 }}>
							<Line label="Rechner" value={system.data.hostname} />
							<Line label="System" value={system.data.platform} />
							<Line
								label="Laufzeit"
								value={`${Math.floor(system.data.uptimeSeconds / 3600)} h`}
							/>
							<Line
								label="Arbeitsspeicher"
								value={`${bytes(system.data.memory.used)} / ${bytes(system.data.memory.total)} (${system.data.memory.usedPercent}%)`}
							/>
							{system.data.disk ? (
								<Line
									label="Speicherplatz"
									value={`${bytes(system.data.disk.used)} / ${bytes(system.data.disk.total)} (${system.data.disk.usedPercent}%)`}
								/>
							) : null}
							<Line
								label="Auslastung"
								value={`${system.data.load.avg1.toFixed(2)} bei ${system.data.load.cpus} Kernen`}
							/>
						</Card>
					) : null}
				</>
			) : null}

			{tab === 'log' ? (
				<Card style={{ gap: 10 }}>
					{(audit.data?.logs ?? []).map((l) => (
						<View key={l.id} style={styles.logRow}>
							<Text style={styles.logAction}>{l.action}</Text>
							<Text style={styles.muted}>
								{l.actorUsername ?? 'System'} ·{' '}
								{new Date(l.createdAt.replace(' ', 'T') + 'Z').toLocaleString('de-CH', {
									day: 'numeric',
									month: 'short',
									hour: '2-digit',
									minute: '2-digit'
								})}
							</Text>
						</View>
					))}
				</Card>
			) : null}

			<Sheet
				visible={pwOpen}
				onClose={() => setPwOpen(false)}
				title={`Passwort für ${userFor?.username ?? ''}`}
			>
				<Input
					placeholder="Neues Passwort (mind. 10 Zeichen)"
					value={newPw}
					onChangeText={setNewPw}
				/>
				<View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
					<Button label="Abbrechen" kind="ghost" onPress={() => setPwOpen(false)} />
					<Button label="Setzen" onPress={resetPassword} />
				</View>
			</Sheet>

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
				<View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
					<Button label="Abbrechen" kind="ghost" onPress={() => setPushOpen(false)} />
					<Button label="Senden" onPress={sendBroadcast} />
				</View>
			</Sheet>
		</Screen>
	);
}

function Line({ label, value }: { label: string; value: string }) {
	const styles = useThemedStyles(makeStyles);
	return (
		<View style={styles.lineRow}>
			<Text style={styles.muted}>{label}</Text>
			<Text style={styles.lineValue}>{value}</Text>
		</View>
	);
}

const makeStyles = (colors: ThemeColors) =>
	StyleSheet.create({
		muted: { color: colors.fg + textAlpha.muted, fontSize: 12, lineHeight: 16, fontFamily: fonts.sans },
		tabRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
		tab: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: 6,
			borderRadius: 999,
			backgroundColor: colors.hover,
			paddingHorizontal: 12,
			paddingVertical: 8
		},
		tabText: {
			color: colors.fg + textAlpha.secondary,
			fontSize: 12,
			lineHeight: 16,
			fontFamily: fonts.sansSemi
		},
		userHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
		userName: {
			color: colors.fg + textAlpha.primary,
			fontSize: 14,
			lineHeight: 20,
			fontFamily: fonts.sansSemi
		},
		chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
		chip: {
			borderRadius: 999,
			borderWidth: 1,
			borderColor: colors.border,
			backgroundColor: colors.hover,
			paddingHorizontal: 12,
			paddingVertical: 6
		},
		chipText: {
			color: colors.fg + textAlpha.primary,
			fontSize: 12,
			lineHeight: 16,
			fontFamily: fonts.sansMedium
		},
		lineRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
		lineValue: {
			color: colors.fg + textAlpha.primary,
			fontSize: 13,
			lineHeight: 18,
			fontFamily: fonts.sansSemi,
			flexShrink: 1,
			textAlign: 'right'
		},
		logRow: { gap: 2 },
		logAction: {
			color: colors.fg + textAlpha.primary,
			fontSize: 13,
			lineHeight: 18,
			fontFamily: fonts.sansMedium
		}
	});
