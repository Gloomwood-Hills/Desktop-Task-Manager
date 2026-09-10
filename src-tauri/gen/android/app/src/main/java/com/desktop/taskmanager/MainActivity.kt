package com.desktop.taskmanager

import android.annotation.SuppressLint
import android.content.Intent
import android.os.Bundle
import android.webkit.WebView
import android.view.View
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  /** 当前 WebView（在 onWebViewCreate 时注入），用于向前端派发"聚焦命令框"事件 */
  private var activeWeb: WebView? = null

  @SuppressLint("WebViewClientOnReceivedSslError")
  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    activeWeb = webView
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    // 系统栏（状态栏 / 导航栏 / 挖孔）不遮挡 WebView 内容：内容根视图按系统 inset 内缩。
    // 说明：edge-to-edge 下 WebView 会延伸到系统栏之下；CSS env(safe-area-inset-*) 在部分
    // 桌面/WebView（含鸿蒙）支持不一致（返回 0），因此改为原生内缩，任何设备都不会被导航栏遮盖。
    ViewCompat.setOnApplyWindowInsetsListener(findViewById(android.R.id.content)) { v, insets ->
      val bars = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
      )
      v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
      WindowInsetsCompat.CONSUMED
    }
    refreshWidget()
    // 冷启动从小部件「快速记录」进入：WebView 尚未加载完成，延迟后派发聚焦命令框事件
    if (intent.getBooleanExtra(TaskWidgetProvider.EXTRA_OPEN_COMMAND, false)) {
      postFocusCommand()
    }
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    refreshWidget()
    // 应用已在后台/前台，WebView 就绪 → 立即派发聚焦命令框事件
    if (intent.getBooleanExtra(TaskWidgetProvider.EXTRA_OPEN_COMMAND, false)) {
      dispatchFocusCommand()
    }
  }

  override fun onResume() {
    super.onResume()
    refreshWidget()
  }

  override fun onPause() {
    super.onPause()
    // 离开应用（如按 Home）时刷新小部件：用户在应用内增删改任务后，小部件
    // 会因数据源未被通知而显示陈旧/已删除任务。onPause 覆盖每次退出应用。
    refreshWidget()
  }

  /** 冷启动时延迟派发（等 WebView 与页面加载），再兜底一次 */
  private fun postFocusCommand() {
    activeWeb?.postDelayed({ dispatchFocusCommand() }, 900)
  }

  /** 向前端 WebView 派发 DOM 事件，App 前端监听后自动聚焦命令解析框 */
  private fun dispatchFocusCommand() {
    runCatching {
      activeWeb?.evaluateJavascript(
        "window.dispatchEvent(new Event('open-command-bar'))",
        null
      )
    }
  }

  /**
   * 刷新所有桌面小部件。仅 onCreate/onNewIntent/onResume/onPause 会在应用切换
   * 前后各触发一次，覆盖冷启动与后台恢复场景；若用户未离开应用，小部件也不可见。
   */
  private fun refreshWidget() {
    try {
      TaskWidgetProvider.requestRefresh(this)
    } catch (_: Exception) {
    }
  }
}
