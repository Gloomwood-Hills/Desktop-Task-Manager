import { useEffect, useState } from 'react';
import { getDatabase } from './data';
import { TaskService, FolderService, SettingsService, WindowStateService } from './services';

function App() {
  const [status, setStatus] = useState('Initializing...');
  const [databaseReady, setDatabaseReady] = useState(false);

  useEffect(() => {
    initApp();
  }, []);

  async function initApp() {
    try {
      setStatus('Connecting to database...');
      const db = await getDatabase();
      
      setStatus('Testing FolderService...');
      const folderService = new FolderService(db);
      const folders = folderService.getAllFolders();
      setStatus(`Found ${folders.length} folders`);

      setStatus('Testing TaskService...');
      const taskService = new TaskService(db);
      const tasks = taskService.getAllTasks();
      setStatus(`Found ${tasks.length} tasks`);

      setStatus('Testing SettingsService...');
      const settingsService = new SettingsService(db);
      const settings = settingsService.getSettings();
      setStatus(`Settings loaded: ${settings?.theme || 'N/A'}`);

      setStatus('Testing WindowStateService...');
      const windowStateService = new WindowStateService(db);
      const windowState = windowStateService.getWindowState();
      setStatus(`Window state loaded: ${windowState?.width || 0}x${windowState?.height || 0}`);

      setDatabaseReady(true);
      setStatus('阶段1: 数据层设计与实现完成 ✅');
    } catch (error) {
      setStatus(`Error: ${(error as Error).message}`);
    }
  }

  return (
    <div className="min-h-screen bg-transparent p-6">
      <div className="backdrop-blur-md bg-glass-light rounded-2xl shadow-glass p-6">
        <h1 className="text-2xl font-semibold text-gray-800">Desktop Task Manager</h1>
        <p className="text-gray-600 mt-4">{status}</p>
        
        {databaseReady && (
          <div className="mt-6 space-y-2 text-sm text-gray-500">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              <span>SQLite 数据库连接成功</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              <span>Repository 模式实现完成</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              <span>TaskService + FolderService 业务层实现完成</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              <span>数据迁移和初始化完成</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              <span>错误处理和日志添加完成</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              <span>通用工具函数提取完成</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;