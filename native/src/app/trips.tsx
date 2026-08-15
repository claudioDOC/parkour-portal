import { useState } from 'react';
import { View, Text, StyleSheet, Alert, Share, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { fonts, type ThemeColors } from '../lib/theme';
import { textAlpha } from '../lib/tokens';
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
	Sheet,
	Input
} from '../lib/ui';
import { useData } from '../lib/store';
import { NativeMap, type MapMarker } from '../lib/NativeMap';
import {
	getTrips,
	tripAction,
	createTrip,
	proposeDateOption,
	proposePlanOption,
	votePlanOption,
	removePlanVote,
	proposeStopover,
	deleteStopover,
	setTripDestination,
	adminTrashTrip,
	geocode,
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

/** Exakt die Auswahl der Trips-Seite im Portal. */
const TRANSPORT_MODES = [
	{ key: 'mitfahrt', label: 'Ich fahre mit' },
	{ key: 'auto_owner', label: 'Ich nehme mein Auto' },
	{ key: 'motorrad', label: 'Motorrad' },
	{ key: 'zug', label: 'Zug' },
	{ key: 'unentschlossen', label: 'Noch unentschlossen' }
];

/** Chip-Beschriftung pro Person — dieselben Worte wie die Web-Seite. */
function memberLabel(m: Trip['memberStates'][number]): string {
	if (m.status === 'pending') return 'Offen';
	if (m.status === 'declined') return 'Abgemeldet';
	switch (m.transportMode) {
		case 'auto_owner':
			return 'Eigenes Auto';
		case 'motorrad':
			return 'Motorrad';
		case 'zug':
			return 'Zug';
		case 'unentschlossen':
			return 'Unentschlossen';
		default:
			return 'Mitfahrt';
	}
}

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
	// Ablauf-Vorschlag (im Portal „Ablauf") und Zwischenstopps
	const [planFor, setPlanFor] = useState<Trip | null>(null);
	const [planText, setPlanText] = useState('');
	const [stopFor, setStopFor] = useState<Trip | null>(null);
	const [stopQuery, setStopQuery] = useState('');
	const [stopHits, setStopHits] = useState<{ lat: number; lon: number; displayName: string }[]>([]);
	const [joinNote, setJoinNote] = useState('');
	// Trip-Ziel setzen (Ersteller/Admin) — gleiche Ortssuche wie Zwischenstopps.
	const [destFor, setDestFor] = useState<Trip | null>(null);
	// Angetippter Teilnehmer-Chip: zeigt dessen Notiz darunter an.
	const [openNoteKey, setOpenNoteKey] = useState<string | null>(null);

	const act = async (fn: () => Promise<unknown>) => {
		try {
			await fn();
			await refresh();
		} catch (e) {
			Alert.alert('Fehler', e instanceof Error ? e.message : 'Aktion fehlgeschlagen');
		}
	};

	/** Beitritt/Änderung: Notiz aus der bisherigen Anmeldung vorbefüllen. */
	const openJoin = (trip: Trip) => {
		setJoinNote(trip.myParticipation?.note ?? '');
		setJoinFor(trip);
	};

	/** Ortssuche für Zwischenstopp- und Ziel-Sheet. */
	const searchPlaces = async () => {
		const q = stopQuery.trim();
		if (q.length < 2) return;
		try {
			const res = await geocode(q);
			setStopHits(res.results);
			if (!res.results.length) Alert.alert('Nichts gefunden', `Keine Treffer für „${q}".`);
		} catch (e) {
			Alert.alert('Fehler', e instanceof Error ? e.message : 'Suche fehlgeschlagen');
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
				const canManage = data?.isAdmin || trip.createdBy === data?.user.id;
				const tripPins: MapMarker[] = [
					...(trip.destinationLatitude != null && trip.destinationLongitude != null
						? [
								{
									id: -trip.id,
									name: trip.destinationLabel ?? trip.title,
									lat: trip.destinationLatitude,
									lon: trip.destinationLongitude,
									kind: 'main'
								}
							]
						: []),
					...(trip.stopovers ?? []).map((st) => ({
						id: st.id,
						name: st.label,
						lat: st.latitude,
						lon: st.longitude,
						kind: 'parking'
					}))
				];
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

						{/* Zählkacheln wie im Web: Angemeldet / Offen / Abgemeldet */}
						<View style={styles.tilesRow}>
							<View style={[styles.tile, { borderColor: colors.success + '59' }]}>
								<Text style={[styles.tileNum, { color: colors.success }]}>{trip.joinedCount}</Text>
								<Text style={styles.tileLabel}>Angemeldet</Text>
							</View>
							<View style={styles.tile}>
								<Text style={styles.tileNum}>{trip.pendingCount}</Text>
								<Text style={styles.tileLabel}>Offen</Text>
							</View>
							<View style={[styles.tile, { borderColor: colors.danger + '59' }]}>
								<Text style={[styles.tileNum, { color: colors.danger }]}>{trip.declinedCount}</Text>
								<Text style={styles.tileLabel}>Abgemeldet</Text>
							</View>
						</View>

						{/* Wer ist wie unterwegs — Chip antippen zeigt die Notiz */}
						<View style={styles.chipsWrap}>
							{trip.memberStates.map((m) => {
								const key = `${trip.id}:${m.userId}`;
								const tint =
									m.status === 'declined'
										? colors.danger
										: m.status === 'pending'
											? colors.fg + textAlpha.muted
											: m.transportMode === 'auto_owner'
												? colors.accent
												: colors.success;
								return (
									<Pressable
										key={key}
										onPress={() =>
											m.note ? setOpenNoteKey(openNoteKey === key ? null : key) : undefined
										}
										style={[styles.memberChip, { borderColor: tint + '40' }]}
									>
										<Text style={[styles.memberChipText, { color: tint }]}>
											{m.username} · {memberLabel(m)}
											{m.note ? ' *' : ''}
										</Text>
									</Pressable>
								);
							})}
						</View>
						{openNoteKey?.startsWith(`${trip.id}:`)
							? (() => {
									const m = trip.memberStates.find(
										(x) => `${trip.id}:${x.userId}` === openNoteKey
									);
									return m?.note ? (
										<Text style={styles.memberNote}>
											{m.username}: {m.note}
										</Text>
									) : null;
								})()
							: null}

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
										const subline = [
											opt.proposedByName ? `von ${opt.proposedByName}` : null,
											opt.sameAsPlanned ? 'wie Trip geplant' : null
										]
											.filter(Boolean)
											.join(' · ');
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
												<View style={{ flex: 1, gap: 8 }}>
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
													{subline ? <Text style={styles.proposeText}>{subline}</Text> : null}
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

						{/* Ablauf-Vorschläge — im Portal „Ablauf" */}
						<View style={{ gap: 8 }}>
							{trip.destinations?.length ? (
								<>
									<Text style={styles.datesTitle}>ABLAUF-VORSCHLÄGE</Text>
									{trip.destinations.map((d) => {
										const mine = trip.myVoteDestinationId === d.id;
										return (
											<Pressable
												key={d.id}
												onPress={() =>
													act(() =>
														mine ? removePlanVote(trip.id) : votePlanOption(trip.id, d.id)
													)
												}
												style={({ pressed }) => [styles.dateRow, pressed && { opacity: 0.8 }]}
											>
												<View style={{ flex: 1, gap: 4 }}>
													<View style={styles.dateHead}>
														{mine ? (
															<Ionicons name="checkmark-circle" size={15} color={colors.accent} />
														) : null}
														<Text style={[styles.dateLabel, mine && { color: colors.accent }]}>
															{d.name}
														</Text>
														<Text style={styles.dateVotes}>{d.voteCount}</Text>
													</View>
													<Text style={styles.proposeText}>von {d.proposedByName}</Text>
												</View>
											</Pressable>
										);
									})}
								</>
							) : null}
							<Pressable
								onPress={() => setPlanFor(trip)}
								style={({ pressed }) => [styles.proposeRow, pressed && { opacity: 0.7 }]}
							>
								<Ionicons name="add-circle-outline" size={16} color={colors.fg + textAlpha.secondary} />
								<Text style={styles.proposeText}>Ablauf vorschlagen</Text>
							</Pressable>
						</View>

						{/* Zwischenstopps */}
						<View style={{ gap: 8 }}>
							{trip.stopovers?.length ? (
								<>
									<Text style={styles.datesTitle}>ZWISCHENSTOPPS</Text>
									{trip.stopovers.map((st) => (
										<View key={st.id} style={styles.stopRow}>
											<Ionicons name="location-outline" size={15} color={colors.accentBlue} />
											<Text style={styles.stopLabel} numberOfLines={1}>
												{st.label}
											</Text>
											<Text style={styles.proposeText}>{st.proposedByName}</Text>
											<Pressable
												onPress={() => act(() => deleteStopover(trip.id, st.id))}
												hitSlop={8}
											>
												<Ionicons name="close" size={16} color={colors.fg + textAlpha.muted} />
											</Pressable>
										</View>
									))}
								</>
							) : null}
							<Pressable
								onPress={() => {
									setStopFor(trip);
									setStopQuery('');
									setStopHits([]);
								}}
								style={({ pressed }) => [styles.proposeRow, pressed && { opacity: 0.7 }]}
							>
								<Ionicons name="add-circle-outline" size={16} color={colors.fg + textAlpha.secondary} />
								<Text style={styles.proposeText}>Zwischenstopp vorschlagen</Text>
							</Pressable>
						</View>

						{/* Routen-Karte: Ziel (★) und Zwischenstopps — wie im Web */}
						{tripPins.length > 0 ? <NativeMap markers={tripPins} height={180} zoom={7} /> : null}
						{canManage ? (
							<View style={styles.manageRow}>
								<Pressable
									onPress={() => {
										setDestFor(trip);
										setStopQuery('');
										setStopHits([]);
									}}
									style={({ pressed }) => [styles.proposeRow, pressed && { opacity: 0.7 }]}
								>
									<Ionicons name="flag-outline" size={16} color={colors.fg + textAlpha.secondary} />
									<Text style={styles.proposeText}>
										{trip.destinationLabel ? 'Ziel ändern' : 'Ziel setzen'}
									</Text>
								</Pressable>
								{trip.destinationLabel ? (
									<Pressable
										onPress={() => act(() => setTripDestination(trip.id, null))}
										style={({ pressed }) => [styles.proposeRow, pressed && { opacity: 0.7 }]}
									>
										<Ionicons name="close-circle-outline" size={16} color={colors.fg + textAlpha.muted} />
										<Text style={styles.proposeText}>Ziel entfernen</Text>
									</Pressable>
								) : null}
								{data?.isAdmin ? (
									<Pressable
										onPress={() =>
											Alert.alert('In Papierkorb?', `Trip „${trip.title}" in den Papierkorb legen?`, [
												{ text: 'Abbrechen', style: 'cancel' },
												{
													text: 'Papierkorb',
													style: 'destructive',
													onPress: () => act(() => adminTrashTrip(trip.id))
												}
											])
										}
										style={({ pressed }) => [styles.proposeRow, pressed && { opacity: 0.7 }]}
									>
										<Ionicons name="trash-outline" size={16} color={colors.warning} />
										<Text style={[styles.proposeText, { color: colors.warning }]}>Papierkorb</Text>
									</Pressable>
								) : null}
							</View>
						) : null}

						<View style={styles.actions}>
							{status === 'joined' ? (
								<>
									<Pill label="✓ Du bist dabei" color={colors.success} />
									<Button label="Ändern" kind="ghost" small onPress={() => openJoin(trip)} />
									<Button
										label="Abmelden"
										kind="ghost"
										small
										onPress={() => act(() => tripAction('decline_trip', trip.id))}
									/>
									<Button
										label="Zurück auf offen"
										kind="ghost"
										small
										onPress={() => act(() => tripAction('leave_trip', trip.id))}
									/>
								</>
							) : status === 'declined' ? (
								<>
									<Pill label="Nicht dabei" color={colors.textMuted} />
									<Button label="Doch dabei" small onPress={() => openJoin(trip)} />
									<Button
										label="Zurück auf offen"
										kind="ghost"
										small
										onPress={() => act(() => tripAction('leave_trip', trip.id))}
									/>
								</>
							) : status === 'abstained' ? (
								<>
									<Pill label="Enthalten" color={colors.warning} />
									<Button label="Dabei!" small onPress={() => openJoin(trip)} />
									<Button
										label="Abmelden"
										kind="ghost"
										small
										onPress={() => act(() => tripAction('decline_trip', trip.id))}
									/>
								</>
							) : (
								<>
									<Button label="Dabei!" small onPress={() => openJoin(trip)} />
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

			{/* Transportmittel-Auswahl beim Beitritt — Antippen sendet inkl. Notiz */}
			<Sheet visible={joinFor !== null} onClose={() => setJoinFor(null)} title="Wie kommst du hin?">
				<Input
					placeholder="Notiz für alle sichtbar (optional)"
					value={joinNote}
					onChangeText={setJoinNote}
				/>
				{TRANSPORT_MODES.map((mode) => (
					<Pressable
						key={mode.key}
						style={({ pressed }) => [styles.modeRow, pressed && { opacity: 0.7 }]}
						onPress={() => {
							const trip = joinFor!;
							const note = joinNote.trim();
							setJoinFor(null);
							act(() => tripAction('join_trip', trip.id, { transportMode: mode.key, note }));
						}}
					>
						<Text style={styles.modeText}>{mode.label}</Text>
						<Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
					</Pressable>
				))}
				<Button label="Abbrechen" kind="ghost" onPress={() => setJoinFor(null)} />
			</Sheet>

			{/* Ablauf vorschlagen (freier Text, wie das Web-Textfeld) */}
			<Sheet
				visible={planFor !== null}
				onClose={() => setPlanFor(null)}
				title={`Ablauf vorschlagen — ${planFor?.title ?? ''}`}
			>
				<Input
					placeholder="Ablauf beschreiben — z. B. ganze Woche mit Trainer, wer fährt mit wem …"
					multiline
					value={planText}
					onChangeText={setPlanText}
					style={{ minHeight: 90 }}
				/>
				<View style={styles.sheetActions}>
					<Button label="Abbrechen" kind="ghost" onPress={() => setPlanFor(null)} />
					<Button
						label="Vorschlagen"
						onPress={() => {
							const trip = planFor;
							const text = planText.trim();
							if (!trip || !text) return;
							setPlanFor(null);
							setPlanText('');
							act(() => proposePlanOption(trip.id, text));
						}}
					/>
				</View>
			</Sheet>

			{/* Zwischenstopp: Ort suchen und übernehmen */}
			<Sheet
				visible={stopFor !== null}
				onClose={() => setStopFor(null)}
				title={`Zwischenstopp — ${stopFor?.title ?? ''}`}
			>
				<View style={styles.searchRow}>
					<View style={{ flex: 1 }}>
						<Input
							placeholder="Ort suchen …"
							value={stopQuery}
							onChangeText={setStopQuery}
							onSubmitEditing={searchPlaces}
							returnKeyType="search"
						/>
					</View>
					<Button label="Suchen" kind="ghost" onPress={searchPlaces} />
				</View>
				{stopHits.map((hit, i) => (
					<Pressable
						key={i}
						style={({ pressed }) => [styles.hitRow, pressed && { opacity: 0.7 }]}
						onPress={() => {
							const trip = stopFor!;
							setStopFor(null);
							act(() => proposeStopover(trip.id, hit.displayName, hit.lat, hit.lon));
						}}
					>
						<Ionicons name="location-outline" size={16} color={colors.accentBlue} />
						<Text style={styles.hitText} numberOfLines={2}>
							{hit.displayName}
						</Text>
					</Pressable>
				))}
				<Button label="Abbrechen" kind="ghost" onPress={() => setStopFor(null)} />
			</Sheet>

			{/* Trip-Ziel setzen (Ersteller/Admin) */}
			<Sheet
				visible={destFor !== null}
				onClose={() => setDestFor(null)}
				title={`Ziel setzen — ${destFor?.title ?? ''}`}
			>
				<View style={styles.searchRow}>
					<View style={{ flex: 1 }}>
						<Input
							placeholder="Zielort suchen …"
							value={stopQuery}
							onChangeText={setStopQuery}
							onSubmitEditing={searchPlaces}
							returnKeyType="search"
						/>
					</View>
					<Button label="Suchen" kind="ghost" onPress={searchPlaces} />
				</View>
				{stopHits.map((hit, i) => (
					<Pressable
						key={i}
						style={({ pressed }) => [styles.hitRow, pressed && { opacity: 0.7 }]}
						onPress={() => {
							const trip = destFor!;
							setDestFor(null);
							act(() =>
								setTripDestination(trip.id, {
									latitude: hit.lat,
									longitude: hit.lon,
									label: hit.displayName
								})
							);
						}}
					>
						<Ionicons name="flag-outline" size={16} color={colors.accent} />
						<Text style={styles.hitText} numberOfLines={2}>
							{hit.displayName}
						</Text>
					</Pressable>
				))}
				<Button label="Abbrechen" kind="ghost" onPress={() => setDestFor(null)} />
			</Sheet>

			{/* Neuen Trip erstellen */}
			<Sheet visible={createOpen} onClose={() => setCreateOpen(false)} title="Neuer Trip">
				<Input
					placeholder="Titel (z. B. Wochenende Lyon)"
					value={form.title}
					onChangeText={(v) => setForm({ ...form, title: v })}
				/>
				<View style={{ flexDirection: 'row', gap: 8 }}>
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
				<View style={{ flexDirection: 'row', gap: 8 }}>
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
	title: { color: colors.fg + textAlpha.primary, fontSize: 16, lineHeight: 22, fontFamily: fonts.sansBold },
	metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
	meta: { color: colors.fg + textAlpha.muted, fontSize: 12, lineHeight: 16 },
	shareBtn: {
		width: 36,
		height: 36,
		borderRadius: 20,
		backgroundColor: colors.hover,
		alignItems: 'center',
		justifyContent: 'center'
	},
	notes: { color: colors.fg + textAlpha.secondary, fontSize: 12, lineHeight: 16 },
	tilesRow: { flexDirection: 'row', gap: 8 },
	tile: {
		flex: 1,
		borderWidth: 1,
		borderColor: colors.border,
		backgroundColor: colors.bgSecondary,
		borderRadius: 14,
		paddingVertical: 10,
		alignItems: 'center',
		gap: 2
	},
	tileNum: {
		color: colors.fg + textAlpha.primary,
		fontFamily: fonts.display,
		fontSize: 24,
		lineHeight: 26
	},
	tileLabel: {
		color: colors.fg + textAlpha.muted,
		fontSize: 10,
		lineHeight: 14,
		letterSpacing: 0.8,
		textTransform: 'uppercase',
		fontFamily: fonts.sansSemi
	},
	chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
	memberChip: {
		borderRadius: 999,
		borderWidth: 1,
		backgroundColor: colors.bgSecondary,
		paddingHorizontal: 10,
		paddingVertical: 5
	},
	memberChipText: { fontSize: 11, lineHeight: 15, fontFamily: fonts.sansMedium },
	memberNote: {
		color: colors.fg + textAlpha.secondary,
		fontSize: 12,
		lineHeight: 17,
		backgroundColor: colors.bgSecondary,
		borderRadius: 10,
		paddingHorizontal: 10,
		paddingVertical: 8
	},
	manageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
	searchRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
	hitRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
		backgroundColor: colors.hover,
		borderRadius: 12,
		paddingHorizontal: 12,
		paddingVertical: 10
	},
	hitText: {
		color: colors.fg + textAlpha.primary,
		fontSize: 13,
		lineHeight: 18,
		fontFamily: fonts.sans,
		flex: 1
	},
	datesTitle: { color: colors.fg + textAlpha.secondary, fontFamily: fonts.displayMedium, fontSize: 12, lineHeight: 16, letterSpacing: 1.5 },
	dateRow: { backgroundColor: colors.bgSecondary, borderRadius: 12, padding: 12 },
	dateHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
	dateLabel: { color: colors.fg + textAlpha.primary, fontSize: 12, lineHeight: 16, fontFamily: fonts.sansSemi, flex: 1 },
	dateVotes: { color: colors.fg + textAlpha.secondary, fontSize: 12, lineHeight: 16, fontFamily: fonts.sansBold },
	proposeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
	proposeText: { color: colors.fg + textAlpha.secondary, fontSize: 12, lineHeight: 16 },
	actions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
	sheetActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
	modeRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		backgroundColor: colors.hover,
		borderRadius: 12,
		paddingHorizontal: 16,
		paddingVertical: 12
	},
	modeText: { color: colors.fg + textAlpha.primary, fontSize: 14, lineHeight: 20, fontFamily: fonts.sansSemi, flex: 1 },
	stopRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
		backgroundColor: colors.bgSecondary,
		borderRadius: 12,
		paddingHorizontal: 12,
		paddingVertical: 10
	},
	stopLabel: {
		color: colors.fg + textAlpha.primary,
		fontSize: 13,
		lineHeight: 18,
		fontFamily: fonts.sansMedium,
		flex: 1
	}
});
