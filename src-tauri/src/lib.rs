use tauri::{Emitter, Manager};

// Windows 的便携版没有 MSIX 包身份。通知库会使用应用 ID 发送 toast，但必须先把
// 此 ID 写入当前用户的 AppUserModelId 注册表项，系统设置才能将通知归属到本应用。
// 仅写 HKCU，不需要管理员权限，也不会修改用户的全局通知开关。
#[cfg(windows)]
mod notification_identity {
    use windows_registry::CURRENT_USER;

    pub const APP_ID: &str = "com.desktop.taskmanager";
    const DISPLAY_NAME: &str = "Desktop Task Manager";

    pub fn ensure_registered() -> Result<(), String> {
        let executable = std::env::current_exe()
            .map_err(|error| format!("无法读取应用路径：{error}"))?;
        let key = CURRENT_USER
            .create(format!(r"SOFTWARE\Classes\AppUserModelId\{APP_ID}"))
            .map_err(|error| format!("无法注册通知发送者：{error}"))?;

        key.set_string("DisplayName", DISPLAY_NAME)
            .map_err(|error| format!("无法写入通知名称：{error}"))?;
        // 使用 exe 自带图标，便携版与安装版均可用；路径变化时会在下次启动自动刷新。
        key.set_string("IconUri", executable.to_string_lossy())
            .map_err(|error| format!("无法写入通知图标：{error}"))?;
        Ok(())
    }
}

#[cfg(not(windows))]
mod notification_identity {
    pub fn ensure_registered() -> Result<(), String> {
        Ok(())
    }
}

// 桌面专属能力（系统托盘 / 全局快捷键 / 开机自启动）在 Android 上无意义：
// 其插件 crate 自身带 `#![cfg(not(any(target_os = "android", target_os = "ios")))]`，
// 在 Android 上根本不编译，故 import 也按平台条件化，避免 Android 构建引用不存在的 crate。
#[cfg(not(target_os = "android"))]
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    PhysicalPosition, PhysicalSize,
};
#[cfg(not(target_os = "android"))]
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

mod webdav;

/** 前端"设置 → 退出"调用：退出应用 */
#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

/// 前端在发送测试通知前再次确认身份已注册；Windows 设置页会在首次实际 toast 后显示它。
#[tauri::command]
fn ensure_notification_identity() -> Result<(), String> {
    notification_identity::ensure_registered()
}

/// 在主窗口外显示仍由前端样式绘制的任务右键菜单。
/// 独立透明浮窗不受主 WebView 裁剪，因此二级菜单可以越过主窗口边界。
#[cfg(not(target_os = "android"))]
#[tauri::command]
async fn open_context_menu_popup(
    app: tauri::AppHandle,
    x: f64,
    y: f64,
    task_id: String,
    can_stop_repeat: bool,
    task_completed: bool,
    dark: bool,
) -> Result<(), String> {
    const POPUP_WIDTH: f64 = 380.0;
    const POPUP_HEIGHT: f64 = 320.0;

    if let Some(existing) = app.get_webview_window("task-context-menu") {
        let _ = existing.destroy();
    }

    let main = app
        .get_webview_window("main")
        .ok_or_else(|| "主窗口不存在".to_string())?;
    let scale = main.scale_factor().map_err(|error| error.to_string())?;
    let outer = main.outer_position().map_err(|error| error.to_string())?;
    let mut screen_x = outer.x as f64 / scale + x;
    let mut screen_y = outer.y as f64 / scale + y;

    // 只避让屏幕工作区，不受主窗口边界约束。
    if let Ok(Some(monitor)) = main.current_monitor() {
        let monitor_scale = monitor.scale_factor();
        let work = monitor.work_area();
        let left = work.position.x as f64 / monitor_scale;
        let top = work.position.y as f64 / monitor_scale;
        let right = left + work.size.width as f64 / monitor_scale;
        let bottom = top + work.size.height as f64 / monitor_scale;
        screen_x = screen_x.clamp(left + 4.0, (right - POPUP_WIDTH - 4.0).max(left + 4.0));
        screen_y = screen_y.clamp(top + 4.0, (bottom - POPUP_HEIGHT - 4.0).max(top + 4.0));
    }

    let url = format!(
        "index.html?popup=task-context-menu&taskId={task_id}&canStopRepeat={can_stop_repeat}&taskCompleted={task_completed}&dark={dark}"
    );
    let popup = tauri::WebviewWindowBuilder::new(
        &app,
        "task-context-menu",
        tauri::WebviewUrl::App(url.into()),
    )
    .title("任务菜单")
    .inner_size(POPUP_WIDTH, POPUP_HEIGHT)
    .position(screen_x, screen_y)
    .resizable(false)
    .maximizable(false)
    .minimizable(false)
    .closable(true)
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .focused(true)
    .build()
    .map_err(|error| format!("无法创建任务菜单浮窗：{error}"))?;

    // 明确使用物理像素设置实际尺寸。Windows 高 DPI 下若只依赖 builder 的逻辑尺寸，
    // WebView 可用区域可能被系统缩放压小，造成二级菜单方向误判并被裁切。
    let physical_width = (POPUP_WIDTH * scale).round().max(1.0) as u32;
    let physical_height = (POPUP_HEIGHT * scale).round().max(1.0) as u32;
    popup
        .set_size(PhysicalSize::new(physical_width, physical_height))
        .map_err(|error| format!("无法调整任务菜单浮窗尺寸：{error}"))?;

    #[cfg(windows)]
    if let Ok(hwnd) = popup.hwnd() {
        watch_context_menu_outside_click(app.clone(), hwnd.0 as isize);
    }
    Ok(())
}

/// Windows 桌面层点击空白处时不一定触发 WebView 的 blur。
/// 监测下一次发生在浮窗外的鼠标按下，使行为与系统原生右键菜单一致。
#[cfg(windows)]
fn watch_context_menu_outside_click(app: tauri::AppHandle, hwnd_raw: isize) {
    std::thread::spawn(move || {
        use windows::Win32::Foundation::{HWND, POINT, RECT};
        use windows::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
        use windows::Win32::UI::WindowsAndMessaging::{GetCursorPos, GetWindowRect};

        let hwnd = HWND(hwnd_raw as *mut _);
        let mut armed = false;

        loop {
            let Some(current) = app.get_webview_window("task-context-menu") else {
                break;
            };
            let Ok(current_hwnd) = current.hwnd() else {
                break;
            };
            if current_hwnd.0 as isize != hwnd_raw {
                break;
            }

            let mouse_down = unsafe {
                GetAsyncKeyState(0x01) < 0
                    || GetAsyncKeyState(0x02) < 0
                    || GetAsyncKeyState(0x04) < 0
            };

            // 等待触发菜单的右键先释放，避免浮窗刚创建就把自己关闭。
            if !armed {
                armed = !mouse_down;
            } else if mouse_down {
                let mut point = POINT::default();
                let mut rect = RECT::default();
                let point_ok = unsafe { GetCursorPos(&mut point) }.is_ok();
                let rect_ok = unsafe { GetWindowRect(hwnd, &mut rect) }.is_ok();
                if point_ok
                    && rect_ok
                    && (point.x < rect.left
                        || point.x >= rect.right
                        || point.y < rect.top
                        || point.y >= rect.bottom)
                {
                    let _ = current.destroy();
                    break;
                }
            }

            std::thread::sleep(std::time::Duration::from_millis(16));
        }
    });
}

#[cfg(target_os = "android")]
#[tauri::command]
async fn open_context_menu_popup(
    _app: tauri::AppHandle,
    _x: f64,
    _y: f64,
    _task_id: String,
    _can_stop_repeat: bool,
    _task_completed: bool,
    _dark: bool,
) -> Result<(), String> {
    Err("移动端不使用桌面右键菜单".to_string())
}

#[cfg(windows)]
mod worker_w {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{
        FindWindowExW, FindWindowW, SendMessageW, SetParent, SetWindowPos, ShowWindow,
        HWND_BOTTOM, SWP_NOACTIVATE, SW_SHOWNOACTIVATE,
    };
    use std::io::Write;

    fn log(msg: &str) {
        if let Ok(mut f) = std::fs::OpenOptions::new()
            .create(true).append(true)
            .open(std::env::temp_dir().join("dtm_workerw.log"))
        {
            let _ = writeln!(f, "[{}] {}", chrono_now(), msg);
        }
        eprintln!("[WorkerW] {}", msg);
    }

    fn chrono_now() -> String {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| format!("{}", d.as_secs()))
            .unwrap_or_default()
    }

    pub unsafe fn attach(hwnd_raw: isize) {
        let hwnd_app = HWND(hwnd_raw as *mut _);

        // Step 1: Find Progman
        let Ok(progman) = FindWindowW(windows::core::w!("Progman"), None) else {
            log("Progman not found");
            return;
        };
        log("Progman found");

        // Step 2: Spawn WorkerW
        let _ = SendMessageW(progman, 0x052C, None, None);
        std::thread::sleep(std::time::Duration::from_millis(100));

        // Step 3: Find SHELLDLL_DefView
        let Ok(def_view) = FindWindowExW(progman, None, windows::core::w!("SHELLDLL_DefView"), None) else {
            log("SHELLDLL_DefView not found");
            return;
        };
        log("SHELLDLL_DefView found");

        // Step 4: Find WorkerW
        let Ok(worker_w) = FindWindowExW(None, def_view, windows::core::w!("WorkerW"), None) else {
            log("WorkerW not found");
            return;
        };
        log("WorkerW found");

        // Step 5: Attach to WorkerW
        let Ok(_prev_parent) = SetParent(hwnd_app, worker_w) else {
            log("SetParent failed");
            return;
        };
        log("SetParent succeeded");

        // Step 6: Show window and position at bottom of WorkerW
        // After SetParent, coordinates are relative to parent WorkerW
        let _ = ShowWindow(hwnd_app, SW_SHOWNOACTIVATE);
        let _ = SetWindowPos(
            hwnd_app,
            HWND_BOTTOM,
            0, 0, 400, 600,
            SWP_NOACTIVATE,
        );
        log("Attach complete");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 基础插件（数据 / 通知）在所有平台保留；桌面专属插件（自启动 / 全局快捷键）
    // 按平台条件注册，Android 构建不引用对应 crate。
    let mut builder = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            exit_app,
            ensure_notification_identity,
            open_context_menu_popup,
            webdav::webdav_fetch,
            webdav::webdav_put,
            webdav::webdav_mkcol
        ])
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_notification::init());

    #[cfg(not(target_os = "android"))]
    {
        builder = builder
            .plugin(tauri_plugin_autostart::Builder::new().build())
            .plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_handler(|app, _shortcut, event| {
                        // Ctrl+Shift+Space：显示窗口并通知前端打开快速创建
                        if event.state == ShortcutState::Pressed {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                                let _ = window.emit("quick-capture-toggle", ());
                            }
                        }
                    })
                    .build(),
            );
    }

    builder
        .setup(|app| {
            // 让 Windows 能将通知稳定归属为“Desktop Task Manager”。失败不阻止主程序启动，
            // 但设置页的测试按钮会把具体错误反馈给用户。
            if let Err(error) = notification_identity::ensure_registered() {
                eprintln!("[notification] failed to register sender identity: {error}");
            }

            // 确保数据库目录存在（sqlx 不会自动创建父目录，否则 Database.load 失败）。
            // Android 上同样需要：app_data_dir() 在移动端可用，保留。
            if let Ok(data_dir) = app.path().app_data_dir() {
                let _ = std::fs::create_dir_all(data_dir.join("desktop-task-manager"));
            }

            // 桌面专属能力：系统托盘 + 全局快捷键注册（Android 无托盘/全局快捷键概念）
            #[cfg(not(target_os = "android"))]
            {
                // 注册全局快捷键：Ctrl+Shift+Space
                let shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space);
                let _ = app.global_shortcut().register(shortcut);

                // System tray
                let show_item = MenuItemBuilder::with_id("show", "显示").build(app)?;
                let hide_item = MenuItemBuilder::with_id("hide", "隐藏").build(app)?;
                let reset_item = MenuItemBuilder::with_id("reset", "复位").build(app)?;
                let quit_item = MenuItemBuilder::with_id("quit", "退出").build(app)?;
                let menu = MenuBuilder::new(app)
                    .item(&show_item)
                    .item(&hide_item)
                    .item(&reset_item)
                    .item(&quit_item)
                    .build()?;

                let quit_handle = app.handle().clone();
                let show_handle = app.handle().clone();
                let hide_handle = app.handle().clone();
                let reset_handle = app.handle().clone();

                let _tray = TrayIconBuilder::new()
                    .icon(app.default_window_icon().unwrap().clone())
                    .menu(&menu)
                    .tooltip("Desktop Task Manager")
                    .on_menu_event(move |_, event| {
                        match event.id().as_ref() {
                            "show" => {
                                if let Some(window) = show_handle.get_webview_window("main") {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                            }
                            "hide" => {
                                if let Some(window) = hide_handle.get_webview_window("main") {
                                    let _ = window.hide();
                                }
                            }
                            "reset" => {
                                // 复位：窗口回到桌面中心的初始位置（400×600）
                                if let Some(window) = reset_handle.get_webview_window("main") {
                                    let default_w: u32 = 400;
                                    let default_h: u32 = 600;
                                    let _ = window.set_size(PhysicalSize::new(default_w, default_h));
                                    if let Ok(Some(monitor)) = window.current_monitor() {
                                        let size = monitor.size();
                                        let scale = monitor.scale_factor();
                                        // 将物理像素换算为逻辑像素后再计算居中（set_position 接收逻辑像素）
                                        let x = ((size.width as f64 / scale) - default_w as f64) / 2.0;
                                        let y = ((size.height as f64 / scale) - default_h as f64) / 2.0;
                                        let _ = window.set_position(PhysicalPosition::new(x as i32, y as i32));
                                    }
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                            }
                            "quit" => {
                                quit_handle.exit(0);
                            }
                            _ => {}
                        }
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            let app = tray.app_handle();
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    })
                    .build(app)?;
            }

            // Spawn WorkerW attach after a delay
            #[cfg(windows)]
            {
                if let Some(window) = app.get_webview_window("main") {
                    if let Ok(hwnd) = window.hwnd() {
                        // HWND.0 is the raw pointer; cast to isize for Send
                        let hwnd_raw = hwnd.0 as isize;
                        let app_handle = app.handle().clone();
                        std::thread::spawn(move || {
                            std::thread::sleep(std::time::Duration::from_millis(1500));
                            unsafe { worker_w::attach(hwnd_raw); }
                            // 通知前端窗口已附加到桌面层，可恢复/保存窗口几何
                            let _ = app_handle.emit("window-attached", ());
                        });
                    }
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            // 桌面专属：关闭请求 → 隐藏到系统托盘（Android 上应用销毁由系统管理，
            // 阻止关闭会导致 Activity 无法正常退出，故仅在桌面启用）
            #[cfg(not(target_os = "android"))]
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // 只有主窗口隐藏到托盘；右键菜单等临时浮窗必须真正销毁。
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }

            // WebView 前端的 blur 在桌面层并不总是可靠；原生窗口失焦时同步销毁菜单。
            #[cfg(not(target_os = "android"))]
            if window.label() == "task-context-menu"
                && matches!(event, tauri::WindowEvent::Focused(false))
            {
                let _ = window.destroy();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
