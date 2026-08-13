use crate::pty_manager::PtyManager;
use serde_json::json;
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

pub struct MeshServer {
    pub port: u16,
}

impl MeshServer {
    pub async fn start(pty_manager: PtyManager, preferred_port: u16) -> Result<Self, String> {
        let mut port = preferred_port;
        let mut listener = None;

        // Try ports starting from preferred_port up to preferred_port + 10
        for p in preferred_port..=(preferred_port + 10) {
            match TcpListener::bind(format!("127.0.0.1:{}", p)).await {
                Ok(l) => {
                    port = p;
                    listener = Some(l);
                    break;
                }
                Err(_) => continue,
            }
        }

        let listener = listener.ok_or_else(|| "Failed to bind to any port for Mandante Mesh Server".to_string())?;
        println!("[Mandante Mesh] HTTP IPC Server started on http://127.0.0.1:{}", port);

        let pty_manager = Arc::new(pty_manager);

        tokio::spawn(async move {
            loop {
                match listener.accept().await {
                    Ok((mut socket, _)) => {
                        let pm = Arc::clone(&pty_manager);
                        tokio::spawn(async move {
                            let mut buffer = [0u8; 16384];
                            match socket.read(&mut buffer).await {
                                Ok(n) if n > 0 => {
                                    let request = String::from_utf8_lossy(&buffer[..n]);
                                    let response = handle_request(&request, &pm).await;
                                    let _ = socket.write_all(response.as_bytes()).await;
                                    let _ = socket.flush().await;
                                }
                                _ => {}
                            }
                        });
                    }
                    Err(e) => {
                        eprintln!("[Mandante Mesh Error] Accept error: {}", e);
                    }
                }
            }
        });

        Ok(Self { port })
    }
}

async fn handle_request(raw_req: &str, pm: &PtyManager) -> String {
    let mut lines = raw_req.lines();
    let first_line = match lines.next() {
        Some(l) => l,
        None => return build_response(400, "Bad Request", &json!({"error": "Empty request"})),
    };

    let parts: Vec<&str> = first_line.split_whitespace().collect();
    if parts.len() < 2 {
        return build_response(400, "Bad Request", &json!({"error": "Invalid request line"}));
    }

    let method = parts[0];
    let full_path = parts[1];

    let path_and_query: Vec<&str> = full_path.split('?').collect();
    let path = path_and_query[0];
    let query_str = path_and_query.get(1).copied().unwrap_or("");

    let caller_id = get_header(raw_req, "X-Mandante-Terminal-ID");

    // Parse body for POST requests
    let body = if method == "POST" {
        if let Some(pos) = raw_req.find("\r\n\r\n") {
            &raw_req[pos + 4..]
        } else if let Some(pos) = raw_req.find("\n\n") {
            &raw_req[pos + 2..]
        } else {
            ""
        }
    } else {
        ""
    };

    // Routing
    if method == "OPTIONS" {
        return build_cors_options_response();
    }

    if method == "GET" && (path == "/" || path == "/api/health") {
        return build_response(
            200,
            "OK",
            &json!({
                "status": "ok",
                "service": "Mandante Mesh Server",
                "version": "1.0.0"
            }),
        );
    }

    if method == "GET" && path == "/api/terminals" {
        let sessions = pm.list_sessions();
        if let Some(ref caller) = caller_id {
            let neighbors = pm.get_neighbors(caller);
            let filtered: Vec<_> = sessions.into_iter().filter(|s| neighbors.contains(&s.id)).collect();
            return build_response(200, "OK", &json!(filtered));
        }
        return build_response(200, "OK", &json!(sessions));
    }

    if method == "GET" && path.starts_with("/api/terminals/") && path.ends_with("/session") {
        let parts: Vec<&str> = path.split('/').collect();
        if parts.len() == 5 {
            let id = parts[3];
            if let Some(ref caller) = caller_id {
                if caller != id && !pm.get_neighbors(caller).contains(&id.to_string()) {
                    return build_response(
                        403,
                        "Forbidden",
                        &json!({
                            "error": format!("Terminal [{}] não está conectado visualmente via cordinha ao terminal [{}]", caller, id)
                        }),
                    );
                }
            }
            let max_lines = parse_query_param(query_str, "max_lines").and_then(|v| v.parse::<usize>().ok());
            match pm.get_transcript(id, max_lines, true) {
                Ok((metadata, transcript)) => {
                    return build_response(
                        200,
                        "OK",
                        &json!({
                            "id": metadata.id,
                            "title": metadata.title,
                            "agent_type": metadata.agent_type,
                            "cwd": metadata.cwd,
                            "transcript": transcript
                        }),
                    );
                }
                Err(e) => return build_response(404, "Not Found", &json!({"error": e})),
            }
        }
    }

    if method == "POST" && path.starts_with("/api/terminals/") && path.ends_with("/write") {
        let parts: Vec<&str> = path.split('/').collect();
        if parts.len() == 5 {
            let id = parts[3];
            if let Some(ref caller) = caller_id {
                if caller != id && !pm.get_neighbors(caller).contains(&id.to_string()) {
                    return build_response(
                        403,
                        "Forbidden",
                        &json!({
                            "error": format!("Terminal [{}] não está conectado visualmente via cordinha ao terminal [{}]", caller, id)
                        }),
                    );
                }
            }
            if let Some(json_body) = parse_json_body(body) {
                let text = json_body
                    .get("text")
                    .or_else(|| json_body.get("data"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                if !text.is_empty() {
                    match pm.write(id, text) {
                        Ok(_) => return build_response(200, "OK", &json!({"status": "written", "id": id})),
                        Err(e) => return build_response(404, "Not Found", &json!({"error": e})),
                    }
                }
            }
            return build_response(400, "Bad Request", &json!({"error": "Missing 'text' or 'data' field"}));
        }
    }

    if method == "POST" && path.starts_with("/api/terminals/") && path.ends_with("/ask") {
        let parts: Vec<&str> = path.split('/').collect();
        if parts.len() == 5 {
            let id = parts[3];
            if let Some(ref caller) = caller_id {
                if caller != id && !pm.get_neighbors(caller).contains(&id.to_string()) {
                    return build_response(
                        403,
                        "Forbidden",
                        &json!({
                            "error": format!("Terminal [{}] não está conectado visualmente via cordinha ao terminal [{}]", caller, id)
                        }),
                    );
                }
            }
            if let Some(json_body) = parse_json_body(body) {
                let prompt = json_body.get("prompt").and_then(|v| v.as_str()).unwrap_or("");
                let timeout_secs = json_body
                    .get("timeout_secs")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(20);
                if !prompt.is_empty() {
                    match pm.ask_session(id, prompt, timeout_secs).await {
                        Ok(resp) => {
                            return build_response(
                                200,
                                "OK",
                                &json!({
                                    "status": "success",
                                    "id": id,
                                    "response": resp
                                }),
                            );
                        }
                        Err(e) => return build_response(500, "Internal Server Error", &json!({"error": e})),
                    }
                }
            }
            return build_response(400, "Bad Request", &json!({"error": "Missing 'prompt' field"}));
        }
    }

    if method == "POST" && path == "/api/broadcast" {
        if let Some(json_body) = parse_json_body(body) {
            let text = json_body
                .get("text")
                .or_else(|| json_body.get("data"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if !text.is_empty() {
                let res = if let Some(ref caller) = caller_id {
                    pm.broadcast_to_neighbors(caller, text)
                        .map(|sent| json!({"status": "broadcasted", "sent_to": sent}))
                } else {
                    pm.broadcast(text).map(|_| json!({"status": "broadcasted"}))
                };
                match res {
                    Ok(payload) => return build_response(200, "OK", &payload),
                    Err(e) => return build_response(400, "Bad Request", &json!({"error": e})),
                }
            }
        }
        return build_response(400, "Bad Request", &json!({"error": "Missing 'text' field"}));
    }

    build_response(404, "Not Found", &json!({"error": "Endpoint not found"}))
}

fn parse_json_body(body: &str) -> Option<serde_json::Value> {
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(body) {
        return Some(v);
    }
    if let (Some(start), Some(end)) = (body.find('{'), body.rfind('}')) {
        if start < end {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&body[start..=end]) {
                return Some(v);
            }
        }
    }
    None
}

fn get_header(raw_req: &str, header_name: &str) -> Option<String> {
    let target = header_name.to_lowercase();
    for line in raw_req.lines() {
        if let Some((key, val)) = line.split_once(':') {
            if key.trim().to_lowercase() == target {
                let v = val.trim();
                if !v.is_empty() {
                    return Some(v.to_string());
                }
            }
        }
    }
    None
}

fn parse_query_param(query: &str, param: &str) -> Option<String> {
    for pair in query.split('&') {
        let mut kv = pair.split('=');
        if let (Some(k), Some(v)) = (kv.next(), kv.next()) {
            if k == param {
                return Some(v.to_string());
            }
        }
    }
    None
}

fn build_response(status_code: u16, status_text: &str, json_payload: &serde_json::Value) -> String {
    let body_str = json_payload.to_string();
    format!(
        "HTTP/1.1 {} {}\r\n\
         Content-Type: application/json; charset=utf-8\r\n\
         Content-Length: {}\r\n\
         Access-Control-Allow-Origin: *\r\n\
         Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n\
         Access-Control-Allow-Headers: Content-Type\r\n\
         Connection: close\r\n\
         \r\n\
         {}",
        status_code,
        status_text,
        body_str.len(),
        body_str
    )
}

fn build_cors_options_response() -> String {
    format!(
        "HTTP/1.1 204 No Content\r\n\
         Access-Control-Allow-Origin: *\r\n\
         Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n\
         Access-Control-Allow-Headers: Content-Type\r\n\
         Connection: close\r\n\
         \r\n"
    )
}
