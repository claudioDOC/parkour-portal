/**
 * Erzeugt sämtliche Marken-Assets aus einer SVG-Quelle:
 *   node scripts/generate-brand.mjs
 *
 * Motiv: drei gestaffelte Chevrons — Bewegung, Tempo, vorwärts-aufwärts.
 * Monochrom: Weiss auf Nachtschwarz, die hinteren Chevrons blenden aus.
 *
 * Ausgaben (alle nach static/):
 *   logo.svg                   Kachel mit Mark (Favicon, Docs)
 *   pwa-192x192.png            App-Icon
 *   pwa-512x512.png            App-Icon gross
 *   pwa-maskable-512x512.png   Android Adaptive Icon (Safe-Zone beachtet)
 *   apple-touch-icon.png       iOS Home-Bildschirm (180px, ohne Transparenz)
 *   splash/*.png               iOS-Startbilder (dunkler Grund, Logo zentriert)
 */
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'static');
mkdirSync(join(OUT, 'splash'), { recursive: true });

const BG_DARK = '#111214';
const INK = '#fafafa';

/** Ein Chevron: Spitze nach rechts, `x` = linke Kante. */
const chevron = (x, opacity, w = 46) =>
	`<path d="M${x} 168 L${x + 106} 268 L${x} 368" fill="none" stroke="${INK}" stroke-width="${w}" stroke-linejoin="miter" opacity="${opacity}"/>`;

/** Das Mark: drei gestaffelte Chevrons, leicht aufwärts rotiert. */
function markSvg({ scale = 1 } = {}) {
	return `
	<g transform="translate(256 256) scale(${scale}) translate(-256 -256) rotate(-14 256 256)">
		${chevron(96, 0.25)}
		${chevron(196, 0.55)}
		${chevron(296, 1)}
	</g>`;
}

/** Kachel; bei `rounded` mit Ecken wie ein App-Icon. */
function tileSvg({ rounded = true, markScale = 1 } = {}) {
	const r = rounded ? 110 : 0;
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
	<clipPath id="tileClip"><rect width="512" height="512" rx="${r}"/></clipPath>
	<g clip-path="url(#tileClip)">
		<rect width="512" height="512" fill="${BG_DARK}"/>
		${markSvg({ scale: markScale })}
	</g>
</svg>`;
}

const tileRounded = tileSvg({ rounded: true });
const tileFull = tileSvg({ rounded: false });
// Maskable: Launcher schneiden bis zu 20 % Rand ab — Motiv in die Safe-Zone.
const tileMaskable = tileSvg({ rounded: false, markScale: 0.78 });

writeFileSync(join(OUT, 'logo.svg'), tileRounded);

await sharp(Buffer.from(tileRounded)).resize(192, 192).png().toFile(join(OUT, 'pwa-192x192.png'));
await sharp(Buffer.from(tileRounded)).resize(512, 512).png().toFile(join(OUT, 'pwa-512x512.png'));
await sharp(Buffer.from(tileMaskable)).resize(512, 512).png().toFile(join(OUT, 'pwa-maskable-512x512.png'));
// iOS rundet selbst ab — volle Kachel ohne Transparenz.
await sharp(Buffer.from(tileFull)).resize(180, 180).png().toFile(join(OUT, 'apple-touch-icon.png'));

// Badge für Android-Statusleiste: nur das Mark, weiss auf transparent (wird
// vom System eingefärbt — Details gehen verloren, darum ohne Staffelung).
const badgeSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
	<g transform="rotate(-14 256 256)">
		${chevron(146, 1, 62)}
		${chevron(280, 1, 62)}
	</g>
</svg>`;
await sharp(Buffer.from(badgeSvg)).resize(96, 96).png().toFile(join(OUT, 'notification-badge.png'));

/** iOS-Startbilder für die gängigen Geräte. */
const SPLASHES = [
	{ w: 750, h: 1334 },
	{ w: 828, h: 1792 },
	{ w: 1125, h: 2436 },
	{ w: 1170, h: 2532 },
	{ w: 1179, h: 2556 },
	{ w: 1242, h: 2688 },
	{ w: 1284, h: 2778 },
	{ w: 1290, h: 2796 }
];

for (const s of SPLASHES) {
	const logoSize = Math.round(Math.min(s.w, s.h) * 0.3);
	const logo = await sharp(Buffer.from(tileRounded)).resize(logoSize, logoSize).png().toBuffer();
	await sharp({
		create: { width: s.w, height: s.h, channels: 4, background: BG_DARK }
	})
		.composite([{ input: logo, gravity: 'center' }])
		.png()
		.toFile(join(OUT, 'splash', `splash-${s.w}x${s.h}.png`));
}

console.log('Marken-Assets erzeugt (Chevron-Staffel, monochrom).');
