package expo.modules.apprestart

import android.app.Activity
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Process

/**
 * Läuft im eigenen Prozess `:restart` (siehe AndroidManifest.xml):
 * beendet den App-Prozess, öffnet die App frisch und beendet sich selbst.
 * Weil diese Activity im Vordergrund steht, darf sie die App starten —
 * ein Start aus dem Hintergrund würde Android blockieren.
 */
class RestartActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val mainPid = intent.getIntExtra(KEY_MAIN_PID, -1)
    if (mainPid > 0 && mainPid != Process.myPid()) {
      Process.killProcess(mainPid)
    }
    val next: Intent? =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        intent.getParcelableExtra(KEY_RESTART_INTENT, Intent::class.java)
      } else {
        @Suppress("DEPRECATION")
        intent.getParcelableExtra(KEY_RESTART_INTENT)
      }
    if (next != null) startActivity(next)
    finish()
    Runtime.getRuntime().exit(0)
  }

  companion object {
    const val KEY_RESTART_INTENT = "app_restart_intent"
    const val KEY_MAIN_PID = "app_restart_main_pid"
  }
}
