package com.desktop.taskmanager

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.content.Intent
import android.graphics.PorterDuff
import android.graphics.Typeface
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/**
 * 小部件「＋新增」打开的独立新建任务界面。
 * 直接读写 App 本地 SQLite（无需启动 WebView），完成后刷新小部件。
 *
 * 视觉与应用端 QuickCapture 对齐：顶部居中白卡片 + 半透明遮罩 + chip 选择器 + 蓝色胶囊按钮。
 * 日期选择与应用端一致：点击开始/截止 chip 展开快捷选项面板（快捷项 + 自定义时间 + 清除），
 * 标题输入实时解析自然语言日期并显示「识别到」预览。
 *
 * 字段与 TaskRepository.create 保持一致：sortOrder = 当前最大 + 1，completed=0，parentId=NULL。
 */
class WidgetAddTaskActivity : AppCompatActivity() {

  private lateinit var titleInput: EditText
  private lateinit var remarkInput: EditText
  private lateinit var folderChip: LinearLayout
  private lateinit var tvFolderName: TextView
  private lateinit var importantChip: LinearLayout
  private lateinit var tvImportant: TextView
  private lateinit var imgImportant: ImageView
  private lateinit var startChip: LinearLayout
  private lateinit var tvStart: TextView
  private lateinit var deadlineChip: LinearLayout
  private lateinit var tvDeadline: TextView
  private lateinit var tvParsePreview: TextView
  private lateinit var panelStart: LinearLayout
  private lateinit var panelDeadline: LinearLayout

  /** 文件夹选项：数据（可为 null → 未分类），并行存储 id */
  private var folderIds: List<String?> = listOf(null)
  private var folderNames: List<String> = listOf("")

  private var selectedFolderIndex = 0
  private var important = false

  /** 手动选择（快捷项/自定义），优先于标题解析；null 时回退到标题解析 */
  private var manualStart: Long? = null
  private var manualDeadline: Long? = null
  private var parsedDeadline: Long? = null

  private val ymdFmt = SimpleDateFormat("yyyy.M.d", Locale.getDefault())
  private val ymdHmFmt = SimpleDateFormat("yyyy.M.d HH:mm", Locale.getDefault())

  /** 快捷项与应用端 DATE_QUICK_START / DATE_QUICK_DEADLINE 一致 */
  private val quickStart: List<String> by lazy {
    listOf(
      getString(R.string.widget_task_today),
      getString(R.string.widget_task_tomorrow),
      getString(R.string.widget_task_day_after),
      getString(R.string.widget_task_next_monday),
      getString(R.string.widget_task_month_end),
    )
  }
  private val quickDeadline: List<String> by lazy {
    listOf(
      getString(R.string.widget_task_one_hour_later),
      getString(R.string.widget_task_tomorrow),
      getString(R.string.widget_task_day_after),
      getString(R.string.widget_task_next_monday),
      getString(R.string.widget_task_month_end),
    )
  }

  /** 截止时间：手动选择优先，其次标题解析 */
  private val effectiveDeadline: Long? get() = manualDeadline ?: parsedDeadline

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setContentView(R.layout.widget_add_task)

    titleInput = findViewById(R.id.et_title)
    remarkInput = findViewById(R.id.et_remark)
    folderChip = findViewById(R.id.chip_folder)
    tvFolderName = findViewById(R.id.tv_folder_name)
    importantChip = findViewById(R.id.chip_important)
    tvImportant = findViewById(R.id.tv_important)
    imgImportant = findViewById(R.id.img_important)
    startChip = findViewById(R.id.chip_start)
    tvStart = findViewById(R.id.tv_start)
    deadlineChip = findViewById(R.id.chip_deadline)
    tvDeadline = findViewById(R.id.tv_deadline)
    tvParsePreview = findViewById(R.id.tv_parse_preview)
    panelStart = findViewById(R.id.panel_start)
    panelDeadline = findViewById(R.id.panel_deadline)

    loadFolders()

    folderChip.setOnClickListener { pickFolder() }
    importantChip.setOnClickListener { toggleImportant() }
    startChip.setOnClickListener { togglePanel(true) }
    deadlineChip.setOnClickListener { togglePanel(false) }

    titleInput.addTextChangedListener(object : TextWatcher {
      override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
      override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
      override fun afterTextChanged(s: Editable?) = updateParsePreview()
    })

    findViewById<ImageView>(R.id.btn_close).setOnClickListener { finishToHome() }
    findViewById<TextView>(R.id.btn_cancel).setOnClickListener { finishToHome() }
    findViewById<TextView>(R.id.btn_create).setOnClickListener { saveTask() }

    // 从桌面小部件「快速记录」进入时自动聚焦标题，可直接输入并自然语言解析
    if (intent.getBooleanExtra(TaskWidgetProvider.EXTRA_FOCUS_TITLE, false)) {
      titleInput.requestFocus()
      titleInput.postDelayed({
        val imm = getSystemService(INPUT_METHOD_SERVICE) as android.view.inputmethod.InputMethodManager
        imm.showSoftInput(titleInput, android.view.inputmethod.InputMethodManager.SHOW_IMPLICIT)
      }, 250)
    }
  }

  /** 读取 Folder 表（deleted=0），首项为「未分类」 */
  private fun loadFolders() {
    val db = WidgetDb.openReadOnly(this)
    if (db == null) {
      folderIds = listOf(null)
      folderNames = listOf(getString(R.string.widget_task_no_folder))
      return
    }
    try {
      val ids = mutableListOf<String?>()
      val names = mutableListOf<String>()
      db.rawQuery("SELECT id, name FROM Folder WHERE deleted = 0 ORDER BY sortOrder ASC", null).use { c ->
        while (c.moveToNext()) {
          ids.add(c.getString(0))
          names.add(c.getString(1))
        }
      }
      folderIds = listOf(null) + ids
      folderNames = listOf(getString(R.string.widget_task_no_folder)) + names
    } catch (_: Exception) {
      folderIds = listOf(null)
      folderNames = listOf(getString(R.string.widget_task_no_folder))
    } finally {
      db.close()
    }
    tvFolderName.text = folderNames[selectedFolderIndex]
  }

  /** 点击文件夹 chip → 弹出文件夹选择面板 */
  private fun pickFolder() {
    AlertDialog.Builder(this)
      .setTitle(R.string.widget_task_folder)
      .setItems(folderNames.toTypedArray()) { _, which ->
        selectedFolderIndex = which
        tvFolderName.text = folderNames[which]
      }
      .setNegativeButton(R.string.widget_task_cancel, null)
      .show()
  }

  /** 点击重要 chip → 切换重要状态（橙色高亮）。注意颜色必须为 8 位 ARGB，否则首字节 alpha=00 全透明导致图标/字体消失 */
  private fun toggleImportant() {
    important = !important
    val textColor = if (important) 0xFFFF9500.toInt() else 0xFF8E8E93.toInt()
    tvImportant.setTextColor(textColor)
    imgImportant.setColorFilter(textColor, PorterDuff.Mode.SRC_IN)
    importantChip.setBackgroundResource(if (important) R.drawable.bg_chip_important else R.drawable.bg_chip)
  }

  /** 切换开始/截止快捷面板：打开目标面板并渲染选项，同时关闭另一个 */
  private fun togglePanel(isStart: Boolean) {
    val target = if (isStart) panelStart else panelDeadline
    val other = if (isStart) panelDeadline else panelStart
    val isOpen = target.visibility == View.VISIBLE
    other.visibility = View.GONE
    if (isOpen) {
      target.visibility = View.GONE
    } else {
      renderPanel(isStart)
      target.visibility = View.VISIBLE
    }
  }

  /** 渲染快捷面板：快捷项 + 自定义时间 + 清除日期（与应用端 QuickCapture 面板一致） */
  private fun renderPanel(isStart: Boolean) {
    val panel = if (isStart) panelStart else panelDeadline
    panel.removeAllViews()

    val presets = if (isStart) quickStart else quickDeadline
    val current = if (isStart) manualStart else effectiveDeadline

    for (label in presets) {
      val ts = NaturalDateParser.parse(label)
      // 开始时间快捷项归一化为当日 00:00（开始日期语义）
      val value = if (isStart && ts != null) startOfDay(ts) else ts
      val selected = current != null && current == value
      panel.addView(quickRow(label, ts?.let { formatTs(startOfDay(it)) }, selected) {
        if (isStart) manualStart = value else manualDeadline = value
        panel.visibility = View.GONE
        updateChips()
      })
    }

    panel.addView(divider())

    // 自定义时间（日期 + 时间选择器）
    panel.addView(quickRowLabel(getString(R.string.widget_task_custom_time)))
    val customRow = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      setPadding(dp(12), dp(8), dp(12), dp(8))
      background = getDrawable(R.drawable.bg_chip)
      setOnClickListener { pickCustom(isStart) }
    }
    customRow.addView(TextView(this).apply {
      text = if (isStart) getString(R.string.widget_task_pick_date) else getString(R.string.widget_task_pick_date)
      textSize = 13f
      setTextColor(0xFF007AFF.toInt())
      typeface = Typeface.DEFAULT_BOLD
    })
    panel.addView(customRow, fullWidth())

    panel.addView(divider())

    // 清除日期
    val clearLabel = if (isStart) getString(R.string.widget_task_clear_start_date) else getString(R.string.widget_task_clear_deadline_date)
    val cleared = if (isStart) manualStart == null else manualDeadline == null
    panel.addView(quickRow(clearLabel, null, cleared) {
      if (isStart) manualStart = null else manualDeadline = null
      panel.visibility = View.GONE
      updateChips()
    })
  }

  /** 快捷项行 */
  private fun quickRow(text: String, subText: String?, selected: Boolean, onClick: () -> Unit): View {
    val row = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      setPadding(dp(12), dp(8), dp(12), dp(8))
      background = getDrawable(if (selected) R.drawable.bg_chip_selected else R.drawable.bg_chip)
      isClickable = true
      isFocusable = true
      setOnClickListener { onClick() }
    }
    row.addView(TextView(this).apply {
      this.text = text
      textSize = 13f
      setTextColor(if (selected) 0xFF007AFF.toInt() else 0xFF1D1D1F.toInt())
      typeface = Typeface.DEFAULT_BOLD
    }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
    if (subText != null) {
      row.addView(TextView(this).apply {
        this.text = subText
        textSize = 11f
        setTextColor(0xFF8E8E93.toInt())
      }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
        marginStart = dp(8)
      })
    }
    return row
  }

  /** 分区小标题（如「自定义时间」） */
  private fun quickRowLabel(text: String): View = TextView(this).apply {
    this.text = text
    textSize = 12f
    setTextColor(0xFF8E8E93.toInt())
    setPadding(dp(12), dp(8), dp(12), dp(2))
  }

  private fun divider(): View = View(this).apply {
    setBackgroundColor(0x11000000.toInt())
    layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(1)).apply {
      topMargin = dp(4); bottomMargin = dp(4)
    }
  }

  private fun fullWidth(): LinearLayout.LayoutParams =
    LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)

  /** 自定义时间：日期选择器 + 时间选择器 */
  private fun pickCustom(isStart: Boolean) {
    val current = if (isStart) manualStart else effectiveDeadline
    val cal = Calendar.getInstance().apply {
      if (current != null) timeInMillis = current
    }
    DatePickerDialog(this, { _, y, m, d ->
      TimePickerDialog(this, { _, h, min ->
        val target = Calendar.getInstance().apply {
          set(Calendar.YEAR, y)
          set(Calendar.MONTH, m)
          set(Calendar.DAY_OF_MONTH, d)
          set(Calendar.HOUR_OF_DAY, h)
          set(Calendar.MINUTE, min)
          set(Calendar.SECOND, 0)
          set(Calendar.MILLISECOND, 0)
        }
        if (isStart) manualStart = target.timeInMillis else manualDeadline = target.timeInMillis
        if (isStart) panelStart.visibility = View.GONE else panelDeadline.visibility = View.GONE
        updateChips()
      }, cal.get(Calendar.HOUR_OF_DAY), cal.get(Calendar.MINUTE), true).show()
    }, cal.get(Calendar.YEAR), cal.get(Calendar.MONTH), cal.get(Calendar.DAY_OF_MONTH)).show()
  }

  /** 标题实时解析：更新「识别到」预览与截止 chip */
  private fun updateParsePreview() {
    val title = titleInput.text?.toString()?.trim().orEmpty()
    parsedDeadline = if (title.isNotEmpty()) NaturalDateParser.parse(title) else null

    if (parsedDeadline != null) {
      tvParsePreview.text = getString(R.string.widget_task_recognized, formatTs(parsedDeadline!!))
      tvParsePreview.visibility = View.VISIBLE
    } else {
      tvParsePreview.visibility = View.GONE
    }
    updateChips()
  }

  /** 刷新开始/截止 chip 的文案、颜色与选中背景 */
  private fun updateChips() {
    if (manualStart != null) {
      tvStart.text = formatTs(manualStart!!)
      tvStart.setTextColor(0xFF007AFF.toInt())
      startChip.setBackgroundResource(R.drawable.bg_chip_selected)
    } else {
      tvStart.setText(R.string.widget_task_start_date)
      tvStart.setTextColor(0xFF8E8E93.toInt())
      startChip.setBackgroundResource(R.drawable.bg_chip)
    }

    if (effectiveDeadline != null) {
      tvDeadline.text = formatTs(effectiveDeadline!!)
      tvDeadline.setTextColor(0xFF007AFF.toInt())
      deadlineChip.setBackgroundResource(R.drawable.bg_chip_selected)
    } else {
      tvDeadline.setText(R.string.widget_task_deadline)
      tvDeadline.setTextColor(0xFF8E8E93.toInt())
      deadlineChip.setBackgroundResource(R.drawable.bg_chip)
    }
  }

  /** 保存任务：插入 Task 表，复刻 TaskRepository.create 字段 */
  private fun saveTask() {
    val title = titleInput.text?.toString()?.trim().orEmpty()
    if (title.isEmpty()) {
      titleInput.error = getString(R.string.widget_task_empty_title)
      Toast.makeText(this, R.string.widget_task_empty_title, Toast.LENGTH_SHORT).show()
      return
    }

    val remark = remarkInput.text?.toString()?.trim().orEmpty()
    val db = WidgetDb.openWritable(this)
    if (db == null) {
      Toast.makeText(this, "数据库无法打开，请先启动应用后再试", Toast.LENGTH_LONG).show()
      return
    }
    try {
      val now = System.currentTimeMillis()
      val folderId = folderIds.getOrNull(selectedFolderIndex)
      val priority = if (important) "important" else "normal"
      val id = "$now-${randomIdSuffix()}"

      // sortOrder = 当前最大 + 1
      var sortOrder = 0L
      db.rawQuery("SELECT COALESCE(MAX(sortOrder), 0) + 1 FROM Task", null).use { c ->
        if (c.moveToFirst()) sortOrder = c.getLong(0)
      }

      db.execSQL(
        "INSERT INTO Task (id, title, remark, folderId, parentId, startDate, deadline, priority," +
          " sortOrder, completed, completedAt, deleted, createdAt, updatedAt)" +
          " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        arrayOf<Any?>(
          id, title, remark, folderId, null, manualStart, effectiveDeadline, priority,
          sortOrder, 0, null, 0, now, now
        )
      )
    } catch (e: Exception) {
      Toast.makeText(this, "保存失败：${e.message ?: e.javaClass.simpleName}", Toast.LENGTH_LONG).show()
      return
    } finally {
      db.close()
    }

    TaskWidgetProvider.requestRefresh(this)
    Toast.makeText(this, getString(R.string.widget_task_saved), Toast.LENGTH_SHORT).show()
    // 延迟 finish，让 Toast 有机会显示，且确保 requestRefresh 已发出广播
    titleInput.postDelayed({ finishToHome() }, 300)
  }

  /** 结束当前 Activity 并回到手机桌面（Home），不回到应用主窗口。
   *  小部件的「新增任务」属于独立任务（NEW_TASK + EXCLUDE_FROM_RECENTS），
   *  但若应用此前已在后台运行，单纯 finish() 可能回退到应用任务栈而非桌面。
   *  因此显式启动 HOME 再 finish，保证用户始终回到桌面。 */
  private fun finishToHome() {
    try {
      val home = Intent(Intent.ACTION_MAIN).apply {
        addCategory(Intent.CATEGORY_HOME)
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
      }
      startActivity(home)
    } catch (_: Exception) {
      // 极少数 ROM 不响应 HOME Intent，fallback 到 moveTaskToBack
      moveTaskToBack(true)
    }
    finish()
  }

  /** 系统返回键也回到桌面 */
  @Deprecated("Deprecated in Java")
  override fun onBackPressed() {
    finishToHome()
  }

  /** 00:00:00 与 23:59:00 视为「仅日期」 */
  private fun hasExplicitTime(ts: Long): Boolean {
    val c = Calendar.getInstance().apply { timeInMillis = ts }
    val h = c.get(Calendar.HOUR_OF_DAY)
    val m = c.get(Calendar.MINUTE)
    val s = c.get(Calendar.SECOND)
    return !(s == 0 && ((h == 0 && m == 0) || (h == 23 && m == 59)))
  }

  private fun formatTs(ts: Long): String =
    if (hasExplicitTime(ts)) ymdHmFmt.format(Date(ts)) else ymdFmt.format(Date(ts))

  private fun startOfDay(ts: Long): Long {
    val c = Calendar.getInstance().apply {
      timeInMillis = ts
      set(Calendar.HOUR_OF_DAY, 0)
      set(Calendar.MINUTE, 0)
      set(Calendar.SECOND, 0)
      set(Calendar.MILLISECOND, 0)
    }
    return c.timeInMillis
  }

  private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

  /** 与桌面端 generateId() 一致的 9 位 base36 随机串 */
  private fun randomIdSuffix(): String {
    val pool = "0123456789abcdefghijklmnopqrstuvwxyz"
    return (0 until 9).map { pool.random() }.joinToString("")
  }
}
