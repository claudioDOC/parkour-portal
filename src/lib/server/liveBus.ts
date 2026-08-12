/**
 * Live-Bus: hält alle offenen SSE-Verbindungen und stösst sie an, wenn sich
 * Daten geändert haben. Die Clients laden dann ihre Seite-Daten neu —
 * dadurch ist die App überall sofort aktuell, ohne Pull-to-Refresh.
 *
 * In-Process reicht: das Portal läuft als ein einzelner Node-Prozess.
 */

type Client = {
	send: (data: string) => void;
	close: () => void;
};

const clients = new Set<Client>();

export function addLiveClient(client: Client): () => void {
	clients.add(client);
	return () => clients.delete(client);
}

export function liveClientCount(): number {
	return clients.size;
}

/** Kurz entprellt — eine Mutation-Salve löst nur einen Reload aus. */
let pending: ReturnType<typeof setTimeout> | null = null;

export function broadcastDataChanged(): void {
	if (pending) return;
	pending = setTimeout(() => {
		pending = null;
		for (const c of clients) {
			try {
				c.send('data');
			} catch {
				clients.delete(c);
				try {
					c.close();
				} catch {
					/* schon zu */
				}
			}
		}
	}, 300);
}
