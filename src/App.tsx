import React, { useRef, useState } from "react";
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
} from "lucide-react";

export const App: React.FC = () => {
  const canvasRef = useRef<CanvasHandle>(null);
  const [broadcastCmd, setBroadcastCmd] = useState("");

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

  return (
    <div className="flex flex-col w-screen h-screen overflow-hidden bg-[#090d16] text-slate-100 select-none">
      {/* Topbar */}
      <header className="h-12 bg-[#0d1117] border-b border-[#21262d] flex items-center justify-between px-4 z-10 shrink-0 gap-4">
        {/* Brand */}
        <div className="flex items-center space-x-3 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-900/50">
            <TerminalIcon className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-wide text-white flex items-center gap-1.5">
              Mandante
              <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-400 border border-indigo-800">
                Spatial Orchestrator
              </span>
            </h1>
          </div>
        </div>

        {/* Broadcast Command Bar */}
        <form
          onSubmit={handleBroadcast}
          className="flex-1 max-w-xl flex items-center bg-[#161b22] border border-[#30363d] rounded-md px-2 py-1 text-xs space-x-2 shadow-inner focus-within:border-indigo-500 transition-colors"
        >
          <Radio className="w-3.5 h-3.5 text-indigo-400 animate-pulse shrink-0" />
          <input
            type="text"
            value={broadcastCmd}
            onChange={(e) => setBroadcastCmd(e.target.value)}
            placeholder="Executar comando em lote em todos os terminais... (ex: git status, clear)"
            className="flex-1 bg-transparent text-slate-200 focus:outline-none placeholder-slate-500 font-mono text-[11px]"
          />
          <button
            type="submit"
            className="flex items-center space-x-1 px-2 py-0.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[11px] font-medium transition-colors cursor-pointer shrink-0"
          >
            <Send className="w-3 h-3" />
            <span>Transmitir</span>
          </button>
        </form>

        {/* Actions & Presets */}
        <div className="flex items-center space-x-2 shrink-0">
          {/* Workspace Import / Export */}
          <div className="flex items-center bg-[#161b22] p-0.5 rounded-md border border-[#30363d] space-x-0.5">
            <button
              onClick={handleExportWorkspace}
              title="Salvar Workspace atual (.json)"
              className="p-1.5 text-slate-300 hover:text-indigo-400 hover:bg-[#21262d] rounded transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleImportWorkspace}
              title="Abrir Workspace salvo (.json)"
              className="p-1.5 text-slate-300 hover:text-indigo-400 hover:bg-[#21262d] rounded transition-colors cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Preset Buttons */}
          <div className="flex items-center bg-[#161b22] p-0.5 rounded-md border border-[#30363d] space-x-0.5">
            <button
              onClick={handleLoadFullstack}
              title="Preset Fullstack: Backend + Frontend + DB"
              className="flex items-center space-x-1 px-2 py-1 text-[11px] font-medium text-slate-300 hover:text-white hover:bg-[#21262d] rounded transition-colors cursor-pointer"
            >
              <Zap className="w-3 h-3 text-amber-400" />
              <span>Fullstack</span>
            </button>
            <button
              onClick={handleLoadGrid}
              title="Preset Microserviços: Grid 2x2"
              className="flex items-center space-x-1 px-2 py-1 text-[11px] font-medium text-slate-300 hover:text-white hover:bg-[#21262d] rounded transition-colors cursor-pointer"
            >
              <Boxes className="w-3 h-3 text-emerald-400" />
              <span>Grid 2x2</span>
            </button>
          </div>

          <button
            onClick={handleAddTerminal}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-md shadow transition-all duration-150 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Novo Terminal</span>
          </button>

          <button
            onClick={handleClearCanvas}
            title="Limpar todos os terminais do canvas"
            className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-[#161b22] rounded-md transition-colors cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Infinite Canvas */}
      <main className="flex-1 w-full h-full relative">
        <Canvas ref={canvasRef} />
      </main>
    </div>
  );
};

export default App;
