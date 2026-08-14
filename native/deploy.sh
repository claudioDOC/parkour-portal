#!/usr/bin/env bash
#
# Baut das JS-Bundle der nativen App und veröffentlicht es als Update.
# Alle installierten Apps holen es beim nächsten Start automatisch —
# keine neue APK, kein Store, kein Zutun der Nutzer.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

npx expo export --platform android
node scripts/deploy-update.mjs
