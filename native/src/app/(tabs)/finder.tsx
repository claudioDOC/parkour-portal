import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { fonts, type ThemeColors } from '../../lib/theme';
import { useTheme, useThemedStyles } from '../../lib/themeContext';
import { Card, TopBar, Screen, Stars, Button, Input, EmptyState } from '../../lib/ui';
import { runFinder, type FinderResult } from '../../lib/api';

/**
 * Spot-Finder wie auf der Website: Wunsch eingeben, drei Vorschläge mit
 * Begründungs-Chips, neu würfeln so oft man will.
 */
export default function Finder() {
	const { colors } = useTheme();
	const styles = useThemedStyles(makeStyles);
	const router = useRouter();
	const [wish, setWish] = useState('');
	const [results, setResults] = useState<FinderResult[] | null>(null);
	const [hint, setHint] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const search = async () => {
		if (busy) return;
		setBusy(true);
		try {
			const res = await runFinder(wish.trim());
			setResults(res.results);
			setHint(res.forecastHint);
		} catch (e) {
			Alert.alert('Fehler', e instanceof Error ? e.message : 'Finder nicht erreichbar');
		} finally {
			setBusy(false);
		}
	};

	return (
		<Screen>
			<TopBar
				kicker="Wohin heute?"
				title="Spot Finder"
				sub="Sag, worauf du Lust hast — oder lass dich überraschen."
			/>

			<Input
				placeholder="z. B. Flips, Bars, Mauern, hoch, Rail …"
				value={wish}
				onChangeText={setWish}
				onSubmitEditing={search}
			/>
			<Button
				label={busy ? 'Suche …' : results ? 'Nochmal würfeln 🎲' : 'Spot finden'}
				onPress={search}
				wide
			/>

			{hint ? <Text style={styles.hint}>{hint}</Text> : null}

			{results?.map((r) => (
				<Pressable key={r.id} onPress={() => router.push(`/spot/${r.id}`)}>
					{({ pressed }) => (
						<Card style={[{ gap: 8 }, pressed && { opacity: 0.85 }]}>
							<View style={styles.head}>
								<View style={{ flex: 1 }}>
									<Text style={styles.name}>{r.name}</Text>
									<Text style={styles.city}>{r.city}</Text>
								</View>
								<Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
							</View>
							<View style={styles.scoreRow}>
								<Stars value={r.avgScore} size={14} />
								{r.voteCount > 0 ? (
									<Text style={styles.score}>
										{r.avgScore.toFixed(1)} ({r.voteCount})
									</Text>
								) : null}
							</View>
							{r.reasons.length > 0 ? (
								<View style={styles.reasonWrap}>
									{r.reasons.map((reason, i) => (
										<View key={i} style={styles.reason}>
											<Text style={styles.reasonText}>{reason}</Text>
										</View>
									))}
								</View>
							) : null}
						</Card>
					)}
				</Pressable>
			))}

			{results && results.length === 0 ? (
				<EmptyState icon="telescope-outline" text="Nichts gefunden — formulier den Wunsch anders." />
			) : null}
		</Screen>
	);
}

const makeStyles = (colors: ThemeColors) =>
	StyleSheet.create({
		hint: { color: colors.accentBlue, fontFamily: fonts.sans, fontSize: 13.5 },
		head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
		name: { color: colors.text, fontSize: 16.5, fontFamily: fonts.sansBold },
		city: { color: colors.textMuted, fontSize: 13, fontFamily: fonts.sans },
		scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
		score: { color: colors.textMuted, fontSize: 12.5, fontFamily: fonts.sans },
		reasonWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
		reason: {
			backgroundColor: colors.hover,
			borderRadius: 999,
			paddingHorizontal: 11,
			paddingVertical: 5
		},
		reasonText: { color: colors.textSecondary, fontSize: 12.5, fontFamily: fonts.sansMedium }
	});
