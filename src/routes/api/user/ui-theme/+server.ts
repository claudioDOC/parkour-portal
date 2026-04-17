import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { isUiThemeId } from '$lib/uiThemes';
import { usersTableHasUiThemeColumn, resetUsersTableColumnCache } from '$lib/server/usersTableColumns';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Nicht angemeldet');

	if (!usersTableHasUiThemeColumn()) {
		return json(
			{ error: 'Datenbank-Migration fehlt: ui_theme (0016_ui_theme.sql ausführen).' },
			{ status: 503 }
		);
	}

	let body: { theme?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Ungültige Anfrage (kein JSON)' }, { status: 400 });
	}

	const theme = body.theme;
	if (!isUiThemeId(theme)) {
		return json({ error: 'Unbekanntes Theme' }, { status: 400 });
	}

	db.update(users).set({ uiTheme: theme }).where(eq(users.id, locals.user.id)).run();
	resetUsersTableColumnCache();

	return json({ ok: true, theme });
};
