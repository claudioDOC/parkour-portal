/**
 * App-Version (Semver) — stammt aus package.json; bei Releases dort erhöhen.
 * Sprachgebrauch: „wir sind bei 1.2“ = Minor 1.2.x; Patch nur bei kleinen Fixes.
 * Nächste Stufe: 1.3.0 / 1.4.0 bei Features; 2.0.0 bei größerem Bruch oder Neuaufstellung.
 */
import pkg from '../../package.json';

export const APP_VERSION = pkg.version;
