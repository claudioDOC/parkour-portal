import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq, ne, sql } from 'drizzle-orm';
import { hashPassword } from '$lib/server/auth';
import { logAudit } from '$lib/server/audit';
import { parseAutoAbsentWeekdays, serializeAutoAbsentWeekdays } from '$lib/server/trainingAttendance';
import { isTrainingAttendanceSchemaReady } from '$lib/server/trainingSchemaReady';
import { getUserCoreById } from '$lib/server/userCoreQuery';
import { andWithUsersNotDeleted, whereUsersTrashed } from '$lib/server/usersWhere';
import { purgeUserAccount } from '$lib/server/purgeUserAccount';
import { MIN_PASSWORD_LENGTH } from '$lib/passwordPolicy';
import { asNum } from '$lib/server/asSqlNumber';

function assertAdmin(locals: App.Locals) {
	if (!locals.user || locals.user.role !== 'admin') {
		throw error(403, 'Nur für Admins');
	}
}

function otherNonDeletedAdminCount(userId: number): number {
	return db
		.select({ id: users.id })
		.from(users)
		.where(andWithUsersNotDeleted(eq(users.role, 'admin'), ne(users.id, userId)))
		.all().length;
}

export const GET: RequestHandler = async ({ locals, url }) => {
	assertAdmin(locals);

	const trashed = url.searchParams.get('trashed') === 'true';
	const schemaOk = isTrainingAttendanceSchemaReady();

	if (schemaOk) {
		const rows = db
			.select({
				id: users.id,
				username: users.username,
				role: users.role,
				active: users.active,
				trainingAttendance: users.trainingAttendance,
				autoAbsentWeekdaysRaw: users.autoAbsentWeekdays,
				createdAt: users.createdAt,
				spotCount: sql<number>`(SELECT COUNT(*) FROM spots WHERE added_by = ${users.id})`,
				voteCount: sql<number>`(SELECT COUNT(*) FROM votes WHERE user_id = ${users.id})`
			})
			.from(users)
			.where(whereUsersTrashed(trashed))
			.all();
		const allUsers = rows.map((r) => ({
			id: r.id,
			username: r.username,
			role: r.role,
			active: r.active,
			trainingAttendance: r.trainingAttendance,
			autoAbsentWeekdays: parseAutoAbsentWeekdays(r.autoAbsentWeekdaysRaw),
			createdAt: r.createdAt,
			spotCount: asNum(r.spotCount),
			voteCount: asNum(r.voteCount)
		}));
		return json({ users: allUsers, trainingSchemaReady: true });
	}

	const rows = db
		.select({
			id: users.id,
			username: users.username,
			role: users.role,
			active: users.active,
			createdAt: users.createdAt,
			spotCount: sql<number>`(SELECT COUNT(*) FROM spots WHERE added_by = ${users.id})`,
			voteCount: sql<number>`(SELECT COUNT(*) FROM votes WHERE user_id = ${users.id})`
		})
		.from(users)
		.where(whereUsersTrashed(trashed))
		.all();
	const allUsers = rows.map((r) => ({
		id: r.id,
		username: r.username,
		role: r.role,
		active: r.active,
		trainingAttendance: 'implicit' as const,
		autoAbsentWeekdays: [] as string[],
		createdAt: r.createdAt,
		spotCount: asNum(r.spotCount),
		voteCount: asNum(r.voteCount)
	}));
	return json({ users: allUsers, trainingSchemaReady: false });
};

export const PATCH: RequestHandler = async (event) => {
	const { request, locals } = event;
	assertAdmin(locals);

	const { userId, action, newPassword, newRole, trainingAttendance, autoAbsentWeekdays } =
		await request.json();

	if (!userId) {
		return json({ error: 'User-ID erforderlich' }, { status: 400 });
	}

	const user = getUserCoreById(userId);
	if (!user) {
		return json({ error: 'User nicht gefunden' }, { status: 404 });
	}

	if (
		user.deleted &&
		action !== 'restore_user' &&
		action !== 'purge_user'
	) {
		return json({ error: 'User ist im Papierkorb — zuerst wiederherstellen oder endgültig löschen.' }, { status: 400 });
	}

	if (action === 'reset_password') {
		if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
			return json(
				{ error: `Neues Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen haben` },
				{ status: 400 }
			);
		}
		const hash = await hashPassword(newPassword);
		db.update(users)
			.set({
				passwordHash: hash,
				sessionVersion: sql`${users.sessionVersion} + 1`
			})
			.where(eq(users.id, userId))
			.run();
		logAudit({
			event,
			action: 'admin.user.password_reset',
			actorUserId: locals.user!.id,
			actorUsername: locals.user!.username,
			targetUserId: userId,
			detail: { targetUsername: user.username }
		});
		return json({ success: true, message: `Passwort für ${user.username} zurückgesetzt` });
	}

	if (action === 'change_role') {
		if (userId === locals.user!.id) {
			return json({ error: 'Du kannst deine eigene Rolle nicht ändern' }, { status: 400 });
		}
		if (newRole !== 'admin' && newRole !== 'spotmanager' && newRole !== 'member') {
			return json({ error: 'Ungültige Rolle' }, { status: 400 });
		}
		db.update(users).set({ role: newRole }).where(eq(users.id, userId)).run();
		logAudit({
			event,
			action: 'admin.user.role_change',
			actorUserId: locals.user!.id,
			actorUsername: locals.user!.username,
			targetUserId: userId,
			detail: { targetUsername: user.username, newRole, previousRole: user.role }
		});
		return json({ success: true, message: `${user.username} ist jetzt ${newRole}` });
	}

	if (action === 'toggle_active') {
		if (userId === locals.user!.id) {
			return json({ error: 'Du kannst dich nicht selbst deaktivieren' }, { status: 400 });
		}
		const newActive = !user.active;
		db.update(users).set({ active: newActive }).where(eq(users.id, userId)).run();
		const status = newActive ? 'aktiviert' : 'deaktiviert';
		logAudit({
			event,
			action: 'admin.user.toggle_active',
			actorUserId: locals.user!.id,
			actorUsername: locals.user!.username,
			targetUserId: userId,
			detail: { targetUsername: user.username, active: newActive }
		});
		return json({ success: true, message: `${user.username} wurde ${status}` });
	}

	if (action === 'set_training_attendance') {
		if (!isTrainingAttendanceSchemaReady()) {
			return json(
				{
					error:
						'Datenbank-Migration fehlt: drizzle/0002_training_opt_in.sql und drizzle/0003_auto_absent_weekdays.sql der Reihe nach auf die Server-DB anwenden (sqlite3 data/parkour.db < drizzle/0002_training_opt_in.sql; dasselbe für 0003).'
				},
				{ status: 503 }
			);
		}
		if (trainingAttendance !== 'implicit' && trainingAttendance !== 'opt_in') {
			return json({ error: 'Ungültiger Trainingsmodus' }, { status: 400 });
		}
		db.update(users).set({ trainingAttendance }).where(eq(users.id, userId)).run();
		logAudit({
			event,
			action: 'admin.user.training_attendance',
			actorUserId: locals.user!.id,
			actorUsername: locals.user!.username,
			targetUserId: userId,
			detail: { targetUsername: user.username, trainingAttendance }
		});
		return json({
			success: true,
			message:
				trainingAttendance === 'opt_in'
					? `${user.username}: Trainingsliste nur mit Zusage`
					: `${user.username}: Trainingsliste wie alle anderen`
		});
	}

	if (action === 'set_auto_absent_weekdays') {
		if (!isTrainingAttendanceSchemaReady()) {
			return json(
				{
					error:
						'Datenbank-Migration fehlt: drizzle/0002_training_opt_in.sql und drizzle/0003_auto_absent_weekdays.sql der Reihe nach auf die Server-DB anwenden (sqlite3 data/parkour.db < drizzle/0002_training_opt_in.sql; dasselbe für 0003).'
				},
				{ status: 503 }
			);
		}
		if (!Array.isArray(autoAbsentWeekdays)) {
			return json({ error: 'autoAbsentWeekdays muss ein Array sein' }, { status: 400 });
		}
		const serialized = serializeAutoAbsentWeekdays(autoAbsentWeekdays.map((x: unknown) => String(x)));
		db.update(users).set({ autoAbsentWeekdays: serialized }).where(eq(users.id, userId)).run();
		logAudit({
			event,
			action: 'admin.user.auto_absent_weekdays',
			actorUserId: locals.user!.id,
			actorUsername: locals.user!.username,
			targetUserId: userId,
			detail: { targetUsername: user.username, autoAbsentWeekdays: serialized }
		});
		return json({ success: true, message: `Standard-Abmeldung für ${user.username} aktualisiert` });
	}

	if (action === 'trash_user') {
		if (userId === locals.user!.id) {
			return json({ error: 'Du kannst dich nicht selbst in den Papierkorb legen' }, { status: 400 });
		}
		if (user.deleted) {
			return json({ error: 'User ist bereits im Papierkorb' }, { status: 400 });
		}
		if (user.role === 'admin' && otherNonDeletedAdminCount(userId) === 0) {
			return json({ error: 'Der letzte Admin kann nicht in den Papierkorb gelegt werden' }, { status: 400 });
		}
		db.update(users).set({ deleted: true, active: false }).where(eq(users.id, userId)).run();
		logAudit({
			event,
			action: 'admin.user.trash',
			actorUserId: locals.user!.id,
			actorUsername: locals.user!.username,
			targetUserId: userId,
			detail: { targetUsername: user.username }
		});
		return json({ success: true, message: `${user.username} wurde in den Papierkorb gelegt` });
	}

	if (action === 'restore_user') {
		if (!user.deleted) {
			return json({ error: 'User ist nicht im Papierkorb' }, { status: 400 });
		}
		db.update(users).set({ deleted: false }).where(eq(users.id, userId)).run();
		logAudit({
			event,
			action: 'admin.user.restore',
			actorUserId: locals.user!.id,
			actorUsername: locals.user!.username,
			targetUserId: userId,
			detail: { targetUsername: user.username }
		});
		return json({ success: true, message: `${user.username} wurde wiederhergestellt` });
	}

	if (action === 'purge_user') {
		if (userId === locals.user!.id) {
			return json({ error: 'Du kannst dich nicht selbst löschen' }, { status: 400 });
		}
		if (!user.deleted) {
			return json({ error: 'Nur User im Papierkorb können endgültig gelöscht werden' }, { status: 400 });
		}
		const username = user.username;
		purgeUserAccount(userId);
		logAudit({
			event,
			action: 'admin.user.purge',
			actorUserId: locals.user!.id,
			actorUsername: locals.user!.username,
			detail: { targetUsername: username, targetUserId: userId }
		});
		return json({ success: true, message: `${username} wurde endgültig gelöscht` });
	}

	return json({ error: 'Ungültige Aktion' }, { status: 400 });
};
