import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, TextInput, Modal } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../../lib/theme';
import { Card, TopBar, InitialsRow, Pill, Screen, ErrorCard, Button } from '../../lib/ui';
import { useData } from '../../lib/store';
import { getTraining, trainingAction, type TrainingSession } from '../../lib/api';
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
					<Card key={s.id}>
						<View style={styles.cardHead}>
							<View style={{ gap: 2 }}>
								<Text style={styles.cardDate}>{formatDate(s.date)}</Text>
								<View style={styles.metaRow}>
									<Ionicons name="time-outline" size={13} color={colors.textMuted} />
									<Text style={styles.cardTime}>
										{s.timeStart}–{s.timeEnd}
									</Text>
								</View>
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
										<Ionicons name="location" size={16} color={colors.accent} />
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
									<View style={styles.voteBlock}>
										<View style={styles.voteTitleRow}>
											<Ionicons name="megaphone-outline" size={14} color={colors.accentBlue} />
											<Text style={styles.voteTitle}>Spot-Voting offen</Text>
										</View>
										{s.spotVotes.map((v) => {
											const mine = s.userVotedSpotId === v.spotId;
											return (
												<Pressable
													key={v.spotId}
													style={({ pressed }) => [
														styles.voteRow,
														mine && styles.voteRowMine,
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
															<Ionicons name="checkmark-circle" size={16} color={colors.accent} />
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
											<Text style={styles.voteEmpty}>Noch keine Stimmen — sei die erste Stimme über den Spots-Tab.</Text>
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
								</View>
							</>
						) : null}
					</Card>
				);
			})}

			{/* Abmelde-Dialog als Bottom-Sheet */}
			<Modal visible={absenceFor !== null} transparent animationType="slide">
				<View style={styles.sheetBackdrop}>
					<View style={styles.sheet}>
						<View style={styles.sheetHandle} />
						<Text style={styles.sheetTitle}>
							Abmelden — {absenceFor ? formatDate(absenceFor.date) : ''}
						</Text>
						<TextInput
							style={styles.sheetInput}
							placeholder="Begründung (mind. 10 Zeichen)"
							placeholderTextColor={colors.textMuted}
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
					</View>
				</View>
			</Modal>
		</Screen>
	);
}

const styles = StyleSheet.create({
	cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
	cardDate: { color: colors.text, fontSize: 17, fontWeight: '800' },
	metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
	cardTime: { color: colors.textMuted, fontSize: 13 },
	spotRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
	spotText: { color: colors.text, fontSize: 14, fontWeight: '700', flex: 1 },
	voteMeta: { color: colors.textMuted, fontSize: 12 },
	voteBlock: { marginTop: 12, gap: 6 },
	voteTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 },
	voteTitle: { color: colors.accentBlue, fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },
	voteRow: { borderRadius: 12, overflow: 'hidden', backgroundColor: colors.bgSecondary },
	voteRowMine: { borderWidth: 1, borderColor: colors.accentDim },
	voteFill: { position: 'absolute', top: 0, bottom: 0, left: 0, borderRadius: 12 },
	voteContent: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
		paddingHorizontal: 12,
		paddingVertical: 11
	},
	voteDot: {
		width: 14,
		height: 14,
		borderRadius: 7,
		borderWidth: 1.5,
		borderColor: colors.textMuted,
		marginHorizontal: 1
	},
	voteName: { color: colors.text, fontSize: 14, fontWeight: '700', flexShrink: 1 },
	voteCity: { color: colors.textMuted, fontSize: 12, flex: 1 },
	voteCount: { color: colors.textSecondary, fontSize: 14, fontWeight: '800' },
	voteEmpty: { color: colors.textMuted, fontSize: 13 },
	attendRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
	attendMeta: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
	actions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
	sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
	sheet: {
		backgroundColor: colors.card,
		borderTopLeftRadius: 24,
		borderTopRightRadius: 24,
		padding: 20,
		paddingBottom: 32
	},
	sheetHandle: {
		alignSelf: 'center',
		width: 36,
		height: 4,
		borderRadius: 2,
		backgroundColor: colors.hover,
		marginBottom: 14
	},
	sheetTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
	sheetInput: {
		backgroundColor: colors.bgSecondary,
		borderColor: colors.border,
		borderWidth: 1,
		borderRadius: 12,
		color: colors.text,
		padding: 14,
		minHeight: 76,
		marginTop: 14,
		fontSize: 15,
		textAlignVertical: 'top'
	},
	sheetActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 16 }
});
