import { fileTypeFromBuffer } from 'file-type';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

const MIME_TO_EXT = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp'
} as const;

export type SpotImageExt = (typeof MIME_TO_EXT)[keyof typeof MIME_TO_EXT];

/**
 * Prüft die Bytes (Magic Numbers), nicht nur Dateiname/Content-Type.
 * Nur JPEG, PNG, WebP — kein SVG/HTML-Polyglot über „falsche“ Endung.
 */
export async function validateSpotImageBuffer(
	buffer: Buffer
): Promise<{ ext: SpotImageExt } | null> {
	if (buffer.length < 12) return null;
	const ft = await fileTypeFromBuffer(buffer);
	if (!ft?.mime || !ALLOWED_MIME.has(ft.mime)) return null;
	const ext = MIME_TO_EXT[ft.mime as keyof typeof MIME_TO_EXT];
	if (!ext) return null;
	return { ext };
}
