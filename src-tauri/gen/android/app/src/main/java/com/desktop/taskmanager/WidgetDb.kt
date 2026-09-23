package com.desktop.taskmanager

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.util.Log
import java.io.File

/**
 * 小部件跨进程访问 App 数据库的统一入口。
 * 数据库实际位于 <dataDir>/desktop-task-manager/data.db。
 * 只读/可写均需设置 busy_timeout，避免 App 写入瞬间触发 SQLITE_BUSY 导致列表空白。
 */
object WidgetDb {

  private const val TAG = "TaskWidget"

  private fun resolveFile(context: Context): File? {
    val candidates = listOf(
      File(context.getDataDir(), "desktop-task-manager/data.db"),
      File(context.filesDir, "desktop-task-manager/data.db"),
      File(context.filesDir, "data.db"),
    )
    return candidates.firstOrNull { it.exists() && it.length() > 0 }
  }

  /** 当前命中的数据库路径（供诊断日志使用），未命中返回 null */
  fun resolvePath(context: Context): String? = resolveFile(context)?.absolutePath

  fun openReadOnly(context: Context): SQLiteDatabase? {
    val file = resolveFile(context)
    if (file == null) {
      Log.e(TAG, "openReadOnly: 数据库文件未找到（候选目录均不存在或为空）")
      return null
    }
    return try {
      SQLiteDatabase.openDatabase(file.absolutePath, null, SQLiteDatabase.OPEN_READONLY)
        .also { setPragmas(it) }
    } catch (e: Exception) {
      Log.e(TAG, "openReadOnly failed: path=${file.absolutePath} err=${e.message}")
      null
    }
  }

  fun openWritable(context: Context): SQLiteDatabase? {
    val file = resolveFile(context)
    if (file == null) {
      Log.e(TAG, "openWritable: 数据库文件未找到（候选目录均不存在或为空）")
      return null
    }
    // 应用进程可能短时持有写锁，重试 3 次（间隔 200ms），避免瞬时 SQLITE_BUSY 导致小部件写入失败
    repeat(3) { attempt ->
      try {
        return SQLiteDatabase.openDatabase(file.absolutePath, null, SQLiteDatabase.OPEN_READWRITE)
          .also { setPragmas(it) }
      } catch (e: Exception) {
        Log.w(TAG, "openWritable attempt ${attempt + 1} failed: ${e.message}")
        if (attempt < 2) Thread.sleep(200)
      }
    }
    Log.e(TAG, "openWritable: 3 次重试均失败，path=${file.absolutePath}")
    return null
  }

  private fun setPragmas(db: SQLiteDatabase) {
    try {
      db.rawQuery("PRAGMA busy_timeout = 3000", null).use { }
    } catch (_: Exception) {
    }
    try {
      db.rawQuery("PRAGMA foreign_keys = ON", null).use { }
    } catch (_: Exception) {
    }
  }
}
