import React, { useCallback, useImperativeHandle, forwardRef, useRef } from "react";
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
} from "@tldraw/tldraw";
import { TerminalNode, TerminalThemeColor } from "./TerminalNode";

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
  }
>;

// Custom TLDraw Shape Util
export class TerminalShapeUtil extends BaseBoxShapeUtil<ITerminalShape> {
  static override type = "terminal" as const;

  override getDefaultProps(): ITerminalShape["props"] {
    return {
      w: 640,
      h: 400,
      terminalId: "default",
      title: "Terminal",
      color: "indigo",
      bootCommand: "",
    };
  }

  override component(shape: ITerminalShape) {
    const editor = useEditor();

    return (
      <HTMLContainer
        id={shape.id}
        style={{
          width: shape.props.w,
          height: shape.props.h,
          pointerEvents: "all",
        }}
      >
        <TerminalNode
          id={shape.props.terminalId}
          title={shape.props.title}
          color={shape.props.color || "indigo"}
          bootCommand={shape.props.bootCommand}
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
      </HTMLContainer>
    );
  }

  override indicator(shape: ITerminalShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={8} ry={8} />;
  }
}

const customShapeUtils = [TerminalShapeUtil];

export interface CanvasHandle {
  addTerminalNode: (title?: string, customX?: number, customY?: number) => void;
  loadPreset: (presetType: "fullstack" | "grid") => void;
  broadcastCommand: (command: string) => void;
  clearCanvas: () => void;
  exportWorkspace: () => void;
  importWorkspace: () => void;
}

export const Canvas = forwardRef<CanvasHandle, {}>((_, ref) => {
  const editorRef = useRef<Editor | null>(null);

  const handleMount = useCallback((editor: Editor) => {
    editorRef.current = editor;
  }, []);

  const addTerminalNode = useCallback(
    (title?: string, customX?: number, customY?: number) => {
      if (!editorRef.current) return;

      const editor = editorRef.current;
      const center = editor.getViewportPageBounds().center;
      const x = customX !== undefined ? customX : center.x - 320;
      const y = customY !== undefined ? customY : center.y - 200;
      const id = `term-${Math.random().toString(36).substring(2, 9)}`;

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
    const shapes = editor.getCurrentPageShapes();
    const terminals = shapes
      .filter((s) => s.type === "terminal")
      .map((s) => {
        const ts = s as ITerminalShape;
        return {
          x: ts.x,
          y: ts.y,
          w: ts.props.w,
          h: ts.props.h,
          title: ts.props.title,
          color: ts.props.color,
          bootCommand: ts.props.bootCommand,
        };
      });

    const json = JSON.stringify(terminals, null, 2);

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
    try {
      // Abre a caixa de diálogo nativa do Sistema Operacional para Selecionar o Arquivo
      const selected = await open({
        multiple: false,
        filters: [{ name: "Mandante Workspace", extensions: ["json"] }],
      });

      if (selected && typeof selected === "string") {
        const jsonContent: string = await invoke("read_text_file", { path: selected });
        const items = JSON.parse(jsonContent);

        if (Array.isArray(items)) {
          clearCanvas();
          const editor = editorRef.current!;
          items.forEach((item: any) => {
            const id = `term-${Math.random().toString(36).substring(2, 9)}`;
            editor.createShape({
              id: createShapeId(),
              type: "terminal",
              x: item.x || 0,
              y: item.y || 0,
              props: {
                w: item.w || 640,
                h: item.h || 400,
                terminalId: id,
                title: item.title || "Terminal",
                color: item.color || "indigo",
                bootCommand: item.bootCommand || "",
              },
            });
          });

          await message(`Workspace carregado com sucesso!\n(${items.length} terminais ativos)`, {
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
            const items = JSON.parse(event.target?.result as string);
            if (Array.isArray(items)) {
              clearCanvas();
              const editor = editorRef.current!;
              items.forEach((item: any) => {
                const id = `term-${Math.random().toString(36).substring(2, 9)}`;
                editor.createShape({
                  id: createShapeId(),
                  type: "terminal",
                  x: item.x || 0,
                  y: item.y || 0,
                  props: {
                    w: item.w || 640,
                    h: item.h || 400,
                    terminalId: id,
                    title: item.title || "Terminal",
                    color: item.color || "indigo",
                    bootCommand: item.bootCommand || "",
                  },
                });
              });
            }
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
      } else if (presetType === "grid") {
        const items = [
          {
            title: "Auth Service",
            x: center.x - 660,
            y: center.y - 420,
            color: "purple" as TerminalThemeColor,
          },
          {
            title: "Payment API",
            x: center.x + 20,
            y: center.y - 420,
            color: "amber" as TerminalThemeColor,
          },
          {
            title: "Worker & Queue",
            x: center.x - 660,
            y: center.y + 20,
            color: "indigo" as TerminalThemeColor,
          },
          {
            title: "Redis Cache & PubSub",
            x: center.x + 20,
            y: center.y + 20,
            color: "rose" as TerminalThemeColor,
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

  useImperativeHandle(ref, () => ({
    addTerminalNode,
    loadPreset,
    broadcastCommand,
    clearCanvas,
    exportWorkspace,
    importWorkspace,
  }));

  return (
    <div className="w-full h-full relative">
      <Tldraw
        shapeUtils={customShapeUtils}
        onMount={handleMount}
        inferDarkMode
      />
    </div>
  );
});

Canvas.displayName = "Canvas";
