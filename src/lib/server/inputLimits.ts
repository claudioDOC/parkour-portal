/**
 * Grenzen für Freitext aus Formularen und der App.
 *
 * Vorher nahm der Server Texte jeder Länge und jedes Typs an — ein
 * Spot-Name von mehreren Megabyte wäre bei jedem Seitenaufruf an alle
 * gegangen, ein Objekt statt Text endete in einem Serverfehler. Die
 * Grenzen sind grosszügig: Niemand tippt einen Spot-Namen mit 120 Zeichen.
 */
export const TEXT_MAX = {
	/** Namen, Titel, Orte, Beschriftungen */
	short: 120,
	/** Notizen zu einem Vorschlag */
	note: 1000,
	/** Ablauf-Vorschläge */
	text: 2000,
	/** Beschreibungen, Trip-Notizen */
	long: 4000
} as const;

/**
 * Text säubern: nur Strings und Zahlen, Steuerzeichen raus (Zeilenumbruch
 * und Tab bleiben, `\r\n` wird `\n`), getrimmt und auf `max` Zeichen gekürzt.
 */
export function cleanText(v: unknown, max: number): string {
	if (typeof v !== 'string' && typeof v !== 'number') return '';
	return String(v)
		.replace(/\r\n?/g, '\n')
		.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '')
		.trim()
		.slice(0, max);
}

/** Liste (Array oder Komma-Text) → Komma-Text, jedes Element gesäubert. */
export function cleanList(v: unknown, fallback: string, maxItem = 60, maxItems = 40): string {
	const items = Array.isArray(v) ? v : typeof v === 'string' && v ? v.split(',') : null;
	if (!items) return fallback;
	return items
		.map((x) => cleanText(x, maxItem))
		.filter(Boolean)
		.slice(0, maxItems)
		.join(',');
}

/** Koordinate/Zahl oder null — 0 und Leeres gelten wie bisher als „nicht gesetzt". */
export function numOrNull(v: unknown): number | null {
	if (v === null || v === undefined || v === '' || v === 0 || v === '0') return null;
	const n = Number(v);
	return Number.isFinite(n) ? n : null;
}

/** Beleuchtung eines Spots: nur die drei bekannten Werte, sonst „teilweise". */
export function lightingOf(v: unknown): 'ja' | 'nein' | 'teilweise' {
	return v === 'ja' || v === 'nein' ? v : 'teilweise';
}

/** Echtes Kalenderdatum im Format JJJJ-MM-TT (2026-02-30 gilt nicht). */
export function isValidYmd(s: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
	const d = new Date(`${s}T00:00:00Z`);
	return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
