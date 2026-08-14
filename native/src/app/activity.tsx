import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { fonts, type ThemeColors } from '../lib/theme';
import { useTheme, useThemedStyles } from '../lib/themeContext';
import { Card, TopBar, Screen, EmptyState } from '../lib/ui';
import { useActivity } from '../lib/activity';

const KIND_ICONS: Record<string, string> = {
	'challenge.new': 'trophy-outline',
	'challenge.done': 'checkmark-circle-outline',
	'training.cancelled': 'close-circle-outline',
	'training.spot_fixed': 'location-outline',
	'trip.new': 'airplane-outline',
	'trip.date.adopted': 'calendar-outline'
};

function timeAgo(iso: string): string {
	const then = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`).getTime();
	const mins = Math.max(0, Math.round((Date.now() - then) / 60_000));
	if (mins < 1) return 'gerade eben';
	if (mins < 60) return `vor ${mins} min`;
	const hours = Math.round(mins / 60);
	if (hours < 24) return `vor ${hours} h`;
	const days = Math.round(hours / 24);
	return `vor ${days} d`;
}

export default function Activity() {
	const { colors } = useTheme();
	const styles = useThemedStyles(makeStyles);
	const { entries, refresh, markSeen } = useActivity();

	// Beim Öffnen: aktualisieren und als gelesen markieren (Punkt verschwindet).
	useEffect(() => {
		refresh().then(markSeen);
	}, []);

	return (
		<Screen>
			<TopBar back kicker="Was läuft" title="Aktivität" />

			{entries.length === 0 ? (
				<EmptyState icon="notifications-off-outline" text="Noch keine Ereignisse." />
			) : (
				<Card style={{ gap: 2, paddingVertical: 8 }}>
					{entries.map((e) => (
						<View key={e.id} style={styles.row}>
							<View style={styles.iconWrap}>
								<Ionicons
									name={(KIND_ICONS[e.kind] ?? 'sparkles-outline') as 'sparkles-outline'}
									size={17}
									color={colors.accent}
								/>
							</View>
							<View style={{ flex: 1, gap: 1 }}>
								<Text style={styles.title}>{e.title}</Text>
								{e.body ? (
									<Text style={styles.body} numberOfLines={2}>
										{e.body}
									</Text>
								) : null}
								<Text style={styles.time}>
									{e.actorName ? `${e.actorName} · ` : ''}
									{timeAgo(e.createdAt)}
								</Text>
							</View>
						</View>
					))}
				</Card>
			)}
		</Screen>
	);
}

const makeStyles = (colors: ThemeColors) =>
	StyleSheet.create({
	row: { flexDirection: 'row', gap: 12, paddingVertical: 10 },
	iconWrap: {
		width: 34,
		height: 34,
		borderRadius: 17,
		backgroundColor: colors.accent + '1a',
		alignItems: 'center',
		justifyContent: 'center'
	},
	title: { color: colors.text, fontSize: 14, fontFamily: fonts.sansSemi },
	body: { color: colors.textSecondary, fontSize: 13, fontFamily: fonts.sans },
	time: { color: colors.textMuted, fontSize: 11.5, marginTop: 2 }
});
