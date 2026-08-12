import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Diagnose-Beacon aus dem Service Worker: meldet, ob ein Push-Event auf dem
 * Gerät ankam und ob die Anzeige funktioniert hat. Landet nur im Journal —
 * bewusst ohne Auth (der SW-Kontext hat nicht immer Cookies).
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = (await request.json()) as { stage?: string; detail?: string };
		const ua = request.headers.get('user-agent')?.slice(0, 80) ?? '?';
		console.log(
			`[push-beacon] ${String(body.stage ?? '?').slice(0, 40)}` +
				(body.detail ? ` — ${String(body.detail).slice(0, 200)}` : '') +
				` — UA: ${ua}`
		);
	} catch {
		/* Diagnose darf nie werfen */
	}
	return json({ ok: true });
};
