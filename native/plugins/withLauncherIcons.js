/**
 * Startbildschirm-Symbole als Aliase — inklusive „Standard".
 *
 * Warum nicht die Fertigpakete: Die schalten beim Zurückwechseln die
 * MainActivity selbst ab. Sie ist aber das Ziel aller Aliase — Android
 * verweigert das, und das alte Symbol bleibt zusätzlich stehen (zwei
 * App-Einträge). Hier bekommt die MainActivity gar keinen Launcher-
 * Eintrag mehr; jede Variante — auch Standard — ist ein eigener Alias.
 * Umgeschaltet wird im Modul `launcher-icon` mit „einen ein, Rest aus".
 */
const { withAndroidManifest, withDangerousMod, AndroidConfig } = require('expo/config-plugins');
const { copyFileSync, mkdirSync, existsSync } = require('fs');
const path = require('path');

/** Muss zu LAUNCHER_ICONS in src/app/settings.tsx passen. */
const VARIANTS = [
	{ suffix: 'Standard', icon: '@mipmap/ic_launcher', round: '@mipmap/ic_launcher_round', enabled: true },
	{ suffix: 'terracotta', icon: '@mipmap/terracotta', enabled: false },
	{ suffix: 'neon', icon: '@mipmap/neon', enabled: false },
	{ suffix: 'tuerkis', icon: '@mipmap/tuerkis', enabled: false },
	{ suffix: 'violett', icon: '@mipmap/violett', enabled: false },
	{ suffix: 'rot', icon: '@mipmap/rot', enabled: false },
	{ suffix: 'blau', icon: '@mipmap/blau', enabled: false }
];

const LAUNCHER_FILTER = {
	action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
	category: [{ $: { 'android:name': 'android.intent.category.LAUNCHER' } }]
};

/** Legt die farbigen PNGs als mipmap-Ressourcen ab (höchste Dichte reicht —
 *  Android skaliert für kleinere Bildschirme selbst herunter). */
function withIconFiles(config) {
	return withDangerousMod(config, [
		'android',
		(cfg) => {
			const src = path.join(cfg.modRequest.projectRoot, 'assets', 'images', 'icons');
			const dest = path.join(
				cfg.modRequest.platformProjectRoot,
				'app',
				'src',
				'main',
				'res',
				'mipmap-xxxhdpi'
			);
			mkdirSync(dest, { recursive: true });
			for (const v of VARIANTS) {
				if (v.suffix === 'Standard') continue; // nutzt ic_launcher
				const file = path.join(src, `icon-${v.suffix}.png`);
				if (existsSync(file)) copyFileSync(file, path.join(dest, `${v.suffix}.png`));
			}
			return cfg;
		}
	]);
}

module.exports = function withLauncherIcons(config) {
	config = withIconFiles(config);
	return withAndroidManifest(config, (cfg) => {
		const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
		const pkg = cfg.android?.package ?? config.android?.package;

		// 1. Launcher-Eintrag von der MainActivity nehmen (bleibt Ziel der Aliase).
		const mainActivity = (app.activity ?? []).find((a) => a.$['android:name'] === '.MainActivity');
		if (mainActivity?.['intent-filter']) {
			mainActivity['intent-filter'] = mainActivity['intent-filter'].filter((f) => {
				const isLauncher = (f.category ?? []).some(
					(c) => c.$['android:name'] === 'android.intent.category.LAUNCHER'
				);
				return !isLauncher;
			});
			if (mainActivity['intent-filter'].length === 0) delete mainActivity['intent-filter'];
		}

		// 2. Für jede Variante einen Alias (alte Einträge vorher entfernen —
		//    prebuild läuft mehrfach, sonst sammeln sich Duplikate).
		const ours = new Set(VARIANTS.map((v) => `${pkg}.MainActivity${v.suffix}`));
		app['activity-alias'] = (app['activity-alias'] ?? []).filter(
			(al) => !ours.has(al.$['android:name'])
		);

		for (const v of VARIANTS) {
			app['activity-alias'].push({
				$: {
					'android:name': `${pkg}.MainActivity${v.suffix}`,
					'android:enabled': String(v.enabled),
					'android:exported': 'true',
					'android:icon': v.icon,
					...(v.round ? { 'android:roundIcon': v.round } : {}),
					'android:targetActivity': '.MainActivity'
				},
				'intent-filter': [LAUNCHER_FILTER]
			});
		}

		return cfg;
	});
};
