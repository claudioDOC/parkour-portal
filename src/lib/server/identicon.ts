/**
 * Deterministische Individual-Avatare für alle ohne eigenes Profilbild.
 *
 * Statt bloss dem Anfangsbuchstaben bekommt jede Person ein eigenes,
 * immer gleiches geometrisches Muster (wie ein GitHub-Identicon): ein
 * 5×5-Raster, das an der Mittelachse gespiegelt ist, mit einer aus dem
 * Namen abgeleiteten Farbe. Rein berechnet, ohne externen Dienst — passt
 * damit auch durch die strenge CSP und funktioniert offline.
 */

/** Stabiler 32-Bit-Hash (FNV-1a) über den Seed. */
function hashSeed(seed: string): number {
	let h = 0x811c9dc5;
	for (let i = 0; i < seed.length; i++) {
		h ^= seed.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return h >>> 0;
}

/**
 * Baut ein Identicon-SVG (quadratisch, abgerundeter Hintergrund). `size`
 * ist nur die nominale Kantenlänge im Viewport; das SVG skaliert ohnehin.
 */
export function identiconSvg(seed: string, size = 120): string {
	const hash = hashSeed(seed || '?');
	// Farbton aus dem Hash; Sättigung und Helligkeit fest, damit alle
	// Avatare zueinander passen und auf hell wie dunkel lesbar bleiben.
	const hue = hash % 360;
	const fg = `hsl(${hue} 62% 58%)`;
	const bg = `hsl(${hue} 45% 16%)`;

	const cells = 5;
	const half = Math.ceil(cells / 2); // 3 Spalten, rechts gespiegelt
	const pad = 1; // Rasterrand in Zellen
	const grid = cells + pad * 2;
	const unit = 100 / grid;

	let rects = '';
	for (let col = 0; col < half; col++) {
		for (let row = 0; row < cells; row++) {
			// Je ein Bit des Hashes bestimmt, ob die Zelle gefüllt ist.
			const bit = (hash >> (col * cells + row)) & 1;
			if (!bit) continue;
			for (const c of [col, cells - 1 - col]) {
				const x = (pad + c) * unit;
				const y = (pad + row) * unit;
				rects += `<rect x="${x.toFixed(3)}" y="${y.toFixed(3)}" width="${unit.toFixed(3)}" height="${unit.toFixed(3)}"/>`;
			}
		}
	}

	return (
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}">` +
		`<rect width="100" height="100" rx="18" fill="${bg}"/>` +
		`<g fill="${fg}">${rects}</g>` +
		`</svg>`
	);
}
