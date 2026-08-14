import { useCallback, useState } from 'react';
import {
	View,
	Text,
	ScrollView,
	RefreshControl,
	StyleSheet,
	Pressable,
	Alert,
	TextInput,
	Modal
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { colors } from '../../lib/theme';
import {
	getTraining,
	trainingAction,
	type TrainingPayload,
	type TrainingSession
} from '../../lib/api';
import { useAuth } from '../_layout';

function formatDate(ymd: string): string {
	const d = new Date(`${ymd}T12:00:00`);
	return d.toLocaleDateString('de-CH', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function Training() {
	const [data, setData] = useState<TrainingPayload | null>(null);
	const [refreshing, setRefreshing] = useState(false);
	const [error, setError] = useState('');
	// Abmelde-Dialog: Session + Begründung (min. 10 Zeichen, wie im Web)
	const [absenceFor, setAbsenceFor] = useState<TrainingSession | null>(null);
	const [absenceReason, setAbsenceReason] = useState('');
	const { me } = useAuth();

	const load = useCallback(async () => {
		try {
			setData(await getTraining());
			setError('');
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Laden fehlgeschlagen');
		}
	}, []);

	useFocusEffect(
		useCallback(() => {
			load();
		}, [load])
	);

	const onRefresh = async () => {
		setRefreshing(true);
		await load();
		setRefreshing(false);
	};

	const act = async (fn: () => Promise<unknown>) => {
		try {
			await fn();
			await load();
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
		<ScrollView
			style={styles.screen}
			contentContainerStyle={styles.content}
			refreshControl={
				<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
			}
		>
			<Text style={styles.kicker}>PLANUNG</Text>
			<Text style={styles.title}>Training</Text>
			{error ? <Text style={styles.error}>{error}</Text> : null}

			{(data?.sessions ?? []).map((s) => {
				const iAmIn = me ? s.attending.some((a) => a.id === me.id) : false;
				const absent = s.userDbAbsent || s.userVirtualAbsent;
				return (
					<View key={s.id} style={styles.card}>
						<View style={styles.cardHead}>
							<Text style={styles.cardDate}>{formatDate(s.date)}</Text>
							<Text style={styles.cardTime}>
								{s.timeStart}–{s.timeEnd}
							</Text>
						</View>

						{s.cancelled ? (
							<Text style={styles.cancelled}>Abgesagt</Text>
						) : (
							<>
								{/* Spot-Status */}
								{s.overrideSpot ? (
									<Text style={styles.spotFixed}>
										Spot steht fest: {s.overrideSpot.name} · {s.overrideSpot.city}
									</Text>
								) : s.votingClosed && s.winnerSpot ? (
									<Text style={styles.spotFixed}>
										Gewonnen: {s.winnerSpot.name} · {s.winnerSpot.city} ({s.winnerSpot.votes} Stimmen)
									</Text>
								) : s.votingClosed && s.autoSpot ? (
									<Text style={styles.spotFixed}>
										Auto-Wahl: {s.autoSpot.name} · {s.autoSpot.city}
									</Text>
								) : (
									<View style={styles.voteBlock}>
										<Text style={styles.voteTitle}>Spot-Voting offen</Text>
										{s.spotVotes.map((v) => {
											const mine = s.userVotedSpotId === v.spotId;
											return (
												<Pressable
													key={v.spotId}
													style={[styles.voteRow, mine && styles.voteRowMine]}
													onPress={() =>
														act(() =>
															mine
																? trainingAction('remove_vote', s.id)
																: trainingAction('vote_spot', s.id, { spotId: v.spotId })
														)
													}
												>
													<Text style={[styles.voteName, mine && { color: colors.onAccent }]}>
														{v.spotName} · {v.spotCity}
													</Text>
													<Text style={[styles.voteCount, mine && { color: colors.onAccent }]}>
														{v.voteCount}
													</Text>
												</Pressable>
											);
										})}
										{s.spotVotes.length === 0 ? (
											<Text style={styles.voteEmpty}>
												Noch keine Stimmen — im Portal einen Spot vorschlagen.
											</Text>
										) : null}
									</View>
								)}

								{/* Teilnahme */}
								<Text style={styles.attending}>
									{s.attending.length}/{s.totalMembers} dabei
									{s.guests.length > 0 ? ` · ${s.guests.length} Gäste` : ''}
								</Text>
								<Text style={styles.names} numberOfLines={3}>
									{s.attending.map((a) => a.username).join(', ') || '—'}
								</Text>

								{/* Aktionen */}
								<View style={styles.actions}>
									{optIn ? (
										s.userHasRsvp ? (
											<Pressable
												style={styles.btnGhost}
												onPress={() => act(() => trainingAction('rsvp_no', s.id))}
											>
												<Text style={styles.btnGhostText}>Doch nicht</Text>
											</Pressable>
										) : (
											<Pressable
												style={styles.btnAccent}
												onPress={() => act(() => trainingAction('rsvp_yes', s.id))}
											>
												<Text style={styles.btnAccentText}>Dabei!</Text>
											</Pressable>
										)
									) : absent ? (
										<Pressable
											style={styles.btnAccent}
											onPress={() =>
												act(() =>
													trainingAction(
														s.userDbAbsent ? 'cancel_absence' : 'weekday_override_yes',
														s.id
													)
												)
											}
										>
											<Text style={styles.btnAccentText}>Wieder dabei</Text>
										</Pressable>
									) : (
										<Pressable style={styles.btnGhost} onPress={() => setAbsenceFor(s)}>
											<Text style={styles.btnGhostText}>Abmelden</Text>
										</Pressable>
									)}
									<Text style={[styles.status, { color: iAmIn ? colors.success : colors.textMuted }]}>
										{iAmIn ? '✓ dabei' : absent ? 'abgemeldet' : ''}
									</Text>
								</View>
							</>
						)}
					</View>
				);
			})}

			{/* Abmelde-Dialog mit Begründung */}
			<Modal visible={absenceFor !== null} transparent animationType="fade">
				<View style={styles.modalBackdrop}>
					<View style={styles.modal}>
						<Text style={styles.modalTitle}>
							Abmelden — {absenceFor ? formatDate(absenceFor.date) : ''}
						</Text>
						<TextInput
							style={styles.modalInput}
							placeholder="Begründung (mind. 10 Zeichen)"
							placeholderTextColor={colors.textMuted}
							multiline
							value={absenceReason}
							onChangeText={setAbsenceReason}
						/>
						<View style={styles.modalActions}>
							<Pressable
								style={styles.btnGhost}
								onPress={() => {
									setAbsenceFor(null);
									setAbsenceReason('');
								}}
							>
								<Text style={styles.btnGhostText}>Abbrechen</Text>
							</Pressable>
							<Pressable style={styles.btnAccent} onPress={submitAbsence}>
								<Text style={styles.btnAccentText}>Abmelden</Text>
							</Pressable>
						</View>
					</View>
				</View>
			</Modal>
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	screen: { flex: 1, backgroundColor: colors.bg },
	content: { padding: 20, paddingTop: 56, paddingBottom: 40, gap: 12 },
	kicker: { color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 2 },
	title: { color: colors.text, fontSize: 24, fontWeight: '800', marginTop: 2, marginBottom: 6 },
	error: { color: colors.danger, fontSize: 14 },
	card: {
		backgroundColor: colors.card,
		borderColor: colors.border,
		borderWidth: 1,
		borderRadius: 16,
		padding: 16
	},
	cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
	cardDate: { color: colors.text, fontSize: 17, fontWeight: '800' },
	cardTime: { color: colors.textSecondary, fontSize: 13 },
	cancelled: { color: colors.danger, fontSize: 15, fontWeight: '800', marginTop: 10 },
	spotFixed: { color: colors.accent, fontSize: 14, fontWeight: '700', marginTop: 10 },
	voteBlock: { marginTop: 10, gap: 6 },
	voteTitle: { color: colors.accentBlue, fontSize: 13, fontWeight: '700' },
	voteRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		backgroundColor: colors.hover,
		borderRadius: 10,
		paddingHorizontal: 12,
		paddingVertical: 10
	},
	voteRowMine: { backgroundColor: colors.accent },
	voteName: { color: colors.text, fontSize: 14, fontWeight: '600', flexShrink: 1 },
	voteCount: { color: colors.textSecondary, fontSize: 14, fontWeight: '800' },
	voteEmpty: { color: colors.textMuted, fontSize: 13 },
	attending: { color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 12 },
	names: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
	actions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
	btnAccent: {
		backgroundColor: colors.accent,
		borderRadius: 10,
		paddingHorizontal: 18,
		paddingVertical: 10
	},
	btnAccentText: { color: colors.onAccent, fontSize: 14, fontWeight: '800' },
	btnGhost: {
		borderColor: colors.border,
		borderWidth: 1,
		borderRadius: 10,
		paddingHorizontal: 18,
		paddingVertical: 10
	},
	btnGhostText: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
	status: { fontSize: 13, fontWeight: '700' },
	modalBackdrop: {
		flex: 1,
		backgroundColor: 'rgba(0,0,0,0.7)',
		justifyContent: 'center',
		padding: 24
	},
	modal: {
		backgroundColor: colors.card,
		borderRadius: 16,
		borderColor: colors.border,
		borderWidth: 1,
		padding: 18
	},
	modalTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
	modalInput: {
		backgroundColor: colors.bgSecondary,
		borderColor: colors.border,
		borderWidth: 1,
		borderRadius: 10,
		color: colors.text,
		padding: 12,
		minHeight: 70,
		marginTop: 12,
		textAlignVertical: 'top'
	},
	modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 14 }
});
