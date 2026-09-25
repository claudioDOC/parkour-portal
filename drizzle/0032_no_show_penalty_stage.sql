-- Strafrunde eskaliert im Wechsel: Stufe 1 = Warnung + Fragezeichen,
-- Stufe 2 = zusätzlich falscher Spot (ohne Ankündigung), dann wieder Stufe 1.
-- Der Zähler läuft ohne zeitliche Grenze über alle bisherigen Strafen.
ALTER TABLE no_show_penalties ADD COLUMN stage INTEGER NOT NULL DEFAULT 1;
