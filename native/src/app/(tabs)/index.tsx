import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { fonts, type ThemeColors } from '../../lib/theme';
import { textAlpha } from '../../lib/tokens';
import { useTheme, useThemedStyles } from '../../lib/themeContext';
import { mediaUrl } from '../../lib/api';
import {
	Card,
	TopBar,
	Pill,
	NameChip,
	GroupLabel,
	Screen,
	ErrorCard,
	Button,
	Sheet,
	Input,
	SectionTitle
} from '../../lib/ui';
import { useData } from '../../lib/store';
import { DateField } from '../../lib/DateField';
import {
	getTraining,
	getPendingTrip,
	getStats,
	logSolo,
	removeSolo,
	createExtraTraining,
	deleteExtraTraining,
	trainingAction,
	adminTraining,
	getLivePositions,
	shareLivePosition,
	stopLivePosition,
	type LivePosition,
	type TrainingSession
} from '../../lib/api';
import { NativeMap } from '../../lib/NativeMap';
import { getLocation } from '../../lib/nativeModules';
import { useAuth } from '../_layout';
import { hasNativeExtras } from '../../lib/nativeModules';
import { Linking } from 'react-native';

/** So viele Trainings stehen ausführlich da; der Rest kommt in die Kurzliste. */
const DETAILED_SESSIONS = 3;

/** „Heute", „Morgen", sonst „in N Tagen" — wie auf der Website. */
function countdownLabel(dateStr: string, calendarToday: string): string {
	const target = new Date(dateStr + 'T00:00:00').getTime();
	const today = new Date(calendarToday + 'T00:00:00').getTime();
	const days = Math.round((target - today) / 86_400_000);
	if (days <= 0) return 'Heute';
	if (days === 1) return 'Morgen';
	return `in ${days} Tagen`;
}

function weekdayLong(ymd: string): string {
	return new Date(`${ymd}T12:00:00`).toLocaleDateString('de-CH', { weekday: 'long' });
}

function metaDate(ymd: string): string {
	return new Date(`${ymd}T12:00:00`).toLocaleDateString('de-CH', {
		weekday: 'short',
		day: 'numeric',
		month: 'short'
	});
}

export default function Dashboard() {
	const { me } = useAuth();
	const { colors } = useTheme();
	const styles = useThemedStyles(makeStyles);
	const router = useRouter();

	const training = useData('training', getTraining);
	const pending = useData('trip-pending', getPendingTrip);
	const stats = useData('stats', getStats);

	const [absenceFor, setAbsenceFor] = useState<TrainingSession | null>(null);
	const [absenceReason, setAbsenceReason] = useState('');
	const [spotFor, setSpotFor] = useState<TrainingSession | null>(null);
	// Spot-Voting: eigenen Vorschlag mit Suchfeld einreichen (wie im Web).
	const [voteFor, setVoteFor] = useState<TrainingSession | null>(null);
	const [voteQuery, setVoteQuery] = useState('');
	// Zusatztraining eintragen — wie auf der Website, offen für alle.
	const [extraOpen, setExtraOpen] = useState(false);
	const [extraForm, setExtraForm] = useState({ date: '', start: '18:15', end: '20:15', note: '' });
	const [extraBusy, setExtraBusy] = useState(false);
	// Nur die nächsten drei ausführlich — der Rest steckt in einer
	// Kurzliste, sonst scrollt man ewig bis zum Solo-Eintrag.
	const [moreOpen, setMoreOpen] = useState(false);
	// „Bin da": Standort teilen und die anderen am Spot finden.
	const [meetOpen, setMeetOpen] = useState(false);
	const [live, setLive] = useState<{ sharing: boolean; positions: LivePosition[] } | null>(null);
	const [liveBusy, setLiveBusy] = useState(false);

	const loadLive = async () => {
		try {
			setLive(await getLivePositions());
		} catch (e) {
			Alert.alert('Fehler', e instanceof Error ? e.message : 'Standorte nicht abrufbar');
		}
	};

	const shareMyLocation = async () => {
		const Location = getLocation();
		if (!Location) {
			Alert.alert('Neue App-Version nötig', 'Standort teilen geht ab App-Version 1.1.');
			return;
		}
		setLiveBusy(true);
		try {
			const perm = await Location.requestForegroundPermissionsAsync();
			if (!perm.granted) {
				Alert.alert('Kein Zugriff', 'Für „Bin da" braucht die App die Ortungsberechtigung.');
				return;
			}
			const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
			await shareLivePosition(pos.coords.latitude, pos.coords.longitude);
			await loadLive();
		} catch (e) {
			Alert.alert('Fehler', e instanceof Error ? e.message : 'Teilen fehlgeschlagen');
		} finally {
			setLiveBusy(false);
		}
	};
	// Admin-Aktionen liegen hinter „…", damit die Karte ruhig bleibt.
	const [adminFor, setAdminFor] = useState<TrainingSession | null>(null);
	const isAdmin = me?.role === 'admin';

	const data = training.data;
	const myStreak =
		stats.data?.stats.leaderboard.find((r) => r.userId === me?.id)?.streakNoAbsence ?? 0;
	const pendingTrip = pending.data?.trip ?? null;
	const optIn = data?.viewerTrainingAttendance === 'opt_in';

	const act = async (fn: () => Promise<unknown>) => {
		try {
			await fn();
			await training.refresh();
		} catch (e) {
			Alert.alert('Fehler', e instanceof Error ? e.message : 'Aktion fehlgeschlagen');
		}
	};

	const submitAbsence = async () => {
		if (!absenceFor) return;
		// Beim Zusatztraining ist der Grund freiwillig — der Termin ist es ja
		// auch. Wer etwas schreibt, soll aber verständlich bleiben.
		const needsReason = !absenceFor.isExtra;
		const len = absenceReason.trim().length;
		if (needsReason ? len < 10 : len > 0 && len < 10) {
			Alert.alert('Begründung zu kurz', 'Bitte mindestens 10 Zeichen — wie im Portal.');
			return;
		}
		const session = absenceFor;
		setAbsenceFor(null);
		await act(() => trainingAction('absence', session.id, { reason: absenceReason.trim() }));
		setAbsenceReason('');
	};

	const submitExtra = async () => {
		const { date, start, end, note } = extraForm;
		if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
			Alert.alert('Datum fehlt', 'Bitte im Format JJJJ-MM-TT angeben, z. B. 2026-08-22.');
			return;
		}
		setExtraBusy(true);
		try {
			await createExtraTraining(date, start.trim(), end.trim(), note.trim());
			setExtraOpen(false);
			setExtraForm({ date: '', start: '18:15', end: '20:15', note: '' });
			await training.refresh();
		} catch (e) {
			Alert.alert('Fehler', e instanceof Error ? e.message : 'Konnte nicht angelegt werden');
		} finally {
			setExtraBusy(false);
		}
	};

	const removeExtra = (sessionId: number) =>
		Alert.alert('Zusatztraining entfernen?', 'Anmeldungen und Stimmen gehen verloren.', [
			{ text: 'Abbrechen', style: 'cancel' },
			{
				text: 'Entfernen',
				style: 'destructive',
				onPress: async () => {
					try {
						await deleteExtraTraining(sessionId);
						await training.refresh();
					} catch (e) {
						Alert.alert('Fehler', e instanceof Error ? e.message : 'Fehlgeschlagen');
					}
				}
			}
		]);

	const undoSoloToday = async () => {
		try {
			await removeSolo();
			await training.refresh();
		} catch (e) {
			Alert.alert('Fehler', e instanceof Error ? e.message : 'Rückgängig fehlgeschlagen');
		}
	};

	const logSoloToday = async () => {
		try {
			await logSolo();
			await training.refresh();
		} catch (e) {
			Alert.alert('Fehler', e instanceof Error ? e.message : 'Eintragen fehlgeschlagen');
		}
	};

	return (
		<Screen refreshing={training.refreshing} onRefresh={training.onRefresh}>
			<TopBar
				plainTitle
				kicker="Übersicht"
				title="Start"
				sub={
					<View style={{ gap: 8, marginTop: 8 }}>
						{myStreak >= 2 ? (
							<View style={styles.streakChip}>
								<Ionicons name="flame" size={15} color={colors.accent} />
								<Text style={styles.streakText}>{myStreak}er-Streak</Text>
							</View>
						) : null}
					</View>
				}
			/>

			{training.error && !data ? <ErrorCard message={training.error} /> : null}

			{!hasNativeExtras() ? (
				<Pressable onPress={() => Linking.openURL('https://matetraining.duckdns.org/app')}>
					{({ pressed }) => (
						<Card style={[styles.updateCard, pressed && { opacity: 0.85 }]}>
							<Ionicons name="download-outline" size={22} color={colors.accent} />
							<View style={{ flex: 1 }}>
								<Text style={styles.updateTitle}>Neue App-Version verfügbar</Text>
								<Text style={styles.updateText}>
									Native Karte, Fotos und Standort brauchen die neuste App von der
									Portal-Seite. Einmal installieren — danach läuft alles automatisch.
								</Text>
							</View>
							<Ionicons name="chevron-forward" size={20} color={colors.accent} />
						</Card>
					)}
				</Pressable>
			) : null}

			{pendingTrip ? (
				<Pressable onPress={() => router.push('/trips')}>
					{({ pressed }) => (
						<Card style={[styles.tripCard, pressed && { opacity: 0.85 }]}>
							<View style={styles.rowBetween}>
								<View style={{ flex: 1 }}>
									<Text style={styles.tripKicker}>TRIP — DEINE ANTWORT FEHLT</Text>
									<Text style={styles.tripTitle}>{pendingTrip.title}</Text>
								</View>
								<Ionicons name="chevron-forward" size={20} color={colors.accentBlue} />
							</View>
						</Card>
					)}
				</Pressable>
			) : null}

			{/* Nebeninfos rechtsbündig und dicht beieinander: Wetter und Solo
			    sind Randnotizen — das nächste Training soll oben stehen. */}
			<View style={styles.metaBlock}>
				{data?.trainingForecast?.summaryLine ? (
					<View style={styles.metaRow}>
						<Ionicons
							name={data.trainingForecast.isWet ? 'rainy-outline' : 'partly-sunny-outline'}
							size={13}
							color={colors.fg + textAlpha.muted}
						/>
						{/* Serverzeile beginnt schon mit „Prognose:" */}
						<Text style={styles.metaSmall} numberOfLines={1}>
							{data.trainingForecast.summaryLine}
						</Text>
					</View>
				) : null}
				<View style={styles.metaRow}>
					<Ionicons name="flash-outline" size={13} color={colors.accent} />
					<Text style={styles.metaSmall}>
						{`Solo · ${data?.mySolo.countMonth ?? 0} diesen Monat`}
						{data?.mySolo.todayLogged ? ' · heute ✓' : ''}
					</Text>
					{data?.mySolo.todayLogged ? (
						<Pressable onPress={undoSoloToday} hitSlop={8}>
							<Text style={styles.soloUndo}>Rückgängig</Text>
						</Pressable>
					) : (
						<Pressable onPress={logSoloToday} hitSlop={8}>
							<Text style={styles.soloAction}>Heute eintragen</Text>
						</Pressable>
					)}
				</View>
			</View>

			{/* Eigene Beschriftung statt SectionTitle: dessen Abstände nach oben
			    und unten verschieben den Text gegen den Knopf daneben. */}
			<View style={[styles.rowBetween, { marginTop: 14 }]}>
				<Text style={styles.sectionLabel}>NÄCHSTE TRAININGS</Text>
				<Pressable
					onPress={() => {
						setExtraForm((f) => ({ ...f, date: f.date || (data?.calendarToday ?? '') }));
						setExtraOpen(true);
					}}
					hitSlop={8}
					style={({ pressed }) => [styles.proposeSpotRow, pressed && { opacity: 0.7 }]}
				>
					<Ionicons name="add-circle-outline" size={16} color={colors.accentBlue} />
					<Text style={styles.proposeSpotText}>Zusatztraining</Text>
				</Pressable>
			</View>

			{(data?.sessions ?? []).slice(0, DETAILED_SESSIONS).map((s, sessionIndex) => {
				const iAmIn = me ? s.attending.some((a) => a.id === me.id) : false;
				const absent = s.userDbAbsent || s.userVirtualAbsent;
				const spot = s.overrideSpot
					? { label: `${s.overrideSpot.name} · ${s.overrideSpot.city}`, fixed: true, id: s.overrideSpot.spotId }
					: s.votingClosed && s.winnerSpot
						? { label: `${s.winnerSpot.name} · ${s.winnerSpot.city}`, fixed: false, id: s.winnerSpot.spotId }
						: s.votingClosed && s.autoSpot
							? { label: `${s.autoSpot.name} · ${s.autoSpot.city} (Auto)`, fixed: false, id: s.autoSpot.spotId }
							: null;
				return (
					<Card key={s.id} style={styles.sessionCard}>
						{s.spotThumbnail ? (
							<View>
								<Image
									source={{ uri: mediaUrl(s.spotThumbnail, 960) ?? undefined }}
									style={styles.hero}
									contentFit="cover"
									transition={200}
								/>
								<View style={styles.heroFade} />
							</View>
						) : null}
						{sessionIndex === 0 ? (
							<View style={styles.band}>
								<View style={styles.bandDot} />
								<Text style={styles.bandText}>NÄCHSTES TRAINING</Text>
							</View>
						) : null}

						<View style={styles.sessionBody}>
							<View style={styles.dayRow}>
								<Text style={styles.dayName}>{weekdayLong(s.date).toUpperCase()}</Text>
								{data ? (
									<View style={styles.countChip}>
										<Text style={styles.countChipText}>
											{countdownLabel(s.date, data.calendarToday)}
										</Text>
									</View>
								) : null}
								{s.cancelled ? <Pill label="Abgesagt" color={colors.danger} /> : null}
								{s.isExtra ? <Pill label="Zusatz" color={colors.accentBlue} /> : null}
							</View>
							<Text style={styles.metaLine}>
								{metaDate(s.date)} · {s.timeStart} – {s.timeEnd}
							</Text>
							{s.isExtra ? (
								<View style={styles.extraRow}>
									<Text style={styles.extraNote} numberOfLines={2}>
										{[s.note, s.createdByName ? `von ${s.createdByName}` : null]
											.filter(Boolean)
											.join(' · ')}
									</Text>
									{data?.viewer &&
									(s.createdBy === data.viewer.id || data.viewer.role === 'admin') ? (
										<Pressable onPress={() => removeExtra(s.id)} hitSlop={8}>
											<Text style={styles.extraRemove}>entfernen</Text>
										</Pressable>
									) : null}
								</View>
							) : null}

							{!s.cancelled ? (
								<>
									{spot ? (
									<View style={{ gap: 6 }}>
											{/* Auch der entschiedene Spot führt zu seiner Seite. */}
											<Pressable
												style={({ pressed }) => [styles.spotRow, pressed && { opacity: 0.6 }]}
												onPress={() => router.push(`/spot/${spot.id}`)}
											>
												<Ionicons name="location" size={15} color={colors.accent} />
												<Text style={styles.spotText}>{spot.label}</Text>
												{spot.fixed ? <Pill label="Fix" color={colors.accent} filled /> : null}
											</Pressable>
											{data && s.date === data.calendarToday ? (
												<Pressable
													onPress={() => {
														setMeetOpen(true);
														setLive(null);
														loadLive();
													}}
													style={({ pressed }) => [styles.proposeSpotRow, pressed && { opacity: 0.7 }]}
												>
													<Ionicons name="people-outline" size={16} color={colors.accentBlue} />
													<Text style={styles.proposeSpotText}>Bin da — wer ist am Spot?</Text>
												</Pressable>
											) : null}
										</View>
									) : s.spotVotes.length > 0 ? (
										<View style={{ gap: 8, marginTop: 4 }}>
											<GroupLabel color={colors.accentBlue}>
												{`Spot-Voting (${s.spotVotes.length})`}
											</GroupLabel>
											{s.spotVotes.map((v) => {
												const mine = s.userVotedSpotId === v.spotId;
												return (
													<View
														key={v.spotId}
														style={[styles.voteRow, mine && { borderColor: colors.accent + '66' }]}
													>
														<View style={styles.voteRowTop}>
															{mine ? (
																<Ionicons name="checkmark-circle" size={16} color={colors.accent} />
															) : (
																<View style={styles.voteDot} />
															)}
															{/* Wie auf der Website: der Spot selbst führt zur Spot-Seite. */}
															<Pressable
																style={({ pressed }) => [styles.voteMain, pressed && { opacity: 0.6 }]}
																onPress={() => router.push(`/spot/${v.spotId}`)}
															>
																<Text
																	style={[styles.voteName, mine && { color: colors.accent }]}
																	numberOfLines={1}
																>
																	{v.spotName}
																</Text>
																{/* Ort und wer dafür gestimmt hat — leise. */}
																<Text style={styles.voteMeta} numberOfLines={2}>
																	{[v.spotCity, v.voterList.filter(Boolean).join(', ')]
																		.filter(Boolean)
																		.join(' · ')}
																</Text>
															</Pressable>
															<Text style={styles.voteCount}>{v.voteCount}</Text>
															{!s.votingClosed ? (
																<Pressable
																	style={({ pressed }) => [styles.voteBtn, pressed && { opacity: 0.6 }]}
																	onPress={() =>
																		act(() =>
																			mine
																				? trainingAction('remove_vote', s.id)
																				: trainingAction('vote_spot', s.id, { spotId: v.spotId })
																		)
																	}
																>
																	<Text style={mine ? styles.voteBtnUndo : styles.voteBtnFor}>
																		{mine ? 'Zurückziehen' : 'Dafür'}
																	</Text>
																</Pressable>
															) : null}
														</View>
													</View>
												);
											})}
										<Pressable
												onPress={() => {
													setVoteFor(s);
													setVoteQuery('');
												}}
												style={({ pressed }) => [styles.proposeSpotRow, pressed && { opacity: 0.7 }]}
											>
												<Ionicons name="add-circle-outline" size={16} color={colors.accentBlue} />
												<Text style={styles.proposeSpotText}>Anderen Spot vorschlagen</Text>
											</Pressable>
										</View>
									) : !s.votingClosed ? (
										/* Zustand links, Handlung rechts — eine Zeile statt zwei
										   gleich aussehender Textzeilen untereinander. */
										<View style={styles.spotEmptyRow}>
											<Ionicons
												name="location-outline"
												size={15}
												color={colors.fg + textAlpha.muted}
											/>
											<Text style={styles.spotEmptyText}>Noch kein Spot</Text>
											<Pressable
												onPress={() => {
													setVoteFor(s);
													setVoteQuery('');
												}}
												hitSlop={8}
												style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
											>
												<Text style={styles.proposeSpotText}>Vorschlagen</Text>
											</Pressable>
										</View>
									) : (
										<View style={styles.spotEmptyRow}>
											<Ionicons
												name="location-outline"
												size={15}
												color={colors.fg + textAlpha.muted}
											/>
											<Text style={styles.spotEmptyText}>Kein Spot festgelegt</Text>
										</View>
									)}

									<GroupLabel color={colors.success}>
										{`Zieht (${s.attending.length})`}
									</GroupLabel>
									<View style={styles.chipWrap}>
										{s.attending.map((a, i) => (
											<NameChip
												key={a.id}
												name={a.username}
												avatar={a.avatar ?? null}
												userId={a.id}
												index={i}
											/>
										))}
										{s.guests.map((g) => (
											<NameChip key={`g-${g.id}`} name={`${g.name} (Gast)`} />
										))}
										{s.attending.length === 0 && s.guests.length === 0 ? (
											<Text style={styles.emptyDash}>—</Text>
										) : null}
									</View>
									<GroupLabel color={colors.danger}>
										{`Zieht nicht (${s.absences.length})`}
									</GroupLabel>
									{/* Chip führt aufs Profil, der Grund steht direkt daneben. */}
									<View style={{ gap: 6 }}>
										{s.absences.map((a) => (
											<View key={a.id ?? a.userId} style={styles.absenceRow}>
												<NameChip
													name={a.username}
													tone={colors.danger}
													userId={a.userId}
													avatar={a.avatar ?? null}
												/>
												{a.reason ? (
													<Text style={styles.absenceReason}>{a.reason}</Text>
												) : null}
											</View>
										))}
										{s.absences.length === 0 ? <Text style={styles.emptyDash}>—</Text> : null}
									</View>
									{s.isExtra && (s.pendingResponders?.length ?? 0) > 0 ? (
										<>
											<GroupLabel color={colors.fg + textAlpha.muted}>
												{`Noch keine Antwort (${s.pendingResponders!.length})`}
											</GroupLabel>
											<View style={styles.chipWrap}>
												{s.pendingResponders!.map((u, i) => (
													<NameChip
														key={u.id}
														name={u.username}
														avatar={u.avatar ?? null}
														userId={u.id}
														index={i}
													/>
												))}
											</View>
										</>
									) : null}

									<View style={styles.actions}>
										{iAmIn && !s.isExtra ? (
											<Pill label="✓ Du ziehst mit" color={colors.success} />
										) : null}
										{s.isExtra ? (
											/* Zusatztraining: drei Zustände — zugesagt, abgesagt oder
											   noch offen. Ohne Antwort zählt man nicht mit, darum steht
											   immer genau eine Gegenaktion daneben. */
											s.userHasRsvp ? (
												<>
													<Pill label="Zugesagt" color={colors.success} />
													<Button
														label="Kann doch nicht"
														kind="ghost"
														small
														onPress={() => setAbsenceFor(s)}
													/>
												</>
											) : s.userDbAbsent ? (
												<>
													<Pill label="Abgesagt" color={colors.danger} />
													<Button
														label="Doch dabei"
														small
														onPress={() => act(() => trainingAction('rsvp_yes', s.id))}
													/>
												</>
											) : (
												<>
													<Button
														label="Dabei!"
														small
														onPress={() => act(() => trainingAction('rsvp_yes', s.id))}
													/>
													<Button
														label="Kann nicht"
														kind="ghost"
														small
														onPress={() => setAbsenceFor(s)}
													/>
												</>
											)
										) : optIn ? (
											s.userHasRsvp ? (
												<Button
													label="Doch nicht"
													kind="ghost"
													small
													onPress={() => act(() => trainingAction('rsvp_no', s.id))}
												/>
											) : (
												<Button
													label="Dabei!"
													small
													onPress={() => act(() => trainingAction('rsvp_yes', s.id))}
												/>
											)
										) : absent ? (
											<Button
												label="Wieder dabei"
												small
												onPress={() =>
													act(() =>
														trainingAction(
															s.userDbAbsent ? 'cancel_absence' : 'weekday_override_yes',
															s.id
														)
													)
												}
											/>
										) : (
											<Button
												label="Abmelden"
												kind="ghost"
												small
												onPress={() => setAbsenceFor(s)}
											/>
										)}
										{isAdmin ? (
											<Pressable
												onPress={() => setAdminFor(s)}
												hitSlop={8}
												style={({ pressed }) => [styles.moreBtn, pressed && { opacity: 0.7 }]}
											>
												<Ionicons
													name="ellipsis-horizontal"
													size={18}
													color={colors.fg + textAlpha.secondary}
												/>
											</Pressable>
										) : null}
									</View>
								</>
							) : isAdmin ? (
								<Button
									label="Absage aufheben"
									kind="ghost"
									small
									onPress={() => act(() => adminTraining('uncancel_session', s.id))}
								/>
							) : null}
						</View>
					</Card>
				);
			})}

			{/* Kurzliste: alles nach den ersten drei Terminen. Abmelden geht
			    hier direkt — dafür muss niemand die ganze Seite durchscrollen. */}
			{(data?.sessions ?? []).length > DETAILED_SESSIONS ? (
				<Card style={{ gap: 10 }}>
					<Pressable
						onPress={() => setMoreOpen(!moreOpen)}
						style={({ pressed }) => [styles.moreHead, pressed && { opacity: 0.7 }]}
					>
						<Ionicons
							name={moreOpen ? 'chevron-down' : 'chevron-forward'}
							size={17}
							color={colors.accentBlue}
						/>
						<Text style={styles.moreHeadText}>
							{`Weitere Trainings · ${(data?.sessions ?? []).length - DETAILED_SESSIONS}`}
						</Text>
					</Pressable>
					{moreOpen
						? (data?.sessions ?? []).slice(DETAILED_SESSIONS).map((s) => {
								const absent = s.userDbAbsent || s.userVirtualAbsent;
								return (
									<View key={s.id} style={styles.laterRow}>
										<View style={{ flex: 1 }}>
											<Text style={styles.laterDate}>
												{metaDate(s.date)}
												{s.isExtra ? ' · Zusatz' : ''}
											</Text>
											<Text style={styles.laterMeta}>
												{s.cancelled
													? 'Abgesagt'
													: absent
														? 'Du bist abgemeldet'
														: `${s.attending.length} ziehen mit`}
											</Text>
										</View>
										{!s.cancelled ? (
											absent ? (
												<Button
													label="Wieder dabei"
													kind="ghost"
													small
													onPress={() =>
														act(() =>
															trainingAction(
																s.userDbAbsent ? 'cancel_absence' : 'weekday_override_yes',
																s.id
															)
														)
													}
												/>
											) : (
												<Button
													label="Abmelden"
													kind="ghost"
													small
													onPress={() => setAbsenceFor(s)}
												/>
											)
										) : null}
									</View>
								);
							})
						: null}
				</Card>
			) : null}

			<Sheet
				visible={absenceFor !== null}
				onClose={() => {
					setAbsenceFor(null);
					setAbsenceReason('');
				}}
				title={`${absenceFor?.isExtra ? 'Kann nicht' : 'Abmelden'} — ${absenceFor ? metaDate(absenceFor.date) : ''}`}
			>
				<Input
					placeholder={
						absenceFor?.isExtra ? 'Grund (optional)' : 'Begründung (mind. 10 Zeichen)'
					}
					multiline
					autoFocus
					value={absenceReason}
					onChangeText={setAbsenceReason}
				/>
				<View style={styles.sheetActions}>
					<Button
						label="Abbrechen"
						kind="ghost"
						onPress={() => {
							setAbsenceFor(null);
							setAbsenceReason('');
						}}
					/>
					<Button
						label={absenceFor?.isExtra ? 'Absagen' : 'Abmelden'}
						onPress={submitAbsence}
					/>
				</View>
			</Sheet>

			<Sheet
				visible={adminFor !== null}
				onClose={() => setAdminFor(null)}
				title={`Admin — ${adminFor ? metaDate(adminFor.date) : ''}`}
			>
				<Pressable
					style={({ pressed }) => [styles.spotOption, pressed && { opacity: 0.7 }]}
					onPress={() => {
						const session = adminFor!;
						setAdminFor(null);
						setSpotFor(session);
					}}
				>
					<Ionicons name="location-outline" size={18} color={colors.fg + textAlpha.secondary} />
					<Text style={styles.spotOptionText}>Spot festlegen</Text>
				</Pressable>
				<Pressable
					style={({ pressed }) => [styles.spotOption, pressed && { opacity: 0.7 }]}
					onPress={() => {
						const session = adminFor!;
						setAdminFor(null);
						Alert.alert(
							'Training absagen?',
							`${metaDate(session.date)} — alle Angemeldeten bekommen Push.`,
							[
								{ text: 'Zurück', style: 'cancel' },
								{
									text: 'Absagen',
									style: 'destructive',
									onPress: () => act(() => adminTraining('cancel_session', session.id))
								}
							]
						);
					}}
				>
					<Ionicons name="close-circle-outline" size={18} color={colors.danger} />
					<Text style={[styles.spotOptionText, { color: colors.danger }]}>Training absagen</Text>
				</Pressable>
			</Sheet>

			<Sheet
				visible={spotFor !== null}
				onClose={() => setSpotFor(null)}
				title={`Spot festlegen — ${spotFor ? metaDate(spotFor.date) : ''}`}
				scroll={false}
			>
				<ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ gap: 8 }}>
					{spotFor?.overrideSpot ? (
						<Pressable
							style={({ pressed }) => [styles.spotOption, pressed && { opacity: 0.7 }]}
							onPress={() => {
								const session = spotFor;
								setSpotFor(null);
								act(() => adminTraining('set_spot', session.id, { spotId: null }));
							}}
						>
							<Ionicons name="refresh-outline" size={17} color={colors.warning} />
							<Text style={[styles.spotOptionText, { color: colors.warning }]}>
								Festlegung aufheben (zurück zum Voting)
							</Text>
						</Pressable>
					) : null}
					{(data?.allSpots ?? []).map((sp) => (
						<Pressable
							key={sp.id}
							style={({ pressed }) => [styles.spotOption, pressed && { opacity: 0.7 }]}
							onPress={() => {
								const session = spotFor!;
								setSpotFor(null);
								act(() => adminTraining('set_spot', session.id, { spotId: sp.id }));
							}}
						>
							<Ionicons name="location-outline" size={17} color={colors.textSecondary} />
							<Text style={styles.spotOptionText}>{sp.name}</Text>
							<Text style={styles.spotOptionCity}>{sp.city}</Text>
						</Pressable>
					))}
				</ScrollView>
			</Sheet>

			{/* „Bin da": Standort teilen, andere am Spot finden */}
			{/* Karte drin: kein Sheet-Scrollen, sonst kämpfen Karte und Fläche
			    um jede vertikale Bewegung. */}
			<Sheet
				visible={meetOpen}
				onClose={() => setMeetOpen(false)}
				title="Wer ist am Spot?"
				scroll={false}
			>
				{live === null ? (
					<Text style={styles.meetHint}>Lade …</Text>
				) : !live.sharing ? (
					<>
						<Text style={styles.meetHint}>
							Teile deinen Standort, um zu sehen, wer schon da ist. Sichtbar bist
							du nur für Leute, die ebenfalls teilen — und nach 45 Minuten ohne
							Aktualisierung verschwindet dein Punkt automatisch.
						</Text>
						<Button
							label={liveBusy ? 'Ortet …' : '📍 Meinen Standort teilen'}
							wide
							onPress={shareMyLocation}
						/>
					</>
				) : (
					<>
						<NativeMap
							markers={live.positions.map((pos) => ({
								id: pos.userId,
								name: pos.username,
								lat: pos.latitude,
								lon: pos.longitude,
								kind: pos.userId === me?.id ? 'main' : 'person',
								color: pos.userId === me?.id ? colors.accent : '#2563eb',
								avatarUrl: pos.avatar
							}))}
							height={300}
							zoom={16}
						/>
						<Text style={styles.meetHint}>
							{live.positions.length === 1
								? 'Nur du teilst gerade — die anderen erscheinen, sobald sie auch teilen.'
								: `${live.positions.length} Personen am Start: ${live.positions.map((pos) => pos.username).join(', ')}`}
						</Text>
						<View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
							<Button
								label="Nicht mehr teilen"
								kind="ghost"
								onPress={async () => {
									try {
										await stopLivePosition();
										await loadLive();
									} catch (e) {
										Alert.alert('Fehler', e instanceof Error ? e.message : 'Fehlgeschlagen');
									}
								}}
							/>
							<Button label={liveBusy ? '…' : 'Aktualisieren'} onPress={shareMyLocation} />
						</View>
					</>
				)}
			</Sheet>

			{/* Zusatztraining: spontaner Termin neben Dienstag/Donnerstag */}
			<Sheet
				visible={extraOpen}
				onClose={() => setExtraOpen(false)}
				title="Zusatztraining eintragen"
			>
				<Text style={styles.meetHint}>
					Für spontane Termine. Alle können sich anmelden und den Spot wählen —
					die Statistik bleibt unberührt.
				</Text>
				<DateField
					value={extraForm.date}
					onChange={(v) => setExtraForm({ ...extraForm, date: v })}
					min={data?.calendarToday}
					placeholder="Tag wählen"
				/>
				<View style={{ flexDirection: 'row', gap: 8 }}>
					<View style={{ flex: 1 }}>
						<Input
							placeholder="Von (18:15)"
							value={extraForm.start}
							onChangeText={(v) => setExtraForm({ ...extraForm, start: v })}
						/>
					</View>
					<View style={{ flex: 1 }}>
						<Input
							placeholder="Bis (20:15)"
							value={extraForm.end}
							onChangeText={(v) => setExtraForm({ ...extraForm, end: v })}
						/>
					</View>
				</View>
				<Input
					placeholder="Notiz (optional)"
					value={extraForm.note}
					onChangeText={(v) => setExtraForm({ ...extraForm, note: v })}
				/>
				<View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
					<Button label="Abbrechen" kind="ghost" onPress={() => setExtraOpen(false)} />
					<Button
						label={extraBusy ? 'Wird eingetragen …' : 'Eintragen'}
						onPress={submitExtra}
						disabled={extraBusy}
					/>
				</View>
			</Sheet>

			{/* Spot-Voting: Vorschlag mit Suchfeld — wie auf der Website */}
			<Sheet
				visible={voteFor !== null}
				onClose={() => setVoteFor(null)}
				title="Spot vorschlagen"
				scroll={false}
			>
				<Input
					placeholder="Spot oder Ort suchen …"
					value={voteQuery}
					onChangeText={setVoteQuery}
					autoFocus
				/>
				<ScrollView style={{ maxHeight: 340 }} keyboardShouldPersistTaps="handled">
					{(data?.allSpots ?? [])
						.filter((sp) => {
							const q = voteQuery.trim().toLowerCase();
							if (!q) return true;
							return (
								sp.name.toLowerCase().includes(q) || sp.city.toLowerCase().includes(q)
							);
						})
						.slice(0, 30)
						.map((sp) => (
							<Pressable
								key={sp.id}
								style={({ pressed }) => [styles.spotOption, pressed && { opacity: 0.7 }]}
								onPress={() => {
									const session = voteFor!;
									setVoteFor(null);
									act(() => trainingAction('vote_spot', session.id, { spotId: sp.id }));
								}}
							>
								<Ionicons name="location-outline" size={17} color={colors.textSecondary} />
								<Text style={styles.spotOptionText}>{sp.name}</Text>
								<Text style={styles.spotOptionCity}>{sp.city}</Text>
							</Pressable>
						))}
				</ScrollView>
			</Sheet>
		</Screen>
	);
}

const makeStyles = (colors: ThemeColors) =>
	StyleSheet.create({
		rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
		sectionLabel: {
			color: colors.fg + textAlpha.secondary,
			fontFamily: fonts.sansSemi,
			fontSize: 11,
			lineHeight: 14,
			letterSpacing: 1.2
		},
		streakChip: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: 8,
			alignSelf: 'flex-start',
			backgroundColor: colors.accent + '1a',
			borderRadius: 999,
			paddingHorizontal: 12,
			paddingVertical: 4
		},
		streakText: {
			color: colors.accent,
			fontSize: 14,
			lineHeight: 21,
			fontFamily: fonts.sansSemi
		},
		updateCard: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: 12,
			backgroundColor: colors.accent + '1a'
		},
		updateTitle: {
			color: colors.fg + textAlpha.primary,
			fontFamily: fonts.sansBold,
			fontSize: 14,
			lineHeight: 20
		},
		updateText: {
			color: colors.fg + textAlpha.secondary,
			fontFamily: fonts.sans,
			fontSize: 12,
			lineHeight: 16,
			marginTop: 2
		},
		absenceRow: { gap: 3, alignItems: 'flex-start' },
		absenceReason: {
			color: colors.fg + textAlpha.muted,
			fontSize: 12,
			lineHeight: 17,
			fontFamily: fonts.sans,
			fontStyle: 'italic',
			// Unter dem Namen, auf Höhe des Texts im Chip — und ohne Kürzung.
			marginLeft: 38,
			paddingRight: 4
		},
		tripCard: { backgroundColor: colors.accentBlue + '14' },
		tripKicker: {
			color: colors.accentBlue,
			fontFamily: fonts.displayMedium,
			fontSize: 12, lineHeight: 16,
			letterSpacing: 2.5
		},
		tripTitle: { color: colors.fg + textAlpha.primary, fontSize: 16, lineHeight: 22, fontFamily: fonts.sansBold, marginTop: 4 },
		sessionCard: { padding: 0, overflow: 'hidden' },
		hero: { width: '100%', height: 160, backgroundColor: colors.hover },
		heroFade: {
			position: 'absolute',
			left: 0,
			right: 0,
			bottom: 0,
			height: 56,
			backgroundColor: colors.card,
			opacity: 0.55
		},
		band: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: 8,
			paddingHorizontal: 16,
			paddingTop: 14,
			paddingBottom: 2
		},
		bandDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
		bandText: {
			color: colors.accent,
			fontFamily: fonts.sansSemi,
			fontSize: 11,
			lineHeight: 14,
			letterSpacing: 1.2
		},
		moreBtn: {
			width: 38,
			height: 38,
			borderRadius: 999,
			backgroundColor: colors.hover,
			alignItems: 'center',
			justifyContent: 'center'
		},
		sessionBody: { padding: 16, gap: 8 },
		dayRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
		dayName: {
			color: colors.fg + textAlpha.primary,
			fontFamily: fonts.display,
			fontSize: 30, lineHeight: 32,
			letterSpacing: 1
		},
		countChip: {
			backgroundColor: colors.hover,
			borderRadius: 999,
			paddingHorizontal: 12,
			paddingVertical: 4
		},
		countChipText: { color: colors.fg + textAlpha.secondary, fontSize: 12, lineHeight: 16, fontFamily: fonts.sansMedium },
		metaLine: { color: colors.fg + textAlpha.secondary, fontFamily: fonts.sans, fontSize: 14, lineHeight: 20 },
		spotRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
		spotText: { color: colors.fg + textAlpha.primary, fontSize: 14, lineHeight: 20, fontFamily: fonts.sansBold, flexShrink: 1 },
		groupLabel: {
			fontFamily: fonts.displayMedium,
			fontSize: 14, lineHeight: 20,
			letterSpacing: 2,
			marginTop: 8,
			color: colors.textSecondary
		},
		chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
		emptyDash: { color: colors.fg + textAlpha.muted, fontSize: 14, lineHeight: 20 },
		voteRow: {
			gap: 3,
			backgroundColor: colors.bgSecondary,
			borderRadius: 12,
			borderWidth: 1,
			borderColor: colors.border,
			paddingHorizontal: 12,
			paddingVertical: 12
		},
		proposeSpotRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
		extraRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
		extraNote: {
			flex: 1,
			color: colors.fg + textAlpha.muted,
			fontSize: 12,
			lineHeight: 17,
			fontFamily: fonts.sans
		},
		extraRemove: { color: colors.danger, fontSize: 12, lineHeight: 17, fontFamily: fonts.sansSemi },
	meetHint: {
		color: colors.fg + textAlpha.secondary,
		fontSize: 13,
		lineHeight: 19,
		fontFamily: fonts.sans
	},
	proposeSpotText: {
		color: colors.accentBlue,
		fontSize: 13,
		lineHeight: 18,
		fontFamily: fonts.sansSemi
	},
	voteDot: {
			width: 15,
			height: 15,
			borderRadius: 12,
			borderWidth: 1.5,
			borderColor: colors.textMuted
		},
		voteRowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
		voteMain: { flex: 1, gap: 2 },
		voteName: { color: colors.fg + textAlpha.primary, fontSize: 14, lineHeight: 20, fontFamily: fonts.sansSemi },
		voteMeta: { color: colors.fg + textAlpha.muted, fontSize: 12, lineHeight: 17, fontFamily: fonts.sans },
		// Eigener Knopf fürs Voting, damit der Zeilenklick zur Spot-Seite gehört.
		voteBtn: { paddingVertical: 6, paddingHorizontal: 4 },
		voteBtnFor: { color: colors.accent, fontSize: 13, lineHeight: 18, fontFamily: fonts.sansSemi },
		voteBtnUndo: { color: colors.fg + textAlpha.muted, fontSize: 13, lineHeight: 18, fontFamily: fonts.sans },
		voteCount: { color: colors.fg + textAlpha.secondary, fontSize: 14, lineHeight: 20, fontFamily: fonts.sansBold },
		actions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8 },
		soloCard: { paddingVertical: 12 },
		moreHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
		moreHeadText: {
			color: colors.accentBlue,
			fontSize: 14,
			lineHeight: 20,
			fontFamily: fonts.sansSemi
		},
		laterRow: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: 10,
			borderTopWidth: StyleSheet.hairlineWidth,
			borderTopColor: colors.border,
			paddingTop: 10
		},
		laterDate: {
			color: colors.fg + textAlpha.primary,
			fontSize: 14,
			lineHeight: 20,
			fontFamily: fonts.sansSemi
		},
		laterMeta: { color: colors.fg + textAlpha.muted, fontSize: 12, lineHeight: 17 },
		metaBlock: { alignItems: 'flex-end', gap: 3, paddingHorizontal: 4, marginTop: 2 },
		metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
		metaSmall: {
			color: colors.fg + textAlpha.muted,
			fontSize: 12,
			lineHeight: 16,
			fontFamily: fonts.sans
		},
		spotEmptyRow: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: 6,
			marginTop: 4
		},
		spotEmptyText: {
			flex: 1,
			color: colors.fg + textAlpha.muted,
			fontSize: 13,
			lineHeight: 18,
			fontFamily: fonts.sans
		},
		soloAction: { color: colors.accent, fontSize: 13, lineHeight: 18, fontFamily: fonts.sansSemi },
		soloUndo: {
			color: colors.fg + textAlpha.secondary,
			fontSize: 13,
			lineHeight: 18,
			fontFamily: fonts.sans
		},
		soloTitle: { color: colors.fg + textAlpha.primary, fontSize: 14, lineHeight: 20, fontFamily: fonts.sansBold },
		sheetActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
		spotOption: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: 8,
			backgroundColor: colors.hover,
			borderRadius: 12,
			paddingHorizontal: 12,
			paddingVertical: 12
		},
		spotOptionText: { color: colors.fg + textAlpha.primary, fontSize: 14, lineHeight: 20, fontFamily: fonts.sansSemi, flex: 1 },
		spotOptionCity: { color: colors.fg + textAlpha.muted, fontSize: 12, lineHeight: 16 }
	});
