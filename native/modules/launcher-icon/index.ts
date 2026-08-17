import { requireNativeModule } from 'expo-modules-core';

/**
 * Startbildschirm-Symbol umschalten (nur Android).
 * `name` und die Liste sind Alias-Suffixe aus dem Manifest — '' ist
 * bewusst NICHT erlaubt, jede Variante hat einen eigenen Alias.
 */
type LauncherIconModule = {
	setIcon: (name: string, all: string[]) => boolean;
	getIcon: (all: string[]) => string | null;
};

export default requireNativeModule<LauncherIconModule>('LauncherIcon');
