import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

/**
 * Winziger Daten-Layer mit App-Gefühl: Jede Ansicht zeigt sofort den letzten
 * bekannten Stand aus dem Speicher-Cache und aktualisiert still im
 * Hintergrund — nirgends Ladebalken beim Navigieren.
 */
const cache = new Map<string, unknown>();

export function useData<T>(key: string, fetcher: () => Promise<T>) {
	const [data, setData] = useState<T | null>(() => (cache.get(key) as T) ?? null);
	const [error, setError] = useState('');
	const [refreshing, setRefreshing] = useState(false);
	const fetcherRef = useRef(fetcher);
	fetcherRef.current = fetcher;

	const refresh = useCallback(async () => {
		try {
			const fresh = await fetcherRef.current();
			cache.set(key, fresh);
			setData(fresh);
			setError('');
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Laden fehlgeschlagen');
		}
	}, [key]);

	// Pull-to-refresh: gleicher Refresh, aber mit sichtbarem Spinner.
	const onRefresh = useCallback(async () => {
		setRefreshing(true);
		await refresh();
		setRefreshing(false);
	}, [refresh]);

	useFocusEffect(
		useCallback(() => {
			refresh();
		}, [refresh])
	);

	return { data, error, refresh, refreshing, onRefresh };
}

/** Cache gezielt leeren (z. B. beim Logout). */
export function clearDataCache() {
	cache.clear();
}
