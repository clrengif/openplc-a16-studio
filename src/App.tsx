import React, { useEffect, useState } from 'react';
import {
  Cpu,
  Settings,
  X,
  Plus,
} from 'lucide-react';
import { usePLCStore } from './store/usePLCStore';
import { LeftLibrarySidebar } from './components/LeftLibrarySidebar';
import { LadderEditor } from './components/LadderEditor';
import { STEditor } from './components/STEditor';
import { BoardSimulator } from './components/BoardSimulator';
import { IndustrialNetworksLab } from './components/IndustrialNetworksLab';
import { BottomConsole } from './components/BottomConsole';
import { ExportModal } from './components/ExportModal';
import { PLCLanguage, ScanFrequency } from './types/plc';

export const App: React.FC = () => {
  const {
    workspaceView,
    language,
    isRunning,
    scanFreq,
    scanCount,
    lastScanUs,
    setWorkspaceView,
    setLanguage,
    setRunning,
    setScanFreq,
    stepSingleScan,
    resetMemory,
    compileProgram,
    addRung,
  } = usePLCStore();

  const [showExportModal, setShowExportModal] = useState(false);
  const [showRightBoardDock, setShowRightBoardDock] = useState(true);

  useEffect(() => {
    if (!isRunning) return;
    const intervalMs = Math.round(1000 / scanFreq);
    const timer = window.setInterval(() => {
      stepSingleScan();
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [isRunning, scanFreq, stepSingleScan]);

  return (
    <div className="flex flex-col h-screen w-screen bg-[#f4f6f8] text-slate-800 overflow-hidden select-none">
      {/* Row 1: Simulino-style Clean Light Top Bar */}
      <header className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2 bg-[#f1f5f9] border-b border-slate-300">
        {/* Left: Brand + Desktop Menu Items */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-[#ea580c] flex items-center justify-center text-white shadow-2xs">
              <Cpu className="w-4 h-4" />
            </div>
            <span className="text-base font-extrabold tracking-tight text-slate-900">
              OpenPLC A16
            </span>
          </div>

          <nav className="hidden lg:flex items-center gap-3 text-xs font-medium text-slate-700">
            <button
              onClick={() => setShowExportModal(true)}
              className="hover:text-[#0f766e] cursor-pointer"
            >
              Archivo
            </button>
            <button
              onClick={addRung}
              className="hover:text-[#0f766e] cursor-pointer"
            >
              Editar
            </button>
            <button
              onClick={() => setShowRightBoardDock(!showRightBoardDock)}
              className="hover:text-[#0f766e] cursor-pointer"
            >
              Ver
            </button>
            <button
              onClick={() => setRunning(!isRunning)}
              className="hover:text-[#0f766e] cursor-pointer"
            >
              Simulación
            </button>
            <button
              onClick={() => setWorkspaceView('networks')}
              className="hover:text-[#0f766e] font-semibold text-[#0f766e] cursor-pointer"
            >
              Redes Industriales
            </button>
            <button
              onClick={() => setShowExportModal(true)}
              className="hover:text-[#0f766e] cursor-pointer"
            >
              Firmware HAL
            </button>
          </nav>
        </div>

        {/* Center/Right: Segmented View Switcher + File Label + Simular CTA (Simulino exact layout) */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Segmented View Pill */}
          <div className="flex items-center bg-white rounded-md border border-slate-300 p-0.5 shadow-2xs">
            <button
              onClick={() => setWorkspaceView('schematic')}
              className={`px-3 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
                workspaceView === 'schematic'
                  ? 'bg-[#0f766e] text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Esquemático PLC
            </button>
            <button
              onClick={() => setWorkspaceView('networks')}
              className={`px-3 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
                workspaceView === 'networks'
                  ? 'bg-[#0f766e] text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Redes Industriales
            </button>
            <button
              onClick={() => setWorkspaceView('board')}
              className={`px-3 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
                workspaceView === 'board'
                  ? 'bg-[#0f766e] text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Placa KC868-A16
            </button>
          </div>

          <span className="hidden xl:inline text-xs font-mono text-slate-500 px-1">
            kincony_a16.plc
          </span>

          {/* Primary Simular / Detener Button */}
          <button
            onClick={() => setRunning(!isRunning)}
            className={`px-4 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer shadow-2xs ${
              isRunning
                ? 'bg-rose-600 hover:bg-rose-700 text-white'
                : 'bg-[#0f766e] hover:bg-[#115e59] text-white'
            }`}
          >
            {isRunning ? 'Detener' : 'Simular'}
          </button>

          <button
            onClick={() => {
              compileProgram();
              stepSingleScan();
            }}
            className="px-3 py-1.5 rounded-md bg-white hover:bg-slate-50 border border-slate-300 text-xs font-semibold text-slate-700 cursor-pointer"
          >
            Calcular / Paso
          </button>

          {/* Language Selector Dropdown */}
          <select
            value={language}
            onChange={(e) => {
              setLanguage(e.target.value as PLCLanguage);
              setWorkspaceView('schematic');
            }}
            className="px-2.5 py-1.5 rounded-md bg-white border border-slate-300 text-xs font-medium text-slate-800 cursor-pointer focus:outline-none focus:border-[#0f766e]"
          >
            <option value="LD">Ladder (LD)</option>
            <option value="ST">Structured Text (ST)</option>
          </select>

          <button
            onClick={() => setShowExportModal(true)}
            title="Exportar Firmware ESP32, OpenPLC Custom HAL, ST y PLCopen XML"
            className="p-1.5 rounded-md bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 cursor-pointer"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Row 2: Simulino-style Parameters & Status Sub-bar */}
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-[#f8fafc] border-b border-slate-300 text-xs">
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <span>FRECUENCIA SCAN</span>
            <select
              value={scanFreq}
              onChange={(e) => setScanFreq(Number(e.target.value) as ScanFrequency)}
              className="px-2 py-0.5 rounded bg-white border border-slate-300 font-mono text-xs text-slate-800 normal-case"
            >
              <option value={10}>10 Hz (100 ms)</option>
              <option value={20}>20 Hz (50 ms)</option>
              <option value={50}>50 Hz (20 ms)</option>
              <option value={100}>100 Hz (10 ms)</option>
            </select>
          </label>

          <label className="hidden sm:flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <span>VELOCIDAD</span>
            <span className="px-2.5 py-0.5 rounded bg-white border border-slate-300 font-sans font-medium text-xs text-slate-800 normal-case">
              Tiempo real
            </span>
          </label>

          <button
            onClick={resetMemory}
            className="text-xs text-slate-500 hover:text-slate-800 underline cursor-pointer"
          >
            Reiniciar memoria
          </button>

          <button
            onClick={() => setShowExportModal(true)}
            className="px-2.5 py-0.5 rounded bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 font-semibold text-xs cursor-pointer"
          >
            Descargar Firmware & HAL OpenPLC
          </button>
        </div>

        <div className="font-mono text-xs text-slate-600">
          {isRunning
            ? `Simulación en curso (${scanFreq} Hz · Scan #${scanCount} · ${lastScanUs} µs)`
            : 'Simulación detenida.'}
        </div>
      </div>

      {/* Row 3: Document Tab Strip (like Simulino's "Potencia: fusible ante un co... x | +") */}
      <div className="flex items-center justify-between px-2 pt-1.5 bg-[#e9eef2] border-b border-slate-300 text-xs">
        <div className="flex items-center gap-1">
          <div className="px-3 py-1.5 rounded-t-md bg-white border-t border-x border-slate-300 font-medium text-slate-800 flex items-center gap-2 -mb-px">
            <span>
              {workspaceView === 'networks'
                ? 'Redes Industriales: Modbus TCP / RS485 RTU / I²C PCF8574'
                : workspaceView === 'board'
                ? 'Hardware: Placa KinCony KC868-A16 (ESP32)'
                : language === 'LD'
                ? 'Potencia y Control: Estrella-Triángulo + Lote Modbus'
                : 'Programa IEC 61131-3: KinCony_A16_Main.st'}
            </span>
            <X className="w-3 h-3 text-slate-400" />
          </div>
          <button
            onClick={addRung}
            className="p-1.5 text-slate-600 hover:text-slate-900 cursor-pointer"
            title="Añadir nueva red"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {workspaceView === 'schematic' && (
          <button
            onClick={() => setShowRightBoardDock(!showRightBoardDock)}
            className="mb-1 mr-2 px-2.5 py-0.5 rounded bg-white border border-slate-300 text-[11px] font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            {showRightBoardDock ? 'Ocultar Placa Lateral' : 'Mostrar Placa KC868-A16'}
          </button>
        )}
      </div>

      {/* Main Workspace Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Library Sidebar */}
        <LeftLibrarySidebar />

        {/* Center Editor / Lab + Bottom Oscilloscope & Network Console */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="flex-1 overflow-hidden">
            {workspaceView === 'networks' ? (
              <IndustrialNetworksLab />
            ) : workspaceView === 'board' ? (
              <BoardSimulator />
            ) : language === 'LD' ? (
              <LadderEditor />
            ) : (
              <STEditor />
            )}
          </div>
          <BottomConsole />
        </div>

        {/* Optional Docked KinCony KC868-A16 Board on Right */}
        {workspaceView === 'schematic' && showRightBoardDock && (
          <div className="w-[380px] xl:w-[410px] shrink-0 h-full overflow-hidden">
            <BoardSimulator />
          </div>
        )}
      </div>

      {showExportModal && <ExportModal onClose={() => setShowExportModal(false)} />}
    </div>
  );
};

export default App;
