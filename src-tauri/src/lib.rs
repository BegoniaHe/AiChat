// Library entry point for Android and other platforms

mod commands;
mod storage;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::save_config,
            commands::load_config,
            commands::save_chat_history,
            commands::get_chat_history,
            commands::clear_chat_history,
            commands::save_world_info,
            commands::get_world_info,
            commands::save_character,
            commands::get_characters,
            commands::save_kv,
            commands::load_kv,
            commands::ensure_media_bundle,
            commands::http_request,
            commands::log_js,
        ])
        .setup(|_app| {
            #[cfg(all(debug_assertions, not(any(target_os = "android", target_os = "ios"))))]
            {
                use tauri::Manager;
                if let Some(window) = _app.get_webview_window("main") {
                    window.open_devtools();
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
