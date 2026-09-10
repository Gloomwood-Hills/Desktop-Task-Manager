package com.desktop.taskmanager

import android.content.Intent
import android.widget.RemoteViewsService

/** 小部件任务列表的数据服务：向集合视图提供月/日视图的任务数据 */
class TaskWidgetService : RemoteViewsService() {
  override fun onGetViewFactory(intent: Intent): RemoteViewsFactory {
    return TaskWidgetFactory(applicationContext, intent)
  }
}
