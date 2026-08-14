import {
	createContext,
	useContext,
	useEffect,
	useState,
	useCallback,
	type ReactNode
} from 'react';
import { AppState } from 'react-native';
import { getActivity, markActivitySeen, type FeedEntry } from './api';

/**
 * Aktivitäts-Feed: roter Punkt an der Glocke, überall sichtbar.
 * Pollt alle 30 s solange die App im Vordergrund ist.
 */
type ActivityContextValue = {
	unread: number;
	entries: FeedEntry[];
	latestId: number;
	refresh: () => Promise<void>;
	markSeen: () => Promise<void>;
};

const ActivityContext = createContext<ActivityContextValue>({
	unread: 0,
	entries: [],
	latestId: 0,
	refresh: async () => {},
	markSeen: async () => {}
});

export const useActivity = () => useContext(ActivityContext);

export function ActivityProvider({ children, enabled }: { children: ReactNode; enabled: boolean }) {
	const [unread, setUnread] = useState(0);
	const [entries, setEntries] = useState<FeedEntry[]>([]);
	const [latestId, setLatestId] = useState(0);

	const refresh = useCallback(async () => {
		try {
			const feed = await getActivity();
			setUnread(feed.unread);
			setEntries(feed.entries);
			setLatestId(feed.latestId);
		} catch {
			// Offline — Punkt bleibt einfach wie er ist.
		}
	}, []);

	const markSeen = useCallback(async () => {
		if (!latestId) return;
		setUnread(0);
		try {
			await markActivitySeen(latestId);
		} catch {
			// beim nächsten Poll erneut
		}
	}, [latestId]);

	useEffect(() => {
		if (!enabled) return;
		refresh();
		const interval = setInterval(() => {
			if (AppState.currentState === 'active') refresh();
		}, 30_000);
		const sub = AppState.addEventListener('change', (state) => {
			if (state === 'active') refresh();
		});
		return () => {
			clearInterval(interval);
			sub.remove();
		};
	}, [enabled, refresh]);

	return (
		<ActivityContext.Provider value={{ unread, entries, latestId, refresh, markSeen }}>
			{children}
		</ActivityContext.Provider>
	);
}
