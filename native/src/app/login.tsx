import { useState } from 'react';
import {
	View,
	Text,
	TextInput,
	Pressable,
	StyleSheet,
	KeyboardAvoidingView,
	Platform,
	ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '../lib/theme';
import { login } from '../lib/api';
import { useAuth } from './_layout';

export default function Login() {
	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');
	const [error, setError] = useState('');
	const [busy, setBusy] = useState(false);
	const { setMe } = useAuth();
	const router = useRouter();

	const submit = async () => {
		if (!username || !password || busy) return;
		setBusy(true);
		setError('');
		try {
			const me = await login(username.trim(), password);
			setMe(me);
			router.replace('/');
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Login fehlgeschlagen');
		} finally {
			setBusy(false);
		}
	};

	return (
		<KeyboardAvoidingView
			style={styles.screen}
			behavior={Platform.OS === 'ios' ? 'padding' : undefined}
		>
			<View style={styles.chevrons}>
				{/* Drei gestaffelte Chevrons — das Logo des Portals */}
				{[0, 1, 2].map((i) => (
					<Text key={i} style={[styles.chevron, { opacity: 1 - i * 0.3 }]}>
						❯
					</Text>
				))}
			</View>
			<Text style={styles.title}>Parkour Portal</Text>
			<Text style={styles.subtitle}>Melde dich mit deinem Portal-Konto an</Text>

			<TextInput
				style={styles.input}
				placeholder="Benutzername"
				placeholderTextColor={colors.textMuted}
				autoCapitalize="none"
				autoCorrect={false}
				value={username}
				onChangeText={setUsername}
			/>
			<TextInput
				style={styles.input}
				placeholder="Passwort"
				placeholderTextColor={colors.textMuted}
				secureTextEntry
				value={password}
				onChangeText={setPassword}
				onSubmitEditing={submit}
			/>

			{error ? <Text style={styles.error}>{error}</Text> : null}

			<Pressable
				style={({ pressed }) => [styles.button, pressed && { opacity: 0.8 }]}
				onPress={submit}
				disabled={busy}
			>
				{busy ? (
					<ActivityIndicator color={colors.onAccent} />
				) : (
					<Text style={styles.buttonText}>Anmelden</Text>
				)}
			</Pressable>
		</KeyboardAvoidingView>
	);
}

const styles = StyleSheet.create({
	screen: {
		flex: 1,
		backgroundColor: colors.bg,
		justifyContent: 'center',
		paddingHorizontal: 28
	},
	chevrons: { flexDirection: 'row', justifyContent: 'center', marginBottom: 12 },
	chevron: { color: '#ffffff', fontSize: 34, fontWeight: '900', marginHorizontal: 2 },
	title: {
		color: colors.text,
		fontSize: 28,
		fontWeight: '800',
		textAlign: 'center'
	},
	subtitle: {
		color: colors.textSecondary,
		fontSize: 14,
		textAlign: 'center',
		marginTop: 6,
		marginBottom: 28
	},
	input: {
		backgroundColor: colors.card,
		borderColor: colors.border,
		borderWidth: 1,
		borderRadius: 12,
		color: colors.text,
		paddingHorizontal: 16,
		paddingVertical: 14,
		fontSize: 16,
		marginBottom: 12
	},
	error: { color: colors.danger, fontSize: 14, marginBottom: 8, textAlign: 'center' },
	button: {
		backgroundColor: colors.accent,
		borderRadius: 12,
		paddingVertical: 15,
		alignItems: 'center',
		marginTop: 8
	},
	buttonText: { color: colors.onAccent, fontSize: 16, fontWeight: '800' }
});
