import React, { useCallback, useImperativeHandle, forwardRef, useRef, useEffect } from "react";
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
    cwd?: string;
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
      cwd: "",
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
          cwd={shape.props.cwd}
          themeMode={document.querySelector(".canvas-light") ? "light" : "dark"}
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

export interface WorkspaceItem {
  id: string;
  name: string;
  terminalCount: number;
  cwd?: string;
  emoji?: string;
  color?: string;
}

export interface CanvasHandle {
  addTerminalNode: (title?: string, customX?: number, customY?: number, customCwd?: string) => void;
  loadPreset: (presetType: "fullstack" | "grid") => void;
  broadcastCommand: (command: string) => void;
  clearCanvas: () => void;
  exportWorkspace: () => void;
  importWorkspace: () => void;
  getWorkspaces: () => WorkspaceItem[];
  getActiveWorkspaceId: () => string;
  switchWorkspace: (pageId: string) => void;
  createWorkspace: (name?: string, cwd?: string, emoji?: string, color?: string) => string | undefined;
  renameWorkspace: (pageId: string, newName: string, emoji?: string, color?: string) => void;
  deleteWorkspace: (pageId: string) => void;
}

export interface CanvasProps {
  themeMode?: "dark" | "light";
}

export const Canvas = forwardRef<CanvasHandle, CanvasProps>(({ themeMode = "light" }, ref) => {
  const editorRef = useRef<Editor | null>(null);

  const handleMount = useCallback((editor: Editor) => {
    editorRef.current = editor;
    editor.user.updateUserPreferences({
      colorScheme: themeMode === "dark" ? "dark" : "light",
    });

    // Se o canvas acabou de abrir do zero (com apenas a página padrão "Page 1"), limpa a lista de páginas
    const pages = editor.getPages();
    if (pages.length === 1 && (pages[0].name === "Page 1" || pages[0].name === "Página 1")) {
      // Renomeia a primeira página padrão para solicitar um workspace válido ou limpa conforme necessário
    }
  }, [themeMode]);

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.user.updateUserPreferences({
        colorScheme: themeMode === "dark" ? "dark" : "light",
      });
    }
  }, [themeMode]);

  const addTerminalNode = useCallback(
    (title?: string, customX?: number, customY?: number, customCwd?: string) => {
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
    
    // Salva o snapshot completo das formas da página (terminais, imagens, desenhos, etc.)
    const json = JSON.stringify(shapes, null, 2);

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
            if (item.type === "terminal") {
              const id = `term-${Math.random().toString(36).substring(2, 9)}`;
              editor.createShape({
                ...item,
                id: createShapeId(),
                props: {
                  ...item.props,
                  terminalId: id,
                },
              });
            } else {
              editor.createShape(item);
            }
          });

          await message(`Workspace carregado com sucesso!\n(${items.length} itens restaurados)`, {
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
                if (item.type === "terminal") {
                  const id = `term-${Math.random().toString(36).substring(2, 9)}`;
                  editor.createShape({
                    ...item,
                    id: createShapeId(),
                    props: {
                      ...item.props,
                      terminalId: id,
                    },
                  });
                } else {
                  editor.createShape(item);
                }
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

  const pageCwdMap = useRef<Record<string, string>>({});
  const pageEmojiMap = useRef<Record<string, string>>({});
  const pageColorMap = useRef<Record<string, string>>({});

  const getWorkspaces = useCallback((): WorkspaceItem[] => {
    if (!editorRef.current) return [];
    const editor = editorRef.current;
    const pages = editor.getPages();
    return pages
      .filter((page) => {
        // Se for a página inicial vazia "Page 1" do tldraw sem nenhuma alteração, desconsidera da lista
        const isDefaultUnconfigured = (page.name === "Page 1" || page.name === "Página 1") && !pageCwdMap.current[page.id] && !pageEmojiMap.current[page.id];
        return !isDefaultUnconfigured || pages.length === 1;
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
          color: pageColorMap.current[page.id] || "indigo",
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

  const createWorkspace = useCallback((name?: string, cwd?: string, emoji?: string, color?: string) => {
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
    if (color) pageColorMap.current[targetPageId] = color;

    editor.setCurrentPage(targetPageId as any);
    return targetPageId;
  }, []);

  const renameWorkspace = useCallback((pageId: string, newName: string, emoji?: string, color?: string) => {
    if (!editorRef.current) return;
    const editor = editorRef.current;
    editor.renamePage(pageId as any, newName);
    if (emoji) pageEmojiMap.current[pageId] = emoji;
    if (color) pageColorMap.current[pageId] = color;
  }, []);

  const deleteWorkspace = useCallback((pageId: string) => {
    if (!editorRef.current) return;
    const editor = editorRef.current;
    if (editor.getPages().length > 1) {
      editor.deletePage(pageId as any);
    }
  }, []);

  useImperativeHandle(ref, () => ({
    addTerminalNode,
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
  }));

  return (
    <div className={`w-full h-full relative ${themeMode === "dark" ? "canvas-dark" : "canvas-light"}`}>
      <style>{`
        .tl-watermark, [class*="watermark"], a[href*="tldraw"],
        .tlui-layout__top,
        .tlui-layout__bottom,
        .tlui-toolbar,
        .tlui-style-panel,
        .tlui-navigation-zone,
        .tlui-help-menu,
        .tlui-menu_zone {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }
      `}</style>
      <Tldraw
        shapeUtils={customShapeUtils}
        onMount={handleMount}
        assetStore={{
          async upload(_type, file) {
            return new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = (e) => reject(e);
              reader.readAsDataURL(file);
            });
          },
          async resolve(asset) {
            return asset.props.src;
          },
        }}
      />
    </div>
  );
});

Canvas.displayName = "Canvas";
