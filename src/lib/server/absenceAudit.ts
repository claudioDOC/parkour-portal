import type { SQL } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { absences } from '$lib/server/db/schema';

export type AbsenceSnapshot = { id: number; userId: number; sessionId: number; reason: string | null };

/**
 * Liest die Abmeldungen, die eine anstehende Löschung treffen würde.
 * Der Grund landet so im Audit-Log — sonst ist er nach einem Versehen
 * (z. B. Admin meldet jemanden irrtümlich wieder an) unwiederbringlich weg.
 */
export function snapshotAbsences(where: SQL): AbsenceSnapshot[] {
	return db
		.select({
			id: absences.id,
			userId: absences.userId,
			sessionId: absences.sessionId,
			reason: absences.reason
		})
		.from(absences)
		.where(where)
		.all();
}
