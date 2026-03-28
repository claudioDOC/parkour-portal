import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	absences,
	auditLogs,
	invites,
	sessionHiddenUsers,
	spotImages,
	spots,
	trainingSessionRsvp,
	trainingSessionWeekdayOverride,
	trainingSpotVotes,
	users,
	votes
} from '$lib/server/db/schema';
import { getUploadReadDirs } from '$lib/server/uploads';

function unlinkImageFile(filename: string) {
	for (const dir of getUploadReadDirs()) {
		const p = join(dir, filename);
		try {
			if (existsSync(p)) unlinkSync(p);
		} catch {
			/* ignore */
		}
	}
}

/** Löscht alle abhängigen Daten und die User-Zeile (irreversibel). */
export function purgeUserAccount(userId: number): void {
	const ownedSpotIds = db
		.select({ id: spots.id })
		.from(spots)
		.where(eq(spots.addedBy, userId))
		.all()
		.map((r) => r.id);

	for (const spotId of ownedSpotIds) {
		const imgs = db.select({ filename: spotImages.filename }).from(spotImages).where(eq(spotImages.spotId, spotId)).all();
		for (const img of imgs) unlinkImageFile(img.filename);
		db.delete(spotImages).where(eq(spotImages.spotId, spotId)).run();
		db.delete(trainingSpotVotes).where(eq(trainingSpotVotes.spotId, spotId)).run();
		db.delete(votes).where(eq(votes.spotId, spotId)).run();
		db.delete(spots).where(eq(spots.id, spotId)).run();
	}

	const uploadedElsewhere = db
		.select({ filename: spotImages.filename })
		.from(spotImages)
		.where(eq(spotImages.uploadedBy, userId))
		.all();
	for (const img of uploadedElsewhere) unlinkImageFile(img.filename);
	db.delete(spotImages).where(eq(spotImages.uploadedBy, userId)).run();

	db.delete(votes).where(eq(votes.userId, userId)).run();
	db.delete(trainingSpotVotes).where(eq(trainingSpotVotes.userId, userId)).run();
	db.delete(absences).where(eq(absences.userId, userId)).run();
	db.delete(sessionHiddenUsers).where(eq(sessionHiddenUsers.userId, userId)).run();

	db.delete(trainingSessionRsvp).where(eq(trainingSessionRsvp.userId, userId)).run();
	db.delete(trainingSessionWeekdayOverride).where(eq(trainingSessionWeekdayOverride.userId, userId)).run();

	db.delete(invites).where(eq(invites.createdBy, userId)).run();
	db.update(invites).set({ usedBy: null }).where(eq(invites.usedBy, userId)).run();

	db.update(auditLogs).set({ actorUserId: null }).where(eq(auditLogs.actorUserId, userId)).run();
	db.update(auditLogs).set({ targetUserId: null }).where(eq(auditLogs.targetUserId, userId)).run();

	db.delete(users).where(eq(users.id, userId)).run();
}
