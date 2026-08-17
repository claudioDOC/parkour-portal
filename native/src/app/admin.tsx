import { useState } from 'react';
import { View, Text, StyleSheet, Alert, Pressable, Share } from 'react-native';
import { useRouter } from 'expo-router';
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
	getAdminSessions,
	adminSessionAction,
	adminSessionDelete,
	getTrashedSpots,
	restoreSpot,
	getTrashedChallenges,
	restoreChallenge,
	getTrashedTrips,
	restoreTrip,
	getSpots,
	trashSpot,
	getTrips,
	adminTrashTrip,
	BASE_URL,
	type AdminUser
} from '../lib/api';
import { useAuth } from './_layout';

type Tab = 'users' | 'trainings' | 'spots' | 'trips' | 'trash' | 'invites' | 'system' | 'log';

const TABS: { key: Tab; label: string; icon: string }[] = [
	{ key: 'users', label: 'Benutzer', icon: 'people-outline' },
	{ key: 'trainings', label: 'Trainings', icon: 'calendar-outline' },
	{ key: 'spots', label: 'Spots', icon: 'location-outline' },
	{ key: 'trips', label: 'Trips', icon: 'airplane-outline' },
	{ key: 'trash', label: 'Papierkorb', icon: 'trash-outline' },
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
	const sessions = useData('admin-sessions', getAdminSessions);
	const trashSpots = useData('trash-spots', getTrashedSpots);
	const trashChallenges = useData('trash-challenges', getTrashedChallenges);
	const trashTrips = useData('trash-trips', getTrashedTrips);
	const allSpots = useData('spots', getSpots);
	const allTrips = useData('trips', getTrips);
	const router = useRouter();
	const [guestFor, setGuestFor] = useState<number | null>(null);
	const [guestName, setGuestName] = useState('');
	// Nachträglich abmelden: Session → Mitglied wählen + Grund
	const [absentFor, setAbsentFor] = useState<number | null>(null);
	const [absentUserId, setAbsentUserId] = useState<number | null>(null);
	const [absentReason, setAbsentReason] = useState('');
	const [logFilter, setLogFilter] = useState('');

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
			await Promise.all([users.refresh(), sessions.refresh()]);
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
								<Avatar username={u.username} avatar={u.avatar} size={38} index={i} />
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

							<Text style={styles.muted}>Trainingsmodus:</Text>
							<View style={styles.chipRow}>
								{([
									{ key: 'implicit', label: 'Wie alle (Zieht)' },
									{ key: 'opt_in', label: 'Nur mit Zusage' }
								] as const).map((m) => (
									<Pressable
										key={m.key}
										onPress={() =>
											act(() =>
												adminUserAction(u.id, 'set_training_attendance', {
													trainingAttendance: m.key
												})
											)
										}
										style={({ pressed }) => [
											styles.chip,
											u.trainingAttendance === m.key && {
												backgroundColor: colors.accent,
												borderColor: colors.accent
											},
											pressed && { opacity: 0.8 }
										]}
									>
										<Text
											style={[
												styles.chipText,
												u.trainingAttendance === m.key && { color: colors.onAccent }
											]}
										>
											{m.label}
										</Text>
									</Pressable>
								))}
							</View>
							<Text style={styles.muted}>Auto-Abmeldung an:</Text>
							<View style={styles.chipRow}>
								{(['Dienstag', 'Donnerstag'] as const).map((day) => {
									const on = u.autoAbsentWeekdays.includes(day);
									return (
										<Pressable
											key={day}
											onPress={() =>
												act(() =>
													adminUserAction(u.id, 'set_auto_absent_weekdays', {
														autoAbsentWeekdays: on
															? u.autoAbsentWeekdays.filter((d) => d !== day)
															: [...u.autoAbsentWeekdays, day]
													})
												)
											}
											style={({ pressed }) => [
												styles.chip,
												on && { backgroundColor: colors.warning, borderColor: colors.warning },
												pressed && { opacity: 0.8 }
											]}
										>
											<Text style={[styles.chipText, on && { color: '#111' }]}>{day}</Text>
										</Pressable>
									);
								})}
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

			{tab === 'trainings'
				? [...(sessions.data?.sessions ?? [])]
						.sort((a, b) => a.date.localeCompare(b.date) || a.timeStart.localeCompare(b.timeStart))
						.slice(0, 12)
						.map((sess) => (
						<Card key={sess.id} style={{ gap: 12 }}>
							<View style={styles.userHead}>
								<View style={{ flex: 1 }}>
									<Text style={styles.userName}>
										{new Date(`${sess.date}T12:00:00`).toLocaleDateString('de-CH', {
											weekday: 'short',
											day: 'numeric',
											month: 'short'
										})}{' '}
										· {sess.timeStart}–{sess.timeEnd}
									</Text>
									<Text style={styles.muted}>
										{sess.attending.length} dabei · {sess.absences.length} abgemeldet ·{' '}
										{sess.guests.length} Gäste
									</Text>
								</View>
								{sess.cancelled ? <Pill label="Abgesagt" color={colors.danger} /> : null}
							</View>

							{sess.guests.length > 0 ? (
								<View style={styles.chipRow}>
									{sess.guests.map((g) => (
										<Pressable
											key={g.id}
											onPress={() =>
												act(() => adminSessionDelete('remove_guest', { id: g.id }))
											}
											style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}
										>
											<Text style={styles.chipText}>{g.name} ✕</Text>
										</Pressable>
									))}
								</View>
							) : null}

							{sess.attending.length > 0 ? (
								<View style={{ gap: 6 }}>
									<Text style={styles.muted}>Zieht — antippen entfernt aus der Liste:</Text>
									<View style={styles.chipRow}>
										{sess.attending.map((a) => (
											<Pressable
												key={a.id}
												onPress={() =>
													Alert.alert('Aus „Zieht" entfernen?', a.username, [
														{ text: 'Abbrechen', style: 'cancel' },
														{
															text: 'Entfernen',
															style: 'destructive',
															onPress: () =>
																act(() =>
																	adminSessionAction('hide_user', {
																		sessionId: sess.id,
																		userId: a.id
																	})
																)
														}
													])
												}
												style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}
											>
												<Text style={styles.chipText}>{a.username} ✕</Text>
											</Pressable>
										))}
									</View>
								</View>
							) : null}

							{(sess.hiddenUsers ?? []).length > 0 ? (
								<View style={{ gap: 6 }}>
									<Text style={styles.muted}>Entfernt — antippen holt zurück:</Text>
									<View style={styles.chipRow}>
										{sess.hiddenUsers.map((h) => (
											<Pressable
												key={h.id}
												onPress={() =>
													act(() => adminSessionDelete('unhide_user', { id: h.id }))
												}
												style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}
											>
												<Text style={styles.chipText}>{h.username} ↩</Text>
											</Pressable>
										))}
									</View>
								</View>
							) : null}

							{sess.absences.filter((a) => a.id !== null).length > 0 ? (
								<View style={{ gap: 6 }}>
									<Text style={styles.muted}>Abmeldungen aufheben:</Text>
									<View style={styles.chipRow}>
										{sess.absences
											.filter((a) => a.id !== null)
											.map((a) => (
												<Pressable
													key={a.id}
													onPress={() =>
														act(() => adminSessionDelete('remove_absence', { id: a.id }))
													}
													style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}
												>
													<Text style={styles.chipText}>{a.username} ✕</Text>
												</Pressable>
											))}
									</View>
								</View>
							) : null}

							<View style={styles.chipRow}>
								<Button
									label="Gast hinzufügen"
									kind="ghost"
									small
									onPress={() => setGuestFor(sess.id)}
								/>
								<Button
									label="Jemanden abmelden"
									kind="ghost"
									small
									onPress={() => {
										setAbsentFor(sess.id);
										setAbsentUserId(null);
										setAbsentReason('');
									}}
								/>
								<Button
									label={sess.cancelled ? 'Absage aufheben' : 'Training absagen'}
									kind={sess.cancelled ? 'ghost' : 'danger'}
									small
									onPress={() =>
										act(() =>
											adminSessionAction(
												sess.cancelled ? 'uncancel_session' : 'cancel_session',
												{ sessionId: sess.id }
											)
										)
									}
								/>
							</View>
						</Card>
					))
				: null}

			{tab === 'spots' ? (
				<>
					<Text style={styles.muted}>
						Antippen öffnet den Spot mit dem vollen Bearbeiten-Formular.
					</Text>
					{(allSpots.data?.spots ?? []).map((sp) => (
						<Card key={sp.id} style={styles.trashRow}>
							<Pressable style={{ flex: 1 }} onPress={() => router.push(`/spot/${sp.id}`)}>
								<Text style={styles.userName}>{sp.name}</Text>
								<Text style={styles.muted}>
									{sp.city}
									{sp.isMicro ? ' · Microspot' : ''} · Ø {sp.avgScore.toFixed(1)}
								</Text>
							</Pressable>
							<Button
								label="Papierkorb"
								kind="danger"
								small
								onPress={() =>
									Alert.alert('Spot in den Papierkorb?', sp.name, [
										{ text: 'Abbrechen', style: 'cancel' },
										{
											text: 'Verschieben',
											style: 'destructive',
											onPress: async () => {
												try {
													await trashSpot(sp.id);
													await allSpots.refresh();
												} catch (e) {
													Alert.alert('Fehler', e instanceof Error ? e.message : 'Fehlgeschlagen');
												}
											}
										}
									])
								}
							/>
						</Card>
					))}
				</>
			) : null}

			{tab === 'trips' ? (
				<>
					<Text style={styles.muted}>
						Gelöschte Trips liegen im Papierkorb und lassen sich dort zurückholen.
					</Text>
					{(allTrips.data?.trips ?? []).map((t) => (
						<Card key={t.id} style={styles.trashRow}>
							<View style={{ flex: 1 }}>
								<Text style={styles.userName}>{t.title}</Text>
								<Text style={styles.muted}>
									{t.startDate}
									{t.endDate && t.endDate !== t.startDate ? ` – ${t.endDate}` : ''} ·{' '}
									{t.joinedCount} dabei
								</Text>
							</View>
							<Button
								label="Papierkorb"
								kind="danger"
								small
								onPress={() =>
									Alert.alert('Trip in den Papierkorb?', t.title, [
										{ text: 'Abbrechen', style: 'cancel' },
										{
											text: 'Verschieben',
											style: 'destructive',
											onPress: async () => {
												try {
													await adminTrashTrip(t.id);
													await Promise.all([allTrips.refresh(), trashTrips.refresh()]);
												} catch (e) {
													Alert.alert('Fehler', e instanceof Error ? e.message : 'Fehlgeschlagen');
												}
											}
										}
									])
								}
							/>
						</Card>
					))}
				</>
			) : null}

			{tab === 'trash' ? (
				<>
					<SectionTitle>{`Spots · ${trashSpots.data?.spots.length ?? 0}`}</SectionTitle>
					{(trashSpots.data?.spots ?? []).map((sp) => (
						<Card key={sp.id} style={styles.trashRow}>
							<View style={{ flex: 1 }}>
								<Text style={styles.userName}>{sp.name}</Text>
								<Text style={styles.muted}>{sp.city}</Text>
							</View>
							<Button
								label="Wiederherstellen"
								kind="ghost"
								small
								onPress={async () => {
									await restoreSpot(sp.id);
									await trashSpots.refresh();
								}}
							/>
						</Card>
					))}

					<SectionTitle>{`Challenges · ${trashChallenges.data?.challenges.length ?? 0}`}</SectionTitle>
					{(trashChallenges.data?.challenges ?? []).map((ch) => (
						<Card key={ch.id} style={styles.trashRow}>
							<View style={{ flex: 1 }}>
								<Text style={styles.userName}>{ch.title}</Text>
								<Text style={styles.muted}>{ch.spotName}</Text>
							</View>
							<Button
								label="Zurück"
								kind="ghost"
								small
								onPress={async () => {
									await restoreChallenge(ch.id);
									await trashChallenges.refresh();
								}}
							/>
						</Card>
					))}

					<SectionTitle>{`Trips · ${trashTrips.data?.trips.length ?? 0}`}</SectionTitle>
					{(trashTrips.data?.trips ?? []).map((t) => (
						<Card key={t.id} style={styles.trashRow}>
							<View style={{ flex: 1 }}>
								<Text style={styles.userName}>{t.title}</Text>
								<Text style={styles.muted}>{t.startDate}</Text>
							</View>
							<Button
								label="Zurück"
								kind="ghost"
								small
								onPress={async () => {
									await restoreTrip(t.id);
									await trashTrips.refresh();
								}}
							/>
						</Card>
					))}
				</>
			) : null}

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
					<Input
						placeholder="Filtern — Aktion oder Person …"
						value={logFilter}
						onChangeText={setLogFilter}
						autoCapitalize="none"
					/>
					{(audit.data?.logs ?? [])
						.filter((l) => {
							const q = logFilter.trim().toLowerCase();
							if (!q) return true;
							return (
								l.action.toLowerCase().includes(q) ||
								(l.actorUsername ?? 'system').toLowerCase().includes(q)
							);
						})
						.map((l) => (
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
				visible={absentFor !== null}
				onClose={() => setAbsentFor(null)}
				title="Jemanden abmelden"
				scroll
			>
				<Text style={styles.muted}>Wen abmelden?</Text>
				<View style={styles.chipRow}>
					{(users.data?.users ?? [])
						.filter((u) => u.active)
						.map((u) => (
							<Pressable
								key={u.id}
								onPress={() => setAbsentUserId(u.id)}
								style={({ pressed }) => [
									styles.chip,
									absentUserId === u.id && {
										backgroundColor: colors.accent,
										borderColor: colors.accent
									},
									pressed && { opacity: 0.8 }
								]}
							>
								<Text
									style={[styles.chipText, absentUserId === u.id && { color: colors.onAccent }]}
								>
									{u.username}
								</Text>
							</Pressable>
						))}
				</View>
				<Input
					placeholder="Grund (optional)"
					value={absentReason}
					onChangeText={setAbsentReason}
				/>
				<View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
					<Button label="Abbrechen" kind="ghost" onPress={() => setAbsentFor(null)} />
					<Button
						label="Abmelden"
						onPress={() => {
							if (!absentFor || !absentUserId) {
								Alert.alert('Unvollständig', 'Bitte ein Mitglied auswählen.');
								return;
							}
							const sid = absentFor;
							const uid = absentUserId;
							const reason = absentReason.trim();
							setAbsentFor(null);
							act(() =>
								adminSessionAction('add_absence', {
									sessionId: sid,
									userId: uid,
									...(reason ? { reason } : {})
								})
							);
						}}
					/>
				</View>
			</Sheet>

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

			<Sheet
				visible={guestFor !== null}
				onClose={() => setGuestFor(null)}
				title="Gast hinzufügen"
			>
				<Input placeholder="Name des Gasts" value={guestName} onChangeText={setGuestName} />
				<View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
					<Button label="Abbrechen" kind="ghost" onPress={() => setGuestFor(null)} />
					<Button
						label="Hinzufügen"
						onPress={async () => {
							const sid = guestFor!;
							const name = guestName.trim();
							setGuestFor(null);
							setGuestName('');
							if (!name) return;
							try {
								await adminSessionAction('add_guest', { sessionId: sid, name });
								await sessions.refresh();
							} catch (e) {
								Alert.alert('Fehler', e instanceof Error ? e.message : 'Fehlgeschlagen');
							}
						}}
					/>
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
		trashRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
		logRow: { gap: 2 },
		logAction: {
			color: colors.fg + textAlpha.primary,
			fontSize: 13,
			lineHeight: 18,
			fontFamily: fonts.sansMedium
		}
	});
