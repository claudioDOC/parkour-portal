# Parkour-Portal — HTTP-API

Diese Datei beschreibt die JSON-APIs für Clients (z. B. Android-APK, Skripte). Die Web-App nutzt dieselben Endpunkte teilweise parallel zu den SvelteKit-Seiten.

**Basis-URL:** die Origin deiner Installation, z. B. `https://deine-domain.tld`  
Alle Pfade unten sind relativ dazu (z. B. `POST /api/auth/login`).

---

## 1. Authentifizierung

### Session (Browser)

Nach erfolgreichem Login setzt der Server ein **httpOnly-Cookie** `session` (JWT, typisch 30 Tage). SameSite `lax`, bei HTTPS `secure`.

### Mobile / API-Clients (Bearer-JWT)

1. `POST /api/auth/login` mit JSON **`{ "username": "…", "password": "…", "includeToken": true }`**
2. Antwort enthält dann zusätzlich **`"token": "<jwt>"`**
3. Bei folgenden Requests Header setzen:  
   `Authorization: Bearer <jwt>`

Der Server akzeptiert dieselbe JWT **entweder** im Cookie **oder** im `Authorization`-Header (Bearer hat Vorrang vor dem Cookie).

**Logout:** `POST /api/auth/logout` (Cookie wird gelöscht; Client entfernt das gespeicherte Token lokal).

**Passwort ändern:** `POST /api/auth/change-password` (siehe bestehende Implementierung im Projekt; Login nötig).

---

## 2. Versionierte Lesemodelle (`/api/v1/*`)

Alle `v1`-Routen antworten mit `Content-Type: application/json`.  
Außer **`GET /api/v1/meta`** ist **eingeloggt** erforderlich (Cookie oder Bearer).

| Methode | Pfad | Beschreibung |
|--------|------|----------------|
| GET | `/api/v1/meta` | Index: API-Version, grobe Endpunktliste (ohne Auth) |
| GET | `/api/v1/me` | Aktueller User: `id`, `username`, `role`, `trainingAttendance`, `autoAbsentWeekdays`, `uiTheme` |
| GET | `/api/v1/spots` | Alle nicht gelöschten Spots wie Spot-Übersichtsseite: u. a. `avgScore`, `voteCount`, `thumbnail`, Micro-/Parent-Felder |
| GET | `/api/v1/spots/:id` | Voller Spot wie Spot-Detailseite: Spot, Bilder, Parkplätze, Challenges inkl. `doneBy` / `openBy` / Bilder, `mapMarkers`, `nearbySpots`, `userVote`, `nextOpenSessionId`, plus `user` (Viewer) |
| GET | `/api/v1/challenges` | Challenge-Arena: `spotsWithChallenges`, Leaderboard, `recentClears`, Kennzahlen (`schemaReady` false, falls DB-Schema fehlt) |
| GET | `/api/v1/training/sessions` | Nächste Training-Termine (kompakt): Array `sessions` mit Zeilen aus `training_sessions` (nach heutigem Datum, begrenzt) |

**Bild-URLs:** relativ `/uploads/<filename>` — vollständige URL = `Origin + Pfad`.

---

## 3. Weitere JSON-Endpunkte (Auswahl)

Authentifizierung standardmäßig wie oben (Cookie oder Bearer).

### Spots

| Methode | Pfad | Kurzbeschreibung |
|--------|------|------------------|
| GET | `/api/spots` | Kompaktliste (id, name, city, …) — älteres Format |
| POST | `/api/spots` | Neuen Spot anlegen (Body wie Web-Formular / Admin-Logik) |

### Bewertungen & Medien

| Methode | Pfad |
|--------|------|
| POST / DELETE | `/api/spots/vote` |
| POST / DELETE | `/api/spots/images` (`multipart` bzw. JSON mit `imageId`) |

### Challenges (pro Spot)

| Methode | Pfad | Hinweis |
|--------|------|---------|
| POST | `/api/spots/challenges` | Spot anlegen: `spotId`, `title`, `description?` |
| PATCH | `/api/spots/challenges` | `done` (eigene Erledigung) **oder** `title`/`description` (Bearbeiten, Berechtigung) |
| DELETE | `/api/spots/challenges` | Soft-Delete (Papierkorb) |
| PUT | `/api/spots/challenges` | Wiederherstellen |
| POST / DELETE | `/api/spots/challenges/images` | `multipart` + `challengeId` / JSON `imageId` |

### Training, Finder, Trips

- `POST /api/training` — Aktionen (Abwesenheit, Votes, …), siehe Request-Body in `src/routes/api/training/+server.ts`
- `GET /api/training/watch` — SSE/Watch (falls genutzt)
- `GET /api/finder` — Spot-Finder (Query-Parameter wie Web-UI)
- `GET` / `POST` `/api/trips` — Trips

### Öffentlich (API-Key)

Header **`X-API-Key`** oder **`Authorization: Bearer <key>`** — Schlüssel in `PUBLIC_STATUS_API_KEY` bzw. `PUBLIC_STATUS_API_KEYS` (kommagetrennt).

- `GET /api/public/status/today`
- `GET /api/public/status/next`
- `GET /api/public/stats`

---

## 4. HTTP-Fehler

- **401** — nicht (mehr) angemeldet / ungültiges Token  
- **403** — keine Berechtigung  
- **404** — Ressource unbekannt  
- **429** — Rate-Limit (u. a. Login), ggf. Header `Retry-After`  
- **503** — Schema nicht migriert / Konfiguration fehlt  

Fehlerbody meist `{ "error": "…" }` (deutsche Texte möglich).

---

## 5. Sicherheit & Betrieb

- Produktion: `JWT_SECRET` setzen (nicht Default aus dem Code).
- HTTPS empfohlen; Cookie `secure` hängt an `ORIGIN` (`https://…`).
- Bearer-Token wie Passwörter behandeln (nur TLS, sicher speichern auf dem Gerät).

---

## 6. Änderungen / Version

- **v1** Lesemodelle eingeführt: Meta, Me, Spots, Spot-Detail, Challenges, Training-Sessions (kompakt).
- **Auth:** `Authorization: Bearer` + `includeToken` beim Login für mobile Clients.

Bei Erweiterungen bitte diese Datei und ggf. `GET /api/v1/meta` Endpoint-Liste mitpflegen.
