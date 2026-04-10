import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Einheitliche Konfiguration: absolute Pfadangabe empfohlen in Produktion. */
export const SQLITE_PATH_ENV = 'PARKOUR_DATABASE_PATH';

/**
 * Repo-Wurzel (Ordner mit package.json), ausgehend von einer Datei unter `src/lib/server/db/`.
 */
export function repoRootFromDbFolder(importMetaUrl: string): string {
	const dir = dirname(fileURLToPath(importMetaUrl));
	return resolve(dir, '..', '..', '..', '..');
}

/** Laufende App: zuerst Umgebungsvariable, sonst `process.cwd()/data/parkour.db`. */
export function resolveSqlitePathForApp(): string {
	const v = process.env[SQLITE_PATH_ENV]?.trim();
	if (v) return resolve(v);
	return resolve(process.cwd(), 'data', 'parkour.db');
}

/**
 * CLI (`db:migrate`, `seed`): zuerst Umgebungsvariable, sonst Repo `data/parkour.db`
 * (unabhängig vom aktuellen Arbeitsverzeichnis).
 */
export function resolveSqlitePathForCli(importMetaUrl: string): string {
	const v = process.env[SQLITE_PATH_ENV]?.trim();
	if (v) return resolve(v);
	return join(repoRootFromDbFolder(importMetaUrl), 'data', 'parkour.db');
}

export function drizzleFolderForCli(importMetaUrl: string): string {
	return join(repoRootFromDbFolder(importMetaUrl), 'drizzle');
}
