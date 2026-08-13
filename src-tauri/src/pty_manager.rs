use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use tokio::time::{sleep, Duration};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PtyOutputPayload {
    pub id: String,
    pub data: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PtySessionInfo {
    pub id: String,
    pub title: String,
    pub agent_type: String,
    pub cwd: Option<String>,
    pub created_at: u64,
    pub last_activity: u64,
}

pub struct PtySession {
    pub writer: Box<dyn Write + Send>,
    pub master: Box<dyn MasterPty + Send>,
    pub info: PtySessionInfo,
    pub buffer: Arc<Mutex<String>>,
}

#[derive(Clone)]
pub struct PtyManager {
    sessions: Arc<Mutex<HashMap<String, PtySession>>>,
    connections: Arc<Mutex<Vec<(String, String)>>>,
    mesh_port: Arc<Mutex<u16>>,
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            connections: Arc::new(Mutex::new(Vec::new())),
            mesh_port: Arc::new(Mutex::new(41731)),
        }
    }

    pub fn set_mesh_port(&self, port: u16) {
        if let Ok(mut p) = self.mesh_port.lock() {
            *p = port;
        }
    }

    pub fn get_mesh_port(&self) -> u16 {
        *self.mesh_port.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn set_connections(&self, new_conns: Vec<(String, String)>) {
        if let Ok(mut conns) = self.connections.lock() {
            *conns = new_conns;
        }
    }

    pub fn get_connections(&self) -> Vec<(String, String)> {
        self.connections.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }

    pub fn get_neighbors(&self, terminal_id: &str) -> Vec<String> {
        let conns = self.get_connections();
        let mut neighbors = Vec::new();
        for (a, b) in conns {
            if a == terminal_id && !neighbors.contains(&b) {
                neighbors.push(b);
            } else if b == terminal_id && !neighbors.contains(&a) {
                neighbors.push(a);
            }
        }
        neighbors
    }

    pub fn pipe_to_neighbors(&self, from_id: &str, text: &str) -> Result<Vec<String>, String> {
        let neighbors = self.get_neighbors(from_id);
        if neighbors.is_empty() {
            return Err(format!("No connected neighbor terminals found for {}", from_id));
        }

        let formatted = format!("{}\r\n", text);
        let mut sent_to = Vec::new();

        for target_id in &neighbors {
            if self.write(target_id, &formatted).is_ok() {
                sent_to.push(target_id.clone());
            }
        }

        Ok(sent_to)
    }

    pub fn spawn(
        &self,
        id: String,
        title: Option<String>,
        agent_type: Option<String>,
        cols: u16,
        rows: u16,
        cwd: Option<String>,
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

        let port = self.get_mesh_port();
        let mandante_bin = crate::cli_generator::get_mandante_dir().join("bin");

        #[cfg(target_os = "windows")]
        let mut cmd = {
            let mut cmd = CommandBuilder::new("powershell.exe");
            cmd.env("TERM", "xterm-256color");
            cmd
        };

        #[cfg(not(target_os = "windows"))]
        let mut cmd = {
            let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
            let mut cmd = CommandBuilder::new(&shell);
            if shell.ends_with("bash") || shell.ends_with("zsh") || shell.ends_with("fish") {
                cmd.arg("-l");
            }
            cmd.env("TERM", "xterm-256color");
            cmd.env("COLORTERM", "truecolor");
            cmd
        };

        // Inject Mandante Mesh environment variables & PATH
        cmd.env("MANDANTE_PORT", port.to_string());
        cmd.env("MANDANTE_TERMINAL_ID", &id);

        let current_path = std::env::var("PATH").unwrap_or_default();
        let new_path = format!("{};{}", mandante_bin.to_string_lossy(), current_path);
        cmd.env("PATH", new_path);

        if let Some(ref path) = cwd {
            let p = path.trim();
            if !p.is_empty() && std::path::Path::new(p).exists() {
                cmd.cwd(p);
            }
        }

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
        let session_buffer = Arc::new(Mutex::new(String::new()));
        let buffer_clone = Arc::clone(&session_buffer);

        let log_file_path = crate::cli_generator::get_mandante_dir()
            .join("sessions")
            .join(format!("{}.log", id));

        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);

        let info = PtySessionInfo {
            id: id.clone(),
            title: title.unwrap_or_else(|| format!("Terminal {}", id)),
            agent_type: agent_type.unwrap_or_else(|| "shell".to_string()),
            cwd: cwd.clone(),
            created_at: now,
            last_activity: now,
        };

        // Background reader thread
        std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[..n]).to_string();

                        // 1. Append to in-memory buffer
                        if let Ok(mut buf_guard) = buffer_clone.lock() {
                            buf_guard.push_str(&data);
                            // Keep buffer from growing infinitely (cap at ~150k chars)
                            if buf_guard.len() > 150_000 {
                                let drain_to = buf_guard.len() - 100_000;
                                buf_guard.drain(..drain_to);
                            }
                        }

                        // 2. Append to disk log file
                        if let Ok(mut file) = OpenOptions::new()
                            .create(true)
                            .append(true)
                            .open(&log_file_path)
                        {
                            let _ = file.write_all(data.as_bytes());
                        }

                        // 3. Emit Tauri frontend event
                        let payload = PtyOutputPayload {
                            id: session_id.clone(),
                            data,
                        };
                        let event_name = format!("pty-output-{}", session_id);
                        let _ = app_handle_clone.emit(&event_name, payload);
                    }
                    Err(_) => break,
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
                info,
                buffer: session_buffer,
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
            session.info.last_activity = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);

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
        
        // Remove disk log file
        let log_file_path = crate::cli_generator::get_mandante_dir()
            .join("sessions")
            .join(format!("{}.log", id));
        let _ = fs::remove_file(log_file_path);

        Ok(())
    }

    pub fn list_sessions(&self) -> Vec<PtySessionInfo> {
        let sessions = match self.sessions.lock() {
            Ok(s) => s,
            Err(_) => return Vec::new(),
        };

        sessions.values().map(|s| s.info.clone()).collect()
    }

    pub fn update_metadata(&self, id: &str, title: Option<String>, agent_type: Option<String>) -> Result<(), String> {
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| "Failed to acquire lock".to_string())?;

        if let Some(session) = sessions.get_mut(id) {
            if let Some(t) = title {
                session.info.title = t;
            }
            if let Some(a) = agent_type {
                session.info.agent_type = a;
            }
            Ok(())
        } else {
            Err(format!("Session {} not found", id))
        }
    }

    pub fn get_transcript(&self, id: &str, max_lines: Option<usize>, clean: bool) -> Result<(PtySessionInfo, String), String> {
        let sessions = self
            .sessions
            .lock()
            .map_err(|_| "Failed to acquire lock".to_string())?;

        let session = sessions.get(id).ok_or_else(|| format!("Session {} not found", id))?;
        let info = session.info.clone();

        let raw_buffer = session.buffer.lock().map_err(|_| "Failed to lock buffer".to_string())?.clone();

        let mut text = if clean {
            strip_ansi_codes(&raw_buffer)
        } else {
            raw_buffer
        };

        if let Some(max) = max_lines {
            let lines: Vec<&str> = text.lines().collect();
            if lines.len() > max {
                let start = lines.len() - max;
                text = lines[start..].join("\n");
            }
        }

        Ok((info, text))
    }

    pub fn broadcast(&self, data: &str) -> Result<(), String> {
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| "Failed to acquire lock".to_string())?;

        for session in sessions.values_mut() {
            let _ = session.writer.write_all(data.as_bytes());
            let _ = session.writer.flush();
        }

        Ok(())
    }

    pub fn broadcast_to_neighbors(&self, caller_id: &str, data: &str) -> Result<Vec<String>, String> {
        let neighbors = self.get_neighbors(caller_id);
        if neighbors.is_empty() {
            return Err(format!("No connected neighbor terminals found for {}", caller_id));
        }

        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| "Failed to acquire lock".to_string())?;

        let mut sent_to = Vec::new();
        for target_id in &neighbors {
            if let Some(session) = sessions.get_mut(target_id) {
                let _ = session.writer.write_all(data.as_bytes());
                let _ = session.writer.flush();
                sent_to.push(target_id.clone());
            }
        }

        Ok(sent_to)
    }

    pub async fn ask_session(&self, id: &str, prompt: &str, timeout_secs: u64) -> Result<String, String> {
        let buffer_start_len = {
            let sessions = self
                .sessions
                .lock()
                .map_err(|_| "Failed to acquire lock".to_string())?;
            let session = sessions.get(id).ok_or_else(|| format!("Session {} not found", id))?;
            session.buffer.lock().map(|b| b.len()).unwrap_or(0)
        };

        // Write prompt to PTY
        self.write(id, &format!("{}\r\n", prompt))?;

        let start_time = SystemTime::now();
        let max_duration = Duration::from_secs(timeout_secs);
        let mut last_len = buffer_start_len;
        let mut silence_counter = 0;

        loop {
            sleep(Duration::from_millis(400)).await;

            let current_buffer = {
                let sessions = match self.sessions.lock() {
                    Ok(s) => s,
                    Err(_) => break,
                };
                if let Some(session) = sessions.get(id) {
                    session.buffer.lock().map(|b| b.clone()).unwrap_or_default()
                } else {
                    break;
                }
            };

            let current_len = current_buffer.len();

            if current_len > last_len {
                // New bytes received, reset silence counter
                last_len = current_len;
                silence_counter = 0;
            } else if current_len > buffer_start_len {
                // No new bytes received since last check
                silence_counter += 1;
                // If output has stabilized (no new output for 3 cycles = ~1.2s), consider response finished!
                if silence_counter >= 3 {
                    let new_text = &current_buffer[buffer_start_len..];
                    return Ok(strip_ansi_codes(new_text).trim().to_string());
                }
            }

            if let Ok(elapsed) = start_time.elapsed() {
                if elapsed >= max_duration {
                    // Timed out, return whatever we have so far
                    if current_len > buffer_start_len {
                        let new_text = &current_buffer[buffer_start_len..];
                        return Ok(strip_ansi_codes(new_text).trim().to_string());
                    }
                    return Err(format!("Timeout waiting for response from session {}", id));
                }
            }
        }

        Err("Session closed unexpectedly".to_string())
    }
}

pub fn strip_ansi_codes(input: &str) -> String {
    let mut result = String::with_capacity(input.len());
    let mut in_escape = false;
    let mut in_osc = false;
    let mut chars = input.chars().peekable();

    while let Some(ch) = chars.next() {
        if ch == '\x1b' {
            if let Some(&next) = chars.peek() {
                if next == '[' {
                    chars.next();
                    in_escape = true;
                    continue;
                } else if next == ']' {
                    chars.next();
                    in_osc = true;
                    continue;
                }
            }
        }

        if in_escape {
            if ch.is_ascii_alphabetic() || ch == '~' {
                in_escape = false;
            }
            continue;
        }

        if in_osc {
            if ch == '\x07' || ch == '\x1b' {
                in_osc = false;
            }
            continue;
        }

        if ch == '\r' {
            continue;
        }

        result.push(ch);
    }

    result
}
