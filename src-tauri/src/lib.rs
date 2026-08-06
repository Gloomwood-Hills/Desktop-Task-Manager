use tauri::{
    Manager,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    menu::{MenuBuilder, MenuItemBuilder},
};

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
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .setup(|app| {
            // 确保数据库目录存在（sqlx 不会自动创建父目录，否则 Database.load 失败）
            if let Ok(data_dir) = app.path().app_data_dir() {
                let _ = std::fs::create_dir_all(data_dir.join("desktop-task-manager"));
            }

            // System tray
            let show_item = MenuItemBuilder::with_id("show", "Show").build(app)?;
            let hide_item = MenuItemBuilder::with_id("hide", "Hide").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
            let menu = MenuBuilder::new(app)
                .item(&show_item)
                .item(&hide_item)
                .item(&quit_item)
                .build()?;

            let quit_handle = app.handle().clone();
            let show_handle = app.handle().clone();
            let hide_handle = app.handle().clone();

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

            // Spawn WorkerW attach after a delay
            #[cfg(windows)]
            {
                if let Some(window) = app.get_webview_window("main") {
                    if let Ok(hwnd) = window.hwnd() {
                        // HWND.0 is the raw pointer; cast to isize for Send
                        let hwnd_raw = hwnd.0 as isize;
                        std::thread::spawn(move || {
                            std::thread::sleep(std::time::Duration::from_millis(1500));
                            unsafe { worker_w::attach(hwnd_raw); }
                        });
                    }
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}