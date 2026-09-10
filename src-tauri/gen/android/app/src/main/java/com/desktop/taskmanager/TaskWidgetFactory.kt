package com.desktop.taskmanager

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.database.sqlite.SQLiteDatabase
import android.graphics.Paint
import android.net.Uri
import android.util.Log
import android.view.View
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import java.text.Collator
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/**
 * 小部件列表数据工厂：读取本地 SQLite 任务，排序与显示跟随应用「设置 → 排序」。
 * 列表同时展示未完成与已完成任务，点击复选框即完成任务 / 撤销完成。
 */
class TaskWidgetFactory(private val context: Context, intent: Intent) : RemoteViewsService.RemoteViewsFactory {

  private data class Item(
    val id: String,
    val title: String,
    val deadline: Long?,
    val startDate: Long?,
    val priority: String,
    val folderName: String?,
    val completed: Boolean,
    val createdAt: Long,
  )

  private val items = mutableListOf<Item>()
  private var sortType = "deadline"
  private var importantTop = false
  private val collator = Collator.getInstance(Locale.CHINA)
  private companion object { const val TAG = "TaskWidget" }

  override fun onCreate() = load()

  override fun onDataSetChanged() = load()

  override fun getCount(): Int = items.size

  override fun getViewAt(position: Int): RemoteViews {
    val item = items[position]
    val views = RemoteViews(context.packageName, R.layout.task_widget_item)

    // 复选框：已完成=绿色实心；未完成=重要橙 / 普通灰
    val checkRes = when {
      item.completed -> R.drawable.ic_task_done
      item.priority == "important" -> R.drawable.ic_task_important
      else -> R.drawable.ic_task_normal
    }
    views.setImageViewResource(R.id.item_check, checkRes)

    // 标题：已完成加删除线 + 弱化颜色
    views.setTextViewText(R.id.item_title, item.title)
    if (item.completed) {
      views.setInt(R.id.item_title, "setPaintFlags", Paint.STRIKE_THRU_TEXT_FLAG)
      views.setTextColor(R.id.item_title, 0xFF8E8E93.toInt())
    } else {
      views.setTextColor(R.id.item_title, 0xFF1D1D1F.toInt())
    }

    // 文件夹名（无文件夹时隐藏该行）
    if (item.folderName.isNullOrBlank()) {
      views.setViewVisibility(R.id.item_folder, View.GONE)
    } else {
      views.setViewVisibility(R.id.item_folder, View.VISIBLE)
      views.setTextViewText(R.id.item_folder, item.folderName)
      views.setTextViewCompoundDrawables(R.id.item_folder, R.drawable.ic_folder, 0, 0, 0)
    }

    // 已完成任务不再显示截止徽章，弱化视觉干扰
    if (item.completed) hideDeadline(views) else bindDeadline(views, item)

    // 点击整行 → 切换完成状态（完成 / 撤销完成）。
    // 只用【每项独立 setOnClickPendingIntent】：任务 ID 直接内嵌在每项自己的 PendingIntent 里，
    // 不依赖桌面合并。真机实测（华为鸿蒙 5.x）：
    // - fill-in + 模板：广播能到但 extra_task_id 被桌面丢弃；
    // - 若同时保留模板，点击处理器优先走模板路径、忽略每项 PendingIntent；
    // 因此【不要】在 Provider 设 setPendingIntentTemplate，也不要用 fill-in。
    val togglePendingIntent = PendingIntent.getBroadcast(
      context,
      item.id.hashCode(),
      Intent(context, TaskWidgetProvider::class.java).apply {
        action = TaskWidgetProvider.ACTION_TOGGLE_COMPLETE
        putExtra(TaskWidgetProvider.EXTRA_TASK_ID, item.id)
        putExtra(TaskWidgetProvider.EXTRA_TARGET_COMPLETED, !item.completed)
        // 每项唯一 data URI：保证不同任务的 PendingIntent 身份不冲突（PendingIntent 身份不含 extras）
        data = Uri.parse("widget-task://${item.id}")
      },
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    views.setOnClickPendingIntent(R.id.widget_item_root, togglePendingIntent)

    return views
  }

  override fun getLoadingView(): RemoteViews? = null

  override fun getViewTypeCount(): Int = 1

  override fun getItemId(position: Int): Long = position.toLong()

  override fun hasStableIds(): Boolean = false

  override fun onDestroy() = items.clear()

  private fun load() {
    items.clear()
    val db = WidgetDb.openReadOnly(context) ?: return
    try {
      readSettings(db)

      val rows = mutableListOf<Item>()
      db.rawQuery(
        """SELECT t.id, t.title, t.deadline, t.startDate, t.priority, f.name, t.completed, t.createdAt
           FROM Task t LEFT JOIN Folder f ON t.folderId = f.id
           WHERE t.deleted = 0 AND t.completed = 0""".trimMargin(),
        null
      ).use { c ->
        while (c.moveToNext()) {
          rows.add(
            Item(
              id = c.getString(0),
              title = c.getString(1),
              deadline = if (c.isNull(2)) null else c.getLong(2),
              startDate = if (c.isNull(3)) null else c.getLong(3),
              priority = if (c.isNull(4)) "normal" else c.getString(4),
              folderName = if (c.isNull(5)) null else c.getString(5),
              completed = c.getInt(6) == 1,
              createdAt = c.getLong(7),
            )
          )
        }
      }

      // 小部件不展示已完成任务（SQL 已过滤 completed=0），只对未完成任务排序
      items.addAll(sortTasks(rows))
    } catch (e: Exception) {
      Log.e(TAG, "query failed: ${e.message}")
      items.clear()
    } finally {
      db.close()
    }
  }

  /** 读取设置（排序方式 / 重要任务置顶），默认 deadline */
  private fun readSettings(db: SQLiteDatabase) {
    sortType = "deadline"
    importantTop = false
    try {
      db.rawQuery("SELECT sortType, importantTop FROM Settings WHERE id = 'default'", null).use { c ->
        if (c.moveToFirst()) {
          sortType = if (c.isNull(0)) "deadline" else c.getString(0)
          importantTop = !c.isNull(1) && c.getInt(1) == 1
        }
      }
    } catch (_: Exception) {
    }
  }

  /** 移植 utils.ts sortTasksByType：importantTop 先分区（重要在前），再在各分区内按 sortType 排序 */
  private fun sortTasks(tasks: List<Item>): List<Item> {
    if (!importantTop) return sortCore(tasks)
    val important = sortCore(tasks.filter { it.priority == "important" })
    val normal = sortCore(tasks.filter { it.priority != "important" })
    return important + normal
  }

  private fun sortCore(tasks: List<Item>): List<Item> = when (sortType) {
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

  /** 截止时间徽章：参照桌面端 DateBadge。
   * 使用 5 个预定义徽章（红/橙红/橙/黑/灰），通过 setViewVisibility 切换显示，
   * 规避 RemoteViews.setInt(..., "setBackgroundResource", ...) 在部分 ROM 上失效的问题。 */
  private fun bindDeadline(views: RemoteViews, item: Item) {
    val deadline = item.deadline
    val visibleId: Int
    val text: String

    if (deadline != null) {
      val rel = formatDeadlineRel(deadline)
      val ymd = formatDeadlineYMD(deadline)
      text = if (rel.isNotEmpty()) "$rel $ymd" else ymd

      val remain = deadline - System.currentTimeMillis()
      val day = 24 * 3600 * 1000L
      visibleId = when {
        remain <= day -> R.id.item_dl_red
        remain <= 3 * day -> R.id.item_dl_orange
        remain <= 7 * day -> R.id.item_dl_amber
        else -> R.id.item_dl_dark
      }
    } else if (item.startDate != null) {
      val fmt = SimpleDateFormat(if (hasExplicitTime(item.startDate)) "MM-dd HH:mm" else "MM-dd", Locale.getDefault())
      text = fmt.format(Date(item.startDate))
      visibleId = R.id.item_dl_gray
    } else {
      text = context.getString(R.string.widget_no_deadline)
      visibleId = R.id.item_dl_gray
    }

    hideAllDeadlinesAndShow(views, visibleId, text)
  }

  private fun hideDeadline(views: RemoteViews) {
    val allIds = arrayOf(R.id.item_dl_red, R.id.item_dl_orange, R.id.item_dl_amber, R.id.item_dl_dark, R.id.item_dl_gray)
    for (id in allIds) views.setViewVisibility(id, View.GONE)
  }

  private fun hideAllDeadlinesAndShow(views: RemoteViews, visibleId: Int, text: String) {
    val allIds = arrayOf(R.id.item_dl_red, R.id.item_dl_orange, R.id.item_dl_amber, R.id.item_dl_dark, R.id.item_dl_gray)
    for (id in allIds) {
      views.setViewVisibility(id, if (id == visibleId) View.VISIBLE else View.GONE)
      if (id == visibleId) views.setTextViewText(id, text)
    }
  }

  // ===== 桌面端 formatDate 逻辑移植（保持与 App 内日期徽章一致） =====

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
      val dow = c.get(Calendar.DAY_OF_WEEK) // 1=周日 … 7=周六
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
