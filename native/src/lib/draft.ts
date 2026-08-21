import { readToken, writeToken } from './tokenStore';

/**
 * Zwischenspeicher für Formulare.
 *
 * Android beendet Apps im Hintergrund — wer für die Koordinaten kurz in
 * die Karten-App wechselt, kam bisher mit einem leeren Formular zurück.
 * Der Entwurf wird darum bei jeder Änderung abgelegt und beim Öffnen
 * wieder eingesetzt. Er verfällt nach zwei Stunden und verschwindet,
 * sobald gespeichert oder ausdrücklich verworfen wurde.
 */
const MAX_AGE_MS = 2 * 60 * 60 * 1000;

export async function saveDraft(key: string, value: unknown): Promise<void> {
	try {
		await writeToken(`draft-${key}`, JSON.stringify({ at: Date.now(), value }));
	} catch {
		/* Entwurf ist Beiwerk — nie stören */
	}
}

export async function loadDraft<T>(key: string): Promise<T | null> {
	try {
		const raw = await readToken(`draft-${key}`);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as { at: number; value: T };
		if (!parsed?.at || Date.now() - parsed.at > MAX_AGE_MS) {
			await clearDraft(key);
			return null;
		}
		return parsed.value;
	} catch {
		return null;
	}
}

export async function clearDraft(key: string): Promise<void> {
	try {
		await writeToken(`draft-${key}`, null);
	} catch {
		/* egal */
	}
}
