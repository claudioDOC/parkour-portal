/**
 * SQLite/better-sqlite3 liefert COUNT/AVG u. Ä. teils als BigInt.
 * SvelteKit-`load` und `json()` brauchen JSON-serialisierbare Werte.
 */
export function asNum(v: unknown): number {
	if (typeof v === 'bigint') return Number(v);
	if (typeof v === 'number' && Number.isFinite(v)) return v;
	const n = Number(v);
	return Number.isFinite(n) ? n : 0;
}
