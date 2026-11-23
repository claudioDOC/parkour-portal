import { Text, StyleSheet } from 'react-native';
import { fonts, type ThemeColors } from '../lib/theme';
import { textAlpha } from '../lib/tokens';
import { useThemedStyles } from '../lib/themeContext';
import { Card, TopBar, Screen, ErrorCard } from '../lib/ui';
import { useData } from '../lib/store';
import { getZugkraftPreview } from '../lib/api';
import { ZugkraftCard } from '../lib/ZugkraftCard';
import { useAuth } from './_layout';

/**
 * Admin-Vorschau: alle sechs Zug-O-Meter-Stufen untereinander — mit der
 * echten Karte von der Startseite, also mit Glühen und Animation. Die
 * Stufen kommen vom Server (gleiche Logik wie echt), wie im Web unter
 * /admin/zug-o-meter.
 */
export default function ZugOMeterPreview() {
	const styles = useThemedStyles(makeStyles);
	const { me } = useAuth();
	const isAdmin = me?.role === 'admin';
	const { data, error, refreshing, onRefresh } = useData('zugkraft-preview', getZugkraftPreview);

	return (
		<Screen refreshing={refreshing} onRefresh={onRefresh}>
			<TopBar back kicker="Admin" title="Zug-O-Meter" />
			{!isAdmin ? (
				<Card>
					<Text style={styles.hint}>Nur für Admins.</Text>
				</Card>
			) : (
				<>
					<Text style={styles.hint}>
						Alle Stufen so, wie sie auf der Startseite erscheinen. Die Zahl darüber ist nur hier sichtbar.
					</Text>
					{error && !data ? <ErrorCard message={error} /> : null}
					{(data?.levels ?? []).map((l) => (
						<Card key={l.avg} style={styles.card}>
							<Text style={styles.caption}>{`⌀ ${l.avg} VON 6 IM TRAINING`}</Text>
							<ZugkraftCard data={l} preview />
						</Card>
					))}
				</>
			)}
		</Screen>
	);
}

const makeStyles = (colors: ThemeColors) =>
	StyleSheet.create({
		hint: { color: colors.fg + textAlpha.muted, fontFamily: fonts.sans, fontSize: 12, lineHeight: 17 },
		card: { gap: 8 },
		caption: {
			color: colors.fg + textAlpha.muted,
			fontFamily: fonts.sansSemi,
			fontSize: 10,
			lineHeight: 14,
			letterSpacing: 1.2
		}
	});
