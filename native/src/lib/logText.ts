import type { ClientLog } from './api';

/**
 * Meldung als Text zum Weitergeben.
 *
 * Absichtlich als eigene Datei: App und Server-Protokoll sollen dasselbe
 * Format liefern, damit sich Berichte vergleichen lassen. Kompakt genug
 * für eine Chat-Nachricht, vollständig genug zum Einordnen.
 */
export function clientLogToText(e: ClientLog): string {
	const lines = [
		`[${e.kind.toUpperCase()}] ${e.createdAt}`,
		e.message,
		`Person: ${e.username ?? 'nicht angemeldet'}${e.route ? ` · Seite: ${e.route}` : ''}`,
		`App: ${e.appVersion ?? '?'}${e.appBuild ? ` (Build ${e.appBuild})` : ''} · Stand: ${
			e.updateId ?? '?'
		}${e.runtimeVersion ? ` · Runtime ${e.runtimeVersion}` : ''}`,
		`System: ${e.os ?? e.platform ?? '?'} ${e.osVersion ?? ''}`.trim(),
		`Gerät: ${[e.manufacturer, e.model].filter(Boolean).join(' ') || 'unbekannt'}${
			e.device ? ` (${e.device})` : ''
		}`,
		e.sessionId ? `Sitzung: ${e.sessionId}` : null,
		e.extra ? `Zusatz: ${e.extra}` : null,
		e.stack ? `Stack:\n${e.stack}` : null
	];
	return lines.filter(Boolean).join('\n');
}

/** Mehrere Meldungen mit Trennlinie — für „alles teilen". */
export function clientLogsToText(entries: ClientLog[], max = 25): string {
	const head = `Parkour Portal — ${Math.min(entries.length, max)} von ${entries.length} Meldungen`;
	return [head, ...entries.slice(0, max).map(clientLogToText)].join('\n\n────────────\n');
}

/** Ein Eintrag des Server-Protokolls als Text. */
export function auditToText(l: {
	createdAt: string;
	action: string;
	actorUsername: string | null;
	detail?: unknown;
	ip?: string | null;
}): string {
	return [
		`[${l.action}] ${l.createdAt}`,
		`Person: ${l.actorUsername ?? 'System'}${l.ip ? ` · ${l.ip}` : ''}`,
		l.detail ? `Details: ${JSON.stringify(l.detail)}` : null
	]
		.filter(Boolean)
		.join('\n');
}
