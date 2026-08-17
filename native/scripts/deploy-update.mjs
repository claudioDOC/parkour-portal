/**
 * Veröffentlicht das zuletzt exportierte Bundle (dist/) als Update auf dem
 * eigenen Server: kopiert die Dateien nach ../data/expo-updates/<plattform>/
 * und schreibt je ein fertiges Manifest (Expo-Updates-Protokoll) mit allen
 * Hashes. Beide Plattformen werden bedient, sofern der Export sie enthält —
 * die iOS-App (sideloaded) bekommt damit dieselben automatischen Updates.
 *
 * Ablauf: npx expo export --platform all && node scripts/deploy-update.mjs
 * (oder einfach ./deploy.sh)
 */
import { createHash, randomUUID } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const nativeRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(nativeRoot, 'dist');
const updatesRoot = join(nativeRoot, '..', 'data', 'expo-updates');

const appJson = JSON.parse(readFileSync(join(nativeRoot, 'app.json'), 'utf8'));
const runtimeVersion = appJson.expo.runtimeVersion;
const baseUrl = new URL(appJson.expo.updates.url).origin;

const metadata = JSON.parse(readFileSync(join(dist, 'metadata.json'), 'utf8'));

const EXT_MIME = {
	hbc: 'application/javascript',
	bundle: 'application/javascript',
	js: 'application/javascript',
	png: 'image/png',
	jpg: 'image/jpeg',
	webp: 'image/webp',
	gif: 'image/gif',
	ttf: 'font/ttf',
	otf: 'font/otf',
	json: 'application/json'
};

function assetEntry(path, ext) {
	const buf = readFileSync(join(dist, path));
	return {
		hash: createHash('sha256').update(buf).digest('base64url'),
		key: createHash('md5').update(buf).digest('hex'),
		contentType: EXT_MIME[ext] ?? 'application/octet-stream',
		fileExtension: `.${ext}`,
		url: `${baseUrl}/api/expo/assets/${path}`
	};
}

const platforms = Object.keys(metadata.fileMetadata);
if (platforms.length === 0) throw new Error('Export enthält keine Plattform — lief `expo export`?');

for (const platform of platforms) {
	const files = metadata.fileMetadata[platform];
	const target = join(updatesRoot, platform);
	const manifest = {
		id: randomUUID(),
		createdAt: new Date().toISOString(),
		runtimeVersion,
		launchAsset: assetEntry(files.bundle, 'hbc'),
		assets: files.assets.map((a) => assetEntry(a.path, a.ext)),
		metadata: {},
		extra: {}
	};

	rmSync(target, { recursive: true, force: true });
	mkdirSync(target, { recursive: true });
	cpSync(dist, join(target, 'files'), { recursive: true });
	writeFileSync(join(target, 'manifest.json'), JSON.stringify(manifest, null, '\t'));

	console.log(
		`${platform}: Update ${manifest.id.slice(0, 8)} — Runtime ${runtimeVersion}, ${manifest.assets.length + 1} Dateien`
	);
}
console.log('Alle Installationen laden es beim nächsten App-Start automatisch.');
