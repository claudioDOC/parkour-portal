/**
 * Erzeugt sämtliche Marken-Assets aus einer SVG-Quelle:
 *   node scripts/generate-brand.mjs            (Standard: 4x4-Raster)
 *   node scripts/generate-brand.mjs slant      (leicht gekippt, mehr Tempo)
 *   node scripts/generate-brand.mjs solid      (alle Blöcke gleich stark)
 *
 * Motiv: Route — ein Blockraster, durch das eine Diagonale frei bleibt.
 * Muster statt Buchstaben: der Weg durchs Hindernis. Die Blöcke vor der
 * Route stehen zurück, die dahinter stehen voll — monochrom, keine Verläufe.
 *
 * Ausgaben static/:
 *   logo.svg · pwa-192x192.png · pwa-512x512.png ·
 *   pwa-maskable-512x512.png · apple-touch-icon.png ·
 *   notification-badge.png · splash/*.png
 *
 * Ausgaben native/assets/images/:
 *   icon.png · splash-icon.png · favicon.png ·
 *   android-icon-foreground.png · android-icon-background.png ·
 *   android-icon-monochrome.png · mark-mono.png (für den App-Kopf,
 *   wird dort in der Themefarbe eingefärbt)
 */
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'static');
const NATIVE = join(ROOT, 'native', 'assets', 'images');
mkdirSync(join(OUT, 'splash'), { recursive: true });
mkdirSync(NATIVE, { recursive: true });

const BG_DARK = '#111214';
const INK = '#fafafa';

const VARIANT = process.argv[2] ?? 'standard';
/** Leichte Kippung nur in der Slant-Variante. */
const TILT = VARIANT === 'slant' ? -8 : 0;
/** „solid": alle Blöcke gleich stark statt zurückgesetzter Vorderreihe. */
const DIM = VARIANT === 'solid' ? 1 : 0.42;

/**
 * Das Mark: 4x4-Raster, die Gegendiagonale bleibt leer — das ist die
 * Route. Blöcke oberhalb der Route stehen zurück, die darunter voll:
 * dadurch liest sich die Diagonale als Weg und nicht als Zufallslücke.
 */
function markSvg({ scale = 1, color = INK } = {}) {
	const size = 84;
	const gap = 14;
	// Exakt zentriert: 4 Zellen + 3 Lücken = 378 → (512 - 378) / 2.
	const start = (512 - (4 * size + 3 * gap)) / 2;
	const cells = [];
	for (let row = 0; row < 4; row++) {
		for (let col = 0; col < 4; col++) {
			if (row + col === 3) continue; // die freie Route
			const x = start + col * (size + gap);
			const y = start + row * (size + gap);
			const opacity = row + col < 3 ? DIM : 1;
			cells.push(
				`<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="10" fill="${color}" opacity="${opacity}"/>`
			);
		}
	}
	return `
	<g transform="translate(256 256) scale(${scale}) rotate(${TILT}) translate(-256 -256)">
		${cells.join('\n\t\t')}
	</g>`;
}

/** Kachel; bei `rounded` mit Ecken wie ein App-Icon. */
function tileSvg({ rounded = true, markScale = 1, bg = BG_DARK } = {}) {
	const r = rounded ? 110 : 0;
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
	<clipPath id="tileClip"><rect width="512" height="512" rx="${r}"/></clipPath>
	<g clip-path="url(#tileClip)">
		<rect width="512" height="512" fill="${bg}"/>
		${markSvg({ scale: markScale })}
	</g>
</svg>`;
}

/** Nur das Mark, transparenter Grund — zum Einfärben durch die App. */
function markOnlySvg({ markScale = 1, color = INK } = {}) {
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
	${markSvg({ scale: markScale, color })}
</svg>`;
}

const tileRounded = tileSvg({ rounded: true });
const tileFull = tileSvg({ rounded: false });
// Maskable/Adaptive: Launcher schneiden bis zu 20 % Rand ab — in die Safe-Zone.
const tileMaskable = tileSvg({ rounded: false, markScale: 0.74 });

writeFileSync(join(OUT, 'logo.svg'), tileRounded);

await sharp(Buffer.from(tileRounded)).resize(192, 192).png().toFile(join(OUT, 'pwa-192x192.png'));
await sharp(Buffer.from(tileRounded)).resize(512, 512).png().toFile(join(OUT, 'pwa-512x512.png'));
await sharp(Buffer.from(tileMaskable)).resize(512, 512).png().toFile(join(OUT, 'pwa-maskable-512x512.png'));
// iOS rundet selbst ab — volle Kachel ohne Transparenz.
await sharp(Buffer.from(tileFull)).resize(180, 180).png().toFile(join(OUT, 'apple-touch-icon.png'));

// Badge für die Android-Statusleiste: nur das Mark, wird vom System
// eingefärbt — kräftiger Strich, damit bei 24 px nichts zuläuft.
const badgeSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
	<g fill="${INK}">
		<rect x="72" y="72" width="112" height="112" rx="14"/>
		<rect x="200" y="72" width="112" height="112" rx="14"/>
		<rect x="72" y="200" width="112" height="112" rx="14"/>
		<rect x="328" y="200" width="112" height="112" rx="14"/>
		<rect x="200" y="328" width="112" height="112" rx="14"/>
		<rect x="328" y="328" width="112" height="112" rx="14"/>
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

// --- Assets der nativen App ---------------------------------------------
await sharp(Buffer.from(tileRounded)).resize(1024, 1024).png().toFile(join(NATIVE, 'icon.png'));
await sharp(Buffer.from(tileRounded)).resize(512, 512).png().toFile(join(NATIVE, 'splash-icon.png'));
await sharp(Buffer.from(tileRounded)).resize(64, 64).png().toFile(join(NATIVE, 'favicon.png'));
// Adaptive Icon: Vordergrund transparent + eigener Hintergrund.
await sharp(Buffer.from(markOnlySvg({ markScale: 0.7 })))
	.resize(1024, 1024)
	.png()
	.toFile(join(NATIVE, 'android-icon-foreground.png'));
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: '#0d0d0f' } })
	.png()
	.toFile(join(NATIVE, 'android-icon-background.png'));
await sharp(Buffer.from(markOnlySvg({ markScale: 0.7 })))
	.resize(1024, 1024)
	.png()
	.toFile(join(NATIVE, 'android-icon-monochrome.png'));
// Kopfzeilen-Mark: weiss auf transparent, wird in der App eingefärbt.
await sharp(Buffer.from(markOnlySvg({ markScale: 0.94 })))
	.resize(256, 256)
	.png()
	.toFile(join(NATIVE, 'mark-mono.png'));

console.log(`Marken-Assets erzeugt (Route-Muster, Variante: ${VARIANT}).`);
