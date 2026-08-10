#!/usr/bin/env bash
#
# Baut die Android-App (APK + AAB) auf diesem Server.
#
#   ./android/build-app.sh              → Version 1.0.0, Nummer 1
#   ./android/build-app.sh 1.0.1 2      → Versionsname und -nummer setzen
#
# Nur nötig, wenn sich Name, Icon oder Ziel-URL der App ändern — normale
# Web-Änderungen landen ohne neuen Build in der App.
set -euo pipefail

VERSION_NAME="${1:-1.0.0}"
VERSION_CODE="${2:-1}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KEYSTORE="$ROOT/backups/android/parkour-release.jks"
CREDENTIALS="$ROOT/backups/android/keystore-credentials.txt"

if [ ! -f "$KEYSTORE" ] || [ ! -f "$CREDENTIALS" ]; then
	echo "FEHLER: Signaturschlüssel fehlt unter $KEYSTORE" >&2
	echo "Ohne den ursprünglichen Schlüssel lassen sich bestehende Installationen" >&2
	echo "nicht mehr aktualisieren. Backup einspielen statt neu erzeugen!" >&2
	exit 1
fi

export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
export ANDROID_HOME="$ROOT/tools/android-sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export ANDROID_KEYSTORE_PATH="$KEYSTORE"
# shellcheck source=/dev/null
. "$CREDENTIALS"
export ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_ALIAS ANDROID_KEY_PASSWORD
export APP_VERSION_NAME="$VERSION_NAME"
export APP_VERSION_CODE="$VERSION_CODE"

echo "Baue Parkour Portal $VERSION_NAME (Code $VERSION_CODE) …"
cd "$ROOT/android"
"$ROOT/tools/gradle-8.9/bin/gradle" assembleRelease bundleRelease --no-daemon

APK="$ROOT/android/app/build/outputs/apk/release/app-release.apk"
AAB="$ROOT/android/app/build/outputs/bundle/release/app-release.aab"

echo
echo "Fertig:"
echo "  APK (direkt installierbar): $APK"
echo "  AAB (Play Store)          : $AAB"
echo
FP=$(keytool -list -v -keystore "$KEYSTORE" -alias "$ANDROID_KEY_ALIAS" \
	-storepass "$ANDROID_KEYSTORE_PASSWORD" 2>/dev/null |
	grep 'SHA256:' | head -1 | sed 's/.*SHA256: //' | tr -d ' \r')
echo "Fingerabdruck (muss in .env als ANDROID_CERT_FINGERPRINTS stehen):"
echo "  $FP"
