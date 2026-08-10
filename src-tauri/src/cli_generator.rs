use std::fs;
use std::path::PathBuf;

pub fn get_mandante_dir() -> PathBuf {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".to_string());
    PathBuf::from(home).join(".mandante")
}

pub fn ensure_cli_installed(port: u16) {
    let mandante_dir = get_mandante_dir();
    let bin_dir = mandante_dir.join("bin");
    let sessions_dir = mandante_dir.join("sessions");

    let _ = fs::create_dir_all(&bin_dir);
    let _ = fs::create_dir_all(&sessions_dir);

    // 1. mandante-cli.js (Node.js script)
    let node_script_content = format!(
        r#"#!/usr/bin/env node
const http = require('http');

const PORT = process.env.MANDANTE_PORT || {};
const BASE_URL = `http://127.0.0.1:${{PORT}}`;

const args = process.argv.slice(2);
const command = args[0];

function request(method, path, body = null) {{
  return new Promise((resolve, reject) => {{
    const url = new URL(path, BASE_URL);
    const options = {{
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {{
        'Content-Type': 'application/json',
      }},
    }};

    const req = http.request(options, (res) => {{
      let data = '';
      res.on('data', (chunk) => {{ data += chunk; }});
      res.on('end', () => {{
        try {{
          const parsed = JSON.parse(data);
          resolve({{ status: res.statusCode, body: parsed }});
        }} catch (e) {{
          resolve({{ status: res.statusCode, body: data }});
        }}
      }});
    }});

    req.on('error', (err) => {{
      reject(new Error(`Failed to connect to Mandante Mesh on port ${{PORT}}: ${{err.message}}`));
    }});

    if (body) {{
      req.write(JSON.stringify(body));
    }}
    req.end();
  }});
}}

async function main() {{
  if (!command || command === 'help' || command === '--help') {{
    console.log(`
Mandante Mesh CLI - Inter-Terminal Orchestrator

Usage:
  mandante list                         List active terminal sessions
  mandante read <id> [max_lines]       Read session output / transcript
  mandante send <id> "<message>"       Send input / command to terminal
  mandante ask <id> "<prompt>"         Ask prompt and wait for agent output
  mandante broadcast "<message>"       Broadcast text to all terminals
`);
    return;
  }}

  try {{
    if (command === 'list' || command === 'ls') {{
      const res = await request('GET', '/api/terminals');
      if (res.status === 200 && Array.isArray(res.body)) {{
        console.log('\n=== MANDANTE ACTIVE TERMINAL SESSIONS ===\n');
        if (res.body.length === 0) {{
          console.log('No active terminal sessions found.');
        }} else {{
          res.body.forEach((t) => {{
            console.log(`• ID: [${{t.id}}] | Title: "${{t.title}}" | Agent: [${{t.agent_type}}] | CWD: ${{t.cwd || 'N/A'}}`);
          }});
        }}
        console.log('\n');
      }} else {{
        console.log('Response:', res.body);
      }}
    }} else if (command === 'read' || command === 'cat') {{
      const id = args[1];
      if (!id) {{
        console.error('Error: Missing terminal ID. Usage: mandante read <terminal_id>');
        process.exit(1);
      }}
      const maxLines = args[2] ? parseInt(args[2], 10) : 100;
      const res = await request('GET', `/api/terminals/${{id}}/session?max_lines=${{maxLines}}`);
      if (res.status === 200 && res.body.transcript !== undefined) {{
        console.log(`\n--- TRANSCRIPT FOR TERMINAL [${{id}}] (${{res.body.title}}) ---\n`);
        console.log(res.body.transcript);
        console.log(`\n--- END TRANSCRIPT ---\n`);
      }} else {{
        console.error('Error:', res.body.error || res.body);
      }}
    }} else if (command === 'send' || command === 'write') {{
      const id = args[1];
      const text = args.slice(2).join(' ');
      if (!id || !text) {{
        console.error('Error: Missing args. Usage: mandante send <terminal_id> "<text>"');
        process.exit(1);
      }}
      const res = await request('POST', `/api/terminals/${{id}}/write`, {{ text: text + '\r\n' }});
      if (res.status === 200) {{
        console.log(`Successfully sent input to terminal [${{id}}]`);
      }} else {{
        console.error('Error:', res.body.error || res.body);
      }}
    }} else if (command === 'ask') {{
      const id = args[1];
      const prompt = args.slice(2).join(' ');
      if (!id || !prompt) {{
        console.error('Error: Missing args. Usage: mandante ask <terminal_id> "<prompt>"');
        process.exit(1);
      }}
      console.log(`Sending prompt to terminal [${{id}}] and waiting for response...`);
      const res = await request('POST', `/api/terminals/${{id}}/ask`, {{ prompt, timeout_secs: 25 }});
      if (res.status === 200 && res.body.response !== undefined) {{
        console.log(`\n=== RESPONSE FROM TERMINAL [${{id}}] ===\n`);
        console.log(res.body.response);
        console.log(`\n=== END RESPONSE ===\n`);
      }} else {{
        console.error('Error:', res.body.error || res.body);
      }}
    }} else if (command === 'broadcast') {{
      const text = args.slice(1).join(' ');
      if (!text) {{
        console.error('Error: Missing message. Usage: mandante broadcast "<message>"');
        process.exit(1);
      }}
      const res = await request('POST', '/api/broadcast', {{ text: text + '\r\n' }});
      if (res.status === 200) {{
        console.log('Successfully broadcasted message to all terminals.');
      }} else {{
        console.error('Error:', res.body.error || res.body);
      }}
    }} else {{
      console.error(`Unknown command: ${{command}}. Run 'mandante help' for usage.`);
    }}
  }} catch (err) {{
    console.error(`[Mandante Mesh Error] ${{err.message}}`);
    process.exit(1);
  }}
}}

main();
"#,
        port
    );

    let _ = fs::write(bin_dir.join("mandante-cli.js"), node_script_content);

    // 2. mandante.cmd (Windows cmd wrapper)
    let cmd_wrapper = format!(
        r#"@echo off
node "%USERPROFILE%\.mandante\bin\mandante-cli.js" %*
"#
    );
    let _ = fs::write(bin_dir.join("mandante.cmd"), cmd_wrapper);

    // 3. mandante.ps1 (PowerShell wrapper)
    let ps1_wrapper = format!(
        r#"node "$env:USERPROFILE\.mandante\bin\mandante-cli.js" @args
"#
    );
    let _ = fs::write(bin_dir.join("mandante.ps1"), ps1_wrapper);

    // 4. mandante (Unix / Git Bash shell wrapper)
    let sh_wrapper = format!(
        r#"#!/bin/sh
node "$HOME/.mandante/bin/mandante-cli.js" "$@"
"#
    );
    let _ = fs::write(bin_dir.join("mandante"), sh_wrapper);

    // Set executable permission on Unix if applicable
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(bin_dir.join("mandante"), fs::Permissions::from_mode(0o755));
    }

    // 5. Install AGY Skill for Mandante Mesh
    install_agy_skill();
}

fn install_agy_skill() {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".to_string());
    
    let skill_dir = PathBuf::from(home).join(".gemini").join("config").join("skills").join("mandante-mesh");
    let _ = fs::create_dir_all(&skill_dir);

    let skill_md = r#"---
name: mandante-mesh
description: Inter-terminal communication and multi-agent orchestration bus in Mandante. Use this skill whenever you need to check what another terminal is doing, communicate with another AI agent (OpenCode, Claude Code, etc.) or shell running in another terminal tab/window inside Mandante.
---

# Mandante Mesh - Inter-Terminal Interoperability & Communication

You are running inside **Mandante**, a multi-agent canvas and orchestrator.
Mandante provides a local IPC mesh network connecting all open terminals.

## Available CLI Commands

Use `run_command` or bash execution to run `mandante` commands:

1. **List all open terminal sessions in Mandante**:
   ```bash
   mandante list
   ```
   *Returns terminal IDs, custom titles, agent types (e.g. opencode, agy, claude, bash), and CWDs.*

2. **Read output/transcript of another terminal session**:
   ```bash
   mandante read <terminal_id>
   ```
   *Reads clean human-readable output transcript from terminal `<terminal_id>`.*

3. **Send a prompt/message to another terminal session and receive its response**:
   ```bash
   mandante ask <terminal_id> "Your prompt or instruction here"
   ```
   *Sends prompt to target terminal, waits for the agent/shell in that terminal to output response, and returns the response.*

4. **Send raw input/command to a terminal**:
   ```bash
   mandante send <terminal_id> "ls -la"
   ```

5. **Broadcast message to all open terminals**:
   ```bash
   mandante broadcast "Status update from AGY..."
   ```

## How to Handle Multi-Agent Workflow
- When asked "what is OpenCode doing in terminal 2?", run `mandante list` to find OpenCode's terminal ID, then `mandante read <id>`.
- When asked "tell OpenCode in terminal 2 to fix the function in file X", run `mandante ask <id> "Fix function foo in file X"`.
"#;

    let _ = fs::write(skill_dir.join("SKILL.md"), skill_md);
}
