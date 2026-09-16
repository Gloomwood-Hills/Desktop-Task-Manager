package com.desktop.taskmanager

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews
import java.util.concurrent.Executors

/**
 * 标准 Android 滚动版小部件。
 *
 * 使用原生 ListView + RemoteViewsService，任务数量不再受固定六行限制。
 * 鸿蒙兼容版仍由 TaskWidgetProvider 提供，避免集合项 FillInIntent 在部分桌面丢失任务 ID。
 */
class TaskScrollableWidgetProvider : AppWidgetProvider() {

  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    io.execute { updateAll(context, manager, ids) }
  }

  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    if (intent.action == TaskWidgetProvider.ACTION_REFRESH) {
      io.execute { updateAllRegistered(context) }
    }
  }

  companion object {
    private val io = Executors.newSingleThreadExecutor()

    /** 供任务写入完成后从兼容版 Provider 联动刷新滚动版。调用方已在后台线程。 */
    fun refreshAll(context: Context) {
      updateAllRegistered(context)
    }

    private fun updateAllRegistered(context: Context) {
      val manager = AppWidgetManager.getInstance(context)
      val ids = manager.getAppWidgetIds(ComponentName(context, TaskScrollableWidgetProvider::class.java))
      if (ids.isNotEmpty()) updateAll(context, manager, ids)
    }

    private fun updateAll(context: Context, manager: AppWidgetManager, ids: IntArray) {
      ids.forEach { widgetId ->
        val views = RemoteViews(context.packageName, R.layout.task_widget_scroll)
        views.setTextViewText(R.id.scroll_widget_title, "待办任务·滚动")
        applyAppearance(context, views)

        val serviceIntent = Intent(context, TaskWidgetService::class.java).apply {
          putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
          data = Uri.parse(toUri(Intent.URI_INTENT_SCHEME))
        }
        views.setRemoteAdapter(R.id.widget_list, serviceIntent)
        views.setEmptyView(R.id.widget_list, R.id.scroll_widget_empty)

        val templateIntent = Intent(context, TaskWidgetProvider::class.java).apply {
          action = TaskWidgetProvider.ACTION_TOGGLE_COMPLETE
          data = Uri.parse("widget-scroll-template://$widgetId")
        }
        val template = PendingIntent.getBroadcast(
          context,
          widgetId * 100 + 31,
          templateIntent,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        views.setPendingIntentTemplate(R.id.widget_list, template)

        views.setOnClickPendingIntent(R.id.scroll_btn_refresh, refreshPending(context, widgetId))
        views.setOnClickPendingIntent(R.id.scroll_btn_add, addPending(context))
        views.setOnClickPendingIntent(R.id.scroll_btn_quick_add, commandPending(context))
        manager.updateAppWidget(widgetId, views)
        manager.notifyAppWidgetViewDataChanged(widgetId, R.id.widget_list)
      }
    }

    private fun applyAppearance(context: Context, views: RemoteViews) {
      val prefs = context.getSharedPreferences("widget_appearance", Context.MODE_PRIVATE)
      val dark = prefs.getString("theme", "light") == "dark"
      val glass = prefs.getBoolean("glass", true)
      val transparency = prefs.getInt("transparency", 80).coerceIn(20, 100)
      val bucket = if (!glass) 100 else when {
        transparency <= 30 -> 20
        transparency <= 50 -> 40
        transparency <= 70 -> 60
        transparency <= 90 -> 80
        else -> 100
      }
      val bg = if (dark) when (bucket) {
        20 -> R.drawable.widget_bg_dark_20
        40 -> R.drawable.widget_bg_dark_40
        60 -> R.drawable.widget_bg_dark_60
        80 -> R.drawable.widget_bg_dark_80
        else -> R.drawable.widget_bg_dark_100
      } else when (bucket) {
        20 -> R.drawable.widget_bg_light_20
        40 -> R.drawable.widget_bg_light_40
        60 -> R.drawable.widget_bg_light_60
        80 -> R.drawable.widget_bg_light_80
        else -> R.drawable.widget_bg_light_100
      }
      views.setInt(R.id.scroll_widget_root, "setBackgroundResource", bg)
      views.setTextColor(R.id.scroll_widget_title, if (dark) 0xFFFFFFFF.toInt() else 0xFF1D1D1F.toInt())
      views.setTextColor(R.id.scroll_btn_quick_add_text, if (dark) 0xFFA1A1A6.toInt() else 0xFF8E8E93.toInt())
    }

    private fun refreshPending(context: Context, widgetId: Int): PendingIntent {
      val intent = Intent(context, TaskWidgetProvider::class.java).apply {
        action = TaskWidgetProvider.ACTION_REFRESH
        putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
      }
      return PendingIntent.getBroadcast(
        context,
        widgetId * 100 + 32,
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }

    private fun addPending(context: Context): PendingIntent {
      val intent = Intent(context, WidgetAddTaskActivity::class.java).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      return PendingIntent.getActivity(
        context,
        10033,
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }

    private fun commandPending(context: Context): PendingIntent {
      val intent = Intent(context, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        putExtra(TaskWidgetProvider.EXTRA_OPEN_COMMAND, true)
      }
      return PendingIntent.getActivity(
        context,
        10034,
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }
  }
}
