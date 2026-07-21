use tauri::Manager;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

#[cfg(windows)]
mod worker_w {
    use windows::Win32::Foundation::{BOOL, HWND, LPARAM, WPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, FindWindowW, FindWindowExW, GetClassNameW,
        SendMessageTimeoutW, SetParent, SetWindowPos,
        HWND_BOTTOM, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
        SMTO_NORMAL,
    };
    use windows::core::PCWSTR;

    /// 未文档化的 Windows 消息，用于让 Progman 创建 WorkerW
    const WM_SPAWN_WORKER: u32 = 0x052C;

    /// 将窗口附加到 WorkerW（桌面层），使其显示在桌面图标下方
    pub fn attach_to_desktop(window_hwnd: isize) {
        unsafe {
            let hwnd = HWND(window_hwnd as _);

            // 1. 找到 Progman 窗口（桌面管理器）
            let progman_class: Vec<u16> = "Progman\0".encode_utf16().collect();
            let Ok(progman) = FindWindowW(PCWSTR(progman_class.as_ptr()), PCWSTR::null()) else {
                log::error!("Failed to find Progman window");
                return;
            };

            // 2. 发送消息让 Progman 创建 WorkerW
            let _ = SendMessageTimeoutW(
                progman,
                WM_SPAWN_WORKER,
                WPARAM(0),
                LPARAM(0),
                SMTO_NORMAL,
                1000,
                None,
            );

            // 3. 枚举顶层窗口，找到 WorkerW
            let mut worker_w: Option<HWND> = None;
            let _ = EnumWindows(
                Some(enum_proc),
                LPARAM(&mut worker_w as *mut _ as isize),
            );

            if let Some(worker) = worker_w {
                // 4. 将窗口设置为 WorkerW 的子窗口
                match SetParent(hwnd, worker) {
                    Ok(_) => {
                        // 5. 确保窗口在底层
                        let _ = SetWindowPos(
                            hwnd,
                            HWND_BOTTOM,
                            0, 0, 0, 0,
                            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
                        );
                        log::info!("Window attached to WorkerW");
                    }
                    Err(e) => {
                        log::error!("Failed to set parent to WorkerW: {}", e);
                    }
                }
            } else {
                log::warn!("WorkerW window not found, desktop layer attachment skipped");
            }
        }
    }

    /// 从 WorkerW 分离窗口
    pub fn detach_from_desktop(window_hwnd: isize) {
        unsafe {
            let hwnd = HWND(window_hwnd as _);
            let _ = SetParent(hwnd, None);
        }
    }

    unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let worker_w_ptr = lparam.0 as *mut Option<HWND>;
        if worker_w_ptr.is_null() {
            return BOOL(1);
        }

        // 获取窗口类名
        let mut class_name = [0u16; 256];
        let len = GetClassNameW(hwnd, &mut class_name);
        let class_name_str = String::from_utf16_lossy(&class_name[..len as usize]);

        if class_name_str == "WorkerW" {
            // 检查是否是正确的 WorkerW（没有 SHELLDLL_DefView 子窗口的那个）
            let shell_class: Vec<u16> = "SHELLDLL_DefView\0".encode_utf16().collect();
            let shell = FindWindowExW(
                hwnd,
                None,
                PCWSTR(shell_class.as_ptr()),
                PCWSTR::null(),
            );

            if shell.is_err() {
                // 这个 WorkerW 没有 SHELLDLL_DefView 子窗口，它就是目标
                *worker_w_ptr = Some(hwnd);
                return BOOL(0); // 停止枚举
            }
        }

        BOOL(1) // 继续枚举
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // 日志插件（仅 debug 模式）
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // 创建系统托盘菜单
            let show_item = MenuItem::with_id(app, "show", "显示", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            // 创建系统托盘
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => {
                            if let Some(window) = app.get_webview_window("main") {
                                #[cfg(windows)]
                                {
                                    let hwnd = window.hwnd().unwrap().0 as isize;
                                    worker_w::detach_from_desktop(hwnd);
                                }
                                let _ = window.hide();
                            }
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            // WorkerW 桌面层集成 + 窗口关闭隐藏
            if let Some(window) = app.get_webview_window("main") {
                #[cfg(windows)]
                {
                    // 将窗口附加到 WorkerW 桌面层
                    if let Ok(hwnd) = window.hwnd() {
                        worker_w::attach_to_desktop(hwnd.0 as isize);
                        log::info!("Window attached to WorkerW desktop layer");
                    }
                }

                // 监听窗口关闭请求 - 关闭即隐藏到托盘
                let window_clone = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        // 隐藏窗口而不是关闭
                        let _ = window_clone.hide();
                        // 阻止默认关闭行为
                        api.prevent_close();
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}