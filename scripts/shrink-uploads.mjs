/**
 * Verkleinert bereits hochgeladene Bilder auf max. 2560 px Kantenlänge.
 *
 * Das Format bleibt, wie es ist: Der Dateiname steht in der Datenbank, und
 * der Bildserver leitet den MIME-Typ aus der Endung ab (mit `nosniff` im
 * Header). Ein JPEG als WebP zu überschreiben würde also ein kaputtes Bild
 * ausliefern — darum JPEG bleibt JPEG, PNG bleibt PNG.
 *
 * Aufruf:  node scripts/shrink-uploads.mjs [--apply]
 * Ohne --apply wird nur gerechnet, nichts geschrieben.
 */
import { readdirSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const DIR = '/opt/parkour-portal/data/uploads';
const MAX_EDGE = 2560;
const APPLY = process.argv.includes('--apply');

const files = readdirSync(DIR).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
let before = 0;
let after = 0;
let touched = 0;

for (const name of files) {
	const path = join(DIR, name);
	const size = statSync(path).size;
	before += size;
	let out = null;
	try {
		const buf = readFileSync(path);
		const meta = await sharp(buf).metadata();
		const edge = Math.max(meta.width ?? 0, meta.height ?? 0);
		if (edge > MAX_EDGE) {
			const pipe = sharp(buf).rotate().resize(MAX_EDGE, MAX_EDGE, { fit: 'inside' });
			const fmt = (meta.format ?? '').toLowerCase();
			out =
				fmt === 'png'
					? await pipe.png({ compressionLevel: 9, palette: true }).toBuffer()
					: fmt === 'webp'
						? await pipe.webp({ quality: 86 }).toBuffer()
						: await pipe.jpeg({ quality: 84, mozjpeg: true }).toBuffer();
		}
	} catch (e) {
		console.log(`  übersprungen (nicht lesbar): ${name} — ${e.message}`);
	}

	// Nur schreiben, wenn es sich wirklich lohnt (mind. 20 % kleiner).
	if (out && out.length < size * 0.8) {
		console.log(
			`  ${name}: ${(size / 1024 / 1024).toFixed(1)} MB → ${(out.length / 1024 / 1024).toFixed(1)} MB`
		);
		if (APPLY) writeFileSync(path, out);
		after += out.length;
		touched += 1;
	} else {
		after += size;
	}
}

console.log(
	`\n${APPLY ? 'Umgeschrieben' : 'Würde umschreiben'}: ${touched} von ${files.length} Dateien — ` +
		`${(before / 1024 / 1024).toFixed(0)} MB → ${(after / 1024 / 1024).toFixed(0)} MB`
);
