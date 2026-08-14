/**
 * SVG-Grafiken als Daten-URIs (gerendert über expo-image) — Hintergrund-
 * Glows und Verläufe wie im Web-CSS, eingefärbt nach aktivem Theme.
 */
import type { ThemeColors } from './theme';

const svgUri = (svg: string) =>
	`data:image/svg+xml;utf8,${encodeURIComponent(svg).replace(/'/g, '%27')}`;

/** Seitenhintergrund: Akzent-Glow oben Mitte, Zweitakzent oben rechts, Punktraster. */
export function bgTexture(c: ThemeColors): string {
	const dot = c.dark ? '#ffffff' : '#000000';
	return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 860" preserveAspectRatio="xMidYMid slice">
<defs>
<radialGradient id="a" cx="50%" cy="-18%" rx="80%" ry="42%"><stop offset="0%" stop-color="${c.accent}" stop-opacity="0.10"/><stop offset="100%" stop-color="${c.accent}" stop-opacity="0"/></radialGradient>
<radialGradient id="b" cx="105%" cy="0%" rx="55%" ry="28%"><stop offset="0%" stop-color="${c.accentHot}" stop-opacity="0.08"/><stop offset="100%" stop-color="${c.accentHot}" stop-opacity="0"/></radialGradient>
<pattern id="d" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="${dot}" fill-opacity="0.04"/></pattern>
</defs>
<rect width="400" height="860" fill="${c.bg}"/>
<rect width="400" height="860" fill="url(#d)"/>
<rect width="400" height="860" fill="url(#a)"/>
<rect width="400" height="860" fill="url(#b)"/>
</svg>`);
}

/** Horizontaler Akzentbalken (Akzent→Zweitakzent) — wie unter den Web-Titeln. */
export function gradientBar(c: ThemeColors): string {
	return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 6">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="${c.accent}"/><stop offset="100%" stop-color="${c.accentHot}"/></linearGradient></defs>
<rect width="64" height="6" rx="2" fill="url(#g)"/>
</svg>`);
}

/** Verlaufs-Fortschrittsbalken (Akzent→Zweitakzent) wie in der Statistik. */
export function gradientProgress(c: ThemeColors): string {
	return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 6" preserveAspectRatio="none">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="${c.accent}"/><stop offset="100%" stop-color="${c.accentHot}"/></linearGradient></defs>
<rect width="100" height="6" rx="3" fill="url(#g)"/>
</svg>`);
}

/** Flächen-Verlauf für primäre Buttons und Kopfbänder. */
export function gradientFill(c: ThemeColors): string {
	return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40" preserveAspectRatio="none">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0.4"><stop offset="0%" stop-color="${c.accent}"/><stop offset="100%" stop-color="${c.accentHot}"/></linearGradient></defs>
<rect width="100" height="40" fill="url(#g)"/>
</svg>`);
}
