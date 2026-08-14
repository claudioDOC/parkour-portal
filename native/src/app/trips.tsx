import { useState } from 'react';
import { View, Text, StyleSheet, Alert, Share, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { fonts, type ThemeColors } from '../lib/theme';
import { useTheme, useThemedStyles } from '../lib/themeContext';
import {
	Card,
	TopBar,
	Screen,
	Pill,
	ProgressBar,
	ErrorCard,
	EmptyState,
	Button,
	InitialsRow,
	Sheet,
	Input
} from '../lib/ui';
import { useData } from '../lib/store';
import {
	getTrips,
	tripAction,
	createTrip,
	proposeDateOption,
	myTripStatus,
	BASE_URL,
	type Trip
} from '../lib/api';

function formatRange(start: string, end: string | null): string {
	const fmt = (ymd: string) =>
		new Date(`${ymd}T12:00:00`).toLocaleDateString('de-CH', { day: 'numeric', month: 'short' });
	return end && end !== start ? `${fmt(start)} – ${fmt(end)}` : fmt(start);
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

const TRANSPORT_MODES = [
	{ key: 'mitfahrt', label: 'Ich fahre mit' },
	{ key: 'auto_owner', label: 'Ich habe ein Auto' },
	{ key: 'oev', label: 'ÖV' },
	{ key: 'selbst', label: 'Komme selbst' }
];

export default function Trips() {
	const { colors } = useTheme();
	const styles = useThemedStyles(makeStyles);
	const { data, error, refresh, refreshing, onRefresh } = useData('trips', getTrips);
	// Beitritt: erst Transportmittel wählen (Bottom-Sheet), dann senden.
	const [joinFor, setJoinFor] = useState<Trip | null>(null);
	// Neuen Trip erstellen
	const [createOpen, setCreateOpen] = useState(false);
	const [form, setForm] = useState({ title: '', start: '', end: '', notes: '' });
	// Termin-Alternative vorschlagen
	const [dateFor, setDateFor] = useState<Trip | null>(null);
	const [dateForm, setDateForm] = useState({ start: '', end: '', note: '' });

	const act = async (fn: () => Promise<unknown>) => {
		try {
			await fn();
			await refresh();
		} catch (e) {
			Alert.alert('Fehler', e instanceof Error ? e.message : 'Aktion fehlgeschlagen');
		}
	};

	const shareTrip = (trip: Trip) => {
		Share.share({
			message: `${trip.title} (${formatRange(trip.startDate, trip.endDate)}) — bist du dabei? ${BASE_URL}/trips?trip=${trip.id}`
		}).catch(() => {});
	};

	const submitCreate = async () => {
		if (!form.title.trim() || !YMD.test(form.start) || !YMD.test(form.end)) {
			Alert.alert('Unvollständig', 'Titel plus Start/Ende im Format JJJJ-MM-TT.');
			return;
		}
		setCreateOpen(false);
		await act(() => createTrip(form.title.trim(), form.start, form.end, form.notes.trim()));
		setForm({ title: '', start: '', end: '', notes: '' });
	};

	const submitDateOption = async () => {
		if (!dateFor || !YMD.test(dateForm.start) || !YMD.test(dateForm.end)) {
			Alert.alert('Unvollständig', 'Start und Ende im Format JJJJ-MM-TT.');
			return;
		}
		const trip = dateFor;
		setDateFor(null);
		await act(() => proposeDateOption(trip.id, dateForm.start, dateForm.end, dateForm.note.trim()));
		setDateForm({ start: '', end: '', note: '' });
	};

	return (
		<Screen refreshing={refreshing} onRefresh={onRefresh}>
			<TopBar
				back
				kicker="Unterwegs"
				title="Trips"
				right={
					<Pressable
						onPress={() => setCreateOpen(true)}
						hitSlop={8}
						style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.8 }]}
					>
						<Ionicons name="add" size={24} color={colors.onAccent} />
					</Pressable>
				}
			/>
			{error && !data ? <ErrorCard message={error} /> : null}

			{(data?.trips ?? []).map((trip) => {
				const status = myTripStatus(trip);
				const joinedNames = trip.memberStates
					.filter((m) => m.status === 'joined')
					.map((m) => m.username);
				return (
					<Card key={trip.id} style={{ gap: 12 }}>
						<View style={styles.head}>
							<View style={{ flex: 1, gap: 4 }}>
								<Text style={styles.title}>{trip.title}</Text>
								<View style={styles.metaRow}>
									<Ionicons name="calendar-outline" size={13} color={colors.textMuted} />
									<Text style={styles.meta}>{formatRange(trip.startDate, trip.endDate)}</Text>
									{trip.destinationLabel ? (
										<>
											<Ionicons name="location-outline" size={13} color={colors.textMuted} />
											<Text style={styles.meta} numberOfLines={1}>
												{trip.destinationLabel}
											</Text>
										</>
									) : null}
								</View>
							</View>
							<Pressable
								onPress={() => shareTrip(trip)}
								hitSlop={8}
								style={({ pressed }) => [styles.shareBtn, pressed && { opacity: 0.7 }]}
							>
								<Ionicons name="share-social-outline" size={18} color={colors.textSecondary} />
							</Pressable>
						</View>

						{trip.notes ? <Text style={styles.notes}>{trip.notes}</Text> : null}

						<View style={styles.countsRow}>
							<InitialsRow names={joinedNames} />
							<Text style={styles.counts}>
								{trip.joinedCount} dabei · {trip.declinedCount} nicht · {trip.pendingCount} offen
							</Text>
						</View>

						{/* Termin-Alternativen mit Mehrheits-Fortschritt */}
						<View style={{ gap: 8 }}>
							{trip.dateOptions.length > 0 ? (
								<>
									<Text style={styles.datesTitle}>
										TERMIN-ALTERNATIVEN — {trip.votesNeeded} STIMMEN ERSETZEN DEN TERMIN
									</Text>
									{trip.dateOptions.map((opt) => {
										const mine = trip.myVoteDateOptionId === opt.id;
										const range = formatRange(opt.startDate, opt.endDate);
										const label = opt.note ? `${range} · ${opt.note}` : range;
										return (
											<Pressable
												key={opt.id}
												onPress={() =>
													act(() =>
														mine
															? tripAction('remove_date_vote', trip.id, { dateOptionId: opt.id })
															: tripAction('vote_date_option', trip.id, { dateOptionId: opt.id })
													)
												}
												style={({ pressed }) => [styles.dateRow, pressed && { opacity: 0.8 }]}
											>
												<View style={{ flex: 1, gap: 6 }}>
													<View style={styles.dateHead}>
														{mine ? (
															<Ionicons name="checkmark-circle" size={15} color={colors.accentBlue} />
														) : null}
														<Text style={[styles.dateLabel, mine && { color: colors.accentBlue }]}>
															{label}
														</Text>
														<Text style={styles.dateVotes}>
															{opt.voteCount}/{trip.votesNeeded}
														</Text>
													</View>
													<ProgressBar
														percent={(opt.voteCount / Math.max(1, trip.votesNeeded)) * 100}
														color={colors.accentBlue}
													/>
												</View>
											</Pressable>
										);
									})}
								</>
							) : null}
							<Pressable
								onPress={() => setDateFor(trip)}
								style={({ pressed }) => [styles.proposeRow, pressed && { opacity: 0.7 }]}
							>
								<Ionicons name="add-circle-outline" size={16} color={colors.textSecondary} />
								<Text style={styles.proposeText}>Anderen Termin vorschlagen</Text>
							</Pressable>
						</View>

						<View style={styles.actions}>
							{status === 'joined' ? (
								<>
									<Pill label="✓ Du bist dabei" color={colors.success} />
									<Button
										label="Abmelden"
										kind="ghost"
										small
										onPress={() => act(() => tripAction('leave_trip', trip.id))}
									/>
								</>
							) : status === 'declined' ? (
								<>
									<Pill label="Nicht dabei" color={colors.textMuted} />
									<Button label="Doch dabei" small onPress={() => setJoinFor(trip)} />
								</>
							) : status === 'abstained' ? (
								<>
									<Pill label="Enthalten" color={colors.warning} />
									<Button label="Dabei!" small onPress={() => setJoinFor(trip)} />
								</>
							) : (
								<>
									<Button label="Dabei!" small onPress={() => setJoinFor(trip)} />
									<Button
										label="Nicht dabei"
										kind="ghost"
										small
										onPress={() => act(() => tripAction('decline_trip', trip.id))}
									/>
									<Button
										label="Weiss noch nicht"
										kind="ghost"
										small
										onPress={() => act(() => tripAction('abstain_trip', trip.id))}
									/>
								</>
							)}
						</View>
					</Card>
				);
			})}

			{data && data.trips.length === 0 ? (
				<EmptyState icon="airplane-outline" text="Kein Trip geplant — erstell den ersten mit dem + oben." />
			) : null}

			{/* Transportmittel-Auswahl beim Beitritt */}
			<Sheet visible={joinFor !== null} onClose={() => setJoinFor(null)} title="Wie kommst du hin?">
				{TRANSPORT_MODES.map((mode) => (
					<Pressable
						key={mode.key}
						style={({ pressed }) => [styles.modeRow, pressed && { opacity: 0.7 }]}
						onPress={() => {
							const trip = joinFor!;
							setJoinFor(null);
							act(() => tripAction('join_trip', trip.id, { transportMode: mode.key }));
						}}
					>
						<Text style={styles.modeText}>{mode.label}</Text>
						<Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
					</Pressable>
				))}
				<Button label="Abbrechen" kind="ghost" onPress={() => setJoinFor(null)} />
			</Sheet>

			{/* Neuen Trip erstellen */}
			<Sheet visible={createOpen} onClose={() => setCreateOpen(false)} title="Neuer Trip">
				<Input
					placeholder="Titel (z. B. Wochenende Lyon)"
					value={form.title}
					onChangeText={(v) => setForm({ ...form, title: v })}
				/>
				<View style={{ flexDirection: 'row', gap: 10 }}>
					<Input
						placeholder="Start 2026-10-02"
						value={form.start}
						onChangeText={(v) => setForm({ ...form, start: v })}
						style={{ flex: 1 }}
						autoCapitalize="none"
					/>
					<Input
						placeholder="Ende 2026-10-04"
						value={form.end}
						onChangeText={(v) => setForm({ ...form, end: v })}
						style={{ flex: 1 }}
						autoCapitalize="none"
					/>
				</View>
				<Input
					placeholder="Notizen (optional)"
					multiline
					value={form.notes}
					onChangeText={(v) => setForm({ ...form, notes: v })}
				/>
				<View style={styles.sheetActions}>
					<Button label="Abbrechen" kind="ghost" onPress={() => setCreateOpen(false)} />
					<Button label="Erstellen" onPress={submitCreate} />
				</View>
			</Sheet>

			{/* Termin-Alternative vorschlagen */}
			<Sheet
				visible={dateFor !== null}
				onClose={() => setDateFor(null)}
				title={`Termin vorschlagen — ${dateFor?.title ?? ''}`}
			>
				<View style={{ flexDirection: 'row', gap: 10 }}>
					<Input
						placeholder="Start 2026-10-09"
						value={dateForm.start}
						onChangeText={(v) => setDateForm({ ...dateForm, start: v })}
						style={{ flex: 1 }}
						autoCapitalize="none"
					/>
					<Input
						placeholder="Ende 2026-10-11"
						value={dateForm.end}
						onChangeText={(v) => setDateForm({ ...dateForm, end: v })}
						style={{ flex: 1 }}
						autoCapitalize="none"
					/>
				</View>
				<Input
					placeholder="Notiz (optional)"
					value={dateForm.note}
					onChangeText={(v) => setDateForm({ ...dateForm, note: v })}
				/>
				<View style={styles.sheetActions}>
					<Button label="Abbrechen" kind="ghost" onPress={() => setDateFor(null)} />
					<Button label="Vorschlagen" onPress={submitDateOption} />
				</View>
			</Sheet>
		</Screen>
	);
}

const makeStyles = (colors: ThemeColors) =>
	StyleSheet.create({
	addBtn: {
		width: 40,
		height: 40,
		borderRadius: 20,
		backgroundColor: colors.accent,
		alignItems: 'center',
		justifyContent: 'center'
	},
	head: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
	title: { color: colors.text, fontSize: 17.5, fontFamily: fonts.sansBold },
	metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
	meta: { color: colors.textMuted, fontSize: 13 },
	shareBtn: {
		width: 36,
		height: 36,
		borderRadius: 18,
		backgroundColor: colors.hover,
		alignItems: 'center',
		justifyContent: 'center'
	},
	notes: { color: colors.textSecondary, fontSize: 13.5, lineHeight: 20 },
	countsRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
	counts: { color: colors.textMuted, fontSize: 12.5, flex: 1 },
	datesTitle: { color: colors.textSecondary, fontFamily: fonts.displayMedium, fontSize: 13, letterSpacing: 1.5 },
	dateRow: { backgroundColor: colors.bgSecondary, borderRadius: 13, padding: 13 },
	dateHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
	dateLabel: { color: colors.text, fontSize: 13.5, fontFamily: fonts.sansSemi, flex: 1 },
	dateVotes: { color: colors.textSecondary, fontSize: 12.5, fontWeight: '700' },
	proposeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3 },
	proposeText: { color: colors.textSecondary, fontSize: 13 },
	actions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
	sheetActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
	modeRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		backgroundColor: colors.hover,
		borderRadius: 13,
		paddingHorizontal: 15,
		paddingVertical: 14
	},
	modeText: { color: colors.text, fontSize: 15, fontFamily: fonts.sansSemi }
});
