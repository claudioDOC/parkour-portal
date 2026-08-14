/**
 * Veröffentlicht das zuletzt exportierte Bundle (dist/) als Update auf dem
 * eigenen Server: kopiert die Dateien nach ../data/expo-updates/android/ und
 * schreibt ein fertiges Manifest (Expo-Updates-Protokoll) mit allen Hashes.
 *
 * Ablauf: npx expo export --platform android && node scripts/deploy-update.mjs
 * (oder einfach ./deploy.sh)
 */
import { createHash, randomUUID } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const nativeRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(nativeRoot, 'dist');
const target = join(nativeRoot, '..', 'data', 'expo-updates', 'android');

const appJson = JSON.parse(readFileSync(join(nativeRoot, 'app.json'), 'utf8'));
const runtimeVersion = appJson.expo.runtimeVersion;
const baseUrl = new URL(appJson.expo.updates.url).origin;

const metadata = JSON.parse(readFileSync(join(dist, 'metadata.json'), 'utf8'));
const android = metadata.fileMetadata.android;

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

const manifest = {
	id: randomUUID(),
	createdAt: new Date().toISOString(),
	runtimeVersion,
	launchAsset: assetEntry(android.bundle, 'hbc'),
	assets: android.assets.map((a) => assetEntry(a.path, a.ext)),
	metadata: {},
	extra: {}
};

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(dist, join(target, 'files'), { recursive: true });
writeFileSync(join(target, 'manifest.json'), JSON.stringify(manifest, null, '\t'));

console.log(`Update veröffentlicht: ${manifest.id}`);
console.log(`Runtime ${runtimeVersion}, ${manifest.assets.length + 1} Dateien → ${target}`);
console.log('Alle Installationen laden es beim nächsten App-Start automatisch.');
