import { useState } from 'react';
import { View, Text, StyleSheet, Alert, Share, Modal, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../lib/theme';
import {
	Card,
	TopBar,
	Screen,
	Pill,
	ProgressBar,
	ErrorCard,
	EmptyState,
	Button,
	InitialsRow
} from '../lib/ui';
import { useData } from '../lib/store';
import { getTrips, tripAction, myTripStatus, BASE_URL, type Trip } from '../lib/api';

function formatRange(start: string, end: string | null): string {
	const fmt = (ymd: string) =>
		new Date(`${ymd}T12:00:00`).toLocaleDateString('de-CH', { day: 'numeric', month: 'short' });
	return end && end !== start ? `${fmt(start)} – ${fmt(end)}` : fmt(start);
}

const TRANSPORT_MODES = [
	{ key: 'mitfahrt', label: 'Ich fahre mit' },
	{ key: 'auto_owner', label: 'Ich habe ein Auto' },
	{ key: 'oev', label: 'ÖV' },
	{ key: 'selbst', label: 'Komme selbst' }
];

export default function Trips() {
	const { data, error, refresh, refreshing, onRefresh } = useData('trips', getTrips);
	// Beitritt: erst Transportmittel wählen (Bottom-Sheet), dann senden.
	const [joinFor, setJoinFor] = useState<Trip | null>(null);

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

	return (
		<Screen refreshing={refreshing} onRefresh={onRefresh}>
			<TopBar back kicker="Unterwegs" title="Trips" />
			{error && !data ? <ErrorCard message={error} /> : null}

			{(data?.trips ?? []).map((trip) => {
				const status = myTripStatus(trip);
				const joinedNames = trip.memberStates
					.filter((m) => m.status === 'joined')
					.map((m) => m.username);
				return (
					<Card key={trip.id} style={{ gap: 10 }}>
						<View style={styles.head}>
							<View style={{ flex: 1 }}>
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
							<Pressable onPress={() => shareTrip(trip)} hitSlop={8} style={styles.shareBtn}>
								<Ionicons name="share-social-outline" size={19} color={colors.textSecondary} />
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
						{trip.dateOptions.length > 0 ? (
							<View style={styles.datesBlock}>
								<Text style={styles.datesTitle}>
									TERMIN-ALTERNATIVEN — {trip.votesNeeded} Stimmen ersetzen den Termin
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
											style={({ pressed }) => [styles.dateRow, mine && styles.dateRowMine, pressed && { opacity: 0.8 }]}
										>
											<View style={{ flex: 1, gap: 5 }}>
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
							</View>
						) : null}

						<View style={styles.actions}>
							{status === 'joined' ? (
								<>
									<Pill label="✓ Du bist dabei" color={colors.success} />
									<Button label="Abmelden" kind="ghost" small onPress={() => act(() => tripAction('leave_trip', trip.id))} />
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
				<EmptyState icon="airplane-outline" text="Keine Trips geplant. Erstelle einen im Portal!" />
			) : null}

			{/* Transportmittel-Auswahl beim Beitritt */}
			<Modal visible={joinFor !== null} transparent animationType="slide">
				<View style={styles.sheetBackdrop}>
					<View style={styles.sheet}>
						<View style={styles.sheetHandle} />
						<Text style={styles.sheetTitle}>Wie kommst du hin?</Text>
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
					</View>
				</View>
			</Modal>
		</Screen>
	);
}

const styles = StyleSheet.create({
	head: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
	title: { color: colors.text, fontSize: 17, fontWeight: '800' },
	metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4, flexWrap: 'wrap' },
	meta: { color: colors.textMuted, fontSize: 13 },
	shareBtn: { padding: 4 },
	notes: { color: colors.textSecondary, fontSize: 13.5, lineHeight: 20 },
	countsRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
	counts: { color: colors.textMuted, fontSize: 12.5, flex: 1 },
	datesBlock: { gap: 8, marginTop: 2 },
	datesTitle: { color: colors.textMuted, fontSize: 10.5, fontWeight: '800', letterSpacing: 1 },
	dateRow: {
		backgroundColor: colors.bgSecondary,
		borderRadius: 12,
		padding: 12
	},
	dateRowMine: { borderWidth: 1, borderColor: colors.accentBlue + '66' },
	dateHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
	dateLabel: { color: colors.text, fontSize: 13.5, fontWeight: '700', flex: 1 },
	dateVotes: { color: colors.textSecondary, fontSize: 12.5, fontWeight: '700' },
	actions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
	sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
	sheet: {
		backgroundColor: colors.card,
		borderTopLeftRadius: 24,
		borderTopRightRadius: 24,
		padding: 20,
		paddingBottom: 32,
		gap: 8
	},
	sheetHandle: {
		alignSelf: 'center',
		width: 36,
		height: 4,
		borderRadius: 2,
		backgroundColor: colors.hover,
		marginBottom: 8
	},
	sheetTitle: { color: colors.text, fontSize: 17, fontWeight: '800', marginBottom: 6 },
	modeRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		backgroundColor: colors.bgSecondary,
		borderRadius: 12,
		paddingHorizontal: 14,
		paddingVertical: 13
	},
	modeText: { color: colors.text, fontSize: 15, fontWeight: '600' }
});
