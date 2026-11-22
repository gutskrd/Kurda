package app.hevalo.glass

import android.content.Context
import android.graphics.Canvas
import android.graphics.Outline
import android.graphics.RecordingCanvas
import android.graphics.RenderEffect
import android.graphics.RenderNode
import android.graphics.RuntimeShader
import android.os.Build
import android.view.View
import android.view.ViewGroup
import android.view.ViewOutlineProvider
import android.view.ViewTreeObserver
import androidx.annotation.RequiresApi
import kotlin.math.min

/**
 * Liquid glass on Android 13 and later. Before each frame it records the views drawn behind it into a RenderNode, which
 * holds references to their display lists rather than pixels, so it costs little; the node is drawn through the glass
 * shader (GlassShader.kt). It never records itself or anything in front of it, so no glass can show itself. On earlier
 * versions it draws nothing and the app draws its own glass (mobile/src/theme/LiquidGlass.tsx).
 */
class GlassView(context: Context) : View(context) {
  private val density = resources.displayMetrics.density
  private var radius = 0f
  private var dark = false
  private val lens: Lens? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) Lens() else null
  private val beforeFrame = ViewTreeObserver.OnPreDrawListener {
    lens?.record()
    true
  }

  init {
    outlineProvider = object : ViewOutlineProvider() {
      override fun getOutline(view: View, outline: Outline) {
        outline.setRoundRect(0, 0, view.width, view.height, radius)
      }
    }
    clipToOutline = true
  }

  /** The corner, in points. */
  fun setRadius(points: Float) {
    radius = points * density
    invalidateOutline()
    lens?.reshape()
  }

  fun setDark(value: Boolean) {
    dark = value
    lens?.reshape()
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    viewTreeObserver.addOnPreDrawListener(beforeFrame)
  }

  override fun onDetachedFromWindow() {
    viewTreeObserver.removeOnPreDrawListener(beforeFrame)
    lens?.release()
    super.onDetachedFromWindow()
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    lens?.reshape()
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    lens?.draw(canvas)
  }

  @RequiresApi(Build.VERSION_CODES.TIRAMISU)
  private inner class Lens {
    private val node = RenderNode("HevaloGlass")
    private val shader = RuntimeShader(GLASS_SHADER)
    private val here = IntArray(2)
    private val there = IntArray(2)
    private var shaped = false

    fun reshape() {
      shaped = false
      invalidate()
    }

    /** The shader's measurements, set again whenever the size, corner or scheme changes. */
    private fun shape(w: Int, h: Int) {
      node.setPosition(0, 0, w, h)
      shader.setFloatUniform("size", w.toFloat(), h.toFloat())
      shader.setFloatUniform("radius", radius)
      // The same bezel as the website's: 22 points, or the whole way in for a shape too small for a flat middle.
      shader.setFloatUniform("bezel", min(22f * density, min(w, h) / 2f))
      shader.setFloatUniform("thickness", 24f * density)
      shader.setFloatUniform("density", density)
      if (dark) {
        shader.setFloatUniform("tint", 30f / 255f, 27f / 255f, 46f / 255f)
        shader.setFloatUniform("optics", 1.7f, 0.92f)
      } else {
        shader.setFloatUniform("tint", 1f, 1f, 1f)
        shader.setFloatUniform("optics", 1.8f, 1.08f)
      }
      node.setRenderEffect(RenderEffect.createRuntimeShaderEffect(shader, "content"))
      shaped = true
    }

    fun record() {
      val w = width
      val h = height
      if (w <= 0 || h <= 0 || !isShown) return
      if (!shaped) shape(w, h)
      getLocationInWindow(here)
      val canvas = node.beginRecording(w, h)
      try {
        drawBehind(canvas)
      } finally {
        node.endRecording()
      }
    }

    /**
     * Everything drawn before this view, farthest first: the window's own background, then at each step down towards
     * this view, that step's background and the siblings drawn under the branch that holds the glass.
     */
    private fun drawBehind(canvas: RecordingCanvas) {
      val branch = ArrayList<View>()
      var step: View = this@GlassView
      while (true) {
        val parent = step.parent as? ViewGroup ?: break
        branch.add(step)
        step = parent
      }
      drawBackground(canvas, step)
      for (level in branch.indices.reversed()) {
        val child = branch[level]
        val parent = child.parent as ViewGroup
        if (level < branch.lastIndex) drawBackground(canvas, parent)
        val z = child.z
        val index = parent.indexOfChild(child)
        for (i in 0 until parent.childCount) {
          val sibling = parent.getChildAt(i)
          if (sibling === child || sibling.visibility != View.VISIBLE || sibling.alpha == 0f) continue
          // Under the branch: lower, or as high and earlier in the list.
          if (sibling.z > z || (sibling.z == z && i > index)) continue
          sibling.getLocationInWindow(there)
          canvas.save()
          canvas.translate((there[0] - here[0]).toFloat(), (there[1] - here[1]).toFloat())
          // A view draws its content shifted by its own scroll, which its parent applies when drawing it normally.
          canvas.translate(-sibling.scrollX.toFloat(), -sibling.scrollY.toFloat())
          sibling.draw(canvas)
          canvas.restore()
        }
      }
    }

    private fun drawBackground(canvas: RecordingCanvas, view: View) {
      val background = view.background ?: return
      view.getLocationInWindow(there)
      canvas.save()
      canvas.translate((there[0] - here[0]).toFloat(), (there[1] - here[1]).toFloat())
      background.draw(canvas)
      canvas.restore()
    }

    fun draw(canvas: Canvas) {
      if (canvas.isHardwareAccelerated && node.hasDisplayList()) canvas.drawRenderNode(node)
    }

    fun release() {
      node.discardDisplayList()
      shaped = false
    }
  }
}
