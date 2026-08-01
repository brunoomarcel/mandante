import React, { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

export type TerminalThemeColor = "indigo" | "emerald" | "amber" | "rose" | "purple";

interface TerminalNodeProps {
  id: string;
  title?: string;
  color?: TerminalThemeColor;
  bootCommand?: string;
  onClose?: () => void;
  onColorChange?: (color: TerminalThemeColor) => void;
  onTitleChange?: (title: string) => void;
}

interface PtyOutputPayload {
  id: string;
  data: String;
}

const COLOR_THEMES: Record<TerminalThemeColor, { dot: string; border: string; header: string }> = {
  indigo: { dot: "bg-indigo-500", border: "border-[#30363d]", header: "bg-[#161b22]" },
  emerald: { dot: "bg-emerald-500", border: "border-emerald-600/60", header: "bg-emerald-950/50" },
  amber: { dot: "bg-amber-500", border: "border-amber-600/60", header: "bg-amber-950/50" },
  rose: { dot: "bg-rose-500", border: "border-rose-600/60", header: "bg-rose-950/50" },
  purple: { dot: "bg-purple-500", border: "border-purple-600/60", header: "bg-purple-950/50" },
};

export const TerminalNode: React.FC<TerminalNodeProps> = ({
  id,
  title,
  color = "indigo",
  bootCommand,
  onClose,
  onColorChange,
  onTitleChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const lastSizeRef = useRef<{ cols: number; rows: number }>({ cols: 0, rows: 0 });

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(title || "");

  useEffect(() => {
    setTitleInput(title || "");
  }, [title]);

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

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    let unlisten: UnlistenFn | null = null;
    let isDisposed = false;

    // Wait for container layout frame before creating PTY so initial dimensions are accurate
    const initRaf = requestAnimationFrame(() => {
      if (isDisposed || !containerRef.current) return;

      fitAddon.fit();
      const cols = term.cols > 0 ? term.cols : 80;
      const rows = term.rows > 0 ? term.rows : 24;
      lastSizeRef.current = { cols, rows };

      invoke("create_pty", { id, cols, rows })
        .then(() => {
          if (isDisposed) return;
          if (bootCommand) {
            setTimeout(() => {
              invoke("write_pty", { id, data: bootCommand + "\n" }).catch(() => {});
            }, 150);
          }
          return listen<PtyOutputPayload>(`pty-output-${id}`, (event) => {
            if (event.payload && event.payload.data) {
              term.write(event.payload.data as string);
            }
          });
        })
        .then((unlistenFn) => {
          if (unlistenFn) unlisten = unlistenFn;
        })
        .catch((err) => {
          if (!isDisposed) {
            term.write(`\r\n\x1b[31m[Error starting PTY: ${err}]\x1b[0m\r\n`);
          }
        });
    });

    // Send user typing from xterm to Rust PTY stdin
    const onDataDisposable = term.onData((data) => {
      invoke("write_pty", { id, data }).catch((err) => {
        console.error("Error writing to PTY:", err);
      });
    });

    // Handle container resize with debounce, only resizing PTY when cols/rows change
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

              if (
                newCols > 0 &&
                newRows > 0 &&
                (newCols !== lastSizeRef.current.cols || newRows !== lastSizeRef.current.rows)
              ) {
                lastSizeRef.current = { cols: newCols, rows: newRows };
                invoke("resize_pty", { id, cols: newCols, rows: newRows }).catch(() => {});
              }
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
      isDisposed = true;
      cancelAnimationFrame(initRaf);
      if (resizeTimer) clearTimeout(resizeTimer);
      onDataDisposable.dispose();
      resizeObserver.disconnect();
      if (unlisten) unlisten();
      term.dispose();
      invoke("close_pty", { id }).catch(() => {});
    };
  }, [id, bootCommand]);

  const handleClear = () => {
    if (xtermRef.current) {
      xtermRef.current.clear();
    }
    invoke("write_pty", { id, data: "clear\n" }).catch(() => {});
  };

  const handleRestart = () => {
    if (xtermRef.current) {
      xtermRef.current.clear();
      xtermRef.current.write("\r\n\x1b[33m[Reiniciando sessão do terminal...]\x1b[0m\r\n");
    }
    const cols = xtermRef.current?.cols || 80;
    const rows = xtermRef.current?.rows || 24;
    invoke("close_pty", { id }).finally(() => {
      invoke("create_pty", { id, cols, rows }).catch(() => {});
    });
  };

  const theme = COLOR_THEMES[color] || COLOR_THEMES.indigo;

  const handleCycleColor = (e: React.MouseEvent) => {
    e.stopPropagation();
    const colors: TerminalThemeColor[] = ["indigo", "emerald", "amber", "rose", "purple"];
    const currentIndex = colors.indexOf(color);
    const nextColor = colors[(currentIndex + 1) % colors.length];
    if (onColorChange) {
      onColorChange(nextColor);
    }
  };

  const handleTitleSubmit = () => {
    setIsEditingTitle(false);
    if (titleInput.trim() && onTitleChange) {
      onTitleChange(titleInput.trim());
    }
  };

  return (
    <div className={`flex flex-col h-full w-full bg-[#0d1117] rounded-lg border ${theme.border} overflow-hidden shadow-2xl transition-colors duration-200`}>
      {/* Terminal Card Header */}
      <div className={`flex items-center justify-between px-3 py-1.5 ${theme.header} border-b border-[#30363d] drag-handle cursor-move select-none transition-colors duration-200`}>
        <div className="flex items-center space-x-2">
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={handleCycleColor}
            title="Clique para alterar a cor da categoria do terminal"
            className={`w-3 h-3 rounded-full ${theme.dot} animate-pulse hover:scale-125 transition-transform cursor-pointer`}
          />
          {isEditingTitle ? (
            <input
              type="text"
              value={titleInput}
              autoFocus
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onChange={(e) => setTitleInput(e.target.value)}
              onBlur={handleTitleSubmit}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") handleTitleSubmit();
                if (e.key === "Escape") setIsEditingTitle(false);
              }}
              className="bg-[#0d1117] border border-[#30363d] rounded px-1.5 py-0.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
            />
          ) : (
            <span
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setIsEditingTitle(true);
              }}
              onClick={(e) => {
                e.stopPropagation();
                setIsEditingTitle(true);
              }}
              title="Clique para renomear este terminal"
              className="text-xs font-medium text-slate-200 hover:text-indigo-300 cursor-pointer transition-colors"
            >
              {title || `Terminal #${id.slice(0, 6)}`}
            </span>
          )}
        </div>
        <div className="flex items-center space-x-1">
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setIsEditingTitle(true);
            }}
            title="Renomear Terminal"
            className="text-slate-400 hover:text-indigo-400 text-xs px-1.5 py-0.5 rounded hover:bg-slate-800 transition-colors cursor-pointer"
          >
            ✏️
          </button>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              handleClear();
            }}
            title="Limpar Terminal"
            className="text-slate-400 hover:text-indigo-400 text-xs px-1.5 py-0.5 rounded hover:bg-slate-800 transition-colors cursor-pointer"
          >
            🧹
          </button>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              handleRestart();
            }}
            title="Reiniciar Sessão"
            className="text-slate-400 hover:text-amber-400 text-xs px-1.5 py-0.5 rounded hover:bg-slate-800 transition-colors cursor-pointer"
          >
            🔄
          </button>
          {onClose && (
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              title="Fechar Terminal"
              className="text-slate-400 hover:text-red-400 text-xs px-1.5 py-0.5 rounded hover:bg-slate-800 transition-colors cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Terminal Viewport */}
      <div
        className="flex-1 w-full h-full min-h-[150px] relative"
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div ref={containerRef} className="absolute inset-0 w-full h-full" />
      </div>
    </div>
  );
};
