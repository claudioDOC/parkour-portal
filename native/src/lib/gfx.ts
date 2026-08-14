/**
 * SVG-Grafiken als Daten-URIs, gerendert über expo-image — so bekommt die
 * App die Verläufe und Hintergrund-Texturen der Website ohne native Module.
 */

const svgUri = (svg: string) =>
	`data:image/svg+xml;utf8,${encodeURIComponent(svg).replace(/'/g, '%27')}`;

/**
 * Seitenhintergrund wie `html` im Web-CSS: Neon-Glow oben Mitte, Orange-Glow
 * oben rechts, leiser Glow unten links, dazu ein feines Punktraster.
 */
export const BG_TEXTURE = svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 860" preserveAspectRatio="xMidYMid slice">
<defs>
<radialGradient id="a" cx="50%" cy="-18%" rx="80%" ry="42%"><stop offset="0%" stop-color="#e8ff47" stop-opacity="0.13"/><stop offset="100%" stop-color="#e8ff47" stop-opacity="0"/></radialGradient>
<radialGradient id="b" cx="105%" cy="0%" rx="55%" ry="28%"><stop offset="0%" stop-color="#ff9947" stop-opacity="0.12"/><stop offset="100%" stop-color="#ff9947" stop-opacity="0"/></radialGradient>
<radialGradient id="c" cx="-5%" cy="100%" rx="45%" ry="25%"><stop offset="0%" stop-color="#e8ff47" stop-opacity="0.05"/><stop offset="100%" stop-color="#e8ff47" stop-opacity="0"/></radialGradient>
<pattern id="d" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#ffffff" fill-opacity="0.045"/></pattern>
</defs>
<rect width="400" height="860" fill="#0d0d0f"/>
<rect width="400" height="860" fill="url(#d)"/>
<rect width="400" height="860" fill="url(#a)"/>
<rect width="400" height="860" fill="url(#b)"/>
<rect width="400" height="860" fill="url(#c)"/>
</svg>`);

/** Horizontaler Akzentbalken (gelb→orange) — wie unter den Web-Titeln. */
export const GRADIENT_BAR = svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 6">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#e8ff47"/><stop offset="100%" stop-color="#ff9947"/></linearGradient></defs>
<rect width="64" height="6" rx="2" fill="url(#g)"/>
</svg>`);

/** Flächen-Verlauf (gelb→orange) für primäre Buttons. */
export const GRADIENT_FILL = svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40" preserveAspectRatio="none">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0.4"><stop offset="0%" stop-color="#e8ff47"/><stop offset="100%" stop-color="#ffb347"/></linearGradient></defs>
<rect width="100" height="40" fill="url(#g)"/>
</svg>`);

/** Vertikaler Glow-Balken (gelb→orange) — Seitenkopf-Detail der Website. */
export const GRADIENT_BAR_V = svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 6 56">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#e8ff47"/><stop offset="60%" stop-color="#ff9947"/><stop offset="100%" stop-color="#ff9947" stop-opacity="0.6"/></linearGradient></defs>
<rect width="6" height="56" rx="2" fill="url(#g)"/>
</svg>`);
