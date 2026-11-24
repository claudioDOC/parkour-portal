import { requireOptionalNativeModule } from 'expo-modules-core';

/**
 * Echter Neustart der App (nur Android, ab APK 1.11). Ältere App-Dateien
 * haben das Modul nicht — dann ist der Wert null.
 */
type AppRestartModule = {
	restart: () => boolean;
};

export default requireOptionalNativeModule<AppRestartModule>('AppRestart');
