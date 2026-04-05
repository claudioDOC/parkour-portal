import { json } from '@sveltejs/kit';

const READONLY_HINT =
	'Datenbank ist schreibgeschützt. Auf dem Server: Besitzer von `data/` und `data/parkour.db` (und ggf. `-wal`/`-shm`) auf denselben User setzen wie in der systemd-Unit (`User=`), z. B. `sudo chown -R DEIN_USER:DEIN_USER /opt/parkour-portal/data`.';

/**
 * Mappt typische SQLite-Fehler auf JSON für Admin-APIs (kein generisches HTML-500).
 */
export function jsonFromSqliteOrSchemaError(e: unknown): ReturnType<typeof json> | null {
	const msg = e instanceof Error ? e.message : String(e);

	if (msg.includes('readonly database')) {
		return json({ error: READONLY_HINT }, { status: 500 });
	}
	if (msg.includes('no such column')) {
		return json(
			{
				error: 'Datenbank-Schema passt nicht zum Code.',
				detail: `${msg} — Auf dem Server: npm run db:migrate`
			},
			{ status: 503 }
		);
	}
	return null;
}
