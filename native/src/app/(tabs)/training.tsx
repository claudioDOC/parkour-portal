import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, fonts } from '../../lib/theme';
import {
	Card,
	TopBar,
	InitialsRow,
	Pill,
	Screen,
	ErrorCard,
	Button,
	Sheet,
	Input
} from '../../lib/ui';
import { useData } from '../../lib/store';
import { getTraining, trainingAction, adminTraining, type TrainingSession } from '../../lib/api';
import { useAuth } from '../_layout';

function formatDate(ymd: string): string {
	const d = new Date(`${ymd}T12:00:00`);
	return d.toLocaleDateString('de-CH', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function Training() {
	const { me } = useAuth();
	const { data, error, refresh, refreshing, onRefresh } = useData('training', getTraining);
	// Abmelde-Dialog: Session + Begründung (min. 10 Zeichen, wie im Web)
	const [absenceFor, setAbsenceFor] = useState<TrainingSession | null>(null);
	const [absenceReason, setAbsenceReason] = useState('');
	// Admin: Spot-festlegen-Dialog
	const [spotFor, setSpotFor] = useState<TrainingSession | null>(null);
	const isAdmin = me?.role === 'admin';

	const act = async (fn: () => Promise<unknown>) => {
		try {
			await fn();
			await refresh();
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

	const confirmCancel = (s: TrainingSession) => {
		Alert.alert('Training absagen?', `${formatDate(s.date)} — alle Angemeldeten bekommen Push.`, [
			{ text: 'Zurück', style: 'cancel' },
			{
				text: 'Absagen',
				style: 'destructive',
				onPress: () => act(() => adminTraining('cancel_session', s.id))
			}
		]);
	};

	const optIn = data?.viewerTrainingAttendance === 'opt_in';

	return (
		<Screen refreshing={refreshing} onRefresh={onRefresh}>
			<TopBar kicker="Planung" title="Training" />
			{error && !data ? <ErrorCard message={error} /> : null}

			{(data?.sessions ?? []).map((s) => {
				const iAmIn = me ? s.attending.some((a) => a.id === me.id) : false;
				const absent = s.userDbAbsent || s.userVirtualAbsent;
				const maxVotes = Math.max(1, ...s.spotVotes.map((v) => v.voteCount));
				return (
					<Card key={s.id} style={{ gap: 14 }}>
						<View style={styles.cardHead}>
							<View style={{ gap: 3 }}>
								<Text style={styles.cardDate}>{formatDate(s.date)}</Text>
								<Text style={styles.cardTime}>
									{s.timeStart}–{s.timeEnd} Uhr
								</Text>
							</View>
							{s.cancelled ? (
								<Pill label="Abgesagt" color={colors.danger} />
							) : iAmIn ? (
								<Pill label="✓ Dabei" color={colors.success} />
							) : absent ? (
								<Pill label="Abgemeldet" color={colors.textMuted} />
							) : null}
						</View>

						{!s.cancelled ? (
							<>
								{s.overrideSpot || (s.votingClosed && (s.winnerSpot || s.autoSpot)) ? (
									<View style={styles.spotRow}>
										<View style={styles.spotIcon}>
											<Ionicons name="location" size={16} color={colors.accent} />
										</View>
										<Text style={styles.spotText}>
											{s.overrideSpot
												? `${s.overrideSpot.name} · ${s.overrideSpot.city}`
												: s.winnerSpot
													? `${s.winnerSpot.name} · ${s.winnerSpot.city}`
													: `${s.autoSpot!.name} · ${s.autoSpot!.city}`}
										</Text>
										{s.overrideSpot ? (
											<Pill label="Fix" color={colors.accent} filled />
										) : s.winnerSpot ? (
											<Text style={styles.voteMeta}>{s.winnerSpot.votes} Stimmen</Text>
										) : (
											<Text style={styles.voteMeta}>Auto</Text>
										)}
									</View>
								) : (
									<View style={{ gap: 7 }}>
										<Text style={styles.voteTitle}>SPOT-VOTING OFFEN</Text>
										{s.spotVotes.map((v) => {
											const mine = s.userVotedSpotId === v.spotId;
											return (
												<Pressable
													key={v.spotId}
													style={({ pressed }) => [styles.voteRow, pressed && { opacity: 0.75 }]}
													onPress={() =>
														act(() =>
															mine
																? trainingAction('remove_vote', s.id)
																: trainingAction('vote_spot', s.id, { spotId: v.spotId })
														)
													}
												>
													<View
														style={[
															styles.voteFill,
															{
																width: `${(v.voteCount / maxVotes) * 100}%`,
																backgroundColor: mine ? colors.accentDim : colors.hover
															}
														]}
													/>
													<View style={styles.voteContent}>
														{mine ? (
															<Ionicons name="checkmark-circle" size={17} color={colors.accent} />
														) : (
															<View style={styles.voteDot} />
														)}
														<Text style={[styles.voteName, mine && { color: colors.accent }]}>
															{v.spotName}
														</Text>
														<Text style={styles.voteCity}>{v.spotCity}</Text>
														<Text style={[styles.voteCount, mine && { color: colors.accent }]}>
															{v.voteCount}
														</Text>
													</View>
												</Pressable>
											);
										})}
										{s.spotVotes.length === 0 ? (
											<Text style={styles.voteEmpty}>
												Noch keine Stimmen — stimm als Erster ab.
											</Text>
										) : null}
									</View>
								)}

								<View style={styles.attendRow}>
									<InitialsRow names={s.attending.map((a) => a.username)} />
									<Text style={styles.attendMeta}>
										{s.attending.length}/{s.totalMembers}
										{s.guests.length > 0 ? ` · ${s.guests.length} Gäste` : ''}
									</Text>
								</View>

								<View style={styles.actions}>
									{optIn ? (
										s.userHasRsvp ? (
											<Button
												label="Doch nicht"
												kind="ghost"
												onPress={() => act(() => trainingAction('rsvp_no', s.id))}
											/>
										) : (
											<Button
												label="Dabei!"
												onPress={() => act(() => trainingAction('rsvp_yes', s.id))}
											/>
										)
									) : absent ? (
										<Button
											label="Wieder dabei"
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
										<Button label="Abmelden" kind="ghost" onPress={() => setAbsenceFor(s)} />
									)}
									{isAdmin ? (
										<>
											<Button label="Spot festlegen" kind="ghost" small onPress={() => setSpotFor(s)} />
											<Button label="Absagen" kind="danger" small onPress={() => confirmCancel(s)} />
										</>
									) : null}
								</View>
							</>
						) : isAdmin ? (
							<Button
								label="Absage aufheben"
								kind="ghost"
								onPress={() => act(() => adminTraining('uncancel_session', s.id))}
							/>
						) : null}
					</Card>
				);
			})}

			{/* Abmelden mit Begründung */}
			<Sheet
				visible={absenceFor !== null}
				onClose={() => {
					setAbsenceFor(null);
					setAbsenceReason('');
				}}
				title={`Abmelden — ${absenceFor ? formatDate(absenceFor.date) : ''}`}
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

			{/* Admin: Spot festlegen — schlägt Voting und Auto-Wahl */}
			<Sheet
				visible={spotFor !== null}
				onClose={() => setSpotFor(null)}
				title={`Spot festlegen — ${spotFor ? formatDate(spotFor.date) : ''}`}
			>
				<ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ gap: 7 }}>
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

const styles = StyleSheet.create({
	cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
	cardDate: { color: colors.text, fontFamily: fonts.display, fontSize: 27, lineHeight: 28, letterSpacing: 0.5 },
	cardTime: { color: colors.textMuted, fontSize: 13.5, fontFamily: fonts.sans },
	spotRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
	spotIcon: {
		width: 32,
		height: 32,
		borderRadius: 16,
		backgroundColor: colors.accent + '1a',
		alignItems: 'center',
		justifyContent: 'center'
	},
	spotText: { color: colors.text, fontSize: 14.5, fontFamily: fonts.sansBold, flex: 1 },
	voteMeta: { color: colors.textMuted, fontSize: 12 },
	voteTitle: { color: colors.accentBlue, fontFamily: fonts.displayMedium, fontSize: 14, letterSpacing: 2.5 },
	voteRow: { borderRadius: 13, overflow: 'hidden', backgroundColor: colors.bgSecondary },
	voteFill: { position: 'absolute', top: 0, bottom: 0, left: 0 },
	voteContent: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 9,
		paddingHorizontal: 13,
		paddingVertical: 12
	},
	voteDot: {
		width: 15,
		height: 15,
		borderRadius: 8,
		borderWidth: 1.5,
		borderColor: colors.textMuted
	},
	voteName: { color: colors.text, fontSize: 14.5, fontFamily: fonts.sansSemi, flexShrink: 1 },
	voteCity: { color: colors.textMuted, fontSize: 12.5, flex: 1 },
	voteCount: { color: colors.textSecondary, fontSize: 15, fontFamily: fonts.sansBold },
	voteEmpty: { color: colors.textMuted, fontSize: 13 },
	attendRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
	attendMeta: { color: colors.textMuted, fontSize: 13, fontFamily: fonts.sansSemi },
	actions: { flexDirection: 'row', alignItems: 'center', gap: 9, flexWrap: 'wrap' },
	sheetActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
	spotOption: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 10,
		backgroundColor: colors.hover,
		borderRadius: 13,
		paddingHorizontal: 14,
		paddingVertical: 13
	},
	spotOptionText: { color: colors.text, fontSize: 14.5, fontWeight: '600', flex: 1 },
	spotOptionCity: { color: colors.textMuted, fontSize: 12.5 }
});
