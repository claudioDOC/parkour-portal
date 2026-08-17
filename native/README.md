# Parkour Portal — Native Android-App

Echte native App (React Native / Expo SDK 57, expo-router) für das Parkour
Portal. Kein WebView-Wrapper: Alle Screens sind nativ gebaut und sprechen mit
dem Portal über die JSON-API (`/api/v1/…`, Bearer-JWT). Die Karte zeichnet
MapLibre nativ auf dem Gerät.

**Grundsatz:** Die App kann mindestens alles, was die Website kann. Wer eine
Funktion im Web ändert oder ergänzt, denkt sie hier mit (siehe
`native-app-architektur` in den Projektnotizen).

## Wie Updates die Nutzer erreichen

Es gibt zwei getrennte Wege — das ist der wichtigste Punkt in diesem Ordner:

1. **JS-Update (der Normalfall, täglich nutzbar):**
   `./deploy.sh` baut das JavaScript-Bundle und legt es unter
   `../data/expo-updates/android/` ab. Das Portal liefert es über
   `/api/expo/manifest` + `/api/expo/assets/…` aus (self-hosted expo-updates).
   Jede installierte App lädt es beim nächsten Start automatisch — ohne Store,
   ohne Zutun der Nutzer.

2. **Neue APK (nur bei nativen Änderungen):**
   Nötig, sobald sich native Module, Berechtigungen, Icons oder der Splash
   ändern. Die APK landet unter `../data/app/parkour-portal.apk` und wird auf
   der Portal-Seite `/app` mit versioniertem Dateinamen
   (`parkour-portal-<version>.apk`) angeboten.

### runtimeVersion — Vorsicht

`runtimeVersion` in `app.json` ist bewusst auf **`1.1.0` eingefroren**, obwohl
die APK-Version weiterläuft (1.1 → 1.2 → 1.3 …). Der Update-Server
(`src/routes/api/expo/manifest/+server.ts`) kennt eine Liste
`COMPATIBLE_RUNTIMES` und **schreibt die runtimeVersion im Manifest auf die des
anfragenden Clients um** — die App prüft das selbst und verwirft sonst das
Update. Wer die runtimeVersion erhöht, schneidet alle bestehenden
Installationen vom Update-Kanal ab. Nur erhöhen, wenn ein JS-Bundle mit alten
APKs wirklich crashen würde — und dann die Server-Liste mitpflegen.

Fehlende native Module dürfen die App nie crashen: Zugriffe laufen über
`src/lib/nativeModules.ts` (Erkennung via TurboModuleRegistry — unter der neuen
RN-Architektur sind NativeModules nicht mehr zuverlässig aufzählbar) und über
die Absturzsicherung `src/lib/SafeRender.tsx`. Fällt ein Modul aus, erscheint
ein Hinweis mit Download-Link statt eines Absturzes.

## JS-Update veröffentlichen

```bash
cd native
./deploy.sh        # expo export + scripts/deploy-update.mjs
```

Danach: App komplett schliessen und neu öffnen (Update lädt beim Start und
greift beim nächsten Start) — oder in der App **Mehr → „Nach Update suchen"**.
Unter **Mehr** steht unten die Update-ID (`Stand xxxxxxxx vom …`) zur Kontrolle.

## APK bauen (auf diesem Server)

Voraussetzungen liegen im Repo bzw. auf dem Server: JDK 21, Android-SDK unter
`tools/android-sdk`, Signaturschlüssel unter `backups/android/` (niemals neu
erzeugen — sonst lassen sich bestehende Installationen nicht aktualisieren).

```bash
cd native
# 1. Version in app.json erhöhen (expo.version + android.versionCode)
# 2. Native Projektdateien erzeugen/aktualisieren:
npx expo prebuild --platform android

# 3. WICHTIG: prebuild ÜBERSCHREIBT android/gradle.properties und
#    android/app/build.gradle. Danach immer wieder einpatchen:
#    - android/app/build.gradle: release-signingConfig aus den
#      Umgebungsvariablen ANDROID_KEYSTORE_PATH/…_PASSWORD/…_ALIAS
#    - android/gradle.properties: org.gradle.jvmargs=-Xmx4096m,
#      reactNativeArchitectures=arm64-v8a
#    (Das JVM-Ziel 17 trägt inzwischen das Config-Plugin
#     plugins/withKotlinJvmTarget.js selbst wieder ein.)
#    (Vorlage: der aktuell eingecheckte Stand dieser Dateien)

# 4. Bauen (Env aus backups/android/keystore-credentials.txt):
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
export ANDROID_HOME=/opt/parkour-portal/tools/android-sdk
export ANDROID_KEYSTORE_PATH=/opt/parkour-portal/backups/android/parkour-release.jks
. /opt/parkour-portal/backups/android/keystore-credentials.txt
cd android && ./gradlew assembleRelease

# 5. Bereitstellen:
cp app/build/outputs/apk/release/app-release.apk /opt/parkour-portal/data/app/parkour-portal.apk
```

Der Build braucht viel RAM/CPU (2-GB-Container reicht nicht — vorher
hochskalieren, siehe `parkour-portal-deploy` in den Projektnotizen).
Verifizieren: `aapt2 dump badging`, `apksigner verify --print-certs`.

## Startbildschirm-Icon (Farbvarianten)

`expo-dynamic-app-icon` legt pro Farbe einen Activity-Alias an; die
Bilder erzeugt `scripts/generate-brand.mjs` nach
`assets/images/icons/icon-<farbe>.png`. Umschalten in der App unter
Einstellungen → Startbildschirm-Icon. Neue Farben brauchen deshalb
immer eine neue APK — reine JS-Updates reichen dafür nicht.

## Screens & Struktur

```
src/app/(tabs)/        Finder · Spots · Start (Mitte, erhöht) · Stats · Mehr
src/app/               map, trips, challenges, challenge/[id], spot/[id],
                       spot-new, profile, activity, settings, admin, login
src/lib/api.ts         kompletter API-Client (Bearer-JWT, Upload-Feld „image")
src/lib/store.ts       useData(key, fetcher): Cache + Refresh bei Fokus
src/lib/theme.ts       alle 8 Portal-Themes; Textfarben über fg + textAlpha
src/lib/NativeMap.tsx  MapLibre-Karte (Exports: Map, Marker[lngLat], Camera)
src/lib/nativeModules.ts  vorsichtige Modul-Erkennung (siehe oben)
```

Design-Regeln: Schriften Teko (Display) + Plus Jakarta Sans über
`@expo-google-fonts` — **nie `fontWeight` mit einer Custom-`fontFamily`
kombinieren** (fällt sonst auf die Systemschrift zurück). Grössen/Radien aus
`src/lib/tokens.ts`. Standard-Theme ist hell; `uiTheme` kommt aus
`/api/v1/me` (Antwort ist in `{ user: { … } }` verpackt).

## Vorschau ohne Gerät (Screenshots)

Die App lässt sich als Web-Export rendern und mit Puppeteer in
Handy-Auflösung fotografieren — so wird nichts blind ausgeliefert:

```bash
npx expo export --platform web            # erzeugt dist/
node <scratchpad>/preview-server.mjs      # serviert dist/ auf :4173, proxyt /api → :3000
node <scratchpad>/appshots.mjs            # Screenshots aller Screens (412×915)
```
