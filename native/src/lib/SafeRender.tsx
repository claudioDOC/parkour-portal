import { Component, type ReactNode } from 'react';

/**
 * Absturzsicherung für einzelne Bereiche.
 *
 * Hintergrund: Eine Erkennung, ob ein natives Modul vorhanden ist, kann
 * sich irren — der JavaScript-Teil steckt im Update-Paket, der native
 * Gegenpart aber nur in neueren Installationen. Schlägt das Zeichnen
 * fehl, riss es bisher die ganze App mit. Diese Hülle fängt den Fehler
 * ab und zeigt stattdessen den Ersatzinhalt.
 */
export class SafeRender extends Component<
	{ children: ReactNode; fallback: ReactNode },
	{ failed: boolean }
> {
	state = { failed: false };

	static getDerivedStateFromError() {
		return { failed: true };
	}

	componentDidCatch() {
		// Bewusst still: der Ersatzinhalt erklärt dem Nutzer, was zu tun ist.
	}

	render() {
		return this.state.failed ? this.props.fallback : this.props.children;
	}
}
