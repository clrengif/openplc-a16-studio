import React, { useEffect, useState } from 'react';
import {
  Play,
  Square,
  StepForward,
  RotateCcw,
  CheckCircle2,
  Cpu,
  Layers,
  Code2,
  Activity,
} from 'lucide-react';
import { usePLCStore } from './store/usePLCStore';
import { LadderEditor } from './components/LadderEditor';
import { STEditor } from './components/STEditor';
import { BoardSimulator } from './components/BoardSimulator';
import { BottomConsole } from './components/BottomConsole';
import { ExportModal } from './components/ExportModal';
import { ScanFrequency } from './types/plc';

export const App: React.FC = () => {
  const {
    language,
    isRunning,
    scanFreq,
    scanCount,
    lastScanUs,
    setLanguage,
    setRunning,
    setScanFreq,
    stepSingleScan,
    resetMemory,
    compileProgram,
  } = usePLCStore();

  const [showExportModal, setShowExportModal] = useState(false);

  // Deterministic PLC Scan Loop
  useEffect(() => {
    if (!isRunning) return;
    const intervalMs = Math.round(1000 / scanFreq);
    const timer = window.setInterval(() => {
      stepSingleScan();
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [isRunning, scanFreq, stepSingleScan]);

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden">
      {/* Top Industrial SCADA Navigation & PLC Control Bar */}
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-slate-900 border-b border-slate-800 select-none">
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-inner">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-wide text-white">
                OpenPLC A16 Studio
              </h1>
              <span className="px-1.5 py-0.5 text-[10px] font-mono font-semibold rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                IEC 61131-3
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              IDE Ladder / ST + Simulador & Adaptación HAL para KinCony KC868-A16 (ESP32)
            </p>
          </div>
        </div>

        {/* Language Mode Switcher (LD vs ST) */}
        <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => setLanguage('LD')}
            className={`px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              language === 'LD'
                ? 'bg-emerald-600 text-slate-950 shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Ladder Diagram (LD)</span>
          </button>
          <button
            onClick={() => setLanguage('ST')}
            className={`px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              language === 'ST'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Structured Text (ST)</span>
          </button>
        </div>

        {/* PLC Run / Stop / Step / Scan Rate Controls */}
        <div className="flex items-center gap-2">
          {/* Status Indicator */}
          <div
            className={`px-2.5 py-1 rounded-md border text-xs font-mono font-bold flex items-center gap-1.5 ${
              isRunning
                ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-300'
                : 'bg-slate-950 border-slate-800 text-amber-400'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span>{isRunning ? 'PLC RUN' : 'PLC STOP'}</span>
          </div>

          {!isRunning ? (
            <button
              onClick={() => setRunning(true)}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Play className="w-3.5 h-3.5 fill-slate-950" />
              <span>RUN</span>
            </button>
          ) : (
            <button
              onClick={() => setRunning(false)}
              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Square className="w-3.5 h-3.5 fill-white" />
              <span>STOP</span>
            </button>
          )}

          <button
            onClick={stepSingleScan}
            disabled={isRunning}
            title="Ejecutar 1 ciclo de Scan paso a paso"
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 border border-slate-700 text-xs font-medium text-slate-200 flex items-center gap-1 cursor-pointer"
          >
            <StepForward className="w-3.5 h-3.5 text-sky-400" />
            <span>Step</span>
          </button>

          <button
            onClick={resetMemory}
            title="Reiniciar entradas, salidas, temporizadores y contadores"
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-300 flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">Reset</span>
          </button>

          {/* Scan Frequency Selector */}
          <select
            value={scanFreq}
            onChange={(e) => setScanFreq(Number(e.target.value) as ScanFrequency)}
            className="px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
            title="Frecuencia del Ciclo de Scan Determinista"
          >
            <option value={10}>10 Hz (100ms)</option>
            <option value={20}>20 Hz (50ms)</option>
            <option value={50}>50 Hz (20ms)</option>
            <option value={100}>100 Hz (10ms)</option>
          </select>

          {/* Scan Telemetry Badge */}
          <div className="hidden 2xl:flex items-center gap-2 px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-400">
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            <span>Ciclos: {scanCount}</span>
            <span>·</span>
            <span>{lastScanUs} µs</span>
          </div>

          <button
            onClick={compileProgram}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-emerald-300 flex items-center gap-1.5 cursor-pointer"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Compilar</span>
          </button>

          <button
            onClick={() => setShowExportModal(true)}
            className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow"
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Firmware & HAL KC868-A16</span>
          </button>
        </div>
      </header>

      {/* Main Split Workspace: Left = PLC Editor + Bottom Console, Right = KinCony KC868-A16 Hardware Simulator */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Column: Editor + Bottom Watch/Diagnostics Dock */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="flex-1 overflow-hidden">
            {language === 'LD' ? <LadderEditor /> : <STEditor />}
          </div>
          <BottomConsole />
        </div>

        {/* Right Column: Interactive KinCony KC868-A16 Board Simulator */}
        <div className="w-[410px] xl:w-[450px] shrink-0 h-full overflow-hidden">
          <BoardSimulator />
        </div>
      </div>

      {/* Firmware & OpenPLC HAL Export Modal */}
      {showExportModal && <ExportModal onClose={() => setShowExportModal(false)} />}
    </div>
  );
};

export default App;
