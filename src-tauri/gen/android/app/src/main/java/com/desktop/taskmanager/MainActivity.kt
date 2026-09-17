package com.desktop.taskmanager

import android.annotation.SuppressLint
import android.content.Intent
import android.os.Bundle
import android.webkit.WebView
import android.view.View
import org.json.JSONObject
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  /** 当前 WebView（在 onWebViewCreate 时注入），用于向前端派发"聚焦命令框"事件 */
  private var activeWeb: WebView? = null
  /** 冷启动时暂存小部件传入的任务 ID，等待 WebView 完成加载后定位详情。 */
  private var pendingTaskId: String? = null

  @SuppressLint("WebViewClientOnReceivedSslError")
  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    activeWeb = webView
    if (pendingTaskId != null) postOpenTask()
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
    pendingTaskId = intent.getStringExtra(TaskWidgetProvider.EXTRA_TASK_ID)
    if (intent.action == TaskWidgetProvider.ACTION_OPEN_TASK && pendingTaskId != null) {
      postOpenTask()
    }
    // 冷启动从小部件「快速记录」进入：WebView 尚未加载完成，延迟后派发聚焦命令框事件
    if (intent.getBooleanExtra(TaskWidgetProvider.EXTRA_OPEN_COMMAND, false)) {
      postFocusCommand()
    }
    if (intent.getBooleanExtra(TaskWidgetProvider.EXTRA_OPEN_QUICK_CAPTURE, false)) {
      postOpenQuickCapture()
    }
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    refreshWidget()
    if (intent.action == TaskWidgetProvider.ACTION_OPEN_TASK) {
      pendingTaskId = intent.getStringExtra(TaskWidgetProvider.EXTRA_TASK_ID)
      postOpenTask()
    }
    // 应用已在后台/前台，WebView 就绪 → 立即派发聚焦命令框事件
    if (intent.getBooleanExtra(TaskWidgetProvider.EXTRA_OPEN_COMMAND, false)) {
      dispatchFocusCommand()
    }
    if (intent.getBooleanExtra(TaskWidgetProvider.EXTRA_OPEN_QUICK_CAPTURE, false)) {
      dispatchOpenQuickCapture()
    }
  }

  /**
   * Android 返回键优先交给前端关闭当前抽屉/弹窗；主视图没有可关闭内容时再退出 Activity。
   * 这样新建任务等底部面板不会吞掉系统返回键，也不需要用户寻找遮罩上的关闭区域。
   */
  override fun onBackPressed() {
    val web = activeWeb
    if (web == null) {
      super.onBackPressed()
      return
    }
    web.evaluateJavascript("(window.__dtmHandleBack && window.__dtmHandleBack()) || false") { result ->
      if (result != "true") super.onBackPressed()
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

  /** 向前端派发小部件新建任务事件，打开当前版本 QuickCapture。 */
  private fun dispatchOpenQuickCapture() {
    runCatching {
      activeWeb?.evaluateJavascript(
        "window.dispatchEvent(new Event('open-quick-capture'))",
        null
      )
    }
  }

  /** 冷启动时等待 WebView 与 React 监听器就绪后再打开当前新建任务视图。 */
  private fun postOpenQuickCapture() {
    activeWeb?.postDelayed({ dispatchOpenQuickCapture() }, 900)
  }

  /** 向前端派发任务定位事件，手机端打开底部详情面板。 */
  private fun dispatchOpenTask(taskId: String) {
    runCatching {
      val quoted = JSONObject.quote(taskId)
      activeWeb?.evaluateJavascript(
        "window.dispatchEvent(new CustomEvent('open-task',{detail:{id:$quoted}}))",
        null
      )
    }
  }

  /** 冷启动/从后台进入时延迟派发，保证 WebView 已经有 React 监听器。 */
  private fun postOpenTask() {
    activeWeb?.postDelayed({
      pendingTaskId?.let { dispatchOpenTask(it) }
      pendingTaskId = null
    }, 700)
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
