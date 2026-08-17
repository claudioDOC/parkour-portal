/**
 * Zwingt alle Android-Module auf JVM-Ziel 17.
 *
 * Hintergrund: Manche Fremdpakete (z. B. expo-dynamic-app-icon) pinnen ihr
 * Kotlin-Ziel auf 11, während der Rest des Projekts mit 17 kompiliert.
 * Gradle bricht das mit „Inconsistent JVM-target compatibility" ab.
 *
 * Als Config-Plugin statt Handpatch, damit `expo prebuild` die Einstellung
 * jedes Mal selbst wieder einträgt.
 */
const { withProjectBuildGradle } = require('expo/config-plugins');

const SNIPPET = `
// Von withKotlinJvmTarget.js: einheitliches JVM-Ziel für alle Module.
subprojects { subproject ->
    subproject.tasks.withType(org.jetbrains.kotlin.gradle.tasks.KotlinCompile).configureEach {
        compilerOptions {
            jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
        }
    }
}
`;

module.exports = function withKotlinJvmTarget(config) {
	return withProjectBuildGradle(config, (cfg) => {
		if (!cfg.modResults.contents.includes('withKotlinJvmTarget.js')) {
			cfg.modResults.contents += SNIPPET;
		}
		return cfg;
	});
};
