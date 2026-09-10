package com.desktop.taskmanager

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.database.sqlite.SQLiteDatabase
import android.graphics.Paint
import android.net.Uri
import android.util.Log
import android.view.View
import android.widget.RemoteViews
import android.widget.Toast
import java.text.Collator
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors

/**
 * 桌面小部件：任务列表（静态布局，前 5 条）+ 刷新 + 新增。
 *
 * 为什么不用集合视图（真机定案，华为鸿蒙 5.x）：
 * 鸿蒙桌面既不派发集合视图（ListView）项上的每项 setOnClickPendingIntent，
 * 也不合并 fill-in 附加信息（模板广播能到但 extra_task_id 丢失）。
 * 唯一在所有桌面都可靠的是普通视图上的 setOnClickPendingIntent（刷新/新增按钮同机制），
 * 故列表改为静态渲染前 5 条任务，每行一个独立 PendingIntent，点击即切换完成状态。
 */
class TaskWidgetProvider : AppWidgetProvider() {

  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    // 后台重绘，避免主线程查库卡顿
    io.execute {
      for (id in appWidgetIds) updateWidget(context, appWidgetManager, id)
    }
  }

  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    // 诊断日志：任何广播到达都记录（含点击广播），区分"广播未送达"与"送达后处理失败"
    Log.i(TAG, "onReceive action=${intent.action} taskId=${intent.getStringExtra(EXTRA_TASK_ID)} data=${intent.data}")
    // 所有数据库/重绘操作都放到串行 io 线程，避免主线程阻塞导致卡顿
    io.execute {
      when (intent.action) {
        ACTION_REFRESH -> {
          val widgetId = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
          if (widgetId != AppWidgetManager.INVALID_APPWIDGET_ID) refreshAll(context, true)
        }
        ACTION_TOGGLE_COMPLETE -> handleToggleComplete(context, intent)
        ACTION_SCROLL -> handleScroll(context, intent)
      }
    }
  }

  /** 切换任务完成状态（完成 / 撤销完成）：直接改本地库，成功后刷新全部小部件。
   * 真机诊断：每个分支都用 Toast 给出可见反馈（无需 logcat）。 */
  private fun handleToggleComplete(context: Context, intent: Intent) {
    val taskId = intent.getStringExtra(EXTRA_TASK_ID)
    val targetCompleted = intent.getBooleanExtra(EXTRA_TARGET_COMPLETED, false)
    if (taskId == null) {
      Log.e(TAG, "toggle complete: EXTRA_TASK_ID 缺失，data=${intent.data}")
      toast(context, "未收到任务ID（data=${intent.data}）")
      return
    }

    val db = WidgetDb.openWritable(context)
    if (db == null) {
      Log.e(TAG, "toggle complete: openWritable 失败，path=${WidgetDb.resolvePath(context)}")
      toast(context, "小部件：无法打开数据库")
      return
    }
    try {
      val now = System.currentTimeMillis()
      val values = ContentValues().apply {
        put("completed", if (targetCompleted) 1 else 0)
        putNull("completedAt")
        if (targetCompleted) put("completedAt", now)
        put("updatedAt", now)
      }
      val rows = db.update("Task", values, "id = ? AND deleted = 0", arrayOf(taskId))
      Log.i(TAG, "toggle complete: id=$taskId target=$targetCompleted rows=$rows path=${WidgetDb.resolvePath(context)}")
      if (rows == 0) {
        Log.w(TAG, "toggle complete: 0 行受影响（id 未命中或 deleted=1）")
        toast(context, "小部件：未匹配到任务（rows=0）")
        return
      }
      toast(context, if (targetCompleted) "小部件：已完成 ✓" else "小部件：已撤销 ✓")
    } catch (e: Exception) {
      Log.e(TAG, "toggle complete failed: ${e.message}", e)
      toast(context, "小部件：写库异常 ${e.message}")
      return
    } finally {
      db.close()
    }

    // 写库后失效缓存并重绘（当前已在 io 线程，直接重绘）
    refreshAll(context, true)
  }

  companion object {
    const val TAG = "TaskWidget"
    const val ACTION_REFRESH = "com.desktop.taskmanager.WIDGET_REFRESH"
    const val ACTION_TOGGLE_COMPLETE = "com.desktop.taskmanager.WIDGET_TOGGLE_COMPLETE"
    const val ACTION_SCROLL = "com.desktop.taskmanager.WIDGET_SCROLL"
    const val EXTRA_TASK_ID = "extra_task_id"
    const val EXTRA_TARGET_COMPLETED = "extra_target_completed"
    const val EXTRA_SCROLL_DELTA = "extra_scroll_delta"
    const val EXTRA_FOCUS_TITLE = "extra_focus_title"
    const val EXTRA_OPEN_COMMAND = "extra_open_command"
    const val SCROLL_PREFS = "widget_scroll"

    /** 串行 IO 线程：所有小部件的 DB 读/写都走这里，避免在主线程查库导致卡顿/ANR */
    private val io = Executors.newSingleThreadExecutor()
    /** 内存缓存：上次加载的任务列表；翻页/重绘直接用缓存，避免重复查库 */
    @Volatile private var cachedTasks: List<WidgetTaskItem>? = null

    /** 静态任务行（weight 等分高度，最多 6 条）对应的视图 ID 组 */
    private val SLOT_IDS = intArrayOf(R.id.slot_1, R.id.slot_2, R.id.slot_3, R.id.slot_4, R.id.slot_5, R.id.slot_6)
    private val CHECK_IDS = intArrayOf(R.id.item_check_1, R.id.item_check_2, R.id.item_check_3, R.id.item_check_4, R.id.item_check_5, R.id.item_check_6)
    private val TITLE_IDS = intArrayOf(R.id.item_title_1, R.id.item_title_2, R.id.item_title_3, R.id.item_title_4, R.id.item_title_5, R.id.item_title_6)
    private val DL_IDS = intArrayOf(R.id.item_dl_1, R.id.item_dl_2, R.id.item_dl_3, R.id.item_dl_4, R.id.item_dl_5, R.id.item_dl_6)

    /** 读取任务（优先缓存；无缓存才查库并填充） —— 调用需在 io 线程 */
    private fun loadTasksCached(context: Context): List<WidgetTaskItem> {
      cachedTasks?.let { return it }
      val loaded = loadTasksFromDb(context)
      cachedTasks = loaded
      return loaded
    }

    /** 失效缓存（数据变更后调用） */
    private fun invalidateCache() {
      cachedTasks = null
    }

    /** 真机诊断用短提示（无需 logcat 即可区分点击链路各分支） */
    private fun toast(context: Context, msg: String) {
      try {
        Toast.makeText(context.applicationContext, msg, Toast.LENGTH_SHORT).show()
      } catch (_: Exception) {
      }
    }

    /**
     * 后台重绘全部小部件（串行 io）。
     * @param invalidate 是否因数据变更而先失效缓存（默认 true；分页等无需重查库时传 false）
     */
    private fun refreshAll(context: Context, invalidate: Boolean) {
      if (invalidate) invalidateCache()
      val manager = AppWidgetManager.getInstance(context)
      val ids = manager.getAppWidgetIds(ComponentName(context, TaskWidgetProvider::class.java))
      for (id in ids) updateWidget(context, manager, id)
    }

    /** 请求刷新全部小部件（App 打开 / 写库成功后调用），后台执行并重新查库 */
    fun requestRefresh(context: Context) {
      io.execute { refreshAll(context, true) }
    }

    private fun updateWidget(context: Context, manager: AppWidgetManager, widgetId: Int) {
      val views = RemoteViews(context.packageName, R.layout.task_widget)
      views.setTextViewText(R.id.widget_title, context.getString(R.string.widget_title))

      // 小部件外观：主题(背景+全部文字配色) + 毛玻璃/透明度(仅背景 alpha，不影响文字)
      val ap = readAppearance(context)
      val dark = ap.theme == "dark"
      applyAppearance(views, context, dark, ap.glass, ap.transparency)

      // 静态渲染：未完成在前，按应用设置排序；上/下键按偏移分页（每页 = SLOT 行数）
      val all = loadTasksCached(context)
      val perPage = SLOT_IDS.size
      val total = all.size
      val pageCount = if (total == 0) 1 else ((total + perPage - 1) / perPage)
      val off = scrollOffset(context, widgetId)
      val start = (off / perPage * perPage).coerceIn(0, maxOf(0, (pageCount - 1) * perPage))
      val page = all.drop(start).take(perPage)

      // 待办计数药丸（无任务时隐藏，保持标题栏干净）
      views.setTextViewText(R.id.widget_count, total.toString())
      views.setViewVisibility(R.id.widget_count, if (total == 0) View.GONE else View.VISIBLE)

      // 页码指示；仅多页时显示翻页条，减少视觉噪音
      views.setTextViewText(R.id.widget_page, "第${start / perPage + 1}/$pageCount 页")
      views.setViewVisibility(R.id.widget_footer, if (pageCount > 1) View.VISIBLE else View.GONE)

      for (i in SLOT_IDS.indices) {
        val slotId = SLOT_IDS[i]
        if (i < page.size) {
          val t = page[i]
          views.setViewVisibility(slotId, View.VISIBLE)

          // 复选框：已完成=绿色实心；未完成=重要橙 / 普通灰
          val checkRes = when {
            t.completed -> R.drawable.ic_task_done
            t.priority == "important" -> R.drawable.ic_task_important
            else -> R.drawable.ic_task_normal
          }
          views.setImageViewResource(CHECK_IDS[i], checkRes)

          // 标题：已完成加删除线 + 弱化颜色
          views.setTextViewText(TITLE_IDS[i], t.title)
          if (t.completed) {
            views.setInt(TITLE_IDS[i], "setPaintFlags", Paint.STRIKE_THRU_TEXT_FLAG)
            views.setTextColor(TITLE_IDS[i], 0xFF8E8E93.toInt())
          } else {
            views.setInt(TITLE_IDS[i], "setPaintFlags", 0)
            views.setTextColor(TITLE_IDS[i], if (dark) 0xFFFFFFFF.toInt() else 0xFF1D1D1F.toInt())
          }

          // 截止/开始日期（单行文本，按紧迫度着色）
          bindDeadlineText(views, DL_IDS[i], t, dark)

          // 点击整行 → 切换完成状态（每项独立 PendingIntent，任务 ID 内嵌，不依赖桌面合并）
          val togglePendingIntent = PendingIntent.getBroadcast(
            context,
            t.id.hashCode(),
            Intent(context, TaskWidgetProvider::class.java).apply {
              action = ACTION_TOGGLE_COMPLETE
              putExtra(EXTRA_TASK_ID, t.id)
              putExtra(EXTRA_TARGET_COMPLETED, !t.completed)
              // 每项唯一 data URI：保证不同任务的 PendingIntent 身份不冲突（PendingIntent 身份不含 extras）
              data = Uri.parse("widget-task://${t.id}")
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
          )
          views.setOnClickPendingIntent(slotId, togglePendingIntent)
        } else {
          views.setViewVisibility(slotId, View.GONE)
        }
      }

      // 空列表占位
      views.setViewVisibility(R.id.widget_empty, if (total == 0) View.VISIBLE else View.GONE)

      // 刷新：重新拉取数据；新增/快速记录：打开小部件新建任务界面；外观：打开小部件外观设置；整卡点击：打开应用主窗口
      views.setOnClickPendingIntent(R.id.btn_refresh, refreshPending(context, widgetId))
      views.setOnClickPendingIntent(R.id.btn_add, openAddTaskPending(context))
      views.setOnClickPendingIntent(R.id.btn_quick_add, quickCommandPending(context))
      views.setOnClickPendingIntent(R.id.btn_appearance, openAppearancePending(context))

      // 上/下翻页
      views.setOnClickPendingIntent(R.id.btn_up, scrollPending(context, widgetId, -perPage))
      views.setOnClickPendingIntent(R.id.btn_down, scrollPending(context, widgetId, +perPage))
      views.setOnClickPendingIntent(R.id.widget_root, openAppPending(context))

      manager.updateAppWidget(widgetId, views)
    }

    private fun refreshPending(context: Context, widgetId: Int): PendingIntent {
      val intent = Intent(context, TaskWidgetProvider::class.java).apply {
        action = ACTION_REFRESH
        putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
      }
      return PendingIntent.getBroadcast(context, widgetId * 10 + 1, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun scrollPending(context: Context, widgetId: Int, delta: Int): PendingIntent {
      val intent = Intent(context, TaskWidgetProvider::class.java).apply {
        action = ACTION_SCROLL
        putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
        putExtra(EXTRA_SCROLL_DELTA, delta)
        data = Uri.parse("widget-scroll://$widgetId/$delta")
      }
      return PendingIntent.getBroadcast(context, widgetId * 10 + 2 + (if (delta > 0) 1 else 0), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    /** 上/下翻页：调整该小部件的滚动偏移并重绘 */
    private fun handleScroll(context: Context, intent: Intent) {
      val widgetId = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
      val delta = intent.getIntExtra(EXTRA_SCROLL_DELTA, 0)
      if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID || delta == 0) return
      val perPage = SLOT_IDS.size
      val total = loadTasksCached(context).size
      val pageCount = if (total == 0) 1 else ((total + perPage - 1) / perPage)
      val current = scrollOffset(context, widgetId)
      val newOff = (current + delta).coerceIn(0, maxOf(0, (pageCount - 1) * perPage))
      context.getSharedPreferences(SCROLL_PREFS, Context.MODE_PRIVATE)
        .edit().putInt("offset_$widgetId", newOff).apply()
      requestRefresh(context)
    }

    /** 小部件滚动偏移（按任务起点索引计，0,6,12...） */
    private fun scrollOffset(context: Context, widgetId: Int): Int {
      return context.getSharedPreferences(SCROLL_PREFS, Context.MODE_PRIVATE)
        .getInt("offset_$widgetId", 0).coerceAtLeast(0)
    }

    private fun openAddTaskPending(context: Context): PendingIntent {
      val intent = Intent(context, WidgetAddTaskActivity::class.java).apply {
        // 仅 NEW_TASK：作为独立任务从桌面打开，退出后回到桌面（不去应用到主窗口）
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS
        // 打开后自动聚焦标题输入，用户可直接输入并自然语言解析
        putExtra(EXTRA_FOCUS_TITLE, true)
      }
      return PendingIntent.getActivity(context, 2, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    /** 快速记录：打开应用主视图并自动聚焦命令解析框（与电脑端一致）。 */
    private fun quickCommandPending(context: Context): PendingIntent {
      val intent = Intent(context, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        putExtra(EXTRA_OPEN_COMMAND, true)
      }
      return PendingIntent.getActivity(context, 3, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun openAppPending(context: Context): PendingIntent {
      val intent = Intent(context, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
      }
      return PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    // ===== 小部件外观：主题 / 毛玻璃(近似半透明) / 透明度（SharedPreferences，独立于 App 设置） =====

    /** 打开小部件外观设置界面 */
    private fun openAppearancePending(context: Context): PendingIntent {
      val intent = Intent(context, WidgetAppearanceActivity::class.java).apply {
        // 仅 NEW_TASK：作为独立任务从桌面打开，退出后回到桌面
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS
      }
      return PendingIntent.getActivity(context, 1, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private data class WidgetAppearance(val theme: String, val glass: Boolean, val transparency: Int)

    /** 读取小部件外观设置（默认：浅色 / 毛玻璃开 / 透明度 80 = 近似 80% 不透明） */
    private fun readAppearance(context: Context): WidgetAppearance {
      val p = context.getSharedPreferences("widget_appearance", Context.MODE_PRIVATE)
      return WidgetAppearance(
        p.getString("theme", "light") ?: "light",
        p.getBoolean("glass", true),
        p.getInt("transparency", 80).coerceIn(20, 100),
      )
    }

    /**
     * 应用小部件外观（贴合应用：圆角卡片 + 黑/白/蓝配色）：
     * - 背景用按「主题 + 不透明度」分档的圆角 drawable（毛玻璃开→按透明度、关→不透明）；圆角保留，透明度只作用于背景。
     * - 文字/按钮颜色按主题（浅=黑字白底蓝强调；深=白字黑底蓝强调），保持不透明。
     */
    private fun applyAppearance(views: RemoteViews, context: Context, dark: Boolean, glass: Boolean, transparency: Int) {
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
      views.setInt(R.id.widget_root, "setBackgroundResource", bg)

      val title = if (dark) 0xFFFFFFFF.toInt() else 0xFF1D1D1F.toInt()
      val muted = if (dark) 0xFFA1A1A6.toInt() else 0xFF8E8E93.toInt()
      val brand = if (dark) 0xFF0A84FF.toInt() else 0xFF007AFF.toInt()
      views.setTextColor(R.id.widget_title, title)
      views.setTextColor(R.id.widget_count, brand)
      views.setTextColor(R.id.btn_quick_add_text, muted)
      views.setTextColor(R.id.widget_page, muted)
      views.setTextColor(R.id.widget_empty, muted)
    }

    // ===== 数据加载与排序（自 TaskWidgetFactory 移植，保持与 App 内排序一致） =====

    private data class WidgetTaskItem(
      val id: String,
      val title: String,
      val deadline: Long?,
      val startDate: Long?,
      val priority: String,
      val folderName: String?,
      val completed: Boolean,
      val completedAt: Long?,
      val createdAt: Long,
    )

    /** 读取任务并按应用设置排序：未完成在前、已完成在后，各自按 sortType 排序 */
    private fun loadTasksFromDb(context: Context): List<WidgetTaskItem> {
      val db = WidgetDb.openReadOnly(context) ?: return emptyList()
      try {
        var sortType = "deadline"
        var importantTop = false
        try {
          db.rawQuery("SELECT sortType, importantTop FROM Settings WHERE id = 'default'", null).use { c ->
            if (c.moveToFirst()) {
              sortType = if (c.isNull(0)) "deadline" else c.getString(0)
              importantTop = !c.isNull(1) && c.getInt(1) == 1
            }
          }
        } catch (_: Exception) {
        }

        val rows = mutableListOf<WidgetTaskItem>()
        db.rawQuery(
          """SELECT t.id, t.title, t.deadline, t.startDate, t.priority, f.name, t.completed, t.completedAt, t.createdAt
             FROM Task t LEFT JOIN Folder f ON t.folderId = f.id
             WHERE t.deleted = 0 AND t.completed = 0""".trimMargin(),
          null
        ).use { c ->
          while (c.moveToNext()) {
            rows.add(
              WidgetTaskItem(
                id = c.getString(0),
                title = c.getString(1),
                deadline = if (c.isNull(2)) null else c.getLong(2),
                startDate = if (c.isNull(3)) null else c.getLong(3),
                priority = if (c.isNull(4)) "normal" else c.getString(4),
                folderName = if (c.isNull(5)) null else c.getString(5),
                completed = c.getInt(6) == 1,
                completedAt = if (c.isNull(7)) null else c.getLong(7),
                createdAt = c.getLong(8),
              )
            )
          }
        }

        val sortTaskList = { list: List<WidgetTaskItem> ->
          if (!importantTop) sortCore(list, sortType)
          else sortCore(list.filter { it.priority == "important" }, sortType) + sortCore(list.filter { it.priority != "important" }, sortType)
        }
        // 小部件不展示已完成任务（SQL 已过滤 completed=0），直接对未完成任务排序返回
        return sortTaskList(rows)
      } catch (e: Exception) {
        Log.e(TAG, "loadTasks failed: ${e.message}")
        return emptyList()
      } finally {
        db.close()
      }
    }

    private fun sortCore(tasks: List<WidgetTaskItem>, sortType: String): List<WidgetTaskItem> = when (sortType) {
      "name" -> tasks.sortedWith { a, b -> compareByName(a.title, b.title) }
      "manual" -> tasks
      "createdAt" -> tasks.sortedByDescending { it.createdAt }
      else -> tasks.sortedWith { a, b -> // deadline（null 置后）
        if (a.deadline == null && b.deadline == null) 0
        else if (a.deadline == null) 1
        else if (b.deadline == null) -1
        else a.deadline!!.compareTo(b.deadline!!)
      }
    }

    /** 名称排序（移植 compareByName）：字母 → 数字 → 中文（拼音） */
    private fun compareByName(a: String, b: String): Int {
      val ra = nameRank(a)
      val rb = nameRank(b)
      if (ra != rb) return ra - rb
      return when (ra) {
        0 -> {
          val al = a.lowercase(Locale.ROOT)
          val bl = b.lowercase(Locale.ROOT)
          if (al != bl) return if (al < bl) -1 else 1
          a.compareTo(b)
        }
        1 -> {
          val na = leadingNumber(a)
          val nb = leadingNumber(b)
          if (na != nb) return if (na > nb) 1 else -1
          collator.compare(a, b)
        }
        else -> collator.compare(a, b)
      }
    }

    private val collator = Collator.getInstance(Locale.CHINA)

    private fun nameRank(s: String): Int {
      if (s.isEmpty()) return 2
      val c = s[0]
      return when {
        c in 'A'..'Z' || c in 'a'..'z' -> 0
        c in '0'..'9' -> 1
        else -> 2
      }
    }

    private fun leadingNumber(s: String): Long {
      val m = Regex("^\\d+").find(s)?.value ?: "0"
      return m.toLongOrNull() ?: 0L
    }

    /** 截止/开始日期文本 + 紧迫度着色（移植 bindDeadline 的等级颜色，简化为单行文本） */
    private fun bindDeadlineText(views: RemoteViews, viewId: Int, item: WidgetTaskItem, dark: Boolean) {
      if (item.completed) {
        views.setViewVisibility(viewId, View.GONE)
        return
      }
      val deadline = item.deadline
      if (deadline != null) {
        val rel = formatDeadlineRel(deadline)
        val ymd = formatDeadlineYMD(deadline)
        views.setTextViewText(viewId, if (rel.isNotEmpty()) "$rel $ymd" else ymd)
        val remain = deadline - System.currentTimeMillis()
        val day = 24 * 3600 * 1000L
        val color = when {
          remain <= day -> 0xFFFF3333.toInt()
          remain <= 3 * day -> 0xFFFF5A2E.toInt()
          remain <= 7 * day -> 0xFFFF9500.toInt()
          else -> if (dark) 0xFFF2F2F7.toInt() else 0xFF1D1D1F.toInt()
        }
        views.setTextColor(viewId, color)
        views.setViewVisibility(viewId, View.VISIBLE)
      } else if (item.startDate != null) {
        val fmt = SimpleDateFormat(if (hasExplicitTime(item.startDate)) "MM-dd HH:mm" else "MM-dd", Locale.getDefault())
        views.setTextViewText(viewId, fmt.format(Date(item.startDate)))
        views.setTextColor(viewId, if (dark) 0xFFA1A1A6.toInt() else 0xFF8E8E93.toInt())
        views.setViewVisibility(viewId, View.VISIBLE)
      } else {
        views.setViewVisibility(viewId, View.GONE)
      }
    }

    /** 相对标签：明天/后天/本周x/下周x；超出范围返回空串（仅年月日） */
    private fun formatDeadlineRel(deadline: Long): String {
      val day = 24 * 3600 * 1000L
      val now = System.currentTimeMillis()
      val diffDays = Math.round((startOfDay(deadline) - startOfDay(now)) / day.toDouble())
      if (diffDays == 1L) return "明天"
      if (diffDays == 2L) return "后天"

      val weekdays = arrayOf("日", "一", "二", "三", "四", "五", "六")
      fun mondayOf(ts: Long): Long {
        val c = Calendar.getInstance().apply { timeInMillis = ts }
        val dow = c.get(Calendar.DAY_OF_WEEK)
        val diff = if (dow == Calendar.SUNDAY) -6 else 1 - (dow - 1)
        c.add(Calendar.DAY_OF_MONTH, diff)
        return startOfDay(c.timeInMillis)
      }
      val weekDiff = Math.round((mondayOf(deadline) - mondayOf(now)) / (7.0 * day))
      if (weekDiff == 0L) {
        val dow = Calendar.getInstance().apply { timeInMillis = deadline }.get(Calendar.DAY_OF_WEEK)
        return "本周" + weekdays[dow - 1]
      }
      if (weekDiff == 1L) {
        val dow = Calendar.getInstance().apply { timeInMillis = deadline }.get(Calendar.DAY_OF_WEEK)
        return "下周" + weekdays[dow - 1]
      }
      return ""
    }

    /** 年月日标签：2026.8.9；含具体时间时附 HH:mm */
    private fun formatDeadlineYMD(deadline: Long): String {
      val fmt = SimpleDateFormat(if (hasExplicitTime(deadline)) "yyyy.M.d HH:mm" else "yyyy.M.d", Locale.getDefault())
      return fmt.format(Date(deadline))
    }

    /** 00:00:00 与 23:59:00 视为"仅日期" */
    private fun hasExplicitTime(ts: Long): Boolean {
      val c = Calendar.getInstance().apply { timeInMillis = ts }
      val h = c.get(Calendar.HOUR_OF_DAY)
      val m = c.get(Calendar.MINUTE)
      val s = c.get(Calendar.SECOND)
      return !(s == 0 && ((h == 0 && m == 0) || (h == 23 && m == 59)))
    }

    private fun startOfDay(ts: Long): Long {
      val c = Calendar.getInstance().apply { timeInMillis = ts }
      c.set(Calendar.HOUR_OF_DAY, 0)
      c.set(Calendar.MINUTE, 0)
      c.set(Calendar.SECOND, 0)
      c.set(Calendar.MILLISECOND, 0)
      return c.timeInMillis
    }
  }
}
