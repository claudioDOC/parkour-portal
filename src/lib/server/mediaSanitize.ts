import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';

/**
 * Hochgeladene Fotos und Videos von Metadaten befreien.
 *
 * /uploads ist ohne Login lesbar (die App lädt Bilder ohne Sitzung). Was
 * in der Datei steckt, ist damit für jede Person mit dem Link sichtbar:
 * Handyfotos tragen Kamera, Aufnahmezeit und oft die GPS-Position, Videos
 * fast immer den Aufnahmeort. Darum wird jede Datei beim Ablegen neu
 * geschrieben — sichtbar bleibt das Bild, die Metadaten fallen weg.
 */

/** Längste Kante, darüber wird verkleinert (Vollansicht zeigt höchstens 1600 px). */
export const MAX_IMAGE_EDGE = 2560;

export type CleanImage = { data: Buffer; ext: 'jpg' | 'png' | 'webp' };

/**
 * Foto neu schreiben: EXIF-Drehung anwenden (die Pixel stehen danach
 * richtig, das Tag fällt weg), zu Grosses verkleinern und ohne jede
 * Metadaten speichern — sharp übernimmt sie nur auf ausdrücklichen Wunsch.
 *
 * Das Format bleibt, ausser bei HEIC (zeigt kein Browser an) und bei
 * übergrossen Fotos: die werden wie bisher WebP.
 */
export async function cleanImage(buffer: Buffer, detectedExt: string): Promise<CleanImage> {
	const meta = await sharp(buffer).metadata();
	const tooBig = Math.max(meta.width ?? 0, meta.height ?? 0) > MAX_IMAGE_EDGE;
	const ext = detectedExt.toLowerCase();
	const base = sharp(buffer)
		.rotate()
		.resize(MAX_IMAGE_EDGE, MAX_IMAGE_EDGE, { fit: 'inside', withoutEnlargement: true });

	if (tooBig || (ext !== 'jpg' && ext !== 'jpeg' && ext !== 'png' && ext !== 'webp')) {
		return { data: await base.webp({ quality: 86 }).toBuffer(), ext: 'webp' };
	}
	if (ext === 'png') return { data: await base.png({ compressionLevel: 9 }).toBuffer(), ext: 'png' };
	if (ext === 'webp') return { data: await base.webp({ quality: 86 }).toBuffer(), ext: 'webp' };
	return { data: await base.jpeg({ quality: 88, mozjpeg: true }).toBuffer(), ext: 'jpg' };
}

/** Wie lange ffmpeg höchstens rechnen darf (es kopiert nur, das geht in Sekunden). */
const FFMPEG_TIMEOUT_MS = 60_000;

function runFfmpeg(args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const p = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
		let stderr = '';
		p.stderr.on('data', (d) => {
			if (stderr.length < 2000) stderr += String(d);
		});
		const timer = setTimeout(() => p.kill('SIGKILL'), FFMPEG_TIMEOUT_MS);
		p.on('error', (e) => {
			clearTimeout(timer);
			reject(e);
		});
		p.on('close', (code) => {
			clearTimeout(timer);
			if (code === 0) resolve();
			else reject(new Error(`ffmpeg exit ${code}: ${stderr.trim().slice(0, 500)}`));
		});
	});
}

/**
 * Video ohne Metadaten neu verpacken: Bild- und Tonspur werden 1:1
 * kopiert (kein Neukodieren, keine Qualitätseinbusse), Ort, Zeit, Gerät
 * und Zusatzspuren fallen weg. Die Drehung des Videos bleibt erhalten —
 * sie steckt in der Spur selbst, nicht in den Metadaten (nachgemessen).
 *
 * Klappt das nicht (ffmpeg fehlt, exotisches Format), bleibt die Datei
 * unverändert — ein Upload soll daran nicht scheitern. Der Fall wird
 * geloggt.
 */
export async function cleanVideo(buffer: Buffer, ext: 'mp4' | 'mov' | 'webm'): Promise<Buffer> {
	const dir = await mkdtemp(join(tmpdir(), 'pp-video-'));
	try {
		const input = join(dir, `in.${ext}`);
		const output = join(dir, `out.${ext}`);
		await writeFile(input, buffer);
		await runFfmpeg([
			'-hide_banner',
			'-loglevel',
			'error',
			'-y',
			'-i',
			input,
			'-map',
			'0:v',
			'-map',
			'0:a?',
			'-map_metadata',
			'-1',
			'-map_metadata:s:v',
			'-1',
			'-map_metadata:s:a',
			'-1',
			'-map_chapters',
			'-1',
			'-c',
			'copy',
			'-fflags',
			'+bitexact',
			...(ext === 'webm' ? [] : ['-movflags', '+faststart']),
			output
		]);
		const out = await readFile(output);
		if (out.length === 0) throw new Error('leere Ausgabe');
		return out;
	} catch (e) {
		console.warn('[upload] Video-Metadaten nicht entfernt, Original bleibt:', e);
		return buffer;
	} finally {
		await rm(dir, { recursive: true, force: true }).catch(() => {});
	}
}
