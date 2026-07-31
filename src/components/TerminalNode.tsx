import React, { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

interface TerminalNodeProps {
  id: string;
  title?: string;
  onClose?: () => void;
}

interface PtyOutputPayload {
  id: string;
  data: String;
}

export const TerminalNode: React.FC<TerminalNodeProps> = ({ id, title, onClose }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize xterm.js instance
    const term = new Terminal({
      cursorBlink: true,
      theme: {
        background: "#0d1117",
        foreground: "#c9d1d9",
        cursor: "#58a6ff",
        selectionBackground: "#1f6feb44",
        black: "#484f58",
        red: "#ff7b72",
        green: "#3fb950",
        yellow: "#d29922",
        blue: "#58a6ff",
        magenta: "#bc8cff",
        cyan: "#39c5cf",
        white: "#b1bac4",
        brightBlack: "#6e7681",
        brightRed: "#ffa198",
        brightGreen: "#56d364",
        brightYellow: "#e3b341",
        brightBlue: "#79c0ff",
        brightMagenta: "#d2a8ff",
        brightCyan: "#56d4dd",
        brightWhite: "#f0f6fc",
      },
      fontFamily: 'Consolas, Monaco, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.2,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    let unlisten: UnlistenFn | null = null;

    // Create native PTY session in Rust backend
    const cols = term.cols || 80;
    const rows = term.rows || 24;

    invoke("create_pty", { id, cols, rows })
      .then(() => {
        // Listen to stdout events from Rust
        return listen<PtyOutputPayload>(`pty-output-${id}`, (event) => {
          if (event.payload && event.payload.data) {
            term.write(event.payload.data as string);
          }
        });
      })
      .then((unlistenFn) => {
        unlisten = unlistenFn;
      })
      .catch((err) => {
        term.write(`\r\n\x1b[31m[Error starting PTY: ${err}]\x1b[0m\r\n`);
      });

    // Send user typing from xterm to Rust PTY stdin
    const onDataDisposable = term.onData((data) => {
      invoke("write_pty", { id, data }).catch((err) => {
        console.error("Error writing to PTY:", err);
      });
    });

    // Handle container resize with debounce to prevent IPC spam on zoom/drag
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        requestAnimationFrame(() => {
          try {
            if (fitAddonRef.current && xtermRef.current) {
              fitAddonRef.current.fit();
              const newCols = xtermRef.current.cols;
              const newRows = xtermRef.current.rows;
              invoke("resize_pty", { id, cols: newCols, rows: newRows }).catch(() => {});
            }
          } catch (e) {
            // ignore fit errors when container hidden
          }
        });
      }, 60);
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      onDataDisposable.dispose();
      resizeObserver.disconnect();
      if (unlisten) unlisten();
      term.dispose();
      invoke("close_pty", { id }).catch(() => {});
    };
  }, [id]);

  return (
    <div className="flex flex-col h-full w-full bg-[#0d1117] rounded-lg border border-[#30363d] overflow-hidden shadow-2xl">
      {/* Terminal Card Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#161b22] border-b border-[#30363d] drag-handle cursor-move select-none">
        <div className="flex items-center space-x-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="text-xs font-medium text-slate-300">
            {title || `Terminal #${id.slice(0, 6)}`}
          </span>
        </div>
        {onClose && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="text-slate-400 hover:text-red-400 text-xs px-1.5 py-0.5 rounded hover:bg-slate-800 transition-colors"
          >
            ✕
          </button>
        )}
      </div>

      {/* Terminal Viewport */}
      <div className="flex-1 w-full h-full min-h-[150px] relative">
        <div ref={containerRef} className="absolute inset-0 w-full h-full" />
      </div>
    </div>
  );
};
