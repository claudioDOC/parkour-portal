import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
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
