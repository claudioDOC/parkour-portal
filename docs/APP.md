# Parkour Portal als App (PWA / iPhone)

> **Android hat inzwischen eine echte native App** (React Native, eigener
> Ordner `native/`, Doku in [native/README.md](../native/README.md), Download
> auf der Portal-Seite `/app`). Diese Datei beschreibt den **PWA-Weg**, der
> weiterhin für iPhone und Browser gilt. Die frühere TWA-Hülle unter
> `android/` ist durch die native App abgelöst.

Die PWA nutzt dieselbe Codebasis wie die Website: jede Änderung am Web ist
sofort auch in der installierten PWA.

---

## 1. Wie es funktioniert

Eine **PWA** (Progressive Web App) ist die Website selbst, installiert als App:
Icon auf dem Home-Bildschirm, Vollbild, Offline-Grundfunktionen über den
Service Worker, Push-Benachrichtigungen.

| Änderung                       | Was ist zu tun?                          |
|--------------------------------|------------------------------------------|
| Seiten, Funktionen, Design     | Nur deployen — PWA aktualisiert sich selbst |

---

## 2. Installation für Nutzer

**Android:** Die **native App** von der Portal-Seite `/app` installieren
(APK, „Unbekannte Quellen" einmal erlauben). Die PWA über Chrome ist nur noch
die Notlösung.

**iPhone (nur Safari):** Teilen-Symbol → *Zum Home-Bildschirm* → *Hinzufügen*.
Ein Banner in der App führt Schritt für Schritt durch. Wichtig: Nur so
funktionieren Benachrichtigungen auf dem iPhone — im normalen Safari-Tab nicht.

---

## 3. Offline

Der Service Worker (`src/service-worker.ts`) legt automatisch an:

- **Seiten** — zuerst Netz (4 s Geduld), sonst die zuletzt gesehene Fassung,
  sonst die Seite `/offline`.
- **API-Daten** — gleiche Logik, 7 Tage Vorrat.
- **Spot- und Challenge-Bilder** (`/uploads/`) — dauerhaft, bis 400 Bilder.
- **Kartenkacheln** — bis 500 Stück, 30 Tage.

Ohne Empfang erscheint oben ein gelber Balken. Änderungen (Abmelden, Voten)
brauchen weiterhin eine Verbindung.

---

## 4. Benachrichtigungen (Push)

### Für Nutzer
*Einstellungen → Benachrichtigungen → Auf diesem Gerät einschalten.* Die
Freigabe gilt **pro Gerät**, die Auswahl (Training-Erinnerung, Challenges …)
für den Account. Mit *Test senden* lässt sich alles sofort prüfen.

### Was automatisch verschickt wird
| Wann | Was |
|------|-----|
| Vorabend, 18:00 | Erinnerung an das Training am nächsten Tag — an alle, die mitziehen |
| Trainingstag, 09:00 | Nur an `opt_in`-User ohne Zu- oder Absage |

Der Zeitplan läuft im Serverprozess (`src/lib/server/pushScheduler.ts`), Prüfung
alle 10 Minuten. `push_reminder_log` verhindert doppelte Nachrichten nach einem
Neustart. Kein Cron nötig.

### Server-Einrichtung
In `.env` (bereits gesetzt):

```
VAPID_PUBLIC_KEY=…
VAPID_PRIVATE_KEY=…
VAPID_SUBJECT=mailto:…
```

Neue Schlüssel erzeugen — **Achtung, danach müssen alle Nutzer Push erneut
einschalten**:

```bash
node -e "const w=require('web-push');const k=w.generateVAPIDKeys();console.log(k)"
```

Fehlen die Schlüssel, ist Push einfach aus; die App läuft normal weiter.

---

## 5. Android-App bauen

**Die aktuelle native App wird in [native/README.md](../native/README.md)
gebaut und veröffentlicht** — dieser Abschnitt betrifft nur noch die alte
TWA-Hülle unter `android/` (abgelöst, bleibt als Referenz).

Die Toolchain liegt auf dem Server unter `tools/` (JDK 21 via apt, Android-SDK
und Gradle 8.9 — per `.gitignore` ausgenommen). Beide Apps nutzen **denselben
Signaturschlüssel** unter `backups/android/`.

```bash
./android/build-app.sh              # TWA: Version 1.0.0, Nummer 1
```

Die **Versionsnummer muss bei jedem Update steigen**, sonst verweigern Android
und der Play Store die Installation.

### Signaturschlüssel
Liegt unter `backups/android/parkour-release.jks`, Passwörter daneben in
`keystore-credentials.txt` (beide `chmod 600` und gitignored).

> **Unbedingt extern sichern.** Geht der Schlüssel verloren, lassen sich
> bestehende Installationen nie wieder aktualisieren — es bräuchte eine neue App
> mit neuem Paketnamen, und alle müssten neu installieren.

### Adressleiste ausblenden
Damit die App ohne Chrome-Adressleiste startet, muss die Website die App
bestätigen. In `.env` (bereits gesetzt):

```
ANDROID_PACKAGE_NAME=org.duckdns.matetraining.twa
ANDROID_CERT_FINGERPRINTS=0D:2A:5A:…
```

Prüfen: `curl https://matetraining.duckdns.org/.well-known/assetlinks.json` —
der Wert muss zur APK-Signatur passen:

```bash
tools/android-sdk/build-tools/34.0.0/apksigner verify --print-certs \
  android/app/build/outputs/apk/release/app-release.apk
```

Beim Play Store signiert Google zusätzlich selbst — dann **beide** Fingerabdrücke
kommagetrennt eintragen (der aus der Play Console unter *App-Integrität*).

### Alternative: GitHub Actions
`.github/workflows/android-app.yml` baut dasselbe ohne Server-Toolchain
(*Actions → „Android-App bauen" → Run workflow*). Dafür müssen der Code gepusht
und der Schlüssel als Secrets hinterlegt sein — `ANDROID_KEYSTORE_BASE64`
(`base64 -w0 backups/android/parkour-release.jks`), `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Wichtig: **derselbe** Schlüssel wie
lokal, sonst gelten die Builds als verschiedene Apps.

---

## 6. Wichtige Dateien

| Datei | Zweck |
|-------|-------|
| `scripts/generate-brand.mjs` | Erzeugt Logo, App-Icons und Splashscreens aus einer SVG-Quelle |
| `src/lib/components/BrandLogo.svelte` | Logo im Portal — folgt dem gewählten Farbschema |
| `src/lib/devicePrefs.ts` | Geräte-Einstellungen: Schriftgrösse, Animationen, Start-Seite |
| `src/service-worker.ts` | Offline-Caching und Push-Empfang |
| `vite.config.ts` | Web-Manifest (Name, Icons, Shortcuts) |
| `src/lib/server/push.ts` | Versand über VAPID |
| `src/lib/server/pushScheduler.ts` | Automatische Erinnerungen |
| `src/lib/components/PushSettings.svelte` | Bedienung in den Einstellungen |
| `src/lib/components/PwaInstallBanner.svelte` | Installationshinweis, inkl. iOS |
| `src/routes/.well-known/assetlinks.json/+server.ts` | Verknüpfung Website ↔ Android-App |
| `android/` | Die native Hülle (nur Konfiguration, kein Inhalt) |
| `.github/workflows/android-app.yml` | APK-/AAB-Build |
