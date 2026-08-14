import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { THEMES, DEFAULT_THEME, type ThemeColors, type UiThemeId } from './theme';

/**
 * Aktives Theme der App — folgt dem uiTheme aus dem Profil des Users,
 * genau wie die Website (data-theme auf <html>).
 */
type ThemeContextValue = {
	themeId: UiThemeId;
	colors: ThemeColors;
	setThemeId: (id: UiThemeId) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
	themeId: DEFAULT_THEME,
	colors: THEMES[DEFAULT_THEME],
	setThemeId: () => {}
});

export const useTheme = () => useContext(ThemeContext);

/** Stylesheet-Fabrik, neu berechnet wenn das Theme wechselt. */
export function useThemedStyles<T extends StyleSheet.NamedStyles<T>>(
	make: (colors: ThemeColors) => T
): T {
	const { colors } = useTheme();
	return useMemo(() => make(colors), [colors, make]);
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
	const value = useMemo(
		() => ({ themeId, colors: THEMES[themeId], setThemeId }),
		[themeId, setThemeId]
	);
	return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
