import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

/** Schreibziel für neue Uploads (neben DB unter `data/`, in Prod meist beschreibbar). */
export function getUploadWriteDir(): string {
	return join(process.cwd(), 'data', 'uploads');
}

/** Lesen: zuerst data/uploads, dann legacy static/uploads. */
export function getUploadReadDirs(): string[] {
	return [getUploadWriteDir(), join(process.cwd(), 'static', 'uploads')];
}

/**
 * Erlaubte Vorschaubreiten (`/uploads/<name>?w=…`). Fest vorgegeben, damit
 * niemand den Server mit beliebigen Grössen beschäftigen kann.
 * 1600 ist die Vollansicht (Lightbox).
 */
export const THUMB_WIDTHS: readonly number[] = [120, 240, 480, 960, 1600];

/** Zwischenspeicher der Vorschauen, je Upload-Ordner. Wird NIE direkt ausgeliefert. */
export const THUMB_DIR = '.thumbs';

/**
 * Dateinamen, wie der Server sie selbst vergibt: ein einziges Segment,
 * kein Punkt am Anfang, bekannte Endung. Alles andere liefert /uploads
 * nicht aus — so bleibt etwa der Vorschau-Ordner `.thumbs` unerreichbar
 * (vorher liessen sich Vorschauen von Vorschauen erzeugen, endlos, ohne
 * Login: ein Weg, die Platte zu füllen).
 */
const SERVED_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]*\.(jpe?g|png|webp|gif|mp4|mov|webm)$/i;

export function isServedUploadName(name: string): boolean {
	return SERVED_NAME.test(name);
}

/**
 * Pfad einer zwischengespeicherten Vorschau. `gray` ist die Schwarz-Weiss-
 * Fassung (`?w=…&gray=1`) — der Platzhalter der nächsten Trainingskarte.
 */
export function thumbPath(dir: string, width: number, filename: string, gray = false): string {
	return join(dir, THUMB_DIR, `${width}${gray ? 'g' : ''}-${filename}.webp`);
}

/**
 * Upload endgültig entfernen: Original UND alle Vorschauen, in allen
 * Upload-Ordnern. Vorher blieben die Vorschauen (bis 1600 px) liegen und
 * waren ohne Login weiter abrufbar, obwohl das Bild gelöscht war.
 */
export function removeUploadFile(filename: string | null | undefined): void {
	if (!filename || !isServedUploadName(filename)) return;
	for (const dir of getUploadReadDirs()) {
		const targets = [
			join(dir, filename),
			...THUMB_WIDTHS.flatMap((w) => [thumbPath(dir, w, filename), thumbPath(dir, w, filename, true)])
		];
		for (const p of targets) {
			try {
				if (existsSync(p)) unlinkSync(p);
			} catch {
				/* schon weg ist auch gut */
			}
		}
	}
}
