/** Einheitliche Mindestlänge für Passwörter (Registrierung, Änderung, Admin-Reset). */
export const MIN_PASSWORD_LENGTH = 10;

/**
 * Häufige und im Umfeld naheliegende Passwörter.
 *
 * Ein Sicherheitsaudit hat mit „Password-Spraying" drei von vier Konten
 * geknackt: Zehn Zeichen allein sind keine Hürde, wenn es `aaaaaaaaaa`
 * oder `parkour123` sein darf. Die Liste bleibt bewusst kurz — sie soll
 * das Naheliegende abfangen, nicht ein Wörterbuch ersetzen.
 */
const BLOCKLIST = [
	'password',
	'passwort',
	'12345678',
	'123456789',
	'1234567890',
	'qwertzuiop',
	'qwertyuiop',
	'parkour',
	'parkourportal',
	'matetraining',
	'admin123456',
	'letmein',
	'willkommen',
	'geheim',
	'iloveyou',
	'sunshine',
	'freerunning'
];

export type PasswordCheck = { ok: true } | { ok: false; error: string };

/**
 * Prüft ein neues Passwort. Bewusst ohne Zeichenklassen-Zwang („mindestens
 * ein Sonderzeichen") — das führt erfahrungsgemäss zu `Parkour1!` statt zu
 * mehr Sicherheit. Geprüft wird stattdessen auf Länge, Einfallslosigkeit
 * und den eigenen Namen.
 */
export function checkPasswordPolicy(password: string, username?: string): PasswordCheck {
	const pw = password ?? '';
	if (pw.length < MIN_PASSWORD_LENGTH) {
		return { ok: false, error: `Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein` };
	}
	const lower = pw.toLowerCase();

	if (new Set(pw).size < 4) {
		return { ok: false, error: 'Passwort besteht aus zu wenigen verschiedenen Zeichen' };
	}
	if (/^(\d+|[a-z]+)$/.test(lower) && new Set(lower).size < 6) {
		return { ok: false, error: 'Passwort ist zu einfach — bitte etwas Eigenes wählen' };
	}
	for (const bad of BLOCKLIST) {
		if (lower.includes(bad)) {
			return { ok: false, error: 'Passwort enthält ein zu bekanntes Wort — bitte etwas Eigenes' };
		}
	}
	if (username && username.length >= 3 && lower.includes(username.toLowerCase())) {
		return { ok: false, error: 'Passwort darf den Benutzernamen nicht enthalten' };
	}
	// Reine Zahlenfolgen wie 1029384756 sind trotz Länge schwach.
	if (/^\d+$/.test(pw)) {
		return { ok: false, error: 'Passwort darf nicht nur aus Ziffern bestehen' };
	}
	return { ok: true };
}
