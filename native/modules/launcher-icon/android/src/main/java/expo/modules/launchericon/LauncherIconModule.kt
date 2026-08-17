package expo.modules.launchericon

import android.content.ComponentName
import android.content.pm.PackageManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Startbildschirm-Symbol umschalten.
 *
 * Wichtig und der Grund für dieses eigene Modul: Die fertigen Pakete
 * schalten die MainActivity selbst ab, wenn man zurück auf „Standard"
 * geht. Genau diese Activity ist aber das Ziel aller Farb-Aliase —
 * Android verweigert das (oder killt alle Symbole). Hier wird die
 * MainActivity nie angefasst; sie trägt auch keinen Launcher-Eintrag
 * mehr. Stattdessen gibt es für JEDE Variante einen Alias, und
 * umgeschaltet wird immer „einen ein, alle anderen aus".
 */
class LauncherIconModule : Module() {
	override fun definition() = ModuleDefinition {
		Name("LauncherIcon")

		/** `name` ist der Alias-Suffix, `all` die Liste aller Suffixe. */
		Function("setIcon") { name: String, all: List<String> ->
			val pkg = context.packageName
			val pm = context.packageManager
			// Erst den gewünschten einschalten — dann bleibt nie ein Moment
			// ohne Launcher-Eintrag (App würde sonst kurz verschwinden).
			pm.setComponentEnabledSetting(
				ComponentName(pkg, "$pkg.MainActivity$name"),
				PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
				PackageManager.DONT_KILL_APP
			)
			all.filter { it != name }.forEach { other ->
				pm.setComponentEnabledSetting(
					ComponentName(pkg, "$pkg.MainActivity$other"),
					PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
					PackageManager.DONT_KILL_APP
				)
			}
			true
		}

		/** Aktuell eingeschalteter Alias — oder null, wenn keiner gesetzt ist. */
		Function("getIcon") { all: List<String> ->
			val pkg = context.packageName
			val pm = context.packageManager
			all.firstOrNull { suffix ->
				pm.getComponentEnabledSetting(ComponentName(pkg, "$pkg.MainActivity$suffix")) ==
					PackageManager.COMPONENT_ENABLED_STATE_ENABLED
			}
		}
	}

	private val context
		get() = requireNotNull(appContext.reactContext) { "React Application Context is null" }
}
