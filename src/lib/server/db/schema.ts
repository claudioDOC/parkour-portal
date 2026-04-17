import { sqliteTable, text, integer, real, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const TECHNIQUES = [
	'Präzisionssprung',
	'Schwingen',
	'Flow',
	'Armsprung',
	'Klettern',
	'Tic-Tac',
	'Vault',
	'Balance',
	'Drops',
	'Katz',
	'Roofgap'
] as const;

export const WEATHER_OPTIONS = ['trocken', 'nass'] as const;

export const users = sqliteTable('users', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	username: text('username').notNull().unique(),
	passwordHash: text('password_hash').notNull(),
	role: text('role', { enum: ['admin', 'spotmanager', 'member'] }).notNull().default('member'),
	active: integer('active', { mode: 'boolean' }).notNull().default(true),
	/** Soft-Delete: im Papierkorb, aus normalen Listen ausgeblendet. */
	deleted: integer('deleted', { mode: 'boolean' }).notNull().default(false),
	/** Bei jeder Passwortänderung erhöht — JWT muss passen, sonst Session ungültig. */
	sessionVersion: integer('session_version').notNull().default(0),
	/** implicit = wie bisher: zieht mit, wenn nicht abgemeldet. opt_in = nur in „Zieht“, wenn explizit zugesagt. */
	trainingAttendance: text('training_attendance', { enum: ['implicit', 'opt_in'] })
		.notNull()
		.default('implicit'),
	/** JSON-Array, z. B. ["Donnerstag"] – nur bei implicit: auto. abgemeldet an diesem Wochentag (siehe training_session_weekday_override). */
	autoAbsentWeekdays: text('auto_absent_weekdays').notNull().default('[]'),
	createdAt: text('created_at').notNull().default(sql`(datetime('now'))`)
});

export const invites = sqliteTable('invites', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	token: text('token').notNull().unique(),
	createdBy: integer('created_by').notNull().references(() => users.id),
	used: integer('used', { mode: 'boolean' }).notNull().default(false),
	usedBy: integer('used_by').references(() => users.id),
	expiresAt: text('expires_at').notNull(),
	createdAt: text('created_at').notNull().default(sql`(datetime('now'))`)
});

export const trainingSessions = sqliteTable('training_sessions', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	date: text('date').notNull(),
	dayOfWeek: text('day_of_week').notNull(),
	timeStart: text('time_start').notNull().default('18:15'),
	timeEnd: text('time_end').notNull().default('20:15')
});

/** Explizite Zusage für ein Training (nur bei trainingAttendance opt_in relevant). */
export const trainingSessionRsvp = sqliteTable(
	'training_session_rsvp',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		sessionId: integer('session_id')
			.notNull()
			.references(() => trainingSessions.id),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id),
		createdAt: text('created_at').notNull().default(sql`(datetime('now'))`)
	},
	(t) => [uniqueIndex('training_session_rsvp_session_user').on(t.sessionId, t.userId)]
);

/** Einmalig: trotz auto_absent_weekdays für diesen Termin dabei (nur implicit). */
export const trainingSessionWeekdayOverride = sqliteTable(
	'training_session_weekday_override',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		sessionId: integer('session_id')
			.notNull()
			.references(() => trainingSessions.id),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id),
		createdAt: text('created_at').notNull().default(sql`(datetime('now'))`)
	},
	(t) => [uniqueIndex('training_session_weekday_override_session_user').on(t.sessionId, t.userId)]
);

export const absences = sqliteTable('absences', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	userId: integer('user_id').notNull().references(() => users.id),
	sessionId: integer('session_id').notNull().references(() => trainingSessions.id),
	reason: text('reason'),
	createdAt: text('created_at').notNull().default(sql`(datetime('now'))`)
});

export const spots = sqliteTable('spots', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	city: text('city').notNull(),
	latitude: real('latitude'),
	longitude: real('longitude'),
	/** Kleiner Spot: eher kurzer Technik-Stop, nicht für ganze Gruppe. */
	isMicro: integer('is_micro', { mode: 'boolean' }).notNull().default(false),
	/** Optionaler Hauptspot in der Nähe, zu dem dieser Microspot gehört. */
	parentSpotId: integer('parent_spot_id'),
	lighting: text('lighting', { enum: ['ja', 'nein', 'teilweise'] }).notNull().default('teilweise'),
	techniques: text('techniques').notNull().default(''),
	goodWeather: text('good_weather').notNull().default('trocken,nass'),
	description: text('description'),
	addedBy: integer('added_by').notNull().references(() => users.id),
	deleted: integer('deleted', { mode: 'boolean' }).notNull().default(false),
	createdAt: text('created_at').notNull().default(sql`(datetime('now'))`)
});

export const spotImages = sqliteTable('spot_images', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	spotId: integer('spot_id').notNull().references(() => spots.id),
	filename: text('filename').notNull(),
	uploadedBy: integer('uploaded_by').notNull().references(() => users.id),
	createdAt: text('created_at').notNull().default(sql`(datetime('now'))`)
});

export const spotParkingLocations = sqliteTable('spot_parking_locations', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	spotId: integer('spot_id')
		.notNull()
		.references(() => spots.id),
	name: text('name'),
	latitude: real('latitude').notNull(),
	longitude: real('longitude').notNull(),
	createdAt: text('created_at').notNull().default(sql`(datetime('now'))`)
});

export const spotChallenges = sqliteTable('spot_challenges', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	spotId: integer('spot_id').notNull().references(() => spots.id),
	title: text('title').notNull(),
	description: text('description'),
	createdBy: integer('created_by').notNull().references(() => users.id),
	createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
	/** Soft-Delete: aus Listen ausgeblendet, im Papierkorb wiederherstellbar. */
	deleted: integer('deleted', { mode: 'boolean' }).notNull().default(false),
	deletedAt: text('deleted_at')
});

export const spotChallengeCompletions = sqliteTable(
	'spot_challenge_completions',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		challengeId: integer('challenge_id')
			.notNull()
			.references(() => spotChallenges.id),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id),
		createdAt: text('created_at').notNull().default(sql`(datetime('now'))`)
	},
	(t) => [uniqueIndex('spot_challenge_completion_unique').on(t.challengeId, t.userId)]
);

export const votes = sqliteTable('votes', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	userId: integer('user_id').notNull().references(() => users.id),
	spotId: integer('spot_id').notNull().references(() => spots.id),
	score: integer('score').notNull(),
	createdAt: text('created_at').notNull().default(sql`(datetime('now'))`)
});

export const trainingSpotVotes = sqliteTable('training_spot_votes', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	sessionId: integer('session_id').notNull().references(() => trainingSessions.id),
	spotId: integer('spot_id').notNull().references(() => spots.id),
	userId: integer('user_id').notNull().references(() => users.id),
	createdAt: text('created_at').notNull().default(sql`(datetime('now'))`)
});

export const sessionGuests = sqliteTable('session_guests', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	sessionId: integer('session_id').notNull().references(() => trainingSessions.id),
	name: text('name').notNull(),
	createdAt: text('created_at').notNull().default(sql`(datetime('now'))`)
});

export const sessionHiddenUsers = sqliteTable('session_hidden_users', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	sessionId: integer('session_id').notNull().references(() => trainingSessions.id),
	userId: integer('user_id').notNull().references(() => users.id),
	createdAt: text('created_at').notNull().default(sql`(datetime('now'))`)
});

export const tripPlans = sqliteTable('trip_plans', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	title: text('title').notNull(),
	startDate: text('start_date').notNull(),
	endDate: text('end_date').notNull(),
	notes: text('notes'),
	/** Kartenziel (Zielort), optional — für Route & Karte. */
	destinationLatitude: real('destination_latitude'),
	destinationLongitude: real('destination_longitude'),
	destinationLabel: text('destination_label'),
	transportMode: text('transport_mode').notNull().default('auto'),
	carCount: integer('car_count').notNull().default(0),
	seatsPerCar: integer('seats_per_car').notNull().default(0),
	/** Soft-Delete: Papierkorb. */
	deleted: integer('deleted', { mode: 'boolean' }).notNull().default(false),
	deletedAt: text('deleted_at'),
	createdBy: integer('created_by').notNull().references(() => users.id),
	createdAt: text('created_at').notNull().default(sql`(datetime('now'))`)
});

export const tripStopovers = sqliteTable(
	'trip_stopovers',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		tripId: integer('trip_id')
			.notNull()
			.references(() => tripPlans.id),
		label: text('label').notNull(),
		latitude: real('latitude').notNull(),
		longitude: real('longitude').notNull(),
		sortOrder: integer('sort_order').notNull().default(0),
		proposedBy: integer('proposed_by')
			.notNull()
			.references(() => users.id),
		createdAt: text('created_at').notNull().default(sql`(datetime('now'))`)
	},
	(t) => [index('trip_stopovers_trip_id_idx').on(t.tripId)]
);

export const tripParticipants = sqliteTable(
	'trip_participants',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		tripId: integer('trip_id')
			.notNull()
			.references(() => tripPlans.id),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id),
		transportMode: text('transport_mode').notNull().default('mitfahrt'),
		vehicleFrom: text('vehicle_from'),
		hasCar: integer('has_car', { mode: 'boolean' }).notNull().default(false),
		seatsOffered: integer('seats_offered').notNull().default(0),
		note: text('note'),
		createdAt: text('created_at').notNull().default(sql`(datetime('now'))`)
	},
	(t) => [uniqueIndex('trip_participants_trip_user').on(t.tripId, t.userId)]
);

export const tripDestinations = sqliteTable('trip_destinations', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	tripId: integer('trip_id')
		.notNull()
		.references(() => tripPlans.id),
	name: text('name').notNull(),
	city: text('city').notNull(),
	note: text('note'),
	proposedBy: integer('proposed_by').notNull().references(() => users.id),
	createdAt: text('created_at').notNull().default(sql`(datetime('now'))`)
});

export const tripDestinationVotes = sqliteTable(
	'trip_destination_votes',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		tripId: integer('trip_id')
			.notNull()
			.references(() => tripPlans.id),
		destinationId: integer('destination_id')
			.notNull()
			.references(() => tripDestinations.id),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id),
		createdAt: text('created_at').notNull().default(sql`(datetime('now'))`)
	},
	(t) => [uniqueIndex('trip_destination_votes_trip_user').on(t.tripId, t.userId)]
);

/** Alternative Zeiträume für einen Trip (Abstimmung, z. B. einen Tag später abfahren). */
export const tripDateOptions = sqliteTable('trip_date_options', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	tripId: integer('trip_id')
		.notNull()
		.references(() => tripPlans.id),
	startDate: text('start_date').notNull(),
	endDate: text('end_date').notNull(),
	note: text('note'),
	proposedBy: integer('proposed_by')
		.notNull()
		.references(() => users.id),
	createdAt: text('created_at').notNull().default(sql`(datetime('now'))`)
});

export const tripDateVotes = sqliteTable(
	'trip_date_votes',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		tripId: integer('trip_id')
			.notNull()
			.references(() => tripPlans.id),
		dateOptionId: integer('date_option_id')
			.notNull()
			.references(() => tripDateOptions.id),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id),
		createdAt: text('created_at').notNull().default(sql`(datetime('now'))`)
	},
	(t) => [uniqueIndex('trip_date_votes_trip_user').on(t.tripId, t.userId)]
);

export const auditLogs = sqliteTable('audit_logs', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
	action: text('action').notNull(),
	actorUserId: integer('actor_user_id'),
	actorUsername: text('actor_username'),
	targetUserId: integer('target_user_id'),
	detailJson: text('detail_json'),
	ip: text('ip')
});
