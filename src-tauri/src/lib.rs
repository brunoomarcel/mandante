pub mod pty_manager;

use pty_manager::PtyManager;
use tauri::{AppHandle, State};

#[tauri::command]
fn create_pty(
    id: String,
    cols: u16,
    rows: u16,
    state: State<'_, PtyManager>,
    app_handle: AppHandle,
) -> Result<(), String> {
    state.spawn(id, cols, rows, app_handle)
}

#[tauri::command]
fn write_pty(id: String, data: String, state: State<'_, PtyManager>) -> Result<(), String> {
    state.write(&id, &data)
}

#[tauri::command]
fn resize_pty(id: String, cols: u16, rows: u16, state: State<'_, PtyManager>) -> Result<(), String> {
    state.resize(&id, cols, rows)
}

#[tauri::command]
fn close_pty(id: String, state: State<'_, PtyManager>) -> Result<(), String> {
    state.close(&id)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let pty_manager = PtyManager::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(pty_manager)
        .invoke_handler(tauri::generate_handler![
            create_pty,
            write_pty,
            resize_pty,
            close_pty
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
