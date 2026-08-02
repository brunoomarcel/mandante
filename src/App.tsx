import React, { useRef, useState, useEffect, useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import EmojiPicker, { Theme } from "emoji-picker-react";
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
  Folder,
} from "lucide-react";

export type Language = "pt" | "en" | "es";

const TRANSLATIONS: Record<Language, Record<string, string>> = {
  pt: {
    quickActions: "Ações Rápidas",
    createTerminal: "Novo Terminal",
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
  const [themeMode, setThemeMode] = useState<CanvasThemeMode>("light");
  const [effectiveCanvasTheme, setEffectiveCanvasTheme] = useState<"light" | "dark">("light");
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

  const [isTerminalPickerOpen, setIsTerminalPickerOpen] = useState(false);

  const handleAddTerminalClick = () => {
    // Se não houver nenhum workspace criado/configurado pelo usuário, obriga a abrir o modal de workspace primeiro
    const userWorkspaces = workspaces.filter((ws: any) => !((ws.name === "Page 1" || ws.name === "Página 1") && !ws.cwd));
    if (userWorkspaces.length === 0) {
      handleOpenModal();
      return;
    }
    setIsTerminalPickerOpen(true);
  };

  const handleSelectTerminalType = (type: "empty" | "gemini" | "claude" | "opencode" | "codex" | "aider") => {
    setIsTerminalPickerOpen(false);
    if (type === "empty") {
      canvasRef.current?.addTerminalNode();
    } else if (type === "gemini") {
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
              {workspaces
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
                        {workspaces.length > 1 && (
                          <button
                            onClick={(e) => handleDeleteWorkspace(ws.id, e)}
                            title="Excluir Workspace"
                            className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-red-500 transition-opacity"
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
        </div>

        {/* Sidebar Footer */}
        <div className={`p-3 border-t ${isLight ? "border-slate-200" : "border-[#30363d]/60"} flex items-center justify-between`}>
          <div className="flex items-center space-x-1">
            <button
              onClick={handleExportWorkspace}
              title={t.save}
              className={`p-1.5 ${isLight ? "hover:bg-slate-100 text-slate-600" : "hover:bg-[#21262d] text-slate-300"} rounded transition-colors`}
            >
              <Download className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleImportWorkspace}
              title={t.open}
              className={`p-1.5 ${isLight ? "hover:bg-slate-100 text-slate-600" : "hover:bg-[#21262d] text-slate-300"} rounded transition-colors`}
            >
              <Upload className="w-3.5 h-3.5" />
            </button>
          </div>
          <button
            onClick={handleClearCanvas}
            title={t.clear}
            className={`p-1.5 ${isLight ? "hover:bg-red-50 text-slate-500 hover:text-red-600" : "hover:bg-red-950/50 text-slate-400 hover:text-red-400"} rounded transition-colors`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </aside>

      {/* Main Area */}
      <div className="flex-1 flex flex-col h-full relative">
        {/* Floating Top Toolbar */}
        <div className={`absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center space-x-2 ${isLight ? "bg-white/95 border-slate-200 text-slate-800 shadow-md" : "bg-[#161b22]/95 border-[#30363d] text-slate-200 shadow-xl"
          } backdrop-blur border rounded-full px-3 py-1 text-xs transition-colors duration-200`}>
          <form onSubmit={handleBroadcast} className="flex items-center space-x-2">
            <Radio className="w-3.5 h-3.5 text-indigo-500 animate-pulse" />
            <input
              type="text"
              value={broadcastCmd}
              onChange={(e) => setBroadcastCmd(e.target.value)}
              placeholder={t.placeholder}
              className={`bg-transparent ${isLight ? "text-slate-800 placeholder-slate-400" : "text-slate-200 placeholder-slate-500"} text-xs focus:outline-none w-60 font-mono`}
            />
            <button
              type="submit"
              className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-full p-1 transition-colors"
            >
              <Send className="w-3 h-3" />
            </button>
          </form>



          <button
            onClick={handleAddTerminalClick}
            className="bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs px-2.5 py-1 rounded-full flex items-center gap-1 transition-colors shadow-sm cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t.createTerminal}</span>
          </button>

          <div className={`h-4 w-px ${isLight ? "bg-slate-200" : "bg-[#30363d]"} mx-1`} />

          {/* Canvas Theme Selector Button (Dark -> Light -> System) */}
          <button
            onClick={toggleTheme}
            title={`Tema do Canvas: ${themeMode.toUpperCase()} (Clique para alternar)`}
            className={`px-2 py-0.5 ${isLight ? "hover:bg-slate-100 text-slate-700" : "hover:bg-[#21262d] text-slate-300"} rounded font-mono text-[10px] flex items-center gap-1.5 transition-colors`}
          >
            {themeMode === "dark" && <Moon className="w-3 h-3 text-indigo-400" />}
            {themeMode === "light" && <Sun className="w-3 h-3 text-amber-500" />}
            {themeMode === "system" && <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />}
            <span className="uppercase">{themeMode}</span>
          </button>
        </div>

        {/* Canvas Interativo: Única área que altera de tema (light, dark, system) */}
        <main className={`flex-1 w-full h-full relative ${effectiveCanvasTheme === "light" ? "canvas-light" : "canvas-dark"}`}>
          <Canvas ref={canvasRef} themeMode={effectiveCanvasTheme} />
        </main>
      </div>

      {/* Modal de Criar/Editar Workspace */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className={`w-full max-w-sm ${isLight ? "bg-white text-slate-800 border-slate-200" : "bg-[#161b22] text-slate-100 border-[#30363d]"} border rounded-xl shadow-2xl p-4 overflow-hidden`}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-[#30363d] mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Criar Novo Terminal
              </h3>
              <button
                onClick={() => setIsTerminalPickerOpen(false)}
                className="text-slate-400 hover:text-slate-200 text-xs px-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => handleSelectTerminalType("empty")}
                className={`w-full p-2.5 rounded-lg border text-left flex items-center gap-3 transition-all cursor-pointer ${isLight ? "border-slate-200 hover:bg-slate-50 text-slate-800" : "border-[#30363d] hover:bg-[#21262d] text-slate-100"
                  }`}
              >
                <div className="w-8 h-8 rounded-lg bg-blue-600/10 text-blue-500 flex items-center justify-center font-bold text-sm shrink-0">
                  💻
                </div>
                <div>
                  <div className="text-xs font-bold">Terminal Vazio</div>
                  <div className="text-[10px] text-slate-400">Shell padrão do sistema no repositório</div>
                </div>
              </button>

              <div className="pt-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5 px-1">
                  Ou Iniciar com Agente de IA
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleSelectTerminalType("gemini")}
                    className={`p-2 rounded-lg border text-left flex items-center gap-2 transition-all cursor-pointer ${isLight ? "border-slate-200 hover:bg-indigo-50 text-slate-800" : "border-[#30363d] hover:bg-indigo-950/40 text-slate-100"
                      }`}
                  >
                    <span className="text-base">♊</span>
                    <div>
                      <div className="text-xs font-bold">Gemini CLI</div>
                      <div className="text-[9px] text-slate-400">Google DeepMind</div>
                    </div>
                  </button>

                  <button
                    onClick={() => handleSelectTerminalType("claude")}
                    className={`p-2 rounded-lg border text-left flex items-center gap-2 transition-all cursor-pointer ${isLight ? "border-slate-200 hover:bg-amber-50 text-slate-800" : "border-[#30363d] hover:bg-amber-950/40 text-slate-100"
                      }`}
                  >
                    <span className="text-base">🧠</span>
                    <div>
                      <div className="text-xs font-bold">Claude Code</div>
                      <div className="text-[9px] text-slate-400">Anthropic CLI</div>
                    </div>
                  </button>

                  <button
                    onClick={() => handleSelectTerminalType("opencode")}
                    className={`p-2 rounded-lg border text-left flex items-center gap-2 transition-all cursor-pointer ${isLight ? "border-slate-200 hover:bg-emerald-50 text-slate-800" : "border-[#30363d] hover:bg-emerald-950/40 text-slate-100"
                      }`}
                  >
                    <span className="text-base">🌐</span>
                    <div>
                      <div className="text-xs font-bold">OpenCode</div>
                      <div className="text-[9px] text-slate-400">Codex / LLM</div>
                    </div>
                  </button>

                  <button
                    onClick={() => handleSelectTerminalType("aider")}
                    className={`p-2 rounded-lg border text-left flex items-center gap-2 transition-all cursor-pointer ${isLight ? "border-slate-200 hover:bg-rose-50 text-slate-800" : "border-[#30363d] hover:bg-rose-950/40 text-slate-100"
                      }`}
                  >
                    <span className="text-base">⚡</span>
                    <div>
                      <div className="text-xs font-bold">Aider AI</div>
                      <div className="text-[9px] text-slate-400">Pair Programmer</div>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
