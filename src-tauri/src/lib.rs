mod oauth_callback;
mod secure_store;

#[cfg(target_os = "macos")]
use tauri::{AppHandle, Manager, RunEvent, WindowEvent};

#[cfg(target_os = "macos")]
fn show_main_window(app: &AppHandle) {
  if let Some(window) = app.get_webview_window("main") {
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let builder = tauri::Builder::default()
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_opener::init())
    .invoke_handler(tauri::generate_handler![
      oauth_callback::start_oauth_callback_listener,
      secure_store::secure_get,
      secure_store::secure_set,
      secure_store::secure_delete,
    ]);

  #[cfg(target_os = "macos")]
  let builder = builder.on_window_event(|window, event| {
    if window.label() == "main" {
      if let WindowEvent::CloseRequested { api, .. } = event {
        // Keep the webview alive for scheduled sync and assignment notifications.
        api.prevent_close();
        let _ = window.hide();
      }
    }
  });

  let app = builder
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while running tauri application");

  app.run(|_app_handle, _event| {
    #[cfg(target_os = "macos")]
    if let RunEvent::Reopen { .. } = _event {
      show_main_window(_app_handle);
    }
  });
}
