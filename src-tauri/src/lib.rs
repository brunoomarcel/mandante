pub mod cli_generator;
pub mod mesh_server;
pub mod pty_manager;

use mesh_server::MeshServer;
use pty_manager::PtyManager;
use serde_json::json;
use tauri::{AppHandle, State};

#[tauri::command]
fn create_pty(
    id: String,
    title: Option<String>,
    agent_type: Option<String>,
    cols: u16,
    rows: u16,
    cwd: Option<String>,
    state: State<'_, PtyManager>,
    app_handle: AppHandle,
) -> Result<(), String> {
    state.spawn(id, title, agent_type, cols, rows, cwd, app_handle)
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

#[tauri::command]
fn get_mesh_status(state: State<'_, PtyManager>) -> Result<serde_json::Value, String> {
    let port = state.get_mesh_port();
    let sessions = state.list_sessions();
    Ok(json!({
        "status": "active",
        "mesh_port": port,
        "active_terminals_count": sessions.len(),
        "terminals": sessions
    }))
}

#[tauri::command]
fn get_terminal_transcript(
    id: String,
    max_lines: Option<usize>,
    state: State<'_, PtyManager>,
) -> Result<serde_json::Value, String> {
    match state.get_transcript(&id, max_lines, true) {
        Ok((info, transcript)) => Ok(json!({
            "id": info.id,
            "title": info.title,
            "agent_type": info.agent_type,
            "transcript": transcript
        })),
        Err(e) => Err(e),
    }
}

#[tauri::command]
fn update_terminal_metadata(
    id: String,
    title: Option<String>,
    agent_type: Option<String>,
    state: State<'_, PtyManager>,
) -> Result<(), String> {
    state.update_metadata(&id, title, agent_type)
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_connections(
    connections: Vec<(String, String)>,
    state: State<'_, PtyManager>,
) -> Result<(), String> {
    state.set_connections(connections);
    Ok(())
}

#[tauri::command]
fn check_agent_installed(command: String) -> bool {
    #[cfg(target_os = "windows")]
    let result = std::process::Command::new("where")
        .arg(&command)
        .output();
    #[cfg(not(target_os = "windows"))]
    let result = std::process::Command::new("which")
        .arg(&command)
        .output();

    match result {
        Ok(output) => output.status.success(),
        Err(_) => false,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let pty_manager = PtyManager::new();
    let pty_manager_for_server = pty_manager.clone();
    let pty_manager_for_cli = pty_manager.clone();

    // Start background Tokio runtime task for Mesh HTTP Server
    tauri::async_runtime::spawn(async move {
        match MeshServer::start(pty_manager_for_server, 41731).await {
            Ok(server) => {
                pty_manager_for_cli.set_mesh_port(server.port);
                cli_generator::ensure_cli_installed(server.port);
            }
            Err(e) => eprintln!("[Mandante Mesh Server Error] {}", e),
        }
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(pty_manager)
        .invoke_handler(tauri::generate_handler![
            create_pty,
            write_pty,
            resize_pty,
            close_pty,
            get_mesh_status,
            get_terminal_transcript,
            update_terminal_metadata,
            update_connections,
            write_text_file,
            read_text_file,
            check_agent_installed
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
