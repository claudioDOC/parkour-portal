import { fileTypeFromBuffer } from 'file-type';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

const MIME_TO_EXT = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	// HEIC/HEIF („Hohe Effizienz" bei Samsung, Standard auf iPhones) wird
	// beim Speichern in WebP umgewandelt — Browser zeigen HEIC nicht an.
	'image/heic': 'webp',
	'image/heif': 'webp'
} as const;

export type SpotImageExt = (typeof MIME_TO_EXT)[keyof typeof MIME_TO_EXT];

/**
 * Prüft die Bytes (Magic Numbers), nicht nur Dateiname/Content-Type.
 * Nur JPEG, PNG, WebP, HEIC/HEIF — kein SVG/HTML-Polyglot über „falsche“
 * Endung. HEIC/HEIF werden beim Speichern nach WebP umgewandelt.
 */
export async function validateSpotImageBuffer(
	buffer: Buffer
): Promise<{ ext: SpotImageExt; mime: string } | null> {
	if (buffer.length < 12) return null;
	const ft = await fileTypeFromBuffer(buffer);
	if (!ft?.mime || !ALLOWED_MIME.has(ft.mime)) return null;
	const ext = MIME_TO_EXT[ft.mime as keyof typeof MIME_TO_EXT];
	if (!ext) return null;
	return { ext, mime: ft.mime };
}
