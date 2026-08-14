import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { fonts, type ThemeColors } from '../../lib/theme';
import { useTheme, useThemedStyles } from '../../lib/themeContext';
import { gradientFill } from '../../lib/gfx';
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
import {
	getTraining,
	getPendingTrip,
	getStats,
	logSolo,
	trainingAction,
	adminTraining,
	type TrainingSession
} from '../../lib/api';
import { useAuth } from '../_layout';

/** Sprüche der Website-Startseite — gleiche Rotation nach Kalendertag. */
const GREETINGS = [
	'Bereit für den nächsten Sprung?',
	'Der Beton wartet auf dich.',
	'Präzis bleiben. 🎯',
	'Heute wieder fliegen?',
	'Ein Sprung nach dem anderen.',
	'Send it! 🚀',
	'Die Mauer springt nicht über sich selbst.',
	'Flow > Kraft.',
	'Erst schauen, dann springen — aber springen.'
];

function greetingFor(calendarToday: string): string {
	const [y, m, d] = calendarToday.split('-').map(Number);
	const dayIndex = Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
	return GREETINGS[dayIndex % GREETINGS.length];
}

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
	const band = useMemo(() => gradientFill(colors), [colors]);

	const training = useData('training', getTraining);
	const pending = useData('trip-pending', getPendingTrip);
	const stats = useData('stats', getStats);

	const [absenceFor, setAbsenceFor] = useState<TrainingSession | null>(null);
	const [absenceReason, setAbsenceReason] = useState('');
	const [spotFor, setSpotFor] = useState<TrainingSession | null>(null);
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
		if (absenceReason.trim().length < 10) {
			Alert.alert('Begründung zu kurz', 'Bitte mindestens 10 Zeichen — wie im Portal.');
			return;
		}
		const session = absenceFor;
		setAbsenceFor(null);
		await act(() => trainingAction('absence', session.id, { reason: absenceReason.trim() }));
		setAbsenceReason('');
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
				kicker="Übersicht"
				title="Dashboard"
				sub={
					<View style={{ gap: 8, marginTop: 8 }}>
						<Text style={styles.greeting}>
							Hey <Text style={styles.greetingName}>{me?.username}</Text>
							{data ? ` — ${greetingFor(data.calendarToday)}` : ''}
						</Text>
						{myStreak >= 2 ? (
							<Pill label={`🔥 ${myStreak}er-Streak`} color={colors.accent} />
						) : null}
					</View>
				}
			/>

			{training.error && !data ? <ErrorCard message={training.error} /> : null}

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

			<SectionTitle>Nächste Trainings</SectionTitle>

			{(data?.sessions ?? []).map((s, sessionIndex) => {
				const iAmIn = me ? s.attending.some((a) => a.id === me.id) : false;
				const absent = s.userDbAbsent || s.userVirtualAbsent;
				const spot = s.overrideSpot
					? { label: `${s.overrideSpot.name} · ${s.overrideSpot.city}`, fixed: true }
					: s.votingClosed && s.winnerSpot
						? { label: `${s.winnerSpot.name} · ${s.winnerSpot.city}`, fixed: false }
						: s.votingClosed && s.autoSpot
							? { label: `${s.autoSpot.name} · ${s.autoSpot.city} (Auto)`, fixed: false }
							: null;
				return (
					<Card key={s.id} style={styles.sessionCard}>
						{sessionIndex === 0 ? (
							<View style={styles.band}>
								<Image source={{ uri: band }} style={StyleSheet.absoluteFill} contentFit="fill" />
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
							</View>
							<Text style={styles.metaLine}>
								{metaDate(s.date)} · {s.timeStart} – {s.timeEnd}
							</Text>
							{sessionIndex === 0 && data?.trainingForecast?.summary ? (
								<Text style={styles.metaLine}>Prognose: {data.trainingForecast.summary}</Text>
							) : null}

							{!s.cancelled ? (
								<>
									{spot ? (
										<View style={styles.spotRow}>
											<Ionicons name="location" size={15} color={colors.accent} />
											<Text style={styles.spotText}>{spot.label}</Text>
											{spot.fixed ? <Pill label="Fix" color={colors.accent} filled /> : null}
										</View>
									) : s.spotVotes.length > 0 ? (
										<View style={{ gap: 8, marginTop: 4 }}>
											<GroupLabel color={colors.accentBlue}>
												{`Spot-Voting (${s.spotVotes.length})`}
											</GroupLabel>
											{s.spotVotes.map((v) => {
												const mine = s.userVotedSpotId === v.spotId;
												return (
													<Pressable
														key={v.spotId}
														style={({ pressed }) => [
															styles.voteRow,
															mine && { borderColor: colors.accent + '66' },
															pressed && { opacity: 0.75 }
														]}
														onPress={() =>
															act(() =>
																mine
																	? trainingAction('remove_vote', s.id)
																	: trainingAction('vote_spot', s.id, { spotId: v.spotId })
															)
														}
													>
														{mine ? (
															<Ionicons name="checkmark-circle" size={16} color={colors.accent} />
														) : (
															<View style={styles.voteDot} />
														)}
														<Text style={[styles.voteName, mine && { color: colors.accent }]}>
															{v.spotName}
														</Text>
														<Text style={styles.voteCount}>{v.voteCount}</Text>
													</Pressable>
												);
											})}
										</View>
									) : (
										<Text style={styles.metaLine}>Noch kein Spot vorgeschlagen</Text>
									)}

									<GroupLabel color={colors.success}>
										{`Zieht (${s.attending.length})`}
									</GroupLabel>
									<View style={styles.chipWrap}>
										{s.attending.map((a) => (
											<NameChip key={a.id} name={a.username} />
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
									<View style={styles.chipWrap}>
										{s.absences.map((a) => (
											<NameChip key={a.id} name={a.username} tone={colors.danger} />
										))}
										{s.absences.length === 0 ? <Text style={styles.emptyDash}>—</Text> : null}
									</View>

									<View style={styles.actions}>
										{iAmIn ? <Pill label="✓ Du ziehst mit" color={colors.success} /> : null}
										{optIn ? (
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
											<>
												<Button
													label="Spot festlegen"
													kind="ghost"
													small
													onPress={() => setSpotFor(s)}
												/>
												<Button
													label="Absagen"
													kind="danger"
													small
													onPress={() =>
														Alert.alert(
															'Training absagen?',
															`${metaDate(s.date)} — alle Angemeldeten bekommen Push.`,
															[
																{ text: 'Zurück', style: 'cancel' },
																{
																	text: 'Absagen',
																	style: 'destructive',
																	onPress: () => act(() => adminTraining('cancel_session', s.id))
																}
															]
														)
													}
												/>
											</>
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

			<Card style={styles.soloCard}>
				<View style={styles.soloRow}>
					<Ionicons name="flash-outline" size={18} color={colors.accent} />
					<View style={{ flex: 1 }}>
						<Text style={styles.soloTitle}>Solo-Training</Text>
						<Text style={styles.soloText}>
							{data?.mySolo.countMonth ?? 0} diesen Monat
							{data?.mySolo.todayLogged ? '  ·  heute eingetragen ✓' : ''}
						</Text>
					</View>
					{data && !data.mySolo.todayLogged ? (
						<Button label="Heute eintragen" onPress={logSoloToday} kind="ghost" small />
					) : null}
				</View>
			</Card>

			<Sheet
				visible={absenceFor !== null}
				onClose={() => {
					setAbsenceFor(null);
					setAbsenceReason('');
				}}
				title={`Abmelden — ${absenceFor ? metaDate(absenceFor.date) : ''}`}
			>
				<Input
					placeholder="Begründung (mind. 10 Zeichen)"
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
					<Button label="Abmelden" onPress={submitAbsence} />
				</View>
			</Sheet>

			<Sheet
				visible={spotFor !== null}
				onClose={() => setSpotFor(null)}
				title={`Spot festlegen — ${spotFor ? metaDate(spotFor.date) : ''}`}
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
		</Screen>
	);
}

const makeStyles = (colors: ThemeColors) =>
	StyleSheet.create({
		rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
		greeting: { color: colors.textSecondary, fontFamily: fonts.sans, fontSize: 16, lineHeight: 23 },
		greetingName: { color: colors.text, fontFamily: fonts.sansBold },
		tripCard: { backgroundColor: colors.accentBlue + '14' },
		tripKicker: {
			color: colors.accentBlue,
			fontFamily: fonts.displayMedium,
			fontSize: 13, lineHeight: 18,
			letterSpacing: 2.5
		},
		tripTitle: { color: colors.text, fontSize: 16, lineHeight: 21, fontFamily: fonts.sansBold, marginTop: 4 },
		sessionCard: { padding: 0, overflow: 'hidden' },
		band: { height: 34, justifyContent: 'center', paddingHorizontal: 16 },
		bandText: {
			color: colors.onAccent,
			fontFamily: fonts.displayMedium,
			fontSize: 15, lineHeight: 21,
			letterSpacing: 3
		},
		sessionBody: { padding: 16, gap: 8 },
		dayRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
		dayName: {
			color: colors.text,
			fontFamily: fonts.display,
			fontSize: 28, lineHeight: 30,
			letterSpacing: 1
		},
		countChip: {
			backgroundColor: colors.hover,
			borderRadius: 999,
			paddingHorizontal: 12,
			paddingVertical: 4
		},
		countChipText: { color: colors.textSecondary, fontSize: 13, lineHeight: 18, fontFamily: fonts.sansMedium },
		metaLine: { color: colors.textSecondary, fontFamily: fonts.sans, fontSize: 15, lineHeight: 21 },
		spotRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
		spotText: { color: colors.text, fontSize: 15, lineHeight: 21, fontFamily: fonts.sansBold, flexShrink: 1 },
		groupLabel: {
			fontFamily: fonts.displayMedium,
			fontSize: 15, lineHeight: 21,
			letterSpacing: 2,
			marginTop: 8,
			color: colors.textSecondary
		},
		chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
		emptyDash: { color: colors.textMuted, fontSize: 15, lineHeight: 21 },
		voteRow: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: 8,
			backgroundColor: colors.bgSecondary,
			borderRadius: 12,
			borderWidth: 1,
			borderColor: colors.border,
			paddingHorizontal: 12,
			paddingVertical: 12
		},
		voteDot: {
			width: 15,
			height: 15,
			borderRadius: 12,
			borderWidth: 1.5,
			borderColor: colors.textMuted
		},
		voteName: { color: colors.text, fontSize: 15, lineHeight: 21, fontFamily: fonts.sansSemi, flex: 1 },
		voteCount: { color: colors.textSecondary, fontSize: 15, lineHeight: 21, fontFamily: fonts.sansBold },
		actions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8 },
		soloCard: { paddingVertical: 12 },
		soloRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
		soloTitle: { color: colors.text, fontSize: 15, lineHeight: 21, fontFamily: fonts.sansBold },
		soloText: { color: colors.textSecondary, fontSize: 13, lineHeight: 18, fontFamily: fonts.sans, marginTop: 0 },
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
		spotOptionText: { color: colors.text, fontSize: 15, lineHeight: 21, fontFamily: fonts.sansSemi, flex: 1 },
		spotOptionCity: { color: colors.textMuted, fontSize: 13, lineHeight: 18 }
	});
