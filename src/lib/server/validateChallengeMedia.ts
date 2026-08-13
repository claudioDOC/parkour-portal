import { fileTypeFromBuffer } from 'file-type';

/**
 * Challenge-Medien: Bilder wie bisher, dazu Videos (Handy-Aufnahmen).
 * Geprüft werden die Bytes (Magic Numbers), nicht Dateiname/Content-Type.
 */
const MIME_TO_EXT = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'video/mp4': 'mp4',
	'video/quicktime': 'mov',
	'video/webm': 'webm'
} as const;

const VIDEO_MIMES = new Set(['video/mp4', 'video/quicktime', 'video/webm']);

export type ChallengeMediaExt = (typeof MIME_TO_EXT)[keyof typeof MIME_TO_EXT];

export async function validateChallengeMediaBuffer(
	buffer: Buffer
): Promise<{ ext: ChallengeMediaExt; isVideo: boolean } | null> {
	if (buffer.length < 12) return null;
	const ft = await fileTypeFromBuffer(buffer);
	if (!ft?.mime) return null;
	const ext = MIME_TO_EXT[ft.mime as keyof typeof MIME_TO_EXT];
	if (!ext) return null;
	return { ext, isVideo: VIDEO_MIMES.has(ft.mime) };
}

/** Anzeige-Entscheidung anhand der Dateiendung (Video vs. Bild). */
export function isVideoFilename(filename: string): boolean {
	return /\.(mp4|mov|webm)$/i.test(filename);
}
