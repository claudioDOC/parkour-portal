import type { RequestEvent } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { auditLogs } from '$lib/server/db/schema';
import { getClientIp } from '$lib/server/rateLimitAuth';

/**
 * Echte Client-IP fürs Audit-Log. Nutzt dieselbe Regel wie der
 * Login-Schutz: `X-Forwarded-For` zählt nur, wenn die Verbindung vom
 * eigenen Proxy (`TRUSTED_PROXY_IPS`) kommt — dann der letzte, von nginx
 * gesetzte Eintrag. Vorher stand hier stur die Socket-Adresse, also
 * monatelang nur die IP des Proxys statt der Person.
 */
export function clientIp(event: RequestEvent): string | null {
	const ip = getClientIp(event);
	return ip === 'unbekannt' ? null : ip;
}

type LogParams = {
	event?: RequestEvent;
	action: string;
	actorUserId?: number | null;
	actorUsername?: string | null;
	targetUserId?: number | null;
	detail?: Record<string, unknown>;
};

export function logAudit(params: LogParams): void {
	try {
		const ip = params.event ? clientIp(params.event) : null;
		let detailJson: string | null = null;
		if (params.detail && Object.keys(params.detail).length > 0) {
			detailJson = JSON.stringify(params.detail).slice(0, 4000);
		}
		db.insert(auditLogs).values({
			action: params.action,
			actorUserId: params.actorUserId ?? null,
			actorUsername: params.actorUsername ?? null,
			targetUserId: params.targetUserId ?? null,
			detailJson,
			ip
		}).run();
	} catch {
		// Logging darf Requests nicht brechen
	}
}
