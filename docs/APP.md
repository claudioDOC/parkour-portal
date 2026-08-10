# Parkour Portal als App

Das Portal läuft auf Android und iPhone als App — **mit derselben Codebasis wie
die Website**. Es gibt keinen zweiten Quellcode: jede Änderung am Web ist sofort
auch in der App.

---

## 1. Wie es funktioniert

Die App ist eine **PWA** (Progressive Web App). Das heisst: die Website selbst
ist die App. Auf Android gibt es zusätzlich eine dünne native Hülle (**TWA** —
Trusted Web Activity), damit sie sich installieren und in den Play Store stellen
lässt. Die Hülle enthält keinen eigenen Inhalt, sie öffnet
`https://matetraining.duckdns.org` im Vollbild.

| Änderung                       | Was ist zu tun?                          |
|--------------------------------|------------------------------------------|
| Seiten, Funktionen, Design     | Nur deployen — App aktualisiert sich selbst |
| App-Name, Icon, Ziel-URL       | Android-Workflow neu laufen lassen       |

---

## 2. Installation für Nutzer

**Android (Chrome):** Beim Besuch erscheint unten ein Banner „App installieren".
Alternativ Menü ⋮ → *App installieren*.

**iPhone (nur Safari):** Teilen-Symbol → *Zum Home-Bildschirm* → *Hinzufügen*.
Ein Banner in der App führt Schritt für Schritt durch. Wichtig: Nur so
funktionieren Benachrichtigungen auf dem iPhone — im normalen Safari-Tab nicht.

**Android als APK:** Die Datei aus dem GitHub-Workflow (siehe unten) lässt sich
direkt auf dem Handy installieren („Unbekannte Quellen" erlauben).

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

Die Toolchain liegt auf dem Server unter `tools/` (JDK 21 via apt, Android-SDK
und Gradle 8.9, zusammen ~600 MB — per `.gitignore` ausgenommen).

```bash
./android/build-app.sh              # Version 1.0.0, Nummer 1
./android/build-app.sh 1.0.1 2      # Versionsname und -nummer setzen
```

Dauer: rund eine Minute. Ergebnis:

- `android/app/build/outputs/apk/release/app-release.apk` — direkt aufs Handy
- `android/app/build/outputs/bundle/release/app-release.aab` — für den Play Store

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
