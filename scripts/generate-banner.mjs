/**
 * Erzeugt den Repo-Banner (docs/banner.png) — Route-Muster plus Wortmarke
 * auf Nachtschwarz, in derselben Schrift wie Portal und App (Teko).
 *
 *   node scripts/generate-banner.mjs
 *
 * Voraussetzung: Teko muss für fontconfig sichtbar sein (einmalig die
 * TTFs aus native/node_modules/@expo-google-fonts/teko nach ~/.fonts
 * kopieren und `fc-cache -f` laufen lassen).
 */
import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs');
mkdirSync(OUT, { recursive: true });

const W = 1280;
const H = 420;
const BG = '#111214';
const INK = '#fafafa';
const ACCENT = '#c05f21';

/** Das Mark aus generate-brand.mjs, hier frei platzierbar. */
function mark({ x, y, size }) {
	const cell = size / 4.5;
	const gap = cell * 0.166;
	const step = cell + gap;
	const cells = [];
	for (let row = 0; row < 4; row++) {
		for (let col = 0; col < 4; col++) {
			if (row + col === 3) continue;
			cells.push(
				`<rect x="${x + col * step}" y="${y + row * step}" width="${cell}" height="${cell}" rx="${cell * 0.12}"
					fill="${INK}" opacity="${row + col < 3 ? 0.42 : 1}"/>`
			);
		}
	}
	return cells.join('\n\t\t');
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
	<rect width="${W}" height="${H}" fill="${BG}"/>

	<!-- Angedeutetes Raster im Hintergrund: das Muster als Textur. -->
	<g opacity="0.05">
		${Array.from({ length: 9 }, (_, i) => `<rect x="${-60 + i * 150}" y="-40" width="110" height="110" rx="14" fill="${INK}"/>`).join('')}
		${Array.from({ length: 9 }, (_, i) => `<rect x="${-10 + i * 150}" y="350" width="110" height="110" rx="14" fill="${INK}"/>`).join('')}
	</g>

	${mark({ x: 96, y: 108, size: 232 })}

	<text x="392" y="212" font-family="Teko" font-weight="600" font-size="112"
		letter-spacing="6" fill="${INK}">PARKOUR</text>
	<text x="396" y="266" font-family="Teko" font-weight="500" font-size="42"
		letter-spacing="20" fill="${ACCENT}">PORTAL</text>
	<text x="398" y="330" font-family="Plus Jakarta Sans" font-size="26"
		fill="${INK}" opacity="0.62">Trainings · Spots · Challenges · Trips — Web, PWA und native App</text>

	<rect x="396" y="290" width="120" height="4" rx="2" fill="${ACCENT}"/>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile(join(OUT, 'banner.png'));
console.log('docs/banner.png erzeugt.');
