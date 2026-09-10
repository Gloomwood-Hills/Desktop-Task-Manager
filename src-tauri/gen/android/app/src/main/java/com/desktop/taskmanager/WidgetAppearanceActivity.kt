package com.desktop.taskmanager

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.SeekBar
import android.widget.TextView

/**
 * 小部件外观设置（由小部件"外观"键打开）：主题 / 毛玻璃(近似半透明) / 透明度。
 * 风格对齐应用：浅色底、圆角卡片、品牌蓝强调。结果存 SharedPreferences("widget_appearance")。
 */
class WidgetAppearanceActivity : Activity() {
  companion object {
    const val PREFS = "widget_appearance"
  }

  private fun prefs() = getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val p = prefs()

    fun text(t: String, size: Float, bold: Boolean = false, color: String = "#1D1D1F"): TextView =
      TextView(this).apply { this.text = t; textSize = size; setTextColor(Color.parseColor(color)); if (bold) setTypeface(null, Typeface.BOLD) }

    // 卡片容器
    fun card(): LinearLayout = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(20, 18, 20, 18)
      background = android.graphics.drawable.GradientDrawable().apply {
        cornerRadius = 48f
        setColor(Color.parseColor("#FFFFFF"))
        // 细边框
        setStroke(1, Color.parseColor("#E5E5EA"))
      }
      val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
      layoutParams = lp
    }

    fun pillSelected(tag: String, label: String, selected: Boolean, onClick: () -> Unit): TextView =
      TextView(this).apply {
        text = label
        textSize = 13f
        setTypeface(null, Typeface.BOLD)
        setTextColor(if (selected) Color.WHITE else Color.parseColor("#1D1D1F"))
        setPadding(40, 18, 40, 18)
        background = android.graphics.drawable.GradientDrawable().apply {
          cornerRadius = 48f
          setColor(if (selected) Color.parseColor("#007AFF") else Color.parseColor("#F2F2F7"))
        }
        isClickable = true
        setOnClickListener { onClick() }
      }

    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(36, 48, 36, 32)
      setBackgroundColor(Color.parseColor("#F5F5F7"))
    }

    // 标题
    root.addView(text("小部件外观", 20f, true))
    root.addView(text("调整小部件的主题、毛玻璃与透明度", 13f, color = "#8E8E93").apply { setPadding(0, 6, 0, 22) })

    // 主题卡片
    var currentTheme = p.getString("theme", "light")
    val themeCard = card()
    themeCard.addView(text("主题", 14f, true))
    val themeRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; setPadding(0, 12, 0, 0) }
    val lightBtn = pillSelected("light", "浅色", currentTheme == "light") {}
    val darkBtn = pillSelected("dark", "深色", currentTheme == "dark") {}
    fun layoutTheme() {
      themeRow.removeAllViews()
      themeRow.addView(lightBtn, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply { setMargins(0, 0, 24, 0) })
      themeRow.addView(darkBtn, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
      fun style(btn: TextView, selected: Boolean) {
        (btn.background as android.graphics.drawable.GradientDrawable).setColor(if (selected) Color.parseColor("#007AFF") else Color.parseColor("#F2F2F7"))
        btn.setTextColor(if (selected) Color.WHITE else Color.parseColor("#1D1D1F"))
      }
      style(lightBtn, currentTheme == "light")
      style(darkBtn, currentTheme == "dark")
    }
    lightBtn.setOnClickListener { currentTheme = "light"; applyTheme("light"); layoutTheme(); applyAndRefresh() }
    darkBtn.setOnClickListener { currentTheme = "dark"; applyTheme("dark"); layoutTheme(); applyAndRefresh() }
    layoutTheme()
    themeCard.addView(themeRow)
    root.addView(themeCard)

    // 毛玻璃卡片
    val glassCard = card().apply { setPadding(20, 18, 20, 18) }
    val glassLabel = text(if (p.getBoolean("glass", true)) "毛玻璃效果：开" else "毛玻璃效果：关", 14f, true)
    val glassBtn = pillSelected("", if (p.getBoolean("glass", true)) "点击关闭" else "点击开启", p.getBoolean("glass", true)) {}
    glassBtn.setOnClickListener {
      val next = !p.getBoolean("glass", true)
      p.edit().putBoolean("glass", next).apply()
      glassLabel.text = if (next) "毛玻璃效果：开" else "毛玻璃效果：关"
      glassBtn.text = if (next) "点击关闭" else "点击开启"
      applyAndRefresh()
    }
    glassCard.addView(glassLabel)
    glassCard.addView(text("开启后小部件呈近似半透明背景（RemoteViews 不支持真模糊）", 11.5f, color = "#8E8E93").apply { setPadding(0, 4, 0, 12) })
    glassCard.addView(glassBtn)
    root.addView(glassCard)

    // 透明度卡片
    val transVal = p.getInt("transparency", 80).coerceIn(20, 100)
    val transCard = card()
    val transLabel = text("透明度：$transVal%", 14f, true)
    transCard.addView(transLabel)
    transCard.addView(text("数值越大越不透明（近似）", 11.5f, color = "#8E8E93").apply { setPadding(0, 4, 0, 10) })
    val seek = SeekBar(this).apply { max = 80; progress = transVal - 20 }
    seek.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
      override fun onProgressChanged(sb: SeekBar?, progress: Int, fromUser: Boolean) {}
      override fun onStartTrackingTouch(sb: SeekBar?) {}
      override fun onStopTrackingTouch(sb: SeekBar?) {
        val v = (sb?.progress.orZero()) + 20
        transLabel.text = "透明度：$v%"
        p.edit().putInt("transparency", v).apply()
        applyAndRefresh()
      }
    })
    transCard.addView(seek)
    root.addView(transCard)

    // 完成
    val done = Button(this).apply {
      text = "完成"
      setTextColor(Color.WHITE)
      background = android.graphics.drawable.GradientDrawable().apply {
        cornerRadius = 48f
        setColor(Color.parseColor("#007AFF"))
      }
      val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, (52 * resources.displayMetrics.density).toInt())
      lp.topMargin = (18 * resources.displayMetrics.density).toInt()
      layoutParams = lp
      setOnClickListener { finishToHome() }
    }
    root.addView(done)

    // 说明：退出返回桌面
    root.addView(text("关闭本页后回到桌面", 11f, color = "#8E8E93").apply { setPadding(0, 10, 0, 0) })

    setContentView(root)
  }

  /** 结束当前 Activity 并回到手机桌面（Home），不回到应用主窗口。
   *  与 WidgetAddTaskActivity 一致：显式启动 HOME 再 finish，保证回到桌面。 */
  private fun finishToHome() {
    try {
      val home = Intent(Intent.ACTION_MAIN).apply {
        addCategory(Intent.CATEGORY_HOME)
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
      }
      startActivity(home)
    } catch (_: Exception) {
      moveTaskToBack(true)
    }
    finish()
  }

  /** 系统返回键也回到桌面 */
  @Deprecated("Deprecated in Java")
  override fun onBackPressed() {
    finishToHome()
  }

  private fun applyTheme(theme: String) {
    prefs().edit().putString("theme", theme).apply()
  }

  private fun applyAndRefresh() {
    try { TaskWidgetProvider.requestRefresh(this) } catch (_: Exception) {}
  }
}

private fun Int?.orZero(): Int = this ?: 0
