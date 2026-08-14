import { useState } from 'react';
import {
	View,
	Text,
	TextInput,
	Pressable,
	StyleSheet,
	KeyboardAvoidingView,
	Platform,
	ActivityIndicator,
	Image
} from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../lib/theme';
import { login } from '../lib/api';
import { useAuth } from './_layout';

export default function Login() {
	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');
	const [showPassword, setShowPassword] = useState(false);
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
			<Image source={require('../../assets/images/icon.png')} style={styles.logo} />
			<Text style={styles.title}>
				Parkour <Text style={styles.titleAccent}>Portal</Text>
			</Text>
			<Text style={styles.subtitle}>Melde dich mit deinem Portal-Konto an</Text>

			<View style={styles.inputWrap}>
				<Ionicons name="person-outline" size={18} color={colors.textMuted} />
				<TextInput
					style={styles.input}
					placeholder="Benutzername"
					placeholderTextColor={colors.textMuted}
					autoCapitalize="none"
					autoCorrect={false}
					value={username}
					onChangeText={setUsername}
				/>
			</View>
			<View style={styles.inputWrap}>
				<Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} />
				<TextInput
					style={styles.input}
					placeholder="Passwort"
					placeholderTextColor={colors.textMuted}
					secureTextEntry={!showPassword}
					value={password}
					onChangeText={setPassword}
					onSubmitEditing={submit}
				/>
				<Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
					<Ionicons
						name={showPassword ? 'eye-off-outline' : 'eye-outline'}
						size={18}
						color={colors.textMuted}
					/>
				</Pressable>
			</View>

			{error ? <Text style={styles.error}>{error}</Text> : null}

			<Pressable
				style={({ pressed }) => [styles.button, (pressed || busy) && { opacity: 0.85 }]}
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
	logo: {
		width: 84,
		height: 84,
		borderRadius: 22,
		alignSelf: 'center',
		marginBottom: 18,
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: colors.border
	},
	title: {
		color: colors.text,
		fontSize: 28,
		fontWeight: '800',
		textAlign: 'center',
		letterSpacing: -0.5
	},
	titleAccent: { color: colors.accent },
	subtitle: {
		color: colors.textSecondary,
		fontSize: 14,
		textAlign: 'center',
		marginTop: 6,
		marginBottom: 30
	},
	inputWrap: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 10,
		backgroundColor: colors.card,
		borderColor: colors.border,
		borderWidth: 1,
		borderRadius: 14,
		paddingHorizontal: 14,
		marginBottom: 12
	},
	input: { flex: 1, color: colors.text, paddingVertical: 14, fontSize: 16 },
	error: { color: colors.danger, fontSize: 14, marginBottom: 8, textAlign: 'center' },
	button: {
		backgroundColor: colors.accent,
		borderRadius: 999,
		paddingVertical: 15,
		alignItems: 'center',
		marginTop: 10
	},
	buttonText: { color: colors.onAccent, fontSize: 16, fontWeight: '800' }
});
