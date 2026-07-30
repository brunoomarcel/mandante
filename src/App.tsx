import React, { useRef } from "react";
import { Canvas, CanvasHandle } from "./components/Canvas";
import { Terminal, Plus, Terminal as TerminalIcon, Sparkles } from "lucide-react";

export const App: React.FC = () => {
  const canvasRef = useRef<CanvasHandle>(null);

  const handleAddTerminal = () => {
    canvasRef.current?.addTerminalNode();
  };

  return (
    <div className="flex flex-col w-screen h-screen overflow-hidden bg-[#090d16] text-slate-100 select-none">
      {/* Topbar */}
      <header className="h-12 bg-[#0d1117] border-b border-[#21262d] flex items-center justify-between px-4 z-10 shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-900/50">
            <TerminalIcon className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-wide text-white flex items-center gap-1.5">
              Mandante
              <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-400 border border-indigo-800">
                Spatial CLI
              </span>
            </h1>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleAddTerminal}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-md shadow transition-all duration-150 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Novo Terminal</span>
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
