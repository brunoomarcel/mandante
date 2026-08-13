import React, { useRef, useState, useEffect, useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import EmojiPicker, { Theme } from "emoji-picker-react";
import { Canvas, CanvasHandle } from "./components/Canvas";
import {
  GeminiLogo,
  ClaudeLogo,
  OpenAILogo,
  OpenCodeLogo,
  AiderLogo,
  EmptyTerminalLogo,
} from "./components/AgentLogos";
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
  Folder,
  Settings,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  Globe,
  Sliders,
  StickyNote,
  Search,
  Command,
  Keyboard,
} from "lucide-react";

export type Language = "pt" | "en" | "es";

const TRANSLATIONS: Record<Language, Record<string, string>> = {
  pt: {
    quickActions: "Ações Rápidas",
    createTerminal: "Novo Terminal",
    presetFullstack: "Preset Fullstack",
    placeholder: "Comando em lote nos terminais...",
    clear: "Limpar Canvas",
    save: "Salvar Workspace",
    open: "Abrir Workspace",
  },
  en: {
    quickActions: "Quick Actions",
    createTerminal: "Create Terminal",
    presetFullstack: "Fullstack Preset",
    placeholder: "Broadcast command to terminals...",
    clear: "Clear Canvas",
    save: "Save Workspace",
    open: "Open Workspace",
  },
  es: {
    quickActions: "Acciones Rápidas",
    createTerminal: "Crear Terminal",
    presetFullstack: "Preset Fullstack",
    placeholder: "Transmitir comando a los terminales...",
    clear: "Limpiar Canvas",
    save: "Guardar Workspace",
    open: "Abrir Workspace",
  },
};

export type CanvasThemeMode = "light" | "dark" | "system";

// Agent CLI registry — defines what command to check and how to install
type AgentKey = "gemini" | "claude" | "opencode" | "codex" | "aider";
const AGENT_INFO: Record<AgentKey, {
  label: string;
  checkCommand: string;
  installCommand: string;
  installNote?: string;
  skipCheck?: boolean; // skip check for agents that use npx (always available)
}> = {
  gemini: {
    label: "Gemini CLI",
    checkCommand: "gemini",
    installCommand: "npm install -g @google/gemini-cli",
    skipCheck: true, // uses npx -y, so no install needed
  },
  claude: {
    label: "Claude Code",
    checkCommand: "claude",
    installCommand: "npm install -g @anthropic-ai/claude-code",
    installNote: "Requer Node.js 18+",
  },
  opencode: {
    label: "OpenCode",
    checkCommand: "opencode",
    installCommand: "npm install -g opencode",
  },
  codex: {
    label: "Codex CLI",
    checkCommand: "codex",
    installCommand: "npm install -g @openai/codex",
    installNote: "Requer chave OPENAI_API_KEY",
  },
  aider: {
    label: "Aider AI",
    checkCommand: "aider",
    installCommand: "pip install aider-install && aider-install",
    installNote: "Requer Python 3.9+",
  },
};

export const App: React.FC = () => {
  const canvasRef = useRef<CanvasHandle>(null);
  const [broadcastCmd, setBroadcastCmd] = useState("");
  const [themeMode, setThemeMode] = useState<CanvasThemeMode>("light");
  const [effectiveCanvasTheme, setEffectiveCanvasTheme] = useState<"light" | "dark">("light");
  const [language, setLanguage] = useState<Language>("pt");

  const t = TRANSLATIONS[language];

  // Resolve e sincroniza 100% o tema do sistema para toda a aplicação (Canvas, Sidebar, Topbar, Modais)
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

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [meshInfo, setMeshInfo] = useState<{ port: number; count: number; terminals: any[] } | null>(null);
  const [isMeshModalOpen, setIsMeshModalOpen] = useState(false);

  useEffect(() => {
    const fetchMeshStatus = async () => {
      try {
        const status: any = await invoke("get_mesh_status");
        setMeshInfo({
          port: status.mesh_port,
          count: status.active_terminals_count,
          terminals: status.terminals || [],
        });
      } catch {
        // fallback
      }
    };
    fetchMeshStatus();
    const timer = setInterval(fetchMeshStatus, 3000);
    return () => clearInterval(timer);
  }, []);

  const toggleTheme = () => {
    setThemeMode((prev) => {
      if (prev === "dark") return "light";
      if (prev === "light") return "system";
      return "dark";
    });
  };

  const [zoomPercent, setZoomPercent] = useState(100);

  const updateZoomState = useCallback(() => {
    if (canvasRef.current) {
      const level = canvasRef.current.getZoomLevel();
      setZoomPercent(Math.round(level * 100));
    }
  }, []);

  const handleZoomIn = () => {
    canvasRef.current?.zoomIn();
    setTimeout(updateZoomState, 120);
  };

  const handleZoomOut = () => {
    canvasRef.current?.zoomOut();
    setTimeout(updateZoomState, 120);
  };

  const handleZoomToFit = () => {
    canvasRef.current?.zoomToFit();
    setTimeout(updateZoomState, 120);
  };

  const handleResetZoom = () => {
    canvasRef.current?.resetZoom();
    setTimeout(updateZoomState, 120);
  };

  useEffect(() => {
    const timer = setInterval(updateZoomState, 400);
    return () => clearInterval(timer);
  }, [updateZoomState]);

  // Atalhos Globais de Teclado para Zoom (+ / -) em passos de 10%
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable ||
          target.closest(".xterm") ||
          target.closest("input") ||
          target.closest("textarea"))
      ) {
        return;
      }

      if (e.key === "+" || e.key === "=" || e.code === "NumpadAdd") {
        e.preventDefault();
        canvasRef.current?.zoomIn();
        setTimeout(updateZoomState, 120);
      } else if (e.key === "-" || e.code === "NumpadSubtract") {
        e.preventDefault();
        canvasRef.current?.zoomOut();
        setTimeout(updateZoomState, 120);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [updateZoomState]);

  const [isTerminalPickerOpen, setIsTerminalPickerOpen] = useState(false);
  const [installModal, setInstallModal] = useState<{
    agentKey: AgentKey;
    label: string;
    installCommand: string;
    installNote?: string;
  } | null>(null);
  const [installCopied, setInstallCopied] = useState(false);

  const handleAddTerminalClick = () => {
    // Se não houver nenhum workspace criado/configurado pelo usuário, obriga a abrir o modal de workspace primeiro
    const userWorkspaces = workspaces.filter((ws: any) => !((ws.name === "Page 1" || ws.name === "Página 1") && !ws.cwd));
    if (userWorkspaces.length === 0) {
      handleOpenModal();
      return;
    }
    setIsTerminalPickerOpen(true);
  };

  const handleSelectTerminalType = async (type: "empty" | AgentKey) => {
    setIsTerminalPickerOpen(false);

    if (type === "empty") {
      canvasRef.current?.addTerminalNode();
      refreshWorkspaces();
      return;
    }

    const info = AGENT_INFO[type];

    // Gemini uses npx -y so it never needs a local install check
    if (!info.skipCheck) {
      try {
        const installed = await invoke<boolean>("check_agent_installed", {
          command: info.checkCommand,
        });
        if (!installed) {
          setInstallModal({ agentKey: type, ...info });
          return;
        }
      } catch {
        // If the check itself fails, just proceed normally
      }
    }

    // CLI is available — create terminal
    _createAgentTerminal(type);
  };

  /** Actually create the terminal node for the given agent type */
  const _createAgentTerminal = (type: AgentKey | "empty") => {
    if (type === "gemini") {
      canvasRef.current?.addTerminalNode("♊ Gemini Agent", undefined, undefined, undefined, "npx -y @google/gemini-cli", "gemini");
    } else if (type === "claude") {
      canvasRef.current?.addTerminalNode("🧠 Claude Code", undefined, undefined, undefined, "claude", "claude");
    } else if (type === "opencode") {
      canvasRef.current?.addTerminalNode("🌐 OpenCode Agent", undefined, undefined, undefined, "opencode", "opencode");
    } else if (type === "codex") {
      canvasRef.current?.addTerminalNode("💻 Codex CLI", undefined, undefined, undefined, "codex", "codex");
    } else if (type === "aider") {
      canvasRef.current?.addTerminalNode("⚡ Aider AI", undefined, undefined, undefined, "aider", "aider");
    }
    refreshWorkspaces();
  };

  const handleLoadFullstack = () => {
    canvasRef.current?.loadPreset("fullstack");
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
  const [workspaces, setWorkspaces] = useState<{ id: string; name: string; terminalCount: number; cwd?: string }[]>([]);
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
    const timer = setTimeout(() => {
      refreshWorkspaces();
    }, 400);
    return () => clearTimeout(timer);
  }, [refreshWorkspaces]);

  // Modal de Workspace (Criar / Editar)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWsId, setEditingWsId] = useState<string | null>(null);
  const [newWsName, setNewWsName] = useState("");
  const [newWsCwd, setNewWsCwd] = useState("");
  const [newWsEmoji, setNewWsEmoji] = useState("⚡");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const EMOJI_OPTIONS = ["⚡", "♊", "🧠", "🌐", "💻", "🗄️", "🛠️", "🎯", "🔥", "⚙️", "🚀", "📦", "🤖", "💬", "📂", "🎨"];

  const handleOpenModal = () => {
    setEditingWsId(null);
    setNewWsName(`Workspace ${(workspaces.length || 0) + 1}`);
    setNewWsCwd("");
    setNewWsEmoji("⚡");
    setShowEmojiPicker(false);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (ws: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingWsId(ws.id);
    setNewWsName(ws.name);
    setNewWsCwd(ws.cwd || "");
    setNewWsEmoji(ws.emoji || "📁");
    setShowEmojiPicker(false);
    setIsModalOpen(true);
  };

  const handleSelectFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Selecionar Repositório / Pasta do Projeto",
      });
      if (selected && typeof selected === "string") {
        setNewWsCwd(selected);
      }
    } catch (err) {
      console.error("Erro ao selecionar pasta:", err);
    }
  };

  const handleConfirmWorkspace = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (canvasRef.current) {
      if (editingWsId) {
        canvasRef.current.renameWorkspace(editingWsId, newWsName.trim(), newWsEmoji);
      } else {
        canvasRef.current.createWorkspace(newWsName.trim(), newWsCwd.trim(), newWsEmoji);
      }
    }
    setIsModalOpen(false);
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

  const isLight = effectiveCanvasTheme === "light";

  return (
    <div className={`flex w-screen h-screen overflow-hidden ${isLight ? "bg-slate-50 text-slate-800" : "bg-[#0b0c0e] text-slate-100"} select-none font-sans transition-colors duration-200`}>
      {/* Sidebar */}
      <aside className={`w-56 ${isLight ? "bg-white/95 border-slate-200 text-slate-800" : "bg-[#161b22]/95 border-[#30363d] text-slate-100"} backdrop-blur border-r flex flex-col z-20 shrink-0 transition-colors duration-200`}>
        {/* Sidebar Header Brand */}
        <div className={`h-11 flex items-center px-3 space-x-2 border-b ${isLight ? "border-slate-200" : "border-[#30363d]/60"}`}>
          <div className="w-6 h-6 rounded-md bg-indigo-600 flex items-center justify-center text-white shadow-sm shadow-indigo-950">
            <TerminalIcon className="w-3.5 h-3.5" />
          </div>
          <span className={`text-xs font-bold ${isLight ? "text-slate-800" : "text-slate-100"} tracking-wide`}>Mandante</span>
        </div>

        {/* Sidebar Navigation: Workspaces */}
        <div className="p-2 space-y-4 flex-1 overflow-y-auto">
          {/* Workspaces */}
          <div>
            <div className="flex items-center justify-between px-2 mb-1">
              <span className={`text-[10px] font-semibold tracking-wider uppercase ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                Workspaces
              </span>
              <button
                onClick={handleOpenModal}
                title="Criar novo Workspace"
                className="text-indigo-500 hover:text-indigo-600 p-0.5 rounded"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>

            <div className="space-y-0.5">
              {workspaces.filter((ws: any) => !((ws.name === "Page 1" || ws.name === "Página 1") && !ws.cwd)).length === 0 ? (
                <button
                  onClick={handleOpenModal}
                  className={`w-full py-2 px-3 border border-dashed rounded-lg text-center cursor-pointer transition-all flex items-center justify-center gap-1.5 ${
                    isLight
                      ? "border-slate-300 hover:bg-slate-100 text-slate-600"
                      : "border-[#30363d] hover:bg-[#21262d] text-slate-400"
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span className="text-xs font-medium">Criar Workspace</span>
                </button>
              ) : (
                workspaces
                  .filter((ws: any) => !((ws.name === "Page 1" || ws.name === "Página 1") && !ws.cwd))
                  .map((ws: any) => {
                    const isActive = ws.id === activeWorkspaceId;
                    return (
                      <div
                        key={ws.id}
                        onClick={() => handleSwitchWorkspace(ws.id)}
                        className={`group flex items-center justify-between px-2 py-1.5 text-xs font-medium ${isActive
                          ? isLight
                            ? "bg-slate-200/80 text-slate-900 font-semibold border-l-2 border-indigo-600"
                            : "bg-[#21262d] text-white font-semibold border-l-2 border-indigo-500"
                          : isLight
                            ? "text-slate-600 hover:bg-slate-100"
                            : "text-slate-400 hover:bg-[#21262d]/60"
                          } rounded-md cursor-pointer transition-all`}
                      >
                        <span className="flex flex-col truncate min-w-0 pr-1">
                          <span className="flex items-center gap-1.5 truncate">
                            <span className="text-xs">{ws.emoji || "📁"}</span>
                            <span className="truncate">{ws.name}</span>
                          </span>
                          {ws.cwd && (
                            <span className="text-[9px] text-slate-400 truncate font-mono ml-5">
                              {ws.cwd.split("/").pop() || ws.cwd}
                            </span>
                          )}
                        </span>

                        <div className="flex items-center space-x-1 shrink-0">
                          <span className={`text-[10px] ${isLight ? "bg-slate-200 text-slate-700" : "bg-[#30363d] text-slate-300"} px-1.5 py-0.2 rounded-full font-mono`}>
                            {ws.terminalCount}
                          </span>
                          <button
                            onClick={(e) => handleOpenEditModal(ws, e)}
                            title="Editar / Renomear Workspace"
                            className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-indigo-500 transition-opacity"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={(e) => handleDeleteWorkspace(ws.id, e)}
                            title="Excluir Workspace"
                            className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-red-500 transition-opacity"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        </div>

        {/* Sidebar Footer */}
        <div className={`p-3 border-t ${isLight ? "border-slate-200" : "border-[#30363d]/60"} flex items-center justify-between`}>
          <div className="flex items-center space-x-1">
            <button
              onClick={handleExportWorkspace}
              title={t.save}
              className={`p-1.5 ${isLight ? "hover:bg-slate-100 text-slate-600" : "hover:bg-[#21262d] text-slate-300"} rounded transition-colors cursor-pointer`}
            >
              <Download className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleImportWorkspace}
              title={t.open}
              className={`p-1.5 ${isLight ? "hover:bg-slate-100 text-slate-600" : "hover:bg-[#21262d] text-slate-300"} rounded transition-colors cursor-pointer`}
            >
              <Upload className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setIsSettingsOpen(true)}
              title="Configurações & Preferências"
              className={`p-1.5 ${isLight ? "hover:bg-slate-100 text-slate-600" : "hover:bg-[#21262d] text-slate-300"} rounded transition-colors cursor-pointer`}
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          </div>
          <button
            onClick={handleClearCanvas}
            title={t.clear}
            className={`p-1.5 ${isLight ? "hover:bg-red-50 text-slate-500 hover:text-red-600" : "hover:bg-red-950/50 text-slate-400 hover:text-red-400"} rounded transition-colors cursor-pointer`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </aside>

      {/* Main Area */}
      <div className="flex-1 flex flex-col h-full relative">
        {/* Floating Top Toolbar */}
        <div className={`absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center space-x-2.5 ${isLight ? "bg-white/95 border-slate-200 text-slate-800 shadow-md" : "bg-[#161b22]/95 border-[#30363d] text-slate-200 shadow-xl"
          } backdrop-blur-md border rounded-full px-3.5 py-1.5 text-xs transition-colors duration-200`}>
          <form onSubmit={handleBroadcast} className="flex items-center space-x-2">
            <Radio className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={broadcastCmd}
              onChange={(e) => setBroadcastCmd(e.target.value)}
              placeholder={t.placeholder}
              className={`bg-transparent ${isLight ? "text-slate-800 placeholder-slate-400" : "text-slate-200 placeholder-slate-500"} text-xs focus:outline-none w-56 font-mono`}
            />
            <button
              type="submit"
              title="Enviar comando em lote"
              className={`rounded-full p-1 transition-colors cursor-pointer ${
                isLight ? "bg-slate-800 text-white hover:bg-slate-700" : "bg-slate-200 text-slate-900 hover:bg-white"
              }`}
            >
              <Send className="w-3 h-3" />
            </button>
          </form>

          <div className={`h-4 w-px ${isLight ? "bg-slate-200" : "bg-[#30363d]"} mx-0.5`} />

          <button
            onClick={handleAddTerminalClick}
            className={`font-semibold text-xs px-3 py-1 rounded-full flex items-center gap-1.5 transition-all shadow-sm cursor-pointer ${
              isLight ? "bg-slate-900 text-white hover:bg-slate-800" : "bg-slate-100 text-slate-900 hover:bg-white"
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t.createTerminal}</span>
          </button>

          {/* Seletor de Tema no topo ao lado do Novo Terminal (Local 1) */}
          <button
            onClick={toggleTheme}
            title={`Tema: ${themeMode.toUpperCase()} (Clique para alternar)`}
            className={`p-1.5 rounded-full text-xs font-semibold flex items-center justify-center border transition-all cursor-pointer ${
              isLight
                ? "border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300"
                : "border-[#30363d] text-slate-300 hover:bg-[#21262d] hover:border-slate-600"
            }`}
          >
            {themeMode === "dark" && <Moon className="w-3.5 h-3.5 text-indigo-400" />}
            {themeMode === "light" && <Sun className="w-3.5 h-3.5 text-amber-500" />}
            {themeMode === "system" && <Sliders className="w-3.5 h-3.5 text-emerald-500" />}
          </button>

          <div className={`h-4 w-px ${isLight ? "bg-slate-200" : "bg-[#30363d]"} mx-0.5`} />

          {/* Presets de Terminais - Estilo Unificado e Elegante */}
          <div className="flex items-center space-x-1.5">
            <button
              onClick={handleLoadFullstack}
              title="Carregar Preset Fullstack (Dev, Build, Test)"
              className={`px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 border transition-all cursor-pointer ${
                isLight
                  ? "border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300"
                  : "border-[#30363d] text-slate-300 hover:bg-[#21262d] hover:border-slate-600"
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-slate-400" />
              <span>Fullstack</span>
            </button>

            <button
              onClick={() => setIsMeshModalOpen(true)}
              title="Rede Mandante Mesh IPC ativa. Clique para ver detalhes e CLI."
              className={`px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 border transition-all cursor-pointer ${
                isLight
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                  : "border-emerald-900/60 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/50"
              }`}
            >
              <Globe className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
              <span>Mesh: {meshInfo ? `Port ${meshInfo.port}` : "Ativo"}</span>
            </button>
          </div>
        </div>

        {/* Canvas Interativo */}
        <main className={`flex-1 w-full h-full relative ${effectiveCanvasTheme === "light" ? "canvas-light" : "canvas-dark"}`}>
          <Canvas ref={canvasRef} themeMode={effectiveCanvasTheme} onThemeChange={setThemeMode} />

          {/* Barra Flutuante Inferior de Controle de Zoom (Posicionada no canto inferior esquerdo) */}
          <div className={`fixed bottom-2.5 left-2.5 z-50 ${
            isLight ? "bg-white/95 text-slate-800 border-slate-200" : "bg-[#161b22]/95 text-slate-100 border-[#30363d]"
          } backdrop-blur-md border rounded-full px-2.5 py-1 text-xs shadow-xl flex items-center space-x-1.5 transition-all`}>
            <button
              onClick={handleZoomOut}
              title="Reduzir Zoom (-10%)"
              className={`p-1 ${isLight ? "hover:bg-slate-100 text-slate-700" : "hover:bg-[#21262d] text-slate-300"} rounded-full transition-colors cursor-pointer`}
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={handleResetZoom}
              title="Resetar Zoom para 100%"
              className={`px-1.5 py-0.5 font-mono text-[11px] font-bold rounded ${
                isLight ? "hover:bg-slate-100 text-indigo-600" : "hover:bg-[#21262d] text-indigo-400"
              } transition-colors cursor-pointer`}
            >
              {zoomPercent}%
            </button>

            <button
              onClick={handleZoomIn}
              title="Aumentar Zoom (+10%)"
              className={`p-1 ${isLight ? "hover:bg-slate-100 text-slate-700" : "hover:bg-[#21262d] text-slate-300"} rounded-full transition-colors cursor-pointer`}
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>

            <div className={`h-3.5 w-px ${isLight ? "bg-slate-200" : "bg-[#30363d]"}`} />

            <button
              onClick={handleZoomToFit}
              title="Ajustar à Tela (Fit)"
              className={`p-1 ${isLight ? "hover:bg-slate-100 text-slate-700" : "hover:bg-[#21262d] text-slate-300"} rounded-full transition-colors cursor-pointer`}
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </main>
      </div>

      {/* Modal de Criar/Editar Workspace */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
          <div className={`w-full max-w-md ${isLight ? "bg-white text-slate-800 border-slate-200" : "bg-[#161b22] text-slate-100 border-[#30363d]"} border rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150`}>
            <div className={`px-5 py-4 border-b ${isLight ? "border-slate-200" : "border-[#30363d]"} flex items-center justify-between`}>
              <h3 className="text-sm font-bold tracking-wide">
                {editingWsId ? "Editar Workspace" : "Novo Workspace"}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 text-xs px-1.5 py-0.5 rounded"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmWorkspace} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Nome do Workspace
                </label>
                <input
                  type="text"
                  required
                  value={newWsName}
                  onChange={(e) => setNewWsName(e.target.value)}
                  placeholder="Ex: Medainev / Meu Projeto"
                  className={`w-full px-3 py-2 text-xs rounded-lg border font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 ${isLight ? "bg-slate-100 border-slate-300 text-slate-900" : "bg-[#0d1117] border-[#30363d] text-slate-100"
                    }`}
                />
              </div>

              {/* Emoji */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Emoji / Ícone
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowEmojiPicker((prev) => !prev)}
                    className="text-[11px] font-medium text-indigo-500 hover:text-indigo-400 flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <span>{showEmojiPicker ? "Ocultar Seletor Completo" : "Ver Todos"}</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <div
                    onClick={() => setShowEmojiPicker((prev) => !prev)}
                    className={`w-10 h-10 rounded-xl border flex items-center justify-center text-xl cursor-pointer shrink-0 transition-transform hover:scale-105 shadow-sm ${isLight ? "bg-slate-100 border-slate-300" : "bg-[#0d1117] border-[#30363d]"
                      }`}
                    title="Clique para abrir todos os emojis do celular"
                  >
                    {newWsEmoji || "⚡"}
                  </div>

                  <div className={`flex-1 flex flex-wrap gap-1 ${isLight ? "bg-slate-100 border-slate-200" : "bg-[#0d1117]/50 border-[#30363d]/50"} p-1.5 rounded-xl border items-center`}>
                    {EMOJI_OPTIONS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => {
                          setNewWsEmoji(emoji);
                        }}
                        className={`w-7 h-7 text-sm flex items-center justify-center rounded-lg transition-all ${newWsEmoji === emoji
                            ? "bg-indigo-600 text-white scale-110 shadow-sm"
                            : "hover:bg-slate-300 dark:hover:bg-slate-700/50"
                          }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>

                {showEmojiPicker && (
                  <div className="mt-2.5 rounded-xl overflow-hidden border border-slate-200 dark:border-[#30363d] shadow-2xl animate-in fade-in duration-150">
                    <EmojiPicker
                      onEmojiClick={(emojiData) => {
                        setNewWsEmoji(emojiData.emoji);
                        setShowEmojiPicker(false);
                      }}
                      theme={isLight ? Theme.LIGHT : Theme.DARK}
                      searchPlaceHolder="Buscar emoji (ex: fogo, dev, gato...)"
                      width="100%"
                      height={320}
                      previewConfig={{ showPreview: false }}
                    />
                  </div>
                )}
              </div>



              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Repositório / Diretório do Projeto
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={newWsCwd}
                    placeholder="Nenhuma pasta selecionada (padrão do sistema)"
                    className={`flex-1 px-3 py-2 text-xs rounded-lg border font-mono truncate ${isLight ? "bg-slate-100 border-slate-300 text-slate-600" : "bg-[#0d1117] border-[#30363d] text-slate-400"
                      }`}
                  />
                  <button
                    type="button"
                    onClick={handleSelectFolder}
                    className={`flex items-center gap-1.5 px-3 py-2 border rounded-lg text-xs font-medium transition-colors cursor-pointer shrink-0 ${isLight ? "bg-white border-slate-300 text-slate-700 hover:bg-slate-50" : "bg-[#21262d] border-[#30363d] text-slate-200 hover:bg-[#30363d]"
                      }`}
                  >
                    <Folder className="w-3.5 h-3.5 text-slate-500" />
                    <span>Buscar</span>
                  </button>
                </div>
                {newWsCwd && (
                  <p className="mt-1 text-[10px] text-emerald-500 font-mono truncate">
                    ✓ Todos os novos terminais iniciarão em: {newWsCwd}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${isLight ? "hover:bg-slate-200 text-slate-600" : "hover:bg-[#21262d] text-slate-300"
                    }`}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors cursor-pointer"
                >
                  {editingWsId ? "Salvar Alterações" : "Criar Workspace"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Pop-up Modal de Escolha do Tipo de Terminal / Agente */}
      {isTerminalPickerOpen && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-150">
          <div className={`w-full max-w-md ${isLight ? "bg-white text-slate-800 border-slate-200" : "bg-[#161b22] text-slate-100 border-[#30363d]"} border rounded-xl shadow-2xl p-4 overflow-hidden`}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-[#30363d] mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Criar Novo Terminal
              </h3>
              <button
                onClick={() => setIsTerminalPickerOpen(false)}
                className="text-slate-400 hover:text-slate-200 text-xs px-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => handleSelectTerminalType("empty")}
                className={`w-full p-2.5 rounded-xl border text-left flex items-center gap-3 transition-all cursor-pointer ${isLight ? "border-slate-200 hover:bg-slate-50 text-slate-800" : "border-[#30363d] hover:bg-[#21262d] text-slate-100"
                  }`}
              >
                <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                  <EmptyTerminalLogo className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold">Terminal Vazio</div>
                  <div className="text-[10px] text-slate-400">Shell padrão do sistema no repositório</div>
                </div>
              </button>

              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2 px-1">
                  Ou Iniciar com Agente de IA
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    onClick={() => handleSelectTerminalType("gemini")}
                    className={`p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition-all cursor-pointer ${isLight ? "border-slate-200 hover:bg-indigo-50/70 text-slate-800" : "border-[#30363d] hover:bg-indigo-950/40 text-slate-100"
                      }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800/80 flex items-center justify-center shrink-0 p-1.5 shadow-sm">
                      <GeminiLogo className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold">Gemini CLI</div>
                      <div className="text-[9px] text-slate-400">Google DeepMind</div>
                    </div>
                  </button>

                  <button
                    onClick={() => handleSelectTerminalType("claude")}
                    className={`p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition-all cursor-pointer ${isLight ? "border-slate-200 hover:bg-amber-50/70 text-slate-800" : "border-[#30363d] hover:bg-amber-950/40 text-slate-100"
                      }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0 p-1.5">
                      <ClaudeLogo className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold">Claude Code</div>
                      <div className="text-[9px] text-slate-400">Anthropic CLI</div>
                    </div>
                  </button>

                  <button
                    onClick={() => handleSelectTerminalType("codex")}
                    className={`p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition-all cursor-pointer ${isLight ? "border-slate-200 hover:bg-teal-50/70 text-slate-800" : "border-[#30363d] hover:bg-teal-950/40 text-slate-100"
                      }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0 p-1.5">
                      <OpenAILogo className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold">Codex CLI</div>
                      <div className="text-[9px] text-slate-400">OpenAI Exclusive</div>
                    </div>
                  </button>

                  <button
                    onClick={() => handleSelectTerminalType("opencode")}
                    className={`p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition-all cursor-pointer ${isLight ? "border-slate-200 hover:bg-emerald-50/70 text-slate-800" : "border-[#30363d] hover:bg-emerald-950/40 text-slate-100"
                      }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0 p-1.5">
                      <OpenCodeLogo className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold">OpenCode</div>
                      <div className="text-[9px] text-slate-400">Multi-Model Agent</div>
                    </div>
                  </button>

                  <button
                    onClick={() => handleSelectTerminalType("aider")}
                    className={`p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition-all cursor-pointer col-span-2 ${isLight ? "border-slate-200 hover:bg-rose-50/70 text-slate-800" : "border-[#30363d] hover:bg-rose-950/40 text-slate-100"
                      }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center shrink-0 p-1.5">
                      <AiderLogo className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold">Aider AI</div>
                      <div className="text-[9px] text-slate-400">Pair Programmer CLI</div>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de instalação de agente ───────────────────────────────────── */}
      {installModal && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150">
          <div className={`w-full max-w-sm ${
            isLight ? "bg-white text-slate-800 border-slate-200" : "bg-[#0d1117] text-slate-100 border-[#30363d]"
          } border rounded-2xl shadow-2xl overflow-hidden`}>

            {/* Header */}
            <div className={`px-5 pt-5 pb-4 border-b ${ isLight ? "border-slate-100" : "border-[#21262d]" }`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">Agente não encontrado</div>
                  <h2 className="text-sm font-bold">{installModal.label} não está instalado</h2>
                  <p className={`text-xs mt-1 ${ isLight ? "text-slate-500" : "text-slate-400" }`}>
                    Instale o CLI para usar este agente no Mandante.
                  </p>
                </div>
                <button
                  onClick={() => setInstallModal(null)}
                  className="text-slate-400 hover:text-slate-200 shrink-0 mt-0.5 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Install command */}
            <div className="px-5 py-4">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">Comando de instalação</div>
              <div className={`flex items-center gap-2 rounded-xl px-3 py-2.5 font-mono text-[11px] ${
                isLight ? "bg-slate-50 border border-slate-200 text-slate-800" : "bg-[#161b22] border border-[#30363d] text-slate-200"
              }`}>
                <span className="flex-1 select-all break-all">{installModal.installCommand}</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(installModal.installCommand);
                    setInstallCopied(true);
                    setTimeout(() => setInstallCopied(false), 2000);
                  }}
                  className="shrink-0 text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer text-[10px] font-semibold"
                >
                  {installCopied ? "✓ Copiado" : "Copiar"}
                </button>
              </div>
              {installModal.installNote && (
                <p className="text-[10px] text-slate-500 mt-2 px-0.5">
                  ℹ️ {installModal.installNote}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className={`px-5 pb-5 flex flex-col gap-2`}>
              <button
                onClick={() => {
                  // Open a blank terminal with the install command pre-loaded
                  canvasRef.current?.addTerminalNode(
                    `📦 Instalar ${installModal.label}`,
                    undefined, undefined, undefined,
                    installModal.installCommand
                  );
                  refreshWorkspaces();
                  setInstallModal(null);
                }}
                className="w-full py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all cursor-pointer"
              >
                Abrir terminal e instalar agora
              </button>
              <button
                onClick={() => {
                  setInstallModal(null);
                  _createAgentTerminal(installModal.agentKey);
                }}
                className={`w-full py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer border ${
                  isLight
                    ? "border-slate-200 text-slate-600 hover:bg-slate-50"
                    : "border-[#30363d] text-slate-400 hover:bg-[#21262d]"
                }`}
              >
                Continuar mesmo assim
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mandante Mesh Status & Inter-Terminal CLI Modal */}
      {isMeshModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className={`w-full max-w-xl rounded-2xl border shadow-2xl overflow-hidden ${
            effectiveCanvasTheme === "light" ? "bg-white border-slate-200 text-slate-800" : "bg-[#161b22] border-[#30363d] text-slate-100"
          }`}>
            <div className={`flex items-center justify-between px-5 py-4 border-b ${
              effectiveCanvasTheme === "light" ? "border-slate-100 bg-slate-50" : "border-[#30363d] bg-[#0d1117]"
            }`}>
              <div className="flex items-center gap-2.5">
                <Globe className="w-5 h-5 text-emerald-500" />
                <div>
                  <h3 className="font-semibold text-sm">Mandante Mesh Network (IPC)</h3>
                  <p className="text-xs text-slate-400">Barramento Inter-Processos e Orquestrador Multi-Agentes</p>
                </div>
              </div>
              <button
                onClick={() => setIsMeshModalOpen(false)}
                className={`p-1.5 rounded-lg text-slate-400 hover:text-slate-200 ${effectiveCanvasTheme === "light" ? "hover:bg-slate-200" : "hover:bg-[#21262d]"}`}
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className={`p-3 rounded-xl border flex items-center justify-between ${
                effectiveCanvasTheme === "light" ? "bg-emerald-50 border-emerald-200 text-emerald-900" : "bg-emerald-950/40 border-emerald-800 text-emerald-200"
              }`}>
                <div>
                  <div className="font-semibold">Servidor IPC Local Ativo</div>
                  <div className="text-[11px] opacity-80">Porta HTTP: http://127.0.0.1:{meshInfo?.port || 41731}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{meshInfo?.count || 0} Terminais Conectados</div>
                  <div className="text-[10px] text-emerald-400">Skill `mandante-mesh` instalada no AGY</div>
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-slate-300 mb-2">Comandos da CLI do Mandante (Disponíveis em qualquer terminal):</h4>
                <div className={`p-3 rounded-xl font-mono text-[11px] space-y-1.5 ${
                  effectiveCanvasTheme === "light" ? "bg-slate-100 text-slate-800" : "bg-[#0d1117] text-slate-200 border border-[#30363d]"
                }`}>
                  <div><span className="text-indigo-400">mandante list</span> <span className="text-slate-500"># Lista sessões e IDs abertos</span></div>
                  <div><span className="text-indigo-400">mandante read &lt;id&gt;</span> <span className="text-slate-500"># Lê o histórico/transcrição da sessão</span></div>
                  <div><span className="text-indigo-400">mandante ask &lt;id&gt; &quot;&lt;prompt&gt;&quot;</span> <span className="text-slate-500"># Fala com o agente no terminal e aguarda resposta</span></div>
                  <div><span className="text-indigo-400">mandante send &lt;id&gt; &quot;&lt;comando&gt;&quot;</span> <span className="text-slate-500"># Envia comando bruto ao terminal</span></div>
                </div>
              </div>

              {meshInfo && meshInfo.terminals && meshInfo.terminals.length > 0 && (
                <div>
                  <h4 className="font-semibold text-slate-300 mb-2">Terminais Ativos Conectados:</h4>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                    {meshInfo.terminals.map((t: any) => (
                      <div key={t.id} className={`p-2.5 rounded-lg border flex items-center justify-between ${
                        effectiveCanvasTheme === "light" ? "bg-slate-50 border-slate-200" : "bg-[#21262d] border-[#30363d]"
                      }`}>
                        <div>
                          <span className="font-mono text-indigo-400 font-semibold mr-2">[{t.id}]</span>
                          <span className="font-medium">{t.title}</span>
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300">{t.agent_type}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono truncate max-w-[150px]">
                          {t.cwd || 'N/A'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className={`px-5 py-3 border-t flex justify-end ${effectiveCanvasTheme === "light" ? "border-slate-100 bg-slate-50" : "border-[#30363d] bg-[#0d1117]"}`}>
              <button
                onClick={() => setIsMeshModalOpen(false)}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default App;
