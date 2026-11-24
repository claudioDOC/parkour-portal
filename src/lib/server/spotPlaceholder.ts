import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp, { type OverlayOptions } from 'sharp';
import { db } from '$lib/server/db';
import { spotImages, spots, trainingSessions, trainingSpotVotes, votes } from '$lib/server/db/schema';
import { getUploadWriteDir, THUMB_DIR } from '$lib/server/uploads';
import { and, asc, eq, lt, sql } from 'drizzle-orm';

/**
 * Platzhalter für die nächste Trainingskarte.
 *
 * Hinter der Karte liegt das Foto des gesetzten oder meistgewählten Spots.
 * Solange noch niemand abgestimmt hat — oder der führende Spot noch kein
 * Foto hat — blieb die Karte leer. Stattdessen zeigen Web und App dann drei
 * Spots, an denen die Gruppe am häufigsten trainiert hat: schwarz-weiss,
 * weich ineinander überblendet, als EIN Bild. Das sieht nach euren Spots
 * aus, ohne einen bestimmten als gewählt vorzutäuschen.
 *
 * Das Bild rechnet der Server (sharp): Die App kann weder Bilder maskieren
 * noch zuverlässig entsättigen, so sehen Web und App gleich aus.
 */

/** Endungen, aus denen sich ein Bild rechnen lässt (keine Videos). */
const IMAGE_FILE = /\.(jpe?g|png|webp|gif)$/i;

/** Bei Änderungen an der Gestaltung hochzählen — neue Adresse, alte Caches fallen weg. */
const DESIGN_VERSION = 1;

/** Handy (Karte etwa quadratisch) und breite Bildschirme. */
const SHAPES = {
	square: { width: 900, height: 900 },
	wide: { width: 1500, height: 560 }
} as const;
export type CollageShape = keyof typeof SHAPES;

export function isCollageShape(v: string | null): v is CollageShape {
	return v === 'square' || v === 'wide';
}

/**
 * Die drei Fotos (Dateinamen) für den Platzhalter.
 *
 * „Häufigst trainiert" zählt wie die Statistik: gesetzter Spot, sonst der
 * Spot mit den meisten Stimmen (bei Gleichstand die kleinere Spot-ID).
 * Vorrang haben Spots mit mindestens zwei Fotos — die hat die Gruppe selbst
 * fotografiert; ein einzelnes Bild ist öfter ein Kartenausschnitt oder ein
 * Street-View-Screenshot mit Knöpfen darin. Reicht das nicht für drei,
 * füllen die übrigen Spots mit Foto auf, danach entscheidet die Bewertung.
 */
export function placeholderSpotFiles(today: string, limit = 3): string[] {
	const imagesBySpot = new Map<number, string[]>();
	for (const r of db
		.select({ spotId: spotImages.spotId, filename: spotImages.filename })
		.from(spotImages)
		.innerJoin(spots, eq(spots.id, spotImages.spotId))
		.where(eq(spots.deleted, false))
		.orderBy(asc(spotImages.id))
		.all()) {
		if (!IMAGE_FILE.test(r.filename)) continue;
		const list = imagesBySpot.get(r.spotId) ?? [];
		list.push(r.filename);
		imagesBySpot.set(r.spotId, list);
	}
	if (imagesBySpot.size === 0) return [];

	const past = db
		.select({ id: trainingSessions.id, overrideSpotId: trainingSessions.overrideSpotId })
		.from(trainingSessions)
		.where(and(lt(trainingSessions.date, today), eq(trainingSessions.cancelled, false)))
		.all();

	const topVoted = new Map<number, number>();
	for (const r of db
		.select({
			sessionId: trainingSpotVotes.sessionId,
			spotId: trainingSpotVotes.spotId,
			n: sql<number>`COUNT(*)`.as('n')
		})
		.from(trainingSpotVotes)
		.groupBy(trainingSpotVotes.sessionId, trainingSpotVotes.spotId)
		.orderBy(asc(trainingSpotVotes.sessionId), sql`n DESC`, asc(trainingSpotVotes.spotId))
		.all()) {
		if (!topVoted.has(r.sessionId)) topVoted.set(r.sessionId, r.spotId);
	}

	const trained = new Map<number, number>();
	for (const s of past) {
		const spotId = s.overrideSpotId ?? topVoted.get(s.id);
		if (spotId != null) trained.set(spotId, (trained.get(spotId) ?? 0) + 1);
	}

	const rating = new Map<number, number>(
		db
			.select({ spotId: votes.spotId, avg: sql<number>`AVG(${votes.score})` })
			.from(votes)
			.groupBy(votes.spotId)
			.all()
			.map((r) => [r.spotId, Number(r.avg) || 0])
	);

	const photographed = (id: number) => ((imagesBySpot.get(id)?.length ?? 0) >= 2 ? 1 : 0);
	return [...imagesBySpot.keys()]
		.sort(
			(a, b) =>
				photographed(b) - photographed(a) ||
				(trained.get(b) ?? 0) - (trained.get(a) ?? 0) ||
				(rating.get(b) ?? 0) - (rating.get(a) ?? 0) ||
				a - b
		)
		.slice(0, limit)
		.map((spotId) => imagesBySpot.get(spotId)![0]);
}

function collageKey(files: string[]): string {
	return createHash('sha1')
		.update(`${DESIGN_VERSION}|${files.join('|')}`)
		.digest('hex')
		.slice(0, 12);
}

/**
 * Adressen des Platzhalters für Web und App — mit Schlüssel der
 * Bildauswahl, damit Browser und App das Bild lange behalten dürfen und
 * trotzdem ein neues holen, sobald sich die Auswahl ändert.
 */
export function placeholderCollage(today: string): { square: string; wide: string } | null {
	try {
		const files = placeholderSpotFiles(today);
		if (files.length === 0) return null;
		const k = collageKey(files);
		const url = (shape: CollageShape) => `/api/training/placeholder?shape=${shape}&k=${k}`;
		return { square: url('square'), wide: url('wide') };
	} catch {
		return null;
	}
}

/** Weicher Verlauf (smoothstep) — keine sichtbare Kante am Anfang oder Ende. */
const smooth = (t: number) => t * t * (3 - 2 * t);

async function renderCollage(files: string[], shape: CollageShape): Promise<Buffer> {
	const { width: W, height: H } = SHAPES[shape];
	const dir = getUploadWriteDir();
	const n = files.length;
	const strip = W / n;
	// Überblendung über die halbe Streifenbreite: lang genug, dass kein
	// Übergang als Kante wirkt.
	const fade = Math.round(strip * 0.5);

	const layers: OverlayOptions[] = [];
	for (let i = 0; i < n; i++) {
		// Jedes Bild reicht unter das nächste; das nächste blendet von links
		// her ein (Deckkraft 0 → 1). Darunter bleibt immer volle Deckung,
		// also kein heller Streifen in der Mitte des Übergangs.
		const x0 = i === 0 ? 0 : Math.round(i * strip - fade / 2);
		const x1 = i === n - 1 ? W : Math.round((i + 1) * strip + fade / 2);
		const w = x1 - x0;
		let buf = await sharp(join(dir, files[i]))
			.rotate()
			.resize(w, H, { fit: 'cover', position: 'attention' })
			.grayscale()
			// Gleiche Helligkeit/Kontrast für alle drei — sonst sticht ein
			// dunkles Handyfoto neben einem hellen heraus.
			.normalise({ lower: 2, upper: 98 })
			.ensureAlpha()
			.png()
			.toBuffer();
		if (i > 0) {
			const stops = [0, 0.2, 0.4, 0.6, 0.8, 1]
				.map(
					(t) =>
						`<stop offset="${((t * fade) / w).toFixed(4)}" stop-color="#fff" stop-opacity="${smooth(t).toFixed(3)}"/>`
				)
				.join('');
			const mask = Buffer.from(
				`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${H}"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="0">${stops}</linearGradient></defs><rect width="${w}" height="${H}" fill="url(#g)"/></svg>`
			);
			buf = await sharp(buf).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
		}
		layers.push({ input: buf, left: x0, top: 0 });
	}

	return sharp({ create: { width: W, height: H, channels: 4, background: '#808080' } })
		.composite(layers)
		.flatten({ background: '#808080' })
		.webp({ quality: 72 })
		.toBuffer();
}

const pending = new Map<string, Promise<Buffer>>();

/**
 * Das fertige Bild — einmal gerechnet, danach aus dem Zwischenspeicher
 * (`data/uploads/.thumbs`, nie direkt ausgeliefert). Ältere Fassungen
 * derselben Form werden beim Neurechnen weggeräumt.
 */
export async function placeholderCollageImage(
	today: string,
	shape: CollageShape
): Promise<{ data: Buffer; key: string } | null> {
	const files = placeholderSpotFiles(today);
	if (files.length === 0) return null;
	const key = collageKey(files);
	const cacheDir = join(getUploadWriteDir(), THUMB_DIR);
	const name = `placeholder-${shape}-${key}.webp`;
	const cached = join(cacheDir, name);
	if (existsSync(cached)) return { data: readFileSync(cached), key };

	const id = `${shape}-${key}`;
	let job = pending.get(id);
	if (!job) {
		job = renderCollage(files, shape).finally(() => pending.delete(id));
		pending.set(id, job);
	}
	const data = await job;
	try {
		mkdirSync(cacheDir, { recursive: true });
		writeFileSync(cached, data);
		for (const f of readdirSync(cacheDir)) {
			if (f.startsWith(`placeholder-${shape}-`) && f !== name) unlinkSync(join(cacheDir, f));
		}
	} catch {
		/* ohne Zwischenspeicher halt beim nächsten Mal neu */
	}
	return { data, key };
}
