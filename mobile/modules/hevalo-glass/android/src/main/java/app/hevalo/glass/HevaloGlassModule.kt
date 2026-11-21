package app.hevalo.glass

import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Hevalo's glass for Android: the view, and whether this phone can bend what lies behind it (Android 13 and later). */
class HevaloGlassModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("HevaloGlass")

    Constant("bends") { Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU }

    View(GlassView::class) {
      Prop("radius") { view: GlassView, radius: Float ->
        view.setRadius(radius)
      }
      Prop("dark") { view: GlassView, dark: Boolean ->
        view.setDark(dark)
      }
    }
  }
}
