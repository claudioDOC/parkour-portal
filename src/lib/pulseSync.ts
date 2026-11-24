/**
 * Gleicher Takt für Zug-O-Meter-Balken und Bildschirm-Alarm.
 *
 * Beide atmen mit derselben CSS-Animation (`zug-breathe`, 1,2 s), starten
 * aber zu verschiedenen Zeiten — nach einem Seitenwechsel wäre der Balken
 * neu, der Rahmen nicht, und beide liefen versetzt. Darum werden sie an
 * die gemeinsame Seitenuhr gehängt: `startTime = 0` heisst „läuft seit dem
 * Laden der Seite" — jede Animation mit derselben Dauer ist damit exakt
 * phasengleich, egal wann sie erschienen ist, und driftet nie auseinander.
 *
 * Als Svelte-Action: `use:pulseSync` oder `use:pulseSync={schluessel}` —
 * ändert sich der Schlüssel (z. B. die Stufe und damit die Animation),
 * wird neu angehängt.
 */
export function pulseSync(node: HTMLElement, _key?: unknown) {
	const sync = () =>
		requestAnimationFrame(() => {
			for (const a of node.getAnimations({ subtree: true })) {
				if ((a as CSSAnimation).animationName === 'zug-breathe') a.startTime = 0;
			}
		});
	sync();
	return { update: sync };
}
