#!/usr/bin/env bash
# Tägliche Sicherung von Datenbank und Bildern.
#
# Die Datenbank wird mit `sqlite3 .backup` kopiert, nicht mit `cp`: Das
# Portal schreibt im WAL-Modus, eine simple Dateikopie kann mitten in
# einer Transaktion erwischt werden und ist dann unbrauchbar.
#
# Bilder werden gespiegelt statt gepackt (123 MB, täglich neu packen wäre
# Verschwendung) — und bewusst ohne Löschabgleich: Wird ein Bild im
# Portal entfernt, bleibt die Kopie hier liegen. Genau dafür ist sie da.
set -euo pipefail

ROOT="/opt/parkour-portal"
DB="$ROOT/data/parkour.db"
DEST="$ROOT/backups/db"
UPLOADS_SRC="$ROOT/data/uploads/"
UPLOADS_DEST="$ROOT/backups/uploads/"
KEEP_DAYS=14

mkdir -p "$DEST" "$UPLOADS_DEST"

STAMP="$(date +%Y%m%d-%H%M)"
OUT="$DEST/parkour-$STAMP.db"

sqlite3 "$DB" ".backup '$OUT'"

# Kaputte Sicherung ist schlimmer als keine — darum sofort prüfen.
if [ "$(sqlite3 "$OUT" 'PRAGMA integrity_check;')" != "ok" ]; then
	echo "Integritätsprüfung fehlgeschlagen: $OUT" >&2
	rm -f "$OUT"
	exit 1
fi

gzip -f "$OUT"

# Bilder spiegeln — `cp -au` überträgt nur Neues/Geändertes und ist
# überall vorhanden (rsync ist auf diesem Server nicht installiert).
# Der Thumbnail-Cache bleibt aussen vor, er entsteht jederzeit neu.
find "$UPLOADS_SRC" -maxdepth 1 -type f -exec cp -au {} "$UPLOADS_DEST" \;

# Alte Sicherungen wegräumen; die Spiegelung bleibt bestehen.
find "$DEST" -name 'parkour-*.db.gz' -mtime "+$KEEP_DAYS" -delete

COUNT="$(find "$DEST" -name 'parkour-*.db.gz' | wc -l)"
echo "Sicherung ok: $OUT.gz ($(du -h "$OUT.gz" | cut -f1)), $COUNT Stände vorhanden, Bilder gespiegelt."
