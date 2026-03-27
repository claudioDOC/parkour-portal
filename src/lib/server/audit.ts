import type { RequestEvent } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { auditLogs } from '$lib/server/db/schema';

export function clientIp(event: Pick<RequestEvent, 'getClientAddress' | 'request'>): string | null {
	try {
		return event.getClientAddress();
	} catch {
		const xff = event.request.headers.get('x-forwarded-for');
		return xff?.split(',')[0]?.trim() ?? null;
	}
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
