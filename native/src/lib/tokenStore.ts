import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * Token-Ablage: auf dem Gerät im Android-Keystore (SecureStore), im
 * Browser (nur für Design-Vorschauen beim Entwickeln) im localStorage.
 */
export async function readToken(key: string): Promise<string | null> {
	if (Platform.OS === 'web') return globalThis.localStorage?.getItem(key) ?? null;
	return SecureStore.getItemAsync(key);
}

export async function writeToken(key: string, value: string | null): Promise<void> {
	if (Platform.OS === 'web') {
		if (value) globalThis.localStorage?.setItem(key, value);
		else globalThis.localStorage?.removeItem(key);
		return;
	}
	if (value) await SecureStore.setItemAsync(key, value);
	else await SecureStore.deleteItemAsync(key);
}
