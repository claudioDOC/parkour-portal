# Parkour Portal – Benutzer-Anleitung

Diese Anleitung führt dich beim **ersten Mal** durch die wichtigsten Bereiche. Du kannst sie Schritt für Schritt abarbeiten oder einzelne Kapitel nach Bedarf lesen.

---

## 1. Erster Zugang: Einladung und Konto

1. Du erhältst von einem **Admin** einen **Einladungslink** (URL mit Token), z. B.  
   `https://eure-domain.ch/register/DEIN-TOKEN`
2. Dort wählst du **Benutzername** (mind. 3 Zeichen) und **Passwort** (mind. 10 Zeichen).
3. Nach der Registrierung bist du **eingeloggt**. Merke dir dein Passwort – Admins können es bei Bedarf zurücksetzen, sehen es aber nicht.
4. **Login** später immer unter `/login` mit Benutzername und Passwort.

**Hinweis:** Ohne gültigen Einladungslink ist keine Selbstregistrierung möglich.

---

## 2. Navigation (nach dem Login)

- **Desktop:** Links die **Seitenleiste** mit allen Menüpunkten.
- **Mobile:** Oben **Menü-Icon** öffnet die Navigation.
- **Admin** sieht zusätzlich den Punkt **Admin** (nur für Administratoren).

Standard-Menü:

| Menüpunkt    | Kurzbeschreibung                          |
|-------------|---------------------------------------------|
| **Dashboard** | Startseite, nächste Trainings, Überblick   |
| **Training**  | Alle kommenden Termine, Voting, Abmeldung  |
| **Spots**     | Spot-Liste filtern und Details öffnen      |
| **Spot-Finder** | Quiz: passende Spots nach Kriterien     |
| **Statistik** | Trainingsbeteiligung (geschätzt)          |
| **Einstellungen** | Eigenes Passwort ändern               |

---

## 3. Dashboard (Startseite)

- **Nächste Trainings:** Kurzübersicht mit Datum, wer ungefähr **zieht** bzw. **zieht nicht**, und wer beim letzten Vorschlag führt (Spot-Voting).
- **Top Spots:** beliebte Spots nach Bewertung.
- Link **„Alle Trainings & Spot-Voting“** führt zur vollen **Training**-Seite.

---

## 4. Training – der wichtigste Bereich

### 4.1 Wer „zieht“ und wer „zieht nicht“

- **Zieht:** Person nimmt am Training teil (erscheint in der grünen Liste).
- **Zieht nicht:** Person ist für diesen Termin abgemeldet (rote Liste). So nennt es die Oberfläche – gemeint ist: kommt nicht zum Training.

**Zwei typische Einstellungen** (legt der Admin pro User fest):

- **„Wie alle“ (Standard):** Du erscheinst bei **Zieht**, solange du dich nicht abmeldest. Optional kann der Admin **Auto-Abmeldung** für bestimmte Wochentage setzen (z. B. immer Donnerstag „zieht nicht“, ausser du sagst „diesmal doch dabei“).
- **„Nur mit Zusage“ (Opt-in):** Du erscheinst nur unter **Zieht**, wenn du für diesen Termin **explizit zugesagt** hast.

Wenn etwas nicht klickbar ist, hat dein Admin evtl. andere Regeln aktiv – dann kurz nachfragen.

### 4.2 Abmelden („Zieht nicht“)

1. Beim gewünschten Termin auf **Abmelden** tippen.
2. **Grund** eintragen (mind. **10 Zeichen**), dann bestätigen.
3. Zum **Zurücknehmen** die angebotenen Aktionen nutzen (z. B. wieder anmelden / Zusage, je nach Modus).

### 4.3 Spot-Voting vor dem Training

- Vor dem Termin kannst du **Spots vorschlagen** und für einen Spot **stimmen**.
- **Voting schliesst** automatisch **2 Stunden vor Trainingsbeginn** (Uhrzeit steht beim Termin).
- Nach Ablauf siehst du den **Gewinner-Spot** oder einen **automatischen Vorschlag** (z. B. abhängig vom Wetter), falls niemand gevotet hat.

### 4.4 Gast eintragen (nur wenn ihr das nutzt)

Admins können pro Termin **Gäste** erfassen (Name ohne Login). Die erscheinen dann in der **Zieht**-Liste mit Kennzeichnung als Gast.

---

## 5. Spots

### 5.1 Liste (`/spots`)

- **Filter** nach Stadt und Technik.
- Klick auf einen Spot öffnet die **Detailseite** mit Karte, Beschreibung, Bildern, **Sterne-Bewertung**.

### 5.2 Spot vorschlagen (`/spots/suggest`)

- Neuen Spot mit Name, Stadt, optional Koordinaten, Techniken, Wetter-Eignung usw. eintragen.
- **Adresssuche** (OpenStreetMap) oder Koordinaten manuell.
- Nach dem Speichern ist der Spot in der Datenbank (je nach Rolle ggf. zur Bearbeitung durch Spot-Manager/Admin).

### 5.3 Spot-Detail

- **Bewertung:** 1–5 Sterne, kannst du später **ändern** oder **entfernen**.
- **Bilder hochladen** (erlaubte Formate und Grösse siehe Hinweise auf der Seite).
- **Spot in Papierkorb** (wenn du berechtigt bist): blendet den Spot aus; Wiederherstellung macht der **Admin** im Papierkorb.

---

## 6. Spot-Finder (`/finder`)

- **Schritt-für-Schritt:** Wetter (oder automatisch), Stadt, gewünschte Technik.
- Ergebnis: passende Spots, sortiert nach Nutzen für eure Kriterien.
- Von dort aus kannst du oft **direkt fürs nächste Training voten**, wenn ein Termin offen ist.

---

## 7. Statistik (`/statistik`)

- Pro Mitglied: grobe **Trainingsbeteiligung** (wer wie oft „gezogen“ vs. abgemeldet, **geschätzt** ab Registrierung).
- **Streak** und Monatsübersichten, soweit die Gruppe sie nutzt.
- Die Logik entspricht der **Training**-Seite (inkl. Opt-in / Auto-Abmeldung, wenn bei euch aktiv).

---

## 8. Einstellungen (`/settings`)

- **Passwort ändern:** aktuelles Passwort + neues Passwort zweimal.
- Sicheres Passwort wählen; bei Vergessen einen **Admin** bitten (Passwort-Reset).

---

## 9. Admin-Bereich (nur Administratoren)

Unter **Admin** in der Navigation.

### Tabs im Überblick

| Tab | Inhalt |
|-----|--------|
| **User** | Passwort zurücksetzen, Rolle, Training-Modus (wie alle / nur Zusage), Auto-Abmeldung Wochentage, aktivieren/deaktivieren, **Papierkorb** (User vorübergehend entfernen) |
| **Trainings** | Kommende Termine: Gäste, Abwesenheiten, Spot-Votes, User aus „Zieht“ ausblenden/wiederherstellen |
| **Spots** | Spots bearbeiten, in **Papierkorb** legen |
| **Papierkorb** | **Spots** wiederherstellen; **User** wiederherstellen oder **endgültig löschen** (unwiderruflich inkl. deren Spots/Daten) |
| **Einladungen** | Neue Registrierungslinks erzeugen, bestehende sehen |
| **Server** | Grobe Systeminfos (z. B. auf dem VPS) |
| **Protokoll** | Audit-Log (Anmeldungen, Admin-Aktionen, …) |

**Wichtig:** Den **letzten Admin** kann das System nicht in den Papierkorb legen – immer mindestens einen Zugang sicherstellen.

---

## 10. Rollen kurz erklärt

| Rolle | Typische Rechte |
|-------|------------------|
| **Mitglied** | Training, Spots, Finder, Statistik, eigene Daten |
| **Spot-Manager** | Zusätzlich Spots bearbeiten (wie von eurer Gruppe definiert) |
| **Admin** | User, Einladungen, Papierkorb, Trainings-Administration, Protokoll |

---

## 11. Typische erste Woche (Checkliste)

1. [ ] Mit Einladungslink registrieren und einloggen  
2. [ ] **Einstellungen:** Passwort auf ein persönliches ändern  
3. [ ] **Training** öffnen, nächsten Termin ansehen, testweise **Abmelden** mit Grund (oder Zusage, falls Opt-in)  
4. [ ] Beim gleichen Termin **Spot voten** (solange Voting offen)  
5. [ ] **Spots** durchstöbern, einen Spot **bewerten**  
6. [ ] **Spot-Finder** einmal durchklicken  
7. [ ] **Statistik** ansehen  
8. [ ] (Admins) **Admin** durchgehen: Einladung für neue Mitglieder erstellen  

---

## Fragen oder Probleme?

Technische Installation und Server: siehe **README.md** im Projektroot.  
Funktionen hängen teils von **Datenbank-Migrationen** und Admin-Konfiguration ab – bei 500-Fehlern oder fehlenden Buttons hilft meist der Admin inkl. Server-Log.
