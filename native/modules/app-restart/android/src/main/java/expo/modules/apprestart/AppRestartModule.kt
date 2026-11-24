package expo.modules.apprestart

import android.content.Intent
import android.os.Process
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * App wirklich neu starten — für geladene Updates.
 *
 * `Updates.reloadAsync()` baut die App im laufenden Prozess neu auf. Auf
 * APK 1.10 (expo-updates 57.0.28, React Native 0.86) beendet genau das
 * den ganzen Prozess, und die App blieb zu, bis man sie von Hand wieder
 * öffnete (nachgewiesen im expo-updates-Protokoll: „Restart", dann erst
 * Sekunden später ein frischer Start). Hier wird darum nicht im Prozess
 * neu geladen, sondern der Prozess selbst ersetzt — das bewährte Muster
 * von ProcessPhoenix: Eine kleine Activity in einem eigenen Prozess
 * beendet den App-Prozess und öffnet die App frisch. Beim Kaltstart
 * startet expo-updates von selbst das neueste geladene Update.
 */
class AppRestartModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AppRestart")

    Function("restart") {
      val activity = appContext.currentActivity
        ?: throw CodedException("ERR_NO_ACTIVITY", "Keine sichtbare Activity für den Neustart", null)
      val launch = activity.packageManager.getLaunchIntentForPackage(activity.packageName)
        ?: throw CodedException("ERR_NO_LAUNCH_INTENT", "Start-Intent der App nicht gefunden", null)
      launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
      val phoenix = Intent(activity, RestartActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        .putExtra(RestartActivity.KEY_RESTART_INTENT, launch)
        .putExtra(RestartActivity.KEY_MAIN_PID, Process.myPid())
      activity.startActivity(phoenix)
      true
    }
  }
}
