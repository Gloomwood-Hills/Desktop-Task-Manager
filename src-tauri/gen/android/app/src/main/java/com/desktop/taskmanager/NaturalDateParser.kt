package com.desktop.taskmanager

import java.util.Calendar

/**
 * 自然语言日期解析：从 QuickCapture 的 formatDate.ts parseNaturalDateTime 完整移植。
 * 支持：今天/明天/后天/月底/周X/下周一 + 上午/下午/晚上 + X点(Y分)（中文或数字）。
 * 返回截止时间戳；解析不到返回 null。
 */
object NaturalDateParser {

  private val WEEK_CN = mapOf(
    "一" to 0, "二" to 1, "三" to 2, "四" to 3, "五" to 4, "六" to 5, "日" to 6, "天" to 6
  )

  private val NUM_CN = mapOf(
    "零" to 0, "一" to 1, "二" to 2, "两" to 2, "三" to 3, "四" to 4, "五" to 5, "六" to 6,
    "七" to 7, "八" to 8, "九" to 9, "十" to 10, "十一" to 11, "十二" to 12, "十三" to 13,
    "十四" to 14, "十五" to 15, "十六" to 16, "十七" to 17, "十八" to 18, "十九" to 19,
    "二十" to 20, "二十一" to 21, "二十二" to 22, "二十三" to 23, "二十四" to 24,
    "二十五" to 25, "二十六" to 26, "二十七" to 27, "二十八" to 28, "二十九" to 29,
    "三十" to 30, "三十一" to 31
  )

  private fun toNumber(token: String?): Int? {
    if (token.isNullOrEmpty()) return null
    if (token.matches(Regex("\\d{1,2}"))) return token.toInt()
    return NUM_CN[token]
  }

  private fun addDays(cal: Calendar, n: Int): Calendar {
    val c = (cal.clone() as Calendar).apply { add(Calendar.DAY_OF_MONTH, n) }
    return c
  }

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

  private fun dateCal(year: Int, month0: Int, day: Int): Calendar {
    val c = Calendar.getInstance()
    c.set(Calendar.YEAR, year)
    c.set(Calendar.MONTH, month0) // Calendar 月份 0 索引
    c.set(Calendar.DAY_OF_MONTH, day)
    c.set(Calendar.HOUR_OF_DAY, 0)
    c.set(Calendar.MINUTE, 0)
    c.set(Calendar.SECOND, 0)
    c.set(Calendar.MILLISECOND, 0)
    return c
  }

  fun parse(text: String): Long? {
    val now = Calendar.getInstance()

    // 相对时间：X小时后（精确到具体时刻）
    val afterHours = Regex("(\\d{1,2}|[一二两三四五六七八九十]{1,2})\\s*(?:个)?小时(?:以)?后").find(text)
    if (afterHours != null) {
      val n = toNumber(afterHours.groupValues[1])
      if (n != null && n > 0) {
        val t = Calendar.getInstance().apply { timeInMillis = now.timeInMillis + n * 3600L * 1000L }
        // 若恰落在「仅日期」标记（00:00:00 / 23:59:00），+1 秒保留具体时刻语义
        if (t.get(Calendar.SECOND) == 0 &&
          ((t.get(Calendar.HOUR_OF_DAY) == 23 && t.get(Calendar.MINUTE) == 59) ||
            (t.get(Calendar.HOUR_OF_DAY) == 0 && t.get(Calendar.MINUTE) == 0))) {
          t.set(Calendar.SECOND, 1)
        }
        return t.timeInMillis
      }
    }

    var base: Calendar? = null

    // ===== 具体日期格式（优先级最高）=====
    val ymdCN = Regex("(\\d{4})年\\s*([0-9一二两三四五六七八九十]{1,2})\\s*月\\s*([0-9一二两三四五六七八九十]{1,2})\\s*日").find(text)
    val ymdDot = Regex("(\\d{2,4})\\.(\\d{1,2})\\.(\\d{1,2})").find(text)
    val mdCN = Regex("([0-9一二两三四五六七八九十]{1,2})\\s*月\\s*([0-9一二两三四五六七八九十]{1,2})\\s*日").find(text)
    val mdDot = Regex("(?:^|[^\\d.])(\\d{1,2})\\.(\\d{1,2})(?![\\d.])").find(text)

    if (ymdCN != null) {
      base = dateCal(ymdCN.groupValues[1].toInt(), (toNumber(ymdCN.groupValues[2]) ?: 0) - 1, toNumber(ymdCN.groupValues[3]) ?: 0)
    } else if (ymdDot != null) {
      val y = if (ymdDot.groupValues[1].length == 2) 2000 + ymdDot.groupValues[1].toInt() else ymdDot.groupValues[1].toInt()
      base = dateCal(y, (toNumber(ymdDot.groupValues[2]) ?: 0) - 1, toNumber(ymdDot.groupValues[3]) ?: 0)
    } else if (mdCN != null) {
      val m = toNumber(mdCN.groupValues[1]) ?: 0
      val d = toNumber(mdCN.groupValues[2]) ?: 0
      if (m in 1..12 && d in 1..31) base = dateCal(now.get(Calendar.YEAR), m - 1, d)
    } else if (mdDot != null) {
      val m = toNumber(mdDot.groupValues[1]) ?: 0
      val d = toNumber(mdDot.groupValues[2]) ?: 0
      if (m in 1..12 && d in 1..31) base = dateCal(now.get(Calendar.YEAR), m - 1, d)
    }

    // ===== 相对日期 =====
    if (base == null && text.contains("月底")) {
      base = dateCal(now.get(Calendar.YEAR), now.get(Calendar.MONTH) + 1, 0)
    } else if (base == null && text.contains("后天")) {
      base = addDays(now, 2)
    } else if (base == null && (text.contains("明天") || text.contains("明日"))) {
      base = addDays(now, 1)
    } else if (base == null && (text.contains("今天") || text.contains("今日") || text.contains("今晚"))) {
      base = (now.clone() as Calendar).apply {
        set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
      }
    } else if (base == null) {
      val wm = Regex("(?:下个?周|周|星期|礼拜)([一二三四五六日天])").find(text)
      if (wm != null) {
        val next = wm.groupValues[0].startsWith("下")
        // 周一为一周开始：本周一 = 今天 - 距周一天数（周一→0 … 周日→6）
        val daysSinceMonday = (now.get(Calendar.DAY_OF_WEEK) + 5) % 7 // DAY_OF_WEEK: 周日=1…周六=7
        val thisMonday = Calendar.getInstance().apply {
          timeInMillis = now.timeInMillis
          add(Calendar.DAY_OF_MONTH, -daysSinceMonday)
        }
        var d = addDays(thisMonday, (if (next) 7 else 0) + (WEEK_CN[wm.groupValues[1]] ?: 0))
        if (d.timeInMillis < startOfDay(now.timeInMillis)) d = addDays(d, 7)
        base = d
      }
    }

    // 时间部分：上午/下午/晚上 + X点(Y分)
    var hour: Int? = null
    var minute = 0
    val hm = Regex("(上午|下午|晚上|凌晨)?\\s*(\\d{1,2}|[一二两三四五六七八九十]{1,3})\\s*[点时:：]\\s*(\\d{1,2}|[一二两三四五六七八九十]{1,2})?\\s*分?").find(text)
    if (hm != null) {
      var h = toNumber(hm.groupValues[2]) ?: 0 // 中文数字未命中兜底
      if ((hm.groupValues[1] == "下午" || hm.groupValues[1] == "晚上") && h < 12) h += 12
      hour = h
      if (hm.groupValues[3].isNotEmpty()) minute = toNumber(hm.groupValues[3]) ?: 0
    }

    if (base == null && hour == null) return null

    val target = (base?.clone() as Calendar?) ?: Calendar.getInstance()
    if (hour != null) {
      target.set(Calendar.HOUR_OF_DAY, hour)
      target.set(Calendar.MINUTE, minute)
      target.set(Calendar.SECOND, 0)
      target.set(Calendar.MILLISECOND, 0)
    } else {
      target.set(Calendar.HOUR_OF_DAY, 23)
      target.set(Calendar.MINUTE, 59)
      target.set(Calendar.SECOND, 0)
      target.set(Calendar.MILLISECOND, 0)
    }
    return target.timeInMillis
  }
}
