import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { fonts, type ThemeColors } from '../../lib/theme';
import { textAlpha } from '../../lib/tokens';
import { useTheme, useThemedStyles } from '../../lib/themeContext';
import { Card, TopBar, Screen, Button, Input, EmptyState } from '../../lib/ui';
import { useData } from '../../lib/store';
import { runFinder, getSpots, voteSpotForTraining, type FinderResult } from '../../lib/api';

/**
 * Spot-Finder als Assistent wie auf der Website: Wetter → Stadt → Wunsch →
 * Ergebnis. Alles antippbar, Tippen ist optional.
 */
type Step = 'weather' | 'city' | 'wish' | 'result';

const STEPS: { key: Step; label: string }[] = [
	{ key: 'weather', label: 'Wetter' },
	{ key: 'city', label: 'Stadt' },
	{ key: 'wish', label: 'Wunsch' },
	{ key: 'result', label: 'Ergebnis' }
];

const WISH_IDEAS = ['Flips', 'Bars', 'Mauern', 'Präzisionen', 'Rails', 'Treppen', 'Wall'];

/** Gleiche Liste wie im Web-Portal (src/lib/cityRegions.ts) — Pendel-Regionen. */
const CITY_REGIONS: { id: string; label: string; cities: string[] }[] = [
	{ id: 'thun', label: 'Thun & Umgebung', cities: ['Thun', 'Hünibach', 'Steffisburg', 'Heimberg'] },
	{
		id: 'bern',
		label: 'Bern & Umgebung',
		cities: ['Bern', 'Niederwangen', 'Worb', 'Ittigen', 'Bümpliz', 'Kehrsatz', 'Belp']
	},
	{ id: 'muensingen', label: 'Münsingen & Umgebung', cities: ['Münsingen', 'Rubigen'] }
];

/** Kanonische Techniken des Portals — für den Technik-Filter. */
const TECHNIQUES = [
	'Präzisionssprung', 'Schwingen', 'Flow', 'Armsprung',
	'Klettern', 'Tic-Tac', 'Vault', 'Balance',
	'Drops', 'Katz', 'Roofgap'
];

export default function Finder() {
	const { colors } = useTheme();
	const styles = useThemedStyles(makeStyles);
	const router = useRouter();
	const spots = useData('spots', getSpots);

	const [step, setStep] = useState<Step>('weather');
	const [useAutoWeather, setUseAutoWeather] = useState(true);
	const [weatherCondition, setWeatherCondition] = useState<'trocken' | 'nass' | 'egal'>('egal');
	const [isDark, setIsDark] = useState(false);
	const [cities, setCities] = useState<string[]>([]);
	const [techniques, setTechniques] = useState<string[]>([]);
	const [wish, setWish] = useState('');
	const [results, setResults] = useState<FinderResult[] | null>(null);
	const [hint, setHint] = useState<string | null>(null);
	const [voteSessionId, setVoteSessionId] = useState<number | null>(null);
	const [votedSpotId, setVotedSpotId] = useState<number | null>(null);
	const [busy, setBusy] = useState(false);

	/** Alle Orte aus der Spot-Liste, ohne Dubletten. */
	const allCities = [...new Set((spots.data?.spots ?? []).map((s) => s.city))].sort((a, b) =>
		a.localeCompare(b, 'de')
	);

	const search = async () => {
		setBusy(true);
		setStep('result');
		try {
			const res = await runFinder({
				useAutoWeather,
				weatherCondition,
				isDark,
				cities,
				techniques,
				wish: wish.trim()
			});
			setResults(res.results);
			setHint(res.forecastHint);
			setVoteSessionId(res.nextOpenSessionId ?? null);
		} catch (e) {
			Alert.alert('Fehler', e instanceof Error ? e.message : 'Finder nicht erreichbar');
		} finally {
			setBusy(false);
		}
	};

	/** „Von vorne": alle Eingaben leeren, nicht nur zum ersten Schritt springen. */
	const resetAll = () => {
		setUseAutoWeather(true);
		setWeatherCondition('egal');
		setIsDark(false);
		setCities([]);
		setTechniques([]);
		setWish('');
		setResults(null);
		setHint(null);
		setVotedSpotId(null);
		setStep('weather');
	};

	const voteResult = async (r: FinderResult) => {
		if (!voteSessionId) return;
		try {
			await voteSpotForTraining(voteSessionId, r.id);
			setVotedSpotId(r.id);
			Alert.alert('Gevotet', `„${r.name}" ist fürs nächste Training vorgeschlagen.`);
		} catch (e) {
			Alert.alert('Fehler', e instanceof Error ? e.message : 'Voten fehlgeschlagen');
		}
	};

	const toggleCity = (city: string) =>
		setCities((prev) => (prev.includes(city) ? prev.filter((c) => c !== city) : [...prev, city]));

	/** Region an/aus: alle Orte der Region gemeinsam wählen — wie im Web. */
	const toggleRegion = (regionCities: string[]) =>
		setCities((prev) => {
			const allIn = regionCities.every((c) => prev.includes(c));
			if (allIn) return prev.filter((c) => !regionCities.includes(c));
			return [...new Set([...prev, ...regionCities])];
		});

	const toggleTechnique = (t: string) =>
		setTechniques((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

	const stepIndex = STEPS.findIndex((s) => s.key === step);

	return (
		<Screen>
			<TopBar kicker="Wohin heute?" title="Finder" />

			<View style={styles.steps}>
				{STEPS.map((s, i) => (
					<View key={s.key} style={styles.stepItem}>
						<View style={[styles.stepDot, i <= stepIndex && { backgroundColor: colors.accent }]}>
							<Text style={[styles.stepNum, i <= stepIndex && { color: colors.onAccent }]}>
								{i + 1}
							</Text>
						</View>
						<Text style={[styles.stepLabel, i === stepIndex && { color: colors.fg }]}>
							{s.label}
						</Text>
					</View>
				))}
			</View>

			{step === 'weather' ? (
				<Card style={{ gap: 12 }}>
					<Text style={styles.question}>Wetter berücksichtigen?</Text>
					<Choice
						label="Automatisch (Prognose nutzen)"
						hint="Empfohlen — wählt passende Spots zur Vorhersage"
						active={useAutoWeather}
						onPress={() => setUseAutoWeather(true)}
					/>
					<Choice
						label="Selbst festlegen"
						active={!useAutoWeather}
						onPress={() => setUseAutoWeather(false)}
					/>
					{!useAutoWeather ? (
						<View style={{ gap: 8, marginTop: 4 }}>
							<Text style={styles.subQuestion}>Wie ist der Boden?</Text>
							<View style={styles.chipRow}>
								{(['trocken', 'nass', 'egal'] as const).map((w) => (
									<Chip
										key={w}
										label={w}
										active={weatherCondition === w}
										onPress={() => setWeatherCondition(w)}
									/>
								))}
							</View>
							<Text style={styles.subQuestion}>Ist es dunkel?</Text>
							<View style={styles.chipRow}>
								<Chip label="Hell" active={!isDark} onPress={() => setIsDark(false)} />
								<Chip label="Dunkel — Licht nötig" active={isDark} onPress={() => setIsDark(true)} />
							</View>
						</View>
					) : null}
					<Button label="Weiter" onPress={() => setStep('city')} wide />
				</Card>
			) : null}

			{step === 'city' ? (
				<Card style={{ gap: 12 }}>
					<Text style={styles.question}>Welche Orte kommen infrage?</Text>
					<Text style={styles.subQuestion}>
						{cities.length === 0 ? 'Alle Orte' : `${cities.length} ausgewählt`}
					</Text>
					<Text style={styles.subQuestion}>Regionen (Pendeln):</Text>
					<View style={styles.chipRow}>
						{CITY_REGIONS.map((rg) => (
							<Chip
								key={rg.id}
								label={rg.label}
								active={rg.cities.every((c) => cities.includes(c))}
								onPress={() => toggleRegion(rg.cities)}
							/>
						))}
					</View>
					<Text style={styles.subQuestion}>Einzelne Orte:</Text>
					<View style={styles.chipRow}>
						<Chip label="Alle" active={cities.length === 0} onPress={() => setCities([])} />
						{allCities.map((c) => (
							<Chip key={c} label={c} active={cities.includes(c)} onPress={() => toggleCity(c)} />
						))}
					</View>
					<View style={styles.navRow}>
						<Button label="Zurück" kind="ghost" onPress={() => setStep('weather')} />
						<Button label="Weiter" onPress={() => setStep('wish')} />
					</View>
				</Card>
			) : null}

			{step === 'wish' ? (
				<Card style={{ gap: 12 }}>
					<Text style={styles.question}>Worauf hast du Lust?</Text>
					<Text style={styles.subQuestion}>Optional — auswählen oder tippen</Text>
					<View style={styles.chipRow}>
						{WISH_IDEAS.map((w) => (
							<Chip
								key={w}
								label={w}
								active={wish.toLowerCase().includes(w.toLowerCase())}
								onPress={() =>
									setWish((prev) =>
										prev.toLowerCase().includes(w.toLowerCase())
											? prev
													.split(/\s+/)
													.filter((x) => x.toLowerCase() !== w.toLowerCase())
													.join(' ')
											: `${prev} ${w}`.trim()
									)
								}
							/>
						))}
					</View>
					<Input placeholder="z. B. hohe Mauer, weicher Boden …" value={wish} onChangeText={setWish} />
					<Text style={styles.subQuestion}>Bestimmte Techniken?</Text>
					<View style={styles.chipRow}>
						{TECHNIQUES.map((t) => (
							<Chip
								key={t}
								label={t}
								active={techniques.includes(t)}
								onPress={() => toggleTechnique(t)}
							/>
						))}
					</View>
					<View style={styles.navRow}>
						<Button label="Zurück" kind="ghost" onPress={() => setStep('city')} />
						<Button label="Spots finden" onPress={search} />
					</View>
				</Card>
			) : null}

			{step === 'result' ? (
				<>
					{busy ? (
						<View style={{ paddingVertical: 40 }}>
							<ActivityIndicator color={colors.accent} size="large" />
						</View>
					) : null}

					{hint ? <Text style={styles.hint}>{hint}</Text> : null}

					{results?.map((r, i) => {
						const tags = [
							...(r.lighting ? [`Licht: ${r.lighting}`] : []),
							...(r.goodWeather ?? '').split(',').map((t) => t.trim()).filter(Boolean),
							...(r.techniques ?? '')
								.split(',')
								.map((t) => t.trim())
								.filter(Boolean)
								.slice(0, 4)
						];
						return (
							<Pressable key={r.id} onPress={() => router.push(`/spot/${r.id}`)}>
								{({ pressed }) => (
									<Card style={[{ gap: 8 }, pressed && { opacity: 0.85 }]}>
										<View style={styles.head}>
											<View style={styles.rank}>
												<Text style={styles.rankText}>{i + 1}</Text>
											</View>
											<View style={{ flex: 1 }}>
												<Text style={styles.name}>{r.name}</Text>
												<Text style={styles.city}>
													{r.city}
													{r.voteCount > 0
														? ` · ${r.voteCount} Stimme${r.voteCount === 1 ? '' : 'n'}`
														: ''}
												</Text>
											</View>
											<Text style={styles.score}>
												{r.voteCount > 0 ? r.avgScore.toFixed(1) : '—'}
											</Text>
											<Ionicons
												name="chevron-forward"
												size={18}
												color={colors.fg + textAlpha.muted}
											/>
										</View>
										{r.reasons.length > 0 ? (
											<View style={styles.chipRow}>
												{r.reasons.map((reason, k) => (
													<View key={k} style={styles.reason}>
														<Text style={styles.reasonText}>{reason}</Text>
													</View>
												))}
											</View>
										) : null}
										{tags.length > 0 ? (
											<Text style={styles.city} numberOfLines={2}>
												{tags.join(' · ')}
											</Text>
										) : null}
										{voteSessionId ? (
											<Button
												label={
													votedSpotId === r.id
														? '✓ Fürs Training gevotet'
														: 'Fürs Training voten'
												}
												kind={votedSpotId === r.id ? 'ghost' : 'accent'}
												small
												onPress={() => voteResult(r)}
											/>
										) : null}
									</Card>
								)}
							</Pressable>
						);
					})}

					{results && results.length === 0 && !busy ? (
						<EmptyState icon="telescope-outline" text="Nichts gefunden — andere Filter probieren." />
					) : null}

					{!busy ? (
						<View style={styles.navRow}>
							<Button label="Von vorne" kind="ghost" onPress={resetAll} />
							<Button label="Filter ändern" kind="ghost" onPress={() => setStep('weather')} />
							<Button label="Neu würfeln 🎲" onPress={search} />
						</View>
					) : null}
				</>
			) : null}
		</Screen>
	);
}

/** Grosse Auswahlzeile mit Punkt — für Entweder-oder-Fragen. */
function Choice({
	label,
	hint,
	active,
	onPress
}: {
	label: string;
	hint?: string;
	active: boolean;
	onPress: () => void;
}) {
	const { colors } = useTheme();
	const styles = useThemedStyles(makeStyles);
	return (
		<Pressable
			onPress={onPress}
			style={({ pressed }) => [
				styles.choice,
				active && { borderColor: colors.accent, backgroundColor: colors.accent + '14' },
				pressed && { opacity: 0.8 }
			]}
		>
			<Ionicons
				name={active ? 'radio-button-on' : 'radio-button-off'}
				size={20}
				color={active ? colors.accent : colors.fg + textAlpha.muted}
			/>
			<View style={{ flex: 1 }}>
				<Text style={styles.choiceLabel}>{label}</Text>
				{hint ? <Text style={styles.choiceHint}>{hint}</Text> : null}
			</View>
		</Pressable>
	);
}

/** Antippbarer Filter-Chip. */
function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
	const { colors } = useTheme();
	const styles = useThemedStyles(makeStyles);
	return (
		<Pressable
			onPress={onPress}
			style={({ pressed }) => [
				styles.chip,
				active && { backgroundColor: colors.accent, borderColor: colors.accent },
				pressed && { opacity: 0.8 }
			]}
		>
			<Text style={[styles.chipText, active && { color: colors.onAccent }]}>{label}</Text>
		</Pressable>
	);
}

const makeStyles = (colors: ThemeColors) =>
	StyleSheet.create({
		steps: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
		stepItem: { alignItems: 'center', gap: 4, flex: 1 },
		stepDot: {
			width: 26,
			height: 26,
			borderRadius: 13,
			backgroundColor: colors.hover,
			alignItems: 'center',
			justifyContent: 'center'
		},
		stepNum: {
			color: colors.fg + textAlpha.secondary,
			fontSize: 12,
			lineHeight: 16,
			fontFamily: fonts.sansBold
		},
		stepLabel: {
			color: colors.fg + textAlpha.muted,
			fontSize: 11,
			lineHeight: 14,
			fontFamily: fonts.sansSemi
		},
		question: {
			color: colors.fg + textAlpha.primary,
			fontFamily: fonts.display,
			fontSize: 24,
			lineHeight: 26,
			letterSpacing: 0.5
		},
		subQuestion: {
			color: colors.fg + textAlpha.secondary,
			fontSize: 14,
			lineHeight: 20,
			fontFamily: fonts.sans
		},
		choice: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: 12,
			borderWidth: 1,
			borderColor: colors.border,
			borderRadius: 12,
			padding: 14
		},
		choiceLabel: {
			color: colors.fg + textAlpha.primary,
			fontSize: 14,
			lineHeight: 20,
			fontFamily: fonts.sansSemi
		},
		choiceHint: {
			color: colors.fg + textAlpha.muted,
			fontSize: 12,
			lineHeight: 16,
			fontFamily: fonts.sans,
			marginTop: 2
		},
		chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
		chip: {
			borderRadius: 999,
			borderWidth: 1,
			borderColor: colors.border,
			backgroundColor: colors.hover,
			paddingHorizontal: 14,
			paddingVertical: 8
		},
		chipText: {
			color: colors.fg + textAlpha.primary,
			fontSize: 13,
			lineHeight: 18,
			fontFamily: fonts.sansMedium
		},
		navRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 4 },
		hint: { color: colors.accentBlue, fontFamily: fonts.sans, fontSize: 14, lineHeight: 20 },
		head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
		rank: {
			width: 28,
			height: 28,
			borderRadius: 14,
			backgroundColor: colors.accent + '22',
			alignItems: 'center',
			justifyContent: 'center'
		},
		rankText: { color: colors.accent, fontSize: 14, lineHeight: 20, fontFamily: fonts.sansBold },
		name: {
			color: colors.fg + textAlpha.primary,
			fontSize: 16,
			lineHeight: 22,
			fontFamily: fonts.sansSemi
		},
		city: {
			color: colors.fg + textAlpha.muted,
			fontSize: 13,
			lineHeight: 18,
			fontFamily: fonts.sans
		},
		score: { color: colors.accent, fontFamily: fonts.display, fontSize: 28, lineHeight: 30 },
		reason: {
			backgroundColor: colors.hover,
			borderRadius: 999,
			paddingHorizontal: 12,
			paddingVertical: 5
		},
		reasonText: {
			color: colors.fg + textAlpha.secondary,
			fontSize: 12,
			lineHeight: 16,
			fontFamily: fonts.sansMedium
		}
	});
