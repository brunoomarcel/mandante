use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

#[derive(Serialize, Deserialize, Clone)]
pub struct PtyOutputPayload {
    pub id: String,
    pub data: String,
}

pub struct PtySession {
    pub writer: Box<dyn Write + Send>,
    pub master: Box<dyn MasterPty + Send>,
}

#[derive(Clone)]
pub struct PtyManager {
    sessions: Arc<Mutex<HashMap<String, PtySession>>>,
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn spawn(
        &self,
        id: String,
        cols: u16,
        rows: u16,
        app_handle: AppHandle,
    ) -> Result<(), String> {
        let pty_system = native_pty_system();

        let size = PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        };

        let pair = pty_system
            .openpty(size)
            .map_err(|e| format!("Failed to open PTY: {}", e))?;

        #[cfg(target_os = "windows")]
        let cmd = CommandBuilder::new("powershell.exe");

        #[cfg(not(target_os = "windows"))]
        let cmd = {
            let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
            CommandBuilder::new(shell)
        };

        let _child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("Failed to spawn shell command: {}", e))?;

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("Failed to take PTY writer: {}", e))?;

        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("Failed to clone PTY reader: {}", e))?;

        let session_id = id.clone();
        let app_handle_clone = app_handle.clone();

        // Spawn a thread to read stdout asynchronously from PTY and emit to Tauri frontend
        std::thread::spawn(move || {
            let mut buf = [0u8; 2048];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break, // EOF reached
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[..n]).to_string();
                        let payload = PtyOutputPayload {
                            id: session_id.clone(),
                            data,
                        };
                        let event_name = format!("pty-output-{}", session_id);
                        if let Err(err) = app_handle_clone.emit(&event_name, payload) {
                            eprintln!("Failed to emit PTY output event: {}", err);
                        }
                    }
                    Err(e) => {
                        eprintln!("PTY read error for id {}: {}", session_id, e);
                        break;
                    }
                }
            }
        });

        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| "Failed to acquire lock on PTY sessions".to_string())?;

        sessions.insert(
            id,
            PtySession {
                writer,
                master: pair.master,
            },
        );

        Ok(())
    }

    pub fn write(&self, id: &str, data: &str) -> Result<(), String> {
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| "Failed to acquire lock on PTY sessions".to_string())?;

        if let Some(session) = sessions.get_mut(id) {
            session
                .writer
                .write_all(data.as_bytes())
                .map_err(|e| format!("Failed to write to PTY: {}", e))?;
            session
                .writer
                .flush()
                .map_err(|e| format!("Failed to flush PTY writer: {}", e))?;
            Ok(())
        } else {
            Err(format!("PTY session {} not found", id))
        }
    }

    pub fn resize(&self, id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| "Failed to acquire lock on PTY sessions".to_string())?;

        if let Some(session) = sessions.get_mut(id) {
            session
                .master
                .resize(PtySize {
                    rows,
                    cols,
                    pixel_width: 0,
                    pixel_height: 0,
                })
                .map_err(|e| format!("Failed to resize PTY: {}", e))?;
            Ok(())
        } else {
            Err(format!("PTY session {} not found", id))
        }
    }

    pub fn close(&self, id: &str) -> Result<(), String> {
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| "Failed to acquire lock on PTY sessions".to_string())?;

        sessions.remove(id);
        Ok(())
    }
}
