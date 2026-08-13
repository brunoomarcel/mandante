# Mandante Mesh - Inter-Terminal Communication & Visual Rope Rules

You are running inside **Mandante**, a multi-agent canvas and orchestrator.
Mandante provides a local IPC mesh network connecting terminals visualised on the canvas.

## 🔌 Visual Connection Rules (Cordinhas)
- You can **ONLY** see and communicate with terminals that are **physically connected to your terminal shape via a rope connection (cordinha)** on the canvas.
- If `mandante list` returns no active terminals, inform the user: *"Nenhum terminal está conectado visualmente a este nó via cordinha no canvas."*

## Available CLI Commands

Use `run_command` or bash execution to run `mandante` commands:

1. **List connected terminal sessions**:
   ```bash
   mandante list
   ```
   *Returns connected terminal IDs, custom titles, agent types (e.g. opencode, agy, claude, bash), and CWDs.*

2. **Read output/transcript of a connected terminal session**:
   ```bash
   mandante read <terminal_id>
   ```
   *Reads clean human-readable output transcript from connected terminal `<terminal_id>`.*

3. **Send a prompt/message to a connected terminal session**:
   ```bash
   mandante ask <terminal_id> "Your prompt or instruction here"
   ```
   *Sends prompt to connected target terminal, waits for the agent/shell in that terminal to output response, and returns the response.*

4. **Send raw input/command to a connected terminal**:
   ```bash
   mandante send <terminal_id> "ls -la"
   ```

5. **Broadcast message to all connected neighbor terminals**:
   ```bash
   mandante broadcast "Status update..."
   ```

## How to Handle Multi-Agent Workflow
- When asked "what is OpenCode doing in terminal 2?", run `mandante list` to find OpenCode's terminal ID, then `mandante read <id>`.
- When asked "tell OpenCode in terminal 2 to fix the function in file X", run `mandante ask <id> "Fix function foo in file X"`.
