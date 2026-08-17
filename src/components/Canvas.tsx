import React, { useCallback, useContext, useImperativeHandle, forwardRef, useRef, useEffect, useState, createContext } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save, open, message } from "@tauri-apps/plugin-dialog";
import {
  Tldraw,
  Editor,
  BaseBoxShapeUtil,
  HTMLContainer,
  TLBaseShape,
  useEditor,
  createShapeId,
  DEFAULT_EMBED_DEFINITIONS,
  RecordProps,
  T,
} from "@tldraw/tldraw";

const customEmbeds = DEFAULT_EMBED_DEFINITIONS.filter(
  (embed) => embed.type === "figma" || embed.type === "excalidraw"
);
import { TerminalNode, TerminalThemeColor } from "./TerminalNode";
import { RopeOverlay } from "./RopeOverlay";

// Context to propagate themeMode reactively into tldraw shape components
const ThemeModeContext = createContext<"dark" | "light">("light");

// Define the TLDraw custom shape interface for Terminal
export type ITerminalShape = TLBaseShape<
  "terminal",
  {
    w: number;
    h: number;
    terminalId: string;
    title: string;
    color?: TerminalThemeColor;
    bootCommand?: string;
    agentType?: string;
    cwd?: string;
  }
>;

// Custom TLDraw Shape Util
export class TerminalShapeUtil extends BaseBoxShapeUtil<ITerminalShape> {
  static override type = "terminal" as const;

  static override props: RecordProps<ITerminalShape> = {
    w: T.number,
    h: T.number,
    terminalId: T.string,
    title: T.string,
    color: T.optional(T.string) as any,
    bootCommand: T.optional(T.string),
    agentType: T.optional(T.string),
    cwd: T.optional(T.string),
  };

  override getDefaultProps(): ITerminalShape["props"] {
    return {
      w: 640,
      h: 400,
      terminalId: "default",
      title: "Terminal",
      color: "indigo",
      bootCommand: "",
      agentType: "shell",
      cwd: "",
    };
  }

  override component(shape: ITerminalShape) {
    const editor = useEditor();
    const themeMode = useContext(ThemeModeContext);

    /** Starts a manual edge/corner resize drag */
    const startResize = (
      e: React.PointerEvent,
      edges: { right?: boolean; bottom?: boolean; left?: boolean; top?: boolean }
    ) => {
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      e.preventDefault();

      // Abort any tldraw interaction FIRST, then read the settled position
      editor.cancel();

      // Read position from store AFTER cancel so we get the definitive values
      const snap = editor.getShape(shape.id) as any;
      const startClientX = e.clientX;
      const startClientY = e.clientY;
      const startW  = snap.props.w  as number;
      const startH  = snap.props.h  as number;
      const startShapeX = snap.x    as number;
      const startShapeY = snap.y    as number;

      const onMove = (mv: PointerEvent) => {
        mv.stopImmediatePropagation();
        mv.preventDefault();

        const cam = editor.getCamera();
        const dx = (mv.clientX - startClientX) / cam.z;
        const dy = (mv.clientY - startClientY) / cam.z;

        let newW = startW;
        let newH = startH;

        if (edges.right)  newW = Math.max(300, startW + dx);
        if (edges.bottom) newH = Math.max(150, startH + dy);
        if (edges.left)   newW = Math.max(300, startW - dx);
        if (edges.top)    newH = Math.max(150, startH - dy);

        // Only move the origin when resizing from left/top edge
        const update: Record<string, any> = {
          id: shape.id,
          type: "terminal",
          props: { ...snap.props, w: newW, h: newH },
        };
        if (edges.left) update.x = startShapeX + startW - newW;
        if (edges.top)  update.y = startShapeY + startH - newH;

        editor.updateShape<ITerminalShape>(update as any);
      };

      const onUp = (up: PointerEvent) => {
        up.stopImmediatePropagation();
        window.removeEventListener("pointermove", onMove, { capture: true } as any);
        window.removeEventListener("pointerup",   onUp,   { capture: true } as any);
      };

      window.addEventListener("pointermove", onMove, { capture: true });
      window.addEventListener("pointerup",   onUp,   { capture: true });
    };

    const E = 8; // edge zone thickness in px

    return (
      <HTMLContainer
        id={shape.id}
        style={{
          width: shape.props.w,
          height: shape.props.h,
          pointerEvents: "all",
          position: "relative",
        }}
      >
        <TerminalNode
          id={shape.props.terminalId}
          title={shape.props.title}
          agentType={shape.props.agentType}
          color={shape.props.color || "indigo"}
          bootCommand={shape.props.bootCommand}
          cwd={shape.props.cwd}
          themeMode={themeMode}
          onClose={() => {
            editor.deleteShapes([shape.id]);
          }}
          onColorChange={(newColor) => {
            editor.updateShape<ITerminalShape>({
              id: shape.id,
              type: "terminal",
              props: {
                ...shape.props,
                color: newColor,
              },
            });
          }}
          onTitleChange={(newTitle) => {
            editor.updateShape<ITerminalShape>({
              id: shape.id,
              type: "terminal",
              props: {
                ...shape.props,
                title: newTitle,
              },
            });
          }}
        />

        {/* ── Resize zones ─────────────────────────────────────────────── */}
        {/* Positioned above TerminalNode content; capture-phase events prevent tldraw move */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 50 }}>
          {/* Corners */}
          <div onPointerDown={e => startResize(e, { top: true, left: true })}
               style={{ position: "absolute", top: 0, left: 0, width: E + 4, height: E + 4, cursor: "nw-resize", pointerEvents: "all" }} />
          <div onPointerDown={e => startResize(e, { top: true, right: true })}
               style={{ position: "absolute", top: 0, right: 0, width: E + 4, height: E + 4, cursor: "ne-resize", pointerEvents: "all" }} />
          <div onPointerDown={e => startResize(e, { bottom: true, left: true })}
               style={{ position: "absolute", bottom: 0, left: 0, width: E + 4, height: E + 4, cursor: "sw-resize", pointerEvents: "all" }} />
          <div onPointerDown={e => startResize(e, { bottom: true, right: true })}
               style={{ position: "absolute", bottom: 0, right: 0, width: E + 4, height: E + 4, cursor: "se-resize", pointerEvents: "all" }} />
          {/* Edges */}
          <div onPointerDown={e => startResize(e, { top: true })}
               style={{ position: "absolute", top: 0, left: E + 4, right: E + 4, height: E, cursor: "n-resize", pointerEvents: "all" }} />
          <div onPointerDown={e => startResize(e, { bottom: true })}
               style={{ position: "absolute", bottom: 0, left: E + 4, right: E + 4, height: E, cursor: "s-resize", pointerEvents: "all" }} />
          <div onPointerDown={e => startResize(e, { left: true })}
               style={{ position: "absolute", left: 0, top: E + 4, bottom: E + 4, width: E, cursor: "w-resize", pointerEvents: "all" }} />
          <div onPointerDown={e => startResize(e, { right: true })}
               style={{ position: "absolute", right: 0, top: E + 4, bottom: E + 4, width: E, cursor: "e-resize", pointerEvents: "all" }} />
        </div>
      </HTMLContainer>
    );
  }

  override indicator(shape: ITerminalShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={8} ry={8} />;
  }
}

// Define the TLDraw custom shape interface for Note
export type INoteShape = TLBaseShape<
  "note" | "sticky_note",
  {
    w: number;
    h: number;
    text: string;
    color?: string;
  }
>;

// Custom TLDraw Shape Util for Notes with full 2D resizing (w, h)
export abstract class BaseNoteShapeUtil extends BaseBoxShapeUtil<INoteShape> {
  static override props: RecordProps<INoteShape> = {
    w: T.number,
    h: T.number,
    text: T.string,
    color: T.optional(T.string),
  };

  override getDefaultProps(): INoteShape["props"] {
    return {
      w: 240,
      h: 240,
      text: "",
      color: "yellow",
    };
  }

  override component(shape: INoteShape) {
    const editor = useEditor();
    const themeMode = useContext(ThemeModeContext);

    /** Starts a manual edge/corner resize drag */
    const startResize = (
      e: React.PointerEvent,
      edges: { right?: boolean; bottom?: boolean; left?: boolean; top?: boolean }
    ) => {
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      e.preventDefault();

      // Abort any tldraw interaction FIRST, then read the settled position
      editor.cancel();

      // Read position from store AFTER cancel so we get the definitive values
      const snap = editor.getShape(shape.id) as any;
      const startClientX = e.clientX;
      const startClientY = e.clientY;
      const startW = (snap.props?.w ?? 240) as number;
      const startH = (snap.props?.h ?? 240) as number;
      const startShapeX = snap.x as number;
      const startShapeY = snap.y as number;

      const onMove = (mv: PointerEvent) => {
        mv.stopImmediatePropagation();
        mv.preventDefault();

        const cam = editor.getCamera();
        const dx = (mv.clientX - startClientX) / cam.z;
        const dy = (mv.clientY - startClientY) / cam.z;

        let newW = startW;
        let newH = startH;

        if (edges.right) newW = Math.max(120, startW + dx);
        if (edges.bottom) newH = Math.max(100, startH + dy);
        if (edges.left) newW = Math.max(120, startW - dx);
        if (edges.top) newH = Math.max(100, startH - dy);

        // Only move the origin when resizing from left/top edge
        const update: Record<string, any> = {
          id: shape.id,
          type: shape.type,
          props: { ...snap.props, w: newW, h: newH },
        };
        if (edges.left) update.x = startShapeX + startW - newW;
        if (edges.top) update.y = startShapeY + startH - newH;

        editor.updateShape(update as any);
      };

      const onUp = (up: PointerEvent) => {
        up.stopImmediatePropagation();
        window.removeEventListener("pointermove", onMove, { capture: true } as any);
        window.removeEventListener("pointerup", onUp, { capture: true } as any);
      };

      window.addEventListener("pointermove", onMove, { capture: true });
      window.addEventListener("pointerup", onUp, { capture: true });
    };

    const E = 8;
    const w = shape.props?.w ?? 240;
    const h = shape.props?.h ?? 240;
    const text = shape.props?.text ?? "";
    const color = shape.props?.color ?? "yellow";

    const NOTE_THEMES: Record<string, { bg: string; border: string; text: string; header: string }> = {
      yellow: {
        bg: themeMode === "dark" ? "#2d2a15" : "#fef9c3",
        border: themeMode === "dark" ? "#713f12" : "#facc15",
        text: themeMode === "dark" ? "#fef08a" : "#713f12",
        header: themeMode === "dark" ? "#3e3818" : "#fef08a",
      },
      emerald: {
        bg: themeMode === "dark" ? "#062e20" : "#d1fae5",
        border: themeMode === "dark" ? "#065f46" : "#34d399",
        text: themeMode === "dark" ? "#a7f3d0" : "#064e3b",
        header: themeMode === "dark" ? "#0c3b2b" : "#a7f3d0",
      },
      blue: {
        bg: themeMode === "dark" ? "#0f233a" : "#dbeafe",
        border: themeMode === "dark" ? "#1e40af" : "#60a5fa",
        text: themeMode === "dark" ? "#bfdbfe" : "#1e3a8a",
        header: themeMode === "dark" ? "#142d4a" : "#bfdbfe",
      },
      rose: {
        bg: themeMode === "dark" ? "#311119" : "#ffe4e6",
        border: themeMode === "dark" ? "#881337" : "#fb7185",
        text: themeMode === "dark" ? "#fecdd3" : "#881337",
        header: themeMode === "dark" ? "#3f1621" : "#fecdd3",
      },
      purple: {
        bg: themeMode === "dark" ? "#241335" : "#f3e8ff",
        border: themeMode === "dark" ? "#581c87" : "#c084fc",
        text: themeMode === "dark" ? "#e9d5ff" : "#581c87",
        header: themeMode === "dark" ? "#321a4a" : "#e9d5ff",
      },
    };

    const currentTheme = NOTE_THEMES[color] || NOTE_THEMES.yellow;

    return (
      <HTMLContainer
        id={shape.id}
        style={{
          width: w,
          height: h,
          pointerEvents: "all",
          position: "relative",
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            backgroundColor: currentTheme.bg,
            border: `1.5px solid ${currentTheme.border}`,
            borderRadius: "12px",
            boxShadow: themeMode === "dark"
              ? "0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 4px 6px -2px rgba(0, 0, 0, 0.4)"
              : "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Note Top Bar */}
          <div
            style={{
              padding: "6px 10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderBottom: `1px solid ${currentTheme.border}44`,
              background: currentTheme.header,
              userSelect: "none",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "13px" }}>📝</span>
              <span style={{ fontSize: "11px", fontWeight: 700, color: currentTheme.text, opacity: 0.8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Nota
              </span>
            </div>

            {/* Color switcher dots & close button */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              {(["yellow", "emerald", "blue", "rose", "purple"] as const).map((c) => {
                const bgColors: Record<string, string> = {
                  yellow: "#eab308",
                  emerald: "#10b981",
                  blue: "#3b82f6",
                  rose: "#f43f5e",
                  purple: "#a855f7",
                };
                const isSelected = color === c;
                return (
                  <button
                    key={c}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      e.nativeEvent.stopImmediatePropagation();
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.nativeEvent.stopImmediatePropagation();
                      editor.updateShape({
                        id: shape.id,
                        type: shape.type,
                        props: { ...shape.props, color: c },
                      });
                    }}
                    style={{
                      width: "14px",
                      height: "14px",
                      borderRadius: "50%",
                      border: isSelected ? "2px solid #ffffff" : "1.5px solid rgba(0,0,0,0.25)",
                      outline: isSelected ? "2px solid rgba(0,0,0,0.6)" : "none",
                      background: bgColors[c],
                      cursor: "pointer",
                      padding: 0,
                      transform: isSelected ? "scale(1.15)" : "scale(1)",
                      transition: "transform 0.15s ease, border-color 0.15s ease",
                      boxShadow: isSelected ? "0 2px 4px rgba(0,0,0,0.3)" : "none",
                    }}
                    title={`Cor: ${c}`}
                  />
                );
              })}
              <button
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.nativeEvent.stopImmediatePropagation();
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  e.nativeEvent.stopImmediatePropagation();
                  editor.deleteShapes([shape.id]);
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: currentTheme.text,
                  opacity: 0.7,
                  fontSize: "13px",
                  fontWeight: "bold",
                  marginLeft: "4px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "18px",
                  height: "18px",
                  borderRadius: "4px",
                  padding: 0,
                }}
                title="Excluir Nota"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Note Content Area */}
          <textarea
            value={text}
            onChange={(e) => {
              editor.updateShape({
                id: shape.id,
                type: shape.type,
                props: { ...shape.props, text: e.target.value },
              });
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
            }}
            style={{
              flex: 1,
              width: "100%",
              padding: "10px 12px",
              background: "transparent",
              border: "none",
              outline: "none",
              resize: "none",
              color: currentTheme.text,
              fontSize: "13px",
              lineHeight: "1.5",
              fontFamily: "ui-sans-serif, system-ui, sans-serif",
            }}
          />
        </div>

        {/* ── Resize zones ─────────────────────────────────────────────── */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 50 }}>
          {/* Corners */}
          <div onPointerDown={e => startResize(e, { top: true, left: true })}
               style={{ position: "absolute", top: 0, left: 0, width: E + 4, height: E + 4, cursor: "nw-resize", pointerEvents: "all" }} />
          <div onPointerDown={e => startResize(e, { top: true, right: true })}
               style={{ position: "absolute", top: 0, right: 0, width: E + 4, height: E + 4, cursor: "ne-resize", pointerEvents: "all" }} />
          <div onPointerDown={e => startResize(e, { bottom: true, left: true })}
               style={{ position: "absolute", bottom: 0, left: 0, width: E + 4, height: E + 4, cursor: "sw-resize", pointerEvents: "all" }} />
          <div onPointerDown={e => startResize(e, { bottom: true, right: true })}
               style={{ position: "absolute", bottom: 0, right: 0, width: E + 4, height: E + 4, cursor: "se-resize", pointerEvents: "all" }} />
          {/* Edges */}
          <div onPointerDown={e => startResize(e, { top: true })}
               style={{ position: "absolute", top: 0, left: E + 4, right: E + 4, height: E, cursor: "n-resize", pointerEvents: "all" }} />
          <div onPointerDown={e => startResize(e, { bottom: true })}
               style={{ position: "absolute", bottom: 0, left: E + 4, right: E + 4, height: E, cursor: "s-resize", pointerEvents: "all" }} />
          <div onPointerDown={e => startResize(e, { left: true })}
               style={{ position: "absolute", left: 0, top: E + 4, bottom: E + 4, width: E, cursor: "w-resize", pointerEvents: "all" }} />
          <div onPointerDown={e => startResize(e, { right: true })}
               style={{ position: "absolute", right: 0, top: E + 4, bottom: E + 4, width: E, cursor: "e-resize", pointerEvents: "all" }} />
        </div>
      </HTMLContainer>
    );
  }

  override canEdit() {
    return true;
  }

  override hideRotateHandle() {
    return true;
  }

  override isAspectRatioLocked() {
    return false;
  }

  override canResize() {
    return true;
  }

  override getText(shape: INoteShape) {
    return shape.props?.text ?? "";
  }

  override indicator(shape: INoteShape) {
    const w = shape.props?.w ?? 240;
    const h = shape.props?.h ?? 240;
    return <rect width={w} height={h} rx={12} ry={12} />;
  }
}

export class NoteShapeUtil extends BaseNoteShapeUtil {
  static override type = "note" as const;
}

export class StickyNoteShapeUtil extends BaseNoteShapeUtil {
  static override type = "sticky_note" as const;
}

const customShapeUtils = [TerminalShapeUtil, NoteShapeUtil, StickyNoteShapeUtil];


export interface WorkspaceItem {
  id: string;
  name: string;
  terminalCount: number;
  cwd?: string;
  emoji?: string;
}

export interface CanvasHandle {
  addTerminalNode: (title?: string, customX?: number, customY?: number, customCwd?: string, bootCommand?: string, agentType?: string) => void;
  addNoteNode: (text?: string) => void;
  loadPreset: (presetType: "fullstack") => void;
  broadcastCommand: (command: string) => void;
  clearCanvas: () => void;
  exportWorkspace: () => void;
  importWorkspace: () => void;
  getWorkspaces: () => WorkspaceItem[];
  getActiveWorkspaceId: () => string;
  switchWorkspace: (pageId: string) => void;
  createWorkspace: (name?: string, cwd?: string, emoji?: string) => string | undefined;
  renameWorkspace: (pageId: string, newName: string, emoji?: string, cwd?: string) => void;
  deleteWorkspace: (pageId: string) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomToFit: () => void;
  resetZoom: () => void;
  getZoomLevel: () => number;
}

export interface CanvasProps {
  themeMode?: "dark" | "light" | "system";
  onThemeChange?: (mode: "dark" | "light" | "system") => void;
}

export const Canvas = forwardRef<CanvasHandle, CanvasProps>(({ themeMode = "light", onThemeChange }, ref) => {
  const editorRef = useRef<Editor | null>(null);

  const handleMount = useCallback((editor: Editor) => {
    editorRef.current = editor;
    try {
      if (editor.getEditingShapeId() === null && editor.getCurrentToolId() === "select.editing_shape") {
        editor.setCurrentTool("select.idle");
      }
    } catch (_) {}
    editor.user.updateUserPreferences({
      colorScheme: themeMode,
    });
    try {
      (editor as any).updateInstanceState({ isGridMode: true });
    } catch (_) {}
  }, [themeMode]);

  // Garante a remoção ativa do botão '>', navegação nativa e item 'Visualizar' no menu
  useEffect(() => {
    const hideNativeToggleBtn = () => {
      const selectors = [
        ".tlui-navigation-zone",
        ".tlui-page-menu",
        "[data-testid*='navigation']",
        "[data-testid*='page-menu']",
        "[class*='navigation']",
        "[class*='page-menu']",
        "button[aria-label*='page']",
        "button[aria-label*='navigation']",
        "[data-testid='main-menu.view']",
        "[data-testid*='menu.view']",
        "[data-testid*='menu-item.view']",
        "[data-testid*='preferences.theme']",
        "[data-testid*='menu.theme']",
      ];
      selectors.forEach((sel) => {
        document.querySelectorAll(sel).forEach((el) => {
          (el as HTMLElement).style.setProperty("display", "none", "important");
          (el as HTMLElement).style.setProperty("visibility", "hidden", "important");
          (el as HTMLElement).style.setProperty("opacity", "0", "important");
          (el as HTMLElement).style.setProperty("pointer-events", "none", "important");
        });
      });

      // Oculta 'Visualizar' e 'Tema' do menu nativo do tldraw
      document.querySelectorAll("button, [class*='menu__button'], [class*='item']").forEach((btn) => {
        const txt = (btn.textContent || "").trim();
        if (txt === "Visualizar" || txt === "View" || txt === "Tema" || txt === "Theme" || txt.startsWith("Tema") || txt.startsWith("Theme")) {
          const parent = btn.closest(".tlui-menu__item, [class*='menu__item']") || btn;
          (parent as HTMLElement).style.setProperty("display", "none", "important");
          (parent as HTMLElement).style.setProperty("visibility", "hidden", "important");
        }
      });
    };

    hideNativeToggleBtn();
    const observer = new MutationObserver(hideNativeToggleBtn);
    observer.observe(document.body, { childList: true, subtree: true });
    const interval = setInterval(hideNativeToggleBtn, 300);

    return () => {
      observer.disconnect();
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.user.updateUserPreferences({
        colorScheme: themeMode,
      });
    }
  }, [themeMode]);

  const addTerminalNode = useCallback(
    (title?: string, customX?: number, customY?: number, customCwd?: string, bootCommand?: string, agentType?: string) => {
      if (!editorRef.current) return;

      const editor = editorRef.current;
      const center = editor.getViewportPageBounds().center;
      const x = customX !== undefined ? customX : center.x - 320;
      const y = customY !== undefined ? customY : center.y - 200;
      const id = `term-${Math.random().toString(36).substring(2, 9)}`;

      // Tenta obter o cwd vinculado à página ativa ou usa a prop customizada
      const currentPageId = editor.getCurrentPageId();
      const cwd = customCwd !== undefined ? customCwd : (pageCwdMap.current[currentPageId] || "");

      editor.createShape({
        id: createShapeId(),
        type: "terminal",
        x,
        y,
        props: {
          w: 640,
          h: 400,
          terminalId: id,
          title: title || `Terminal (${id.slice(5)})`,
          cwd,
          bootCommand: bootCommand || "",
          agentType: agentType || "shell",
        },
      });
    },
    []
  );

  const clearCanvas = useCallback(() => {
    if (!editorRef.current) return;
    const editor = editorRef.current;
    const shapeIds = Array.from(editor.getCurrentPageShapeIds());
    if (shapeIds.length > 0) {
      editor.deleteShapes(shapeIds);
    }
  }, []);

  const exportWorkspace = useCallback(async () => {
    if (!editorRef.current) return;
    const editor = editorRef.current;
    const currentPageId = editor.getCurrentPageId();
    const shapes = editor.getCurrentPageShapes();

    let pageConnections: any[] = [];
    try {
      const saved = localStorage.getItem("mandante_connections_map");
      if (saved) {
        const map = JSON.parse(saved);
        pageConnections = map[currentPageId] || [];
      }
    } catch (_) {}

    const payload = {
      version: 1,
      shapes,
      connections: pageConnections,
    };
    
    // Salva o snapshot completo das formas e conexões da página
    const json = JSON.stringify(payload, null, 2);

    try {
      // Abre a caixa de diálogo nativa do Sistema Operacional para Escolher Pasta e Nome
      const filePath = await save({
        defaultPath: "workspace.mandante.json",
        filters: [{ name: "Mandante Workspace", extensions: ["json"] }],
      });

      if (filePath) {
        await invoke("write_text_file", { path: filePath, content: json });
        await message(`Workspace salvo com sucesso!\nLocal: ${filePath}`, {
          title: "Mandante Spatial Orchestrator",
          kind: "info",
        });
      }
    } catch (err: any) {
      console.error("Erro ao salvar workspace:", err);
      // Fallback para navegador web
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const downloadAnchor = document.createElement("a");
      downloadAnchor.href = url;
      downloadAnchor.download = "workspace.mandante.json";
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      document.body.removeChild(downloadAnchor);
      URL.revokeObjectURL(url);
    }
  }, []);

  const importWorkspace = useCallback(async () => {
    const processImportContent = (jsonContent: string): number => {
      if (!editorRef.current) return 0;
      const editor = editorRef.current;

      let items: any[] = [];
      let connections: any[] = [];

      try {
        const parsed = JSON.parse(jsonContent);
        if (Array.isArray(parsed)) {
          items = parsed;
        } else if (parsed && Array.isArray(parsed.shapes)) {
          items = parsed.shapes;
          connections = Array.isArray(parsed.connections) ? parsed.connections : [];
        }
      } catch (err) {
        console.error("Erro ao ler JSON do workspace:", err);
        return 0;
      }

      clearCanvas();
      const currentPageId = editor.getCurrentPageId();
      const shapeIdMap = new Map<string, string>();

      items.forEach((item: any) => {
        const oldId = item.id;
        const newShapeId = createShapeId();
        if (oldId) shapeIdMap.set(oldId, newShapeId);

        if (item.type === "terminal") {
          const id = `term-${Math.random().toString(36).substring(2, 9)}`;
          editor.createShape({
            ...item,
            id: newShapeId,
            props: {
              ...item.props,
              terminalId: id,
            },
          });
        } else {
          editor.createShape({
            ...item,
            id: newShapeId,
          });
        }
      });

      if (connections.length > 0) {
        const remapped = connections.map((c: any) => ({
          ...c,
          id: `rope-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          fromShapeId: shapeIdMap.get(c.fromShapeId) || c.fromShapeId,
          toShapeId: shapeIdMap.get(c.toShapeId) || c.toShapeId,
          amplitude: 55,
          phase: 0,
          settled: false,
        }));

        try {
          const saved = localStorage.getItem("mandante_connections_map");
          const map = saved ? JSON.parse(saved) : {};
          map[currentPageId] = remapped;
          localStorage.setItem("mandante_connections_map", JSON.stringify(map));
          window.dispatchEvent(new CustomEvent("mandante:connections-updated"));
        } catch (err) {
          console.error("Erro ao salvar conexões no import:", err);
        }
      } else {
        try {
          const saved = localStorage.getItem("mandante_connections_map");
          const map = saved ? JSON.parse(saved) : {};
          map[currentPageId] = [];
          localStorage.setItem("mandante_connections_map", JSON.stringify(map));
          window.dispatchEvent(new CustomEvent("mandante:connections-updated"));
        } catch (_) {}
      }

      return items.length;
    };

    try {
      // Abre a caixa de diálogo nativa do Sistema Operacional para Selecionar o Arquivo
      const selected = await open({
        multiple: false,
        filters: [{ name: "Mandante Workspace", extensions: ["json"] }],
      });

      if (selected && typeof selected === "string") {
        const jsonContent: string = await invoke("read_text_file", { path: selected });
        const restoredCount = processImportContent(jsonContent);

        if (restoredCount > 0) {
          await message(`Workspace carregado com sucesso!\n(${restoredCount} itens restaurados)`, {
            title: "Mandante Spatial Orchestrator",
            kind: "info",
          });
        }
      }
    } catch (err: any) {
      console.error("Erro ao importar workspace:", err);
      // Fallback para input web
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json";
      input.onchange = (e: any) => {
        const file = e.target.files?.[0];
        if (!file || !editorRef.current) return;
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            processImportContent(event.target?.result as string);
          } catch (e) {}
        };
        reader.readAsText(file);
      };
      input.click();
    }
  }, [clearCanvas]);

  const loadPreset = useCallback(
    (presetType: "fullstack" | "grid") => {
      if (!editorRef.current) return;
      clearCanvas();

      const editor = editorRef.current;
      const center = editor.getViewportPageBounds().center;

      if (presetType === "fullstack") {
        const items = [
          {
            title: "Backend API (Node/Go)",
            x: center.x - 1000,
            y: center.y - 200,
            color: "purple" as TerminalThemeColor,
            bootCommand: 'echo "⚡ Backend API pronto em http://localhost:4000"',
          },
          {
            title: "Frontend (Vite/React)",
            x: center.x - 320,
            y: center.y - 200,
            color: "emerald" as TerminalThemeColor,
            bootCommand: 'echo "🚀 Frontend pronto em http://localhost:5173"',
          },
          {
            title: "Database & Logs (Docker)",
            x: center.x + 360,
            y: center.y - 200,
            color: "rose" as TerminalThemeColor,
            bootCommand: 'echo "🗄️ Monitorando logs do Banco de Dados..."',
          },
        ];

        items.forEach((item) => {
          const id = `term-${Math.random().toString(36).substring(2, 9)}`;
          editor.createShape({
            id: createShapeId(),
            type: "terminal",
            x: item.x,
            y: item.y,
            props: {
              w: 640,
              h: 400,
              terminalId: id,
              title: item.title,
              color: item.color,
              bootCommand: item.bootCommand,
            },
          });
        });
      }
    },
    [clearCanvas]
  );

  const broadcastCommand = useCallback((command: string) => {
    if (!editorRef.current || !command.trim()) return;
    const editor = editorRef.current;
    const shapes = editor.getCurrentPageShapes();

    shapes.forEach((shape) => {
      if (shape.type === "terminal") {
        const termShape = shape as ITerminalShape;
        const terminalId = termShape.props.terminalId;
        if (terminalId) {
          invoke("write_pty", { id: terminalId, data: command + "\n" }).catch((err) => {
            console.error("Failed broadcast to PTY:", terminalId, err);
          });
        }
      }
    });
  }, []);

  const pageCwdMap = useRef<Record<string, string>>((() => {
    try {
      const saved = localStorage.getItem("mandante_page_cwd_map");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  })());

  const pageEmojiMap = useRef<Record<string, string>>((() => {
    try {
      const saved = localStorage.getItem("mandante_page_emoji_map");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  })());

  const saveWorkspaceMetadata = useCallback(() => {
    try {
      localStorage.setItem("mandante_page_cwd_map", JSON.stringify(pageCwdMap.current));
      localStorage.setItem("mandante_page_emoji_map", JSON.stringify(pageEmojiMap.current));
    } catch (err) {
      console.error("Erro ao salvar metadados dos workspaces:", err);
    }
  }, []);

  const getWorkspaces = useCallback((): WorkspaceItem[] => {
    if (!editorRef.current) return [];
    const editor = editorRef.current;
    const pages = editor.getPages();
    return pages
      .filter((page) => {
        // Se for a página inicial vazia "Page 1" ou "Página 1" sem CWD e sem Emoji, desconsidera da lista de workspaces do usuário
        const isDefaultUnconfigured =
          (page.name === "Page 1" || page.name === "Página 1") &&
          !pageCwdMap.current[page.id] &&
          !pageEmojiMap.current[page.id];
        return !isDefaultUnconfigured;
      })
      .map((page) => {
        const pageShapeIds = editor.getPageShapeIds(page.id);
        let terminalCount = 0;
        pageShapeIds.forEach((id) => {
          const shape = editor.getShape(id);
          if (shape && shape.type === "terminal") {
            terminalCount++;
          }
        });

        return {
          id: page.id,
          name: page.name,
          terminalCount,
          cwd: pageCwdMap.current[page.id] || "",
          emoji: pageEmojiMap.current[page.id] || "📁",
        };
      });
  }, []);

  const getActiveWorkspaceId = useCallback((): string => {
    if (!editorRef.current) return "";
    return editorRef.current.getCurrentPageId();
  }, []);

  const switchWorkspace = useCallback((pageId: string) => {
    if (!editorRef.current) return;
    editorRef.current.setCurrentPage(pageId as any);
  }, []);

  const createWorkspace = useCallback((name?: string, cwd?: string, emoji?: string) => {
    if (!editorRef.current) return;
    const editor = editorRef.current;
    const pages = editor.getPages();

    // Se só existe 1 página e é a página inicial vazia e sem configuração "Page 1", reaproveita ela
    const defaultPage = pages.find((p) => (p.name === "Page 1" || p.name === "Página 1") && !pageCwdMap.current[p.id] && !pageEmojiMap.current[p.id]);

    let targetPageId: string;
    if (defaultPage) {
      editor.renamePage(defaultPage.id as any, name || "Novo Workspace");
      targetPageId = defaultPage.id;
    } else {
      const count = pages.length + 1;
      editor.createPage({ name: name || `Workspace ${count}` });
      targetPageId = editor.getCurrentPageId();
    }

    if (cwd) pageCwdMap.current[targetPageId] = cwd;
    if (emoji) pageEmojiMap.current[targetPageId] = emoji;

    saveWorkspaceMetadata();
    editor.setCurrentPage(targetPageId as any);
    return targetPageId;
  }, [saveWorkspaceMetadata]);

  const renameWorkspace = useCallback((pageId: string, newName: string, emoji?: string, cwd?: string) => {
    if (!editorRef.current) return;
    const editor = editorRef.current;
    editor.renamePage(pageId as any, newName);
    if (emoji) pageEmojiMap.current[pageId] = emoji;
    if (cwd !== undefined) pageCwdMap.current[pageId] = cwd;
    saveWorkspaceMetadata();
  }, [saveWorkspaceMetadata]);

  const deleteWorkspace = useCallback((pageId: string) => {
    if (!editorRef.current) return;
    const editor = editorRef.current;
    delete pageCwdMap.current[pageId];
    delete pageEmojiMap.current[pageId];

    try {
      const saved = localStorage.getItem("mandante_connections_map");
      if (saved) {
        const map = JSON.parse(saved);
        delete map[pageId];
        localStorage.setItem("mandante_connections_map", JSON.stringify(map));
        window.dispatchEvent(new CustomEvent("mandante:connections-updated"));
      }
    } catch (_) {}

    if (editor.getPages().length > 1) {
      saveWorkspaceMetadata();
      editor.deletePage(pageId as any);
    } else {
      // Se for o único workspace existente, limpa seu conteúdo e reseta para a página inicial padrão unconfigured
      const shapeIds = editor.getPageShapeIds(pageId as any);
      if (shapeIds.size > 0) {
        editor.deleteShapes(Array.from(shapeIds));
      }
      editor.renamePage(pageId as any, "Page 1");
      saveWorkspaceMetadata();
    }
  }, [saveWorkspaceMetadata]);

  const getFocalPoint = useCallback((editor: Editor) => {
    // 1. Se houver elementos selecionados, foca no centro da seleção
    const selectionBounds = editor.getSelectionPageBounds();
    if (selectionBounds && selectionBounds.width > 0) {
      return editor.pageToScreen({
        x: selectionBounds.x + selectionBounds.width / 2,
        y: selectionBounds.y + selectionBounds.height / 2,
      });
    }

    // 2. Se houver qualquer conteúdo/terminal no canvas, foca no centro do conteúdo
    const pageBounds = editor.getCurrentPageBounds();
    if (pageBounds && pageBounds.width > 0 && pageBounds.height > 0) {
      return editor.pageToScreen({
        x: pageBounds.x + pageBounds.width / 2,
        y: pageBounds.y + pageBounds.height / 2,
      });
    }

    // 3. Posição do cursor do mouse se ele estiver dentro do viewport
    const mousePoint = editor.inputs.currentScreenPoint;
    if (mousePoint && mousePoint.x > 0 && mousePoint.y > 0) {
      return mousePoint;
    }

    // 4. Centro da tela
    return editor.getViewportScreenCenter();
  }, []);

  const zoomIn = useCallback(() => {
    if (!editorRef.current) return;
    const editor = editorRef.current;
    const currentZoom = editor.getZoomLevel();
    const newZoom = Math.min(5, Math.round((currentZoom + 0.10) * 100) / 100);
    const center = getFocalPoint(editor);
    const pointInPage = editor.screenToPage(center);
    const newCameraX = (center.x / newZoom) - pointInPage.x;
    const newCameraY = (center.y / newZoom) - pointInPage.y;
    editor.setCamera({ x: newCameraX, y: newCameraY, z: newZoom }, { animation: { duration: 100 } });
  }, [getFocalPoint]);

  const zoomOut = useCallback(() => {
    if (!editorRef.current) return;
    const editor = editorRef.current;
    const currentZoom = editor.getZoomLevel();
    const newZoom = Math.max(0.1, Math.round((currentZoom - 0.10) * 100) / 100);
    const center = getFocalPoint(editor);
    const pointInPage = editor.screenToPage(center);
    const newCameraX = (center.x / newZoom) - pointInPage.x;
    const newCameraY = (center.y / newZoom) - pointInPage.y;
    editor.setCamera({ x: newCameraX, y: newCameraY, z: newZoom }, { animation: { duration: 100 } });
  }, [getFocalPoint]);

  const zoomToFit = useCallback(() => {
    if (!editorRef.current) return;
    editorRef.current.zoomToFit();
  }, []);

  const resetZoom = useCallback(() => {
    if (!editorRef.current) return;
    editorRef.current.resetZoom();
  }, []);

  const getZoomLevel = useCallback(() => {
    if (!editorRef.current) return 1;
    return editorRef.current.getZoomLevel();
  }, []);

  const addNoteNode = useCallback((text?: string) => {
    if (!editorRef.current) return;
    const editor = editorRef.current;
    const center = editor.getViewportPageBounds().center;
    editor.createShape({
      id: createShapeId(),
      type: "note",
      x: center.x - 120,
      y: center.y - 120,
      props: {
        w: 240,
        h: 240,
        color: "yellow",
        text: text || "",
      },
    });
  }, []);

  useImperativeHandle(ref, () => ({
    addTerminalNode,
    addNoteNode,
    loadPreset,
    broadcastCommand,
    clearCanvas,
    exportWorkspace,
    importWorkspace,
    getWorkspaces,
    getActiveWorkspaceId,
    switchWorkspace,
    createWorkspace,
    renameWorkspace,
    deleteWorkspace,
    zoomIn,
    zoomOut,
    zoomToFit,
    resetZoom,
    getZoomLevel,
  }));

  return (
    <ThemeModeContext.Provider value={themeMode === "dark" ? "dark" : "light"}>
    <div className={`w-full h-full relative ${themeMode === "dark" ? "canvas-dark" : "canvas-light"}`}>
      <style>{`
        .tl-watermark, [class*="watermark"], a[href*="tldraw"] {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }

        /* Oculta 100% do menu e botões nativos do tldraw no canto inferior esquerdo (incluindo o botão '>') */
        .tlui-navigation-zone,
        .tlui-page-menu,
        [data-testid*="navigation"],
        [data-testid*="page-menu"],
        button[aria-label*="page"],
        button[aria-label*="Page"],
        button[aria-label*="navigation"],
        button[title*="page"],
        button[title*="Página"],
        [class*="navigation"],
        [class*="page-menu"],
        [class*="zoom-menu"],
        .tlui-zoom-menu {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }
      `}</style>
      <Tldraw
        persistenceKey="mandante_spatial_orchestrator_v2"
        embeds={customEmbeds}
        shapeUtils={customShapeUtils}
        onMount={handleMount}
        {...({
          assetStore: {
            async upload(_type: any, file: File) {
              return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = (e) => reject(e);
                reader.readAsDataURL(file);
              });
            },
            async resolve(asset: any) {
              return asset.props.src;
            },
          },
        } as any)}
      />
      <RopeOverlay editorRef={editorRef} />
    </div>
    </ThemeModeContext.Provider>
  );
});

Canvas.displayName = "Canvas";
