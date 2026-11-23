import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { fonts, type ThemeColors } from '../lib/theme';
import { textAlpha } from '../lib/tokens';
import { useTheme, useThemedStyles } from '../lib/themeContext';
import { Card, TopBar, Screen, SectionTitle, ErrorCard, ProgressBar, Stat, StatGrid, Avatar, Button } from '../lib/ui';
import { useData } from '../lib/store';
import { getStats } from '../lib/api';
import { useAuth } from './_layout';

/** „2026-08" → „Aug. 2026" — kurz genug für die Filterleiste. */
function monthLabel(key: string): string {
	const [y, m] = key.split('-');
	return `${new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('de-CH', { month: 'short' })} ${y}`;
}

export default function Stats() {
	const { colors } = useTheme();
	const styles = useThemedStyles(makeStyles);
	const { me } = useAuth();
	const { data, error, refreshing, onRefresh } = useData('stats', getStats);

	const lb = data?.stats.leaderboard ?? [];

	/**
	 * Extra-Einheiten = Solo-Trainings + Zusatztrainings. Beides bleibt aus der
	 * Hall of Fame heraus, damit „Gezogen %" weiter nur die Verlässlichkeit bei
	 * den festen Terminen misst.
	 */
	const extraUnits = (() => {
		const map = new Map<
			number,
			{ userId: number; username: string; avatar: string | null; solo: number; extra: number; total: number }
		>();
		for (const r of data?.solo.leaderboard ?? []) {
			map.set(r.userId, {
				userId: r.userId,
				username: r.username,
				avatar: r.avatar ?? null,
				solo: r.total,
				extra: 0,
				total: r.total
			});
		}
		for (const r of data?.extra?.rows ?? []) {
			const e = map.get(r.userId) ?? {
				userId: r.userId,
				username: r.username,
				avatar: r.avatar ?? null,
				solo: 0,
				extra: 0,
				total: 0
			};
			e.extra = r.extraSessions;
			e.total = e.solo + e.extra;
			map.set(r.userId, e);
		}
		return [...map.values()].sort((a, b) => b.total - a.total || b.extra - a.extra);
	})();

	// Neuester Monat zuerst; „gesamt" = null zeigt die Hall of Fame ab Beginn.
	const months = [...(data?.stats.monthDetail ?? [])].reverse();
	const [monthKey, setMonthKey] = useState<string | null>(null);
	const selectedMonth = monthKey ? months.find((m) => m.key === monthKey) : null;

	// Spot-Auswertung wie auf der Website: wie oft ein Spot gewählt wurde,
	// wahlweise über alles, ein Jahr oder einen einzelnen Monat.
	const events = data?.stats.spotUsageEvents ?? [];
	const spotPeriods = [
		{ key: 'all', label: 'Gesamt' },
		...[...new Set(events.map((e) => e.date.slice(0, 4)))]
			.sort()
			.reverse()
			.map((y) => ({ key: y, label: y })),
		...[...new Set(events.map((e) => e.date.slice(0, 7)))]
			.sort()
			.reverse()
			.slice(0, 12)
			.map((mk) => ({ key: mk, label: monthLabel(mk) }))
	];
	const [spotPeriod, setSpotPeriod] = useState('all');
	const spotRows = (() => {
		const inPeriod =
			spotPeriod === 'all' ? events : events.filter((e) => e.date.startsWith(spotPeriod));
		const bySpot = new Map<number, { name: string; city: string; count: number; last: string }>();
		for (const e of inPeriod) {
			const row = bySpot.get(e.spotId);
			if (row) {
				row.count += 1;
				if (e.date > row.last) row.last = e.date;
			} else {
				bySpot.set(e.spotId, { name: e.spotName, city: e.spotCity, count: 1, last: e.date });
			}
		}
		return [...bySpot.entries()]
			.map(([spotId, r]) => ({ spotId, ...r }))
			.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
	})();

	// Abmeldegründe: Die Trainingsseite zeigt nur kommende Termine — hier ist
	// die einzige Stelle, an der man nachlesen kann, was die Gründe waren.
	const absences = data?.stats.absenceHistory ?? [];
	const absencePeople = [...new Set(absences.map((a) => a.username))].sort((a, b) =>
		a.localeCompare(b, 'de')
	);
	const [absencePerson, setAbsencePerson] = useState<string | null>(null);
	// Die Liste wird lang (bis 300 Einträge) — stückweise nachladen statt alles
	// auf einmal zu rendern.
	const [absenceLimit, setAbsenceLimit] = useState(30);
	const absenceRows = absencePerson
		? absences.filter((a) => a.username === absencePerson)
		: absences;

	return (
		<Screen refreshing={refreshing} onRefresh={onRefresh}>
			<TopBar back kicker="Zahlen" title="Statistik" />
			{error && !data ? <ErrorCard message={error} /> : null}

			{/* Die Kacheln folgen dem Monatsfilter der Hall of Fame: „Gesamt" zeigt
			    alles seit Beginn, ein Monat nur diesen Monat. Mitglieder bleiben
			    die aktuelle Zahl. */}
			{data ? (
				<StatGrid>
					<Stat
						value={selectedMonth ? selectedMonth.sessionCount : data.stats.group.pastSessionCount}
						label="Trainings"
						tint={colors.accent}
						hint={selectedMonth ? `im ${selectedMonth.label}` : 'bisher durch'}
					/>
					<Stat
						value={selectedMonth ? selectedMonth.absenceCount : data.stats.group.totalAbsences}
						label="Abmeldungen"
						tint={colors.warning}
						hint={selectedMonth ? `im ${selectedMonth.label}` : 'insgesamt gemeldet'}
					/>
					<Stat
						value={
							selectedMonth
								? (selectedMonth.avgPulledPerSession ?? 0)
								: data.stats.group.avgPulledPerSession
						}
						label="Ø pro Training"
						tint={colors.text}
						hint={selectedMonth ? `im ${selectedMonth.label}` : 'im Schnitt dabei'}
					/>
					<Stat
						value={data.stats.group.memberCount}
						label="Mitglieder"
						tint={colors.text}
						hint="in der Wertung"
					/>
				</StatGrid>
			) : null}

			<SectionTitle>Hall of Fame</SectionTitle>
			{months.length ? (
				<ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
					<View style={styles.monthChips}>
						<Pressable
							onPress={() => setMonthKey(null)}
							style={[styles.monthChip, monthKey === null && { backgroundColor: colors.accent, borderColor: colors.accent }]}
						>
							<Text style={[styles.monthChipText, monthKey === null && { color: colors.onAccent }]}>
								Gesamt
							</Text>
						</Pressable>
						{months.map((m) => (
							<Pressable
								key={m.key}
								onPress={() => setMonthKey(m.key)}
								style={[styles.monthChip, monthKey === m.key && { backgroundColor: colors.accent, borderColor: colors.accent }]}
							>
								<Text style={[styles.monthChipText, monthKey === m.key && { color: colors.onAccent }]}>
									{m.label}
								</Text>
							</Pressable>
						))}
					</View>
				</ScrollView>
			) : null}
			<Card style={{ gap: 12 }}>
				{selectedMonth ? (
					<Text style={styles.monthMeta}>
						{selectedMonth.label}: {selectedMonth.sessionCount} Trainings ·{' '}
						{selectedMonth.absenceCount} Abmeldungen
					</Text>
				) : null}
				{(selectedMonth?.leaderboard ?? lb).map((row, i) => (
					<View key={row.userId} style={{ gap: 4 }}>
						<View style={styles.lbRow}>
							<Text style={[styles.lbRank, i < 3 && { color: colors.accent }]}>{i + 1}</Text>
							<Avatar username={row.username} avatar={row.avatar} size={26} index={i} />
							<Text style={[styles.lbName, me?.id === row.userId && { color: colors.accent }]}>
								{row.username}
							</Text>
							{row.streakNoAbsence >= 3 ? (
								<View style={styles.streak}>
									<Ionicons name="flame" size={12} color={colors.warning} />
									<Text style={styles.streakText}>{row.streakNoAbsence}</Text>
								</View>
							) : null}
							<Text style={styles.lbPercent}>{row.showUpPercent}%</Text>
						</View>
						<ProgressBar percent={row.showUpPercent} />
						<Text style={styles.detailLine}>
							{row.eligiblePastSessions} Trainings · {row.implicitPresent} gezogen ·{' '}
							{row.absences} abgemeldet
						</Text>
					</View>
				))}
			</Card>

			{data?.stats.monthly?.length ? (
				<>
					<SectionTitle>Monatsverlauf</SectionTitle>
					<Card style={{ gap: 12 }}>
						{/* Neueste zuerst — vorher zeigte slice(0,8) die ÄLTESTEN Monate. */}
					{[...data.stats.monthly].slice(-8).reverse().map((m) => {
							return (
								<View key={m.key} style={{ gap: 6 }}>
									<View style={styles.monthRow}>
										<Text style={styles.monthLabel}>{m.label}</Text>
										<Text style={styles.monthMeta}>
											{m.sessionCount} Trainings · {m.absenceCount} Abmeldungen
										</Text>
									</View>
									<ProgressBar
										percent={(m.sessionCount / Math.max(...data.stats.monthly.map((x) => x.sessionCount || 1))) * 100}
										color={colors.accentBlue}
									/>
								</View>
							);
						})}
					</Card>
				</>
			) : null}

			{extraUnits.length ? (
				<>
					<SectionTitle>Extra-Einheiten</SectionTitle>
					<Card style={{ gap: 8 }}>
						<Text style={styles.soloHint}>
							Solo-Trainings und Zusatztrainings — zählt nicht in „Gezogen %".
						</Text>
						{extraUnits.map((row, i) => (
							<View key={row.userId} style={styles.lbRow}>
								<Text style={[styles.lbRank, i === 0 && { color: colors.accent }]}>{i + 1}</Text>
								<Avatar username={row.username} avatar={row.avatar} size={26} index={i} />
								<Text style={[styles.lbName, me?.id === row.userId && { color: colors.accent }]}>
									{row.username}
								</Text>
								<Text style={styles.soloMeta}>
									{row.solo} solo{row.extra > 0 ? ` · ${row.extra} zusatz` : ''}
								</Text>
								<Text style={styles.lbPercent}>{row.total}</Text>
							</View>
						))}
					</Card>
				</>
			) : null}

			{spotRows.length > 0 ? (
				<>
					<SectionTitle>Spot-Auswertung</SectionTitle>
					<ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
						<View style={{ flexDirection: 'row', gap: 8 }}>
							{spotPeriods.map((p) => (
								<Pressable
									key={p.key}
									onPress={() => setSpotPeriod(p.key)}
									style={({ pressed }) => [
										styles.monthChip,
										spotPeriod === p.key && {
											backgroundColor: colors.accent,
											borderColor: colors.accent
										},
										pressed && { opacity: 0.8 }
									]}
								>
									<Text
										style={[
											styles.monthChipText,
											spotPeriod === p.key && { color: colors.onAccent }
										]}
									>
										{p.label}
									</Text>
								</Pressable>
							))}
						</View>
					</ScrollView>
					<Card style={{ gap: 10 }}>
						<Text style={styles.sectionHint}>Wie oft ein Spot fürs Training gewählt wurde.</Text>
						{spotRows.map((row, i) => (
							<View key={row.spotId} style={{ gap: 4 }}>
								<View style={styles.monthRow}>
									<Text style={styles.lbRank}>{i + 1}</Text>
									<Text style={styles.spotUsageName} numberOfLines={1}>
										{row.name}
									</Text>
									<Text style={styles.monthMeta}>
										{row.count}×
									</Text>
								</View>
								<ProgressBar
									percent={(row.count / spotRows[0].count) * 100}
									color={colors.accent}
								/>
								<Text style={styles.spotUsageMeta}>
									{row.city} · zuletzt{' '}
									{new Date(`${row.last}T12:00:00`).toLocaleDateString('de-CH', {
										day: 'numeric',
										month: 'short',
										year: 'numeric'
									})}
								</Text>
							</View>
						))}
					</Card>
				</>
			) : null}

			{data?.solo.recent.length ? (
				<>
					<SectionTitle>Zuletzt solo</SectionTitle>
					<Card style={{ gap: 8 }}>
						{data.solo.recent.map((r, i) => (
							<View key={i} style={styles.recentRow}>
								<Ionicons name="flash-outline" size={14} color={colors.accent} />
								<Text style={styles.recentText} numberOfLines={1}>
									<Text style={{ fontFamily: fonts.sansBold, color: colors.text }}>{r.username}</Text>
									{'  '}
									{new Date(`${r.date}T12:00:00`).toLocaleDateString('de-CH', {
										day: 'numeric',
										month: 'short'
									})}
									{r.note ? ` · ${r.note}` : ''}
								</Text>
							</View>
						))}
					</Card>
				</>
			) : null}

			{data ? (
				<>
					<SectionTitle>Abmeldegründe</SectionTitle>
					{absencePeople.length > 1 ? (
						<ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
							<View style={styles.monthChips}>
								<Pressable
									onPress={() => {
										setAbsencePerson(null);
										setAbsenceLimit(30);
									}}
									style={({ pressed }) => [
										styles.monthChip,
										absencePerson === null && {
											backgroundColor: colors.accent,
											borderColor: colors.accent
										},
										pressed && { opacity: 0.8 }
									]}
								>
									<Text
										style={[
											styles.monthChipText,
											absencePerson === null && { color: colors.onAccent }
										]}
									>
										Alle
									</Text>
								</Pressable>
								{absencePeople.map((name) => (
									<Pressable
										key={name}
										onPress={() => {
											setAbsencePerson(name);
											setAbsenceLimit(30);
										}}
										style={({ pressed }) => [
											styles.monthChip,
											absencePerson === name && {
												backgroundColor: colors.accent,
												borderColor: colors.accent
											},
											pressed && { opacity: 0.8 }
										]}
									>
										<Text
											style={[
												styles.monthChipText,
												absencePerson === name && { color: colors.onAccent }
											]}
										>
											{name}
										</Text>
									</Pressable>
								))}
							</View>
						</ScrollView>
					) : null}
					<Card style={{ gap: 12 }}>
						<Text style={styles.soloHint}>
							Was waren die Gründe? Vergangene Trainings, neueste zuerst.
						</Text>
						{absenceRows.length === 0 ? (
							<Text style={styles.sectionHint}>
								Noch keine Abmeldungen in vergangenen Trainings.
							</Text>
						) : (
							<>
								{absenceRows.slice(0, absenceLimit).map((row) => (
									<View key={row.id} style={styles.absenceRow}>
										<Avatar username={row.username} avatar={row.avatar} size={24} />
										<View style={{ flex: 1, gap: 2 }}>
											<View style={styles.absenceHead}>
												<Text style={styles.absenceName}>{row.username}</Text>
												<Text style={styles.absenceDate}>
													{new Date(`${row.date}T12:00:00`).toLocaleDateString('de-CH', {
														weekday: 'short',
														day: 'numeric',
														month: 'short'
													})}
												</Text>
												{row.isExtra ? (
													<Text style={[styles.absenceBadge, { color: colors.accentBlue }]}>
														Zusatz
													</Text>
												) : null}
												{row.byAdmin ? (
													<Text
														style={styles.absenceBadge}
														accessibilityLabel="Vom Admin nachgetragen"
													>
														Admin
													</Text>
												) : null}
												{row.lateMinutes !== null ? (
													<Text
														style={[styles.absenceBadge, { color: colors.danger }]}
														accessibilityLabel={`Zu spät abgemeldet, ${row.lateMinutes} Minuten nach Spot-Schluss`}
													>
														{row.lateMinutes} Min. zu spät
													</Text>
												) : null}
												{row.cancelled ? (
													<Text style={styles.absenceBadge}>abgesagt</Text>
												) : null}
											</View>
											<Text style={styles.absenceReason}>{row.reason}</Text>
										</View>
									</View>
								))}
								{absenceRows.length > absenceLimit ? (
									<Button
										label="Mehr anzeigen"
										kind="ghost"
										small
										onPress={() => setAbsenceLimit((n) => n + 30)}
									/>
								) : null}
							</>
						)}
					</Card>
				</>
			) : null}
		</Screen>
	);
}

const makeStyles = (colors: ThemeColors) =>
	StyleSheet.create({
	statsRow: { flexDirection: 'row', gap: 8 },
	statBox: {
		flex: 1,
		backgroundColor: colors.card,
		borderRadius: 20,
		paddingVertical: 12,
		alignItems: 'center'
	},
	statNum: { color: colors.fg + textAlpha.primary, fontFamily: fonts.display, fontSize: 30, lineHeight: 32 },
	statLabel: { color: colors.fg + textAlpha.muted, fontSize: 12, lineHeight: 16, marginTop: 4 },
	lbRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
	detailLine: {
		color: colors.fg + textAlpha.muted,
		fontSize: 12,
		lineHeight: 16,
		fontFamily: fonts.sans
	},
	monthRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
	monthChips: { flexDirection: 'row', gap: 8, paddingBottom: 4 },
	monthChip: {
		borderRadius: 999,
		borderWidth: 1,
		borderColor: colors.border,
		backgroundColor: colors.card,
		paddingHorizontal: 14,
		paddingVertical: 7
	},
	monthChipText: {
		color: colors.fg + textAlpha.primary,
		fontSize: 13,
		lineHeight: 18,
		fontFamily: fonts.sansMedium
	},
	monthLabel: {
		color: colors.fg + textAlpha.primary,
		fontSize: 14,
		lineHeight: 20,
		fontFamily: fonts.sansSemi
	},
	monthMeta: { color: colors.fg + textAlpha.muted, fontSize: 12, lineHeight: 16, fontFamily: fonts.sans },
	sectionHint: { color: colors.fg + textAlpha.muted, fontSize: 12, lineHeight: 17, fontFamily: fonts.sans },
	spotUsageName: {
		color: colors.fg + textAlpha.primary,
		fontSize: 14,
		lineHeight: 20,
		fontFamily: fonts.sansSemi,
		flex: 1
	},
	spotUsageMeta: { color: colors.fg + textAlpha.muted, fontSize: 11, lineHeight: 15, fontFamily: fonts.sans },
	lbRank: { color: colors.fg + textAlpha.muted, fontSize: 12, lineHeight: 16, fontFamily: fonts.sansBold, width: 18 },
	lbName: { color: colors.fg + textAlpha.primary, fontSize: 14, lineHeight: 20, fontFamily: fonts.sansSemi, flex: 1 },
	lbPercent: { color: colors.fg + textAlpha.secondary, fontSize: 12, lineHeight: 16, fontFamily: fonts.sansBold },
	streak: { flexDirection: 'row', alignItems: 'center', gap: 4 },
	streakText: { color: colors.warning, fontSize: 12, lineHeight: 16, fontFamily: fonts.sansBold },
	soloMeta: { color: colors.fg + textAlpha.muted, fontSize: 12, lineHeight: 16 },
	soloHint: { color: colors.fg + textAlpha.muted, fontSize: 11, lineHeight: 15, marginBottom: 2 },
	recentRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
	recentText: { color: colors.fg + textAlpha.secondary, fontSize: 12, lineHeight: 16, flex: 1 },
	absenceRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
	absenceHead: { flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' },
	absenceName: {
		color: colors.fg + textAlpha.primary,
		fontSize: 13,
		lineHeight: 18,
		fontFamily: fonts.sansSemi
	},
	absenceDate: {
		color: colors.fg + textAlpha.muted,
		fontSize: 11,
		lineHeight: 15,
		fontFamily: fonts.sans
	},
	absenceBadge: {
		color: colors.fg + textAlpha.muted,
		fontSize: 10,
		lineHeight: 14,
		fontFamily: fonts.sansBold,
		textTransform: 'uppercase'
	},
	absenceReason: {
		color: colors.fg + textAlpha.secondary,
		fontSize: 12,
		lineHeight: 17,
		fontFamily: fonts.sans
	}
});
