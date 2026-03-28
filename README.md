# Parkour Training Portal

Ein selbst gehostetes Webportal für Parkour-Gruppen. Verwaltet Trainings, Spot-Datenbank, Spot-Voting und vieles mehr.

Gebaut für unsere Trainingsgruppe im Raum Thun/Bern, aber so aufgebaut, dass es jede Parkour-Gruppe nutzen kann.

## Features

### Training
- Trainings werden automatisch generiert (standardmässig Di + Do, 18:15–20:15)
- Abmeldung nur mit Begründung (mind. 10 Zeichen)
- Übersicht wer zieht (ohne Abmeldung) und wer abgemeldet ist

### Spots
- Spot-Datenbank mit Name, Stadt, Koordinaten, Beschreibung
- Kategorien: Kerntechniken (Präzisionssprung, Flow, Armsprung, Drops, etc.), Wetter-Eignung (trocken/nass), Beleuchtung
- Adress-Suche über OpenStreetMap (Nominatim) oder manuelle Koordinaten
- Bilder-Upload pro Spot
- Satellitenkarte mit Pin auf der Spot-Detailseite
- Bewertungssystem (1–5 Sterne) mit Möglichkeit zum Entfernen
- Filter nach Stadt und Technik

### Spot-Voting fürs Training
- Vor jedem Training können Mitglieder Spots vorschlagen und dafür voten
- Der Spot mit den meisten Stimmen gewinnt
- Falls niemand voted: automatischer Vorschlag basierend auf aktuellem Wetter (Open-Meteo API)
- Voting schliesst 2 Stunden vor Trainingsstart

### Spot-Finder
- Schritt-für-Schritt Quiz: Wetter (automatisch oder manuell), Stadt, Technik
- Zeigt die besten passenden Spots sortiert nach Bewertung
- Direkt aus den Ergebnissen fürs nächste Training voten

### User-System
- Registrierung nur per Einladungslink (kein offenes Signup)
- Drei Rollen:
  - **Admin**: Volle Kontrolle (User-Verwaltung, Spot-Papierkorb, Passwort-Reset, Rollen)
  - **Spot-Manager**: Spots hinzufügen und bearbeiten
  - **Mitglied**: Standard-Rolle, kann Spots hinzufügen, voten, am Training teilnehmen
- Passwort ändern in den Einstellungen

### Admin-Bereich
- User-Verwaltung: Passwort zurücksetzen, Rolle ändern, User deaktivieren/aktivieren (Soft-Delete)
- Spot-Verwaltung: Bearbeiten, Papierkorb mit Wiederherstellen (kein permanentes Löschen)
- Einladungslinks erstellen und verwalten

## Tech Stack

- **Frontend & Backend**: [SvelteKit](https://kit.svelte.dev/) (Svelte 5)
- **Datenbank**: SQLite über [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- **ORM**: [Drizzle ORM](https://orm.drizzle.team/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) v4 (Dark Theme)
- **Auth**: bcrypt + JWT Cookies
- **Wetter**: [Open-Meteo API](https://open-meteo.com/) (kostenlos, kein API-Key nötig)
- **Geocoding**: [Nominatim/OpenStreetMap](https://nominatim.org/) (kostenlos)

## Setup

### Voraussetzungen

- Node.js 18+
- npm

### Installation

```bash
git clone https://github.com/claudioDOC/parkour-portal.git
cd parkour-portal
npm install
```

### Datenbank einrichten

Die Datenbank ist nicht im Repo enthalten und muss lokal angelegt werden. Dazu erst den `data/` Ordner erstellen, dann die Migration und den Seed ausführen:

```bash
mkdir -p data
npx drizzle-kit generate
npx tsx src/lib/server/db/seed.ts
```

Das erstellt die SQLite-Datenbank unter `data/parkour.db`, einen Admin-User und die ersten Trainings-Sessions. Passwort direkt nach dem ersten Login ändern!

### Starten

**Entwicklung:**
```bash
npm run dev
```

**Produktion:**
```bash
npm run build
node build
```

Die App läuft standardmässig auf `http://localhost:5173` (Dev) bzw. `http://localhost:3000` (Produktion).

### Konfiguration

- **JWT Secret**: Setze `JWT_SECRET` als Umgebungsvariable für Produktion
- **Hinter nginx/HTTPS (Produktion)**: Setze für den Node-Prozess `ORIGIN=https://deine-domain` (siehe [adapter-node Environment](https://svelte.dev/docs/kit/adapter-node#Environment-variables)), sonst kann SvelteKit die öffentliche URL falsch erraten. Im Repo ist vorerst `csrf.trustedOrigins: ['*']` gesetzt, damit POST/Upload trotzdem gehen.
- **Trainingszeiten**: Anpassbar in `src/lib/server/db/seed.ts`
- **Standard-Stadt für Wetter**: Thun (anpassbar in `src/lib/server/weather.ts`)

## Mitmachen

Issues und Feature-Requests sind willkommen! Nutze dafür die GitHub Issues. Wenn du einen Bug findest oder eine Idee hast, erstelle einfach ein Issue.

## Lizenz

MIT
