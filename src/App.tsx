import React, { useRef, useState, useEffect, useCallback } from "react";
import { Canvas, CanvasHandle } from "./components/Canvas";
import {
  Plus,
  Terminal as TerminalIcon,
  Zap,
  Radio,
  Trash2,
  Boxes,
  Send,
  Download,
  Upload,
  Sun,
  Moon,
} from "lucide-react";

export type Language = "pt" | "en" | "es";

const TRANSLATIONS: Record<Language, Record<string, string>> = {
  pt: {
    quickActions: "Ações Rápidas",
    createTerminal: "Criar Terminal",
    presetFullstack: "Preset Fullstack",
    presetGrid: "Preset Grid 2x2",
    placeholder: "Comando em lote nos terminais...",
    clear: "Limpar Canvas",
    save: "Salvar Workspace",
    open: "Abrir Workspace",
  },
  en: {
    quickActions: "Quick Actions",
    createTerminal: "Create Terminal",
    presetFullstack: "Fullstack Preset",
    presetGrid: "Grid 2x2 Preset",
    placeholder: "Broadcast command to terminals...",
    clear: "Clear Canvas",
    save: "Save Workspace",
    open: "Open Workspace",
  },
  es: {
    quickActions: "Acciones Rápidas",
    createTerminal: "Crear Terminal",
    presetFullstack: "Preset Fullstack",
    presetGrid: "Preset Grid 2x2",
    placeholder: "Transmitir comando a los terminales...",
    clear: "Limpiar Canvas",
    save: "Guardar Workspace",
    open: "Abrir Workspace",
  },
};

export type CanvasThemeMode = "light" | "dark" | "system";

export const App: React.FC = () => {
  const canvasRef = useRef<CanvasHandle>(null);
  const [broadcastCmd, setBroadcastCmd] = useState("");
  const [themeMode, setThemeMode] = useState<CanvasThemeMode>("dark");
  const [effectiveCanvasTheme, setEffectiveCanvasTheme] = useState<"light" | "dark">("dark");
  const [language, setLanguage] = useState<Language>("pt");

  const t = TRANSLATIONS[language];

  // Escuta sistema (prefers-color-scheme) apenas para o Canvas quando em modo 'system'
  useEffect(() => {
    if (themeMode === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const updateTheme = () => {
        setEffectiveCanvasTheme(mediaQuery.matches ? "dark" : "light");
      };
      updateTheme();
      mediaQuery.addEventListener("change", updateTheme);
      return () => mediaQuery.removeEventListener("change", updateTheme);
    } else {
      setEffectiveCanvasTheme(themeMode);
    }
  }, [themeMode]);

  const toggleTheme = () => {
    setThemeMode((prev) => {
      if (prev === "dark") return "light";
      if (prev === "light") return "system";
      return "dark";
    });
  };

  const handleAddTerminal = () => {
    canvasRef.current?.addTerminalNode();
  };

  const handleLoadFullstack = () => {
    canvasRef.current?.loadPreset("fullstack");
  };

  const handleLoadGrid = () => {
    canvasRef.current?.loadPreset("grid");
  };

  const handleClearCanvas = () => {
    canvasRef.current?.clearCanvas();
  };

  const handleExportWorkspace = () => {
    canvasRef.current?.exportWorkspace();
  };

  const handleImportWorkspace = () => {
    canvasRef.current?.importWorkspace();
  };

  const handleBroadcast = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!broadcastCmd.trim()) return;
    canvasRef.current?.broadcastCommand(broadcastCmd);
    setBroadcastCmd("");
  };

  // Gerenciamento de Workspaces
  const [workspaces, setWorkspaces] = useState<{ id: string; name: string; terminalCount: number }[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>("");

  const refreshWorkspaces = useCallback(() => {
    if (canvasRef.current) {
      const items = canvasRef.current.getWorkspaces();
      const activeId = canvasRef.current.getActiveWorkspaceId();
      setWorkspaces(items);
      setActiveWorkspaceId(activeId);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(refreshWorkspaces, 300);
    return () => clearTimeout(timer);
  }, [refreshWorkspaces]);

  const handleCreateWorkspace = () => {
    canvasRef.current?.createWorkspace();
    refreshWorkspaces();
  };

  const handleSwitchWorkspace = (id: string) => {
    canvasRef.current?.switchWorkspace(id);
    refreshWorkspaces();
  };

  const handleDeleteWorkspace = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    canvasRef.current?.deleteWorkspace(id);
    refreshWorkspaces();
  };

  return (
    /* UI EXTERNA: Fixada permanentemente em Modo Escuro (#0b0c0e) */
    <div className="flex w-screen h-screen overflow-hidden bg-[#0b0c0e] text-slate-100 select-none font-sans">
      {/* Sidebar - Fixo Dark */}
      <aside className="w-56 bg-[#161b22]/95 backdrop-blur border-r border-[#30363d] flex flex-col z-20 shrink-0">
        {/* Sidebar Header Brand */}
        <div className="h-11 flex items-center px-3 space-x-2 border-b border-[#30363d]/60">
          <div className="w-6 h-6 rounded-md bg-indigo-600 flex items-center justify-center text-white shadow-sm shadow-indigo-950">
            <TerminalIcon className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-bold text-slate-100 tracking-wide">Mandante</span>

          <div className="ml-auto flex items-center space-x-1">
            <button
              onClick={handleCreateWorkspace}
              title="Novo Workspace"
              className="p-1 hover:bg-[#21262d] text-slate-300 rounded"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Sidebar Navigation: Workspaces */}
        <div className="p-2 space-y-4 flex-1 overflow-y-auto">
          {/* Workspaces */}
          <div>
            <div className="flex items-center justify-between px-2 mb-1">
              <span className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                Workspaces
              </span>
              <button
                onClick={handleCreateWorkspace}
                title="Criar novo Workspace"
                className="text-indigo-400 hover:text-indigo-300 p-0.5 rounded"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>

            <div className="space-y-0.5">
              {workspaces.map((ws) => {
                const isActive = ws.id === activeWorkspaceId;
                return (
                  <div
                    key={ws.id}
                    onClick={() => handleSwitchWorkspace(ws.id)}
                    className={`group flex items-center justify-between px-2 py-1.5 text-xs font-medium ${
                      isActive
                        ? "bg-[#21262d] text-white font-semibold border-l-2 border-indigo-500"
                        : "text-slate-400 hover:bg-[#21262d]/60"
                    } rounded-md cursor-pointer transition-all`}
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <TerminalIcon
                        className={`w-3.5 h-3.5 ${isActive ? "text-indigo-400" : "text-slate-500"}`}
                      />
                      <span className="truncate">{ws.name}</span>
                    </span>

                    <div className="flex items-center space-x-1 shrink-0">
                      <span className="text-[10px] bg-[#30363d] text-slate-300 px-1.5 py-0.2 rounded-full font-mono">
                        {ws.terminalCount}
                      </span>
                      {workspaces.length > 1 && (
                        <button
                          onClick={(e) => handleDeleteWorkspace(ws.id, e)}
                          title="Excluir Workspace"
                          className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-red-400 transition-opacity"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Ações Rápidas */}
          <div>
            <span className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase px-2">
              {t.quickActions}
            </span>
            <div className="mt-1 space-y-1">
              <button
                onClick={() => {
                  handleAddTerminal();
                  refreshWorkspaces();
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs font-medium hover:bg-[#21262d] text-slate-200 rounded-md cursor-pointer transition-colors text-left"
              >
                <span className="flex items-center gap-2">
                  <Plus className="w-3.5 h-3.5 text-indigo-400" />
                  {t.createTerminal}
                </span>
              </button>

              <button
                onClick={() => {
                  handleLoadFullstack();
                  refreshWorkspaces();
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs font-medium hover:bg-[#21262d] text-slate-200 rounded-md cursor-pointer transition-colors text-left"
              >
                <span className="flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  {t.presetFullstack}
                </span>
              </button>

              <button
                onClick={() => {
                  handleLoadGrid();
                  refreshWorkspaces();
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs font-medium hover:bg-[#21262d] text-slate-200 rounded-md cursor-pointer transition-colors text-left"
              >
                <span className="flex items-center gap-2">
                  <Boxes className="w-3.5 h-3.5 text-emerald-400" />
                  {t.presetGrid}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar Footer - Fixo Dark */}
        <div className="p-3 border-t border-[#30363d]/60 flex items-center justify-between">
          <div className="flex items-center space-x-1">
            <button
              onClick={handleExportWorkspace}
              title={t.save}
              className="p-1.5 hover:bg-[#21262d] text-slate-300 rounded"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleImportWorkspace}
              title={t.open}
              className="p-1.5 hover:bg-[#21262d] text-slate-300 rounded"
            >
              <Upload className="w-3.5 h-3.5" />
            </button>
          </div>
          <button
            onClick={handleClearCanvas}
            title={t.clear}
            className="p-1.5 hover:bg-red-950/50 text-slate-400 hover:text-red-400 rounded"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </aside>

      {/* Main Area */}
      <div className="flex-1 flex flex-col h-full relative">
        {/* Floating Top Toolbar - Fixo Dark */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center space-x-2 bg-[#161b22]/95 backdrop-blur shadow-xl border border-[#30363d] rounded-full px-3 py-1 text-xs text-slate-200">
          <form onSubmit={handleBroadcast} className="flex items-center space-x-2">
            <Radio className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
            <input
              type="text"
              value={broadcastCmd}
              onChange={(e) => setBroadcastCmd(e.target.value)}
              placeholder={t.placeholder}
              className="bg-transparent text-slate-200 placeholder-slate-500 text-xs focus:outline-none w-60 font-mono"
            />
            <button
              type="submit"
              className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-full p-1 transition-colors"
            >
              <Send className="w-3 h-3" />
            </button>
          </form>

          <div className="h-4 w-px bg-[#30363d] mx-1" />

          <button
            onClick={handleLoadFullstack}
            className="px-2 py-0.5 hover:bg-[#21262d] text-slate-300 rounded font-medium flex items-center gap-1 text-[11px]"
          >
            <Zap className="w-3 h-3 text-amber-400" />
            Fullstack
          </button>
          <button
            onClick={handleLoadGrid}
            className="px-2 py-0.5 hover:bg-[#21262d] text-slate-300 rounded font-medium flex items-center gap-1 text-[11px]"
          >
            <Boxes className="w-3 h-3 text-emerald-400" />
            Grid 2x2
          </button>

          <div className="h-4 w-px bg-[#30363d] mx-1" />

          {/* Canvas Theme Selector Button (Dark -> Light -> System) */}
          <button
            onClick={toggleTheme}
            title={`Tema do Canvas: ${themeMode.toUpperCase()} (Clique para alternar)`}
            className="px-2 py-0.5 hover:bg-[#21262d] text-slate-300 rounded font-mono text-[10px] flex items-center gap-1.5 transition-colors"
          >
            {themeMode === "dark" && <Moon className="w-3 h-3 text-indigo-400" />}
            {themeMode === "light" && <Sun className="w-3 h-3 text-amber-400" />}
            {themeMode === "system" && <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />}
            <span className="uppercase">{themeMode}</span>
          </button>
        </div>

        {/* Canvas Interativo: Única área que altera de tema (light, dark, system) */}
        <main className={`flex-1 w-full h-full relative ${effectiveCanvasTheme === "light" ? "canvas-light" : "canvas-dark"}`}>
          <Canvas ref={canvasRef} themeMode={effectiveCanvasTheme} />
        </main>
      </div>
    </div>
  );
};

export default App;
