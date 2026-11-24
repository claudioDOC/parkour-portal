export const ANDROID_APP_VERSION = '1.11.0';
export const ANDROID_APP_VERSION_CODE = 12;

/**
 * Pflicht-Update für die App (JS-Updates über den eigenen Update-Server):
 * true = liegt ein neues Update bereit, kommt der Hinweis OHNE „Später" —
 * man kann nur neu starten. Die App fragt das über /api/v1/app-version ab
 * (`otaPflicht`), wirkt also ab dem ersten Bundle, das diese Abfrage kennt
 * (24.11.2026). false = wie zuvor, „Später" möglich.
 */
export const OTA_UPDATE_PFLICHT = true;
