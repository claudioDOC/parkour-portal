import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { THEMES, DEFAULT_THEME, type ThemeColors, type UiThemeId } from './theme';
import { getFontScale, getMarkColor } from './prefs';

/**
 * Aktives Theme der App — folgt dem uiTheme aus dem Profil des Users,
 * genau wie die Website (data-theme auf <html>).
 */
type ThemeContextValue = {
	themeId: UiThemeId;
	colors: ThemeColors;
	setThemeId: (id: UiThemeId) => void;
	/** Schriftgrössen-Faktor (1 / 1.1 / 1.2) aus den Einstellungen. */
	fontScale: number;
	setFontScaleState: (scale: number) => void;
	/** Eigene Logo-Farbe; null = folgt dem Theme. */
	markColor: string | null;
	setMarkColorState: (color: string | null) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
	themeId: DEFAULT_THEME,
	colors: THEMES[DEFAULT_THEME],
	setThemeId: () => {},
	fontScale: 1,
	setFontScaleState: () => {},
	markColor: null,
	setMarkColorState: () => {}
});

export const useTheme = () => useContext(ThemeContext);

/**
 * Stylesheet-Fabrik, neu berechnet wenn Theme oder Schriftgrösse wechseln.
 * Die Schriftgrösse wird ZENTRAL hier angewandt: jede fontSize/lineHeight
 * aus den makeStyles aller Screens wird mit dem Faktor multipliziert —
 * so wirkt die Einstellung überall, ohne jeden Screen anzufassen.
 */
export function useThemedStyles<T extends StyleSheet.NamedStyles<T>>(
	make: (colors: ThemeColors) => T
): T {
	const { colors, fontScale } = useTheme();
	return useMemo(() => {
		const base = make(colors);
		if (fontScale === 1) return base;
		const scaled: Record<string, object> = {};
		for (const [key, style] of Object.entries(base)) {
			const flat = StyleSheet.flatten(style as object) as Record<string, unknown>;
			const next: Record<string, unknown> = { ...flat };
			if (typeof flat.fontSize === 'number') next.fontSize = flat.fontSize * fontScale;
			if (typeof flat.lineHeight === 'number') next.lineHeight = flat.lineHeight * fontScale;
			scaled[key] = next;
		}
		return scaled as T;
	}, [colors, make, fontScale]);
}

export function ThemeProvider({
	themeId,
	setThemeId,
	children
}: {
	themeId: UiThemeId;
	setThemeId: (id: UiThemeId) => void;
	children: ReactNode;
}) {
	const [fontScale, setFontScaleState] = useState(getFontScale());
	const [markColor, setMarkColorState] = useState<string | null>(getMarkColor());
	const value = useMemo(
		() => ({
			themeId,
			colors: THEMES[themeId],
			setThemeId,
			fontScale,
			setFontScaleState,
			markColor,
			setMarkColorState
		}),
		[themeId, setThemeId, fontScale, markColor]
	);
	return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
