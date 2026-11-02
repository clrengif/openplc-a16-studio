import React, { useEffect, useRef, useState } from 'react';
import {
  Cpu,
  Settings,
  X,
  Plus,
  Check,
  FolderOpen,
  FilePlus,
  Save,
  BookOpen,
  Maximize2,
  Minimize2,
  ChevronRight,
} from 'lucide-react';
import { usePLCStore } from './store/usePLCStore';
import { LeftLibrarySidebar } from './components/LeftLibrarySidebar';
import { LadderEditor } from './components/LadderEditor';
import { STEditor } from './components/STEditor';
import { BoardSimulator } from './components/BoardSimulator';
import { IndustrialNetworksLab } from './components/IndustrialNetworksLab';
import { BottomConsole } from './components/BottomConsole';
import { ExportModal } from './components/ExportModal';
import { ExamplesModal } from './components/ExamplesModal';
import { PLC_EXAMPLES, PlnoProjectFile } from './utils/plcExamples';
import { PLCLanguage, ScanFrequency } from './types/plc';

type OpenMenuId = 'archivo' | 'editar' | 'ver' | 'simulacion' | 'redes' | 'ayuda' | null;

export const App: React.FC = () => {
  const {
    projectFileName,
    workspaceView,
    language,
    isRunning,
    scanFreq,
    scanCount,
    lastScanUs,
    rungs,
    selectedRungId,
    setProjectFileName,
    loadPlnoProject,
    newBlankProject,
    exportPlnoString,
    setWorkspaceView,
    setLanguage,
    setRunning,
    setScanFreq,
    stepSingleScan,
    resetMemory,
    compileProgram,
    addRung,
    toggleParallelBranch,
    syncLadderToST,
    sendModbusTCPRequest,
    sendModbusRTURequest,
    captureI2CBusFrames,
    clearLogs,
    addLog,
  } = usePLCStore();

  const [openMenu, setOpenMenu] = useState<OpenMenuId>(null);
  const [showExamplesSubmenu, setShowExamplesSubmenu] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showExamplesModal, setShowExamplesModal] = useState(false);

  // Window visibility states (controlled via X buttons on windows and the "Ver" menu)
  const [showLeftSidebar, setShowLeftSidebar] = useState(true);
  const [showRightBoardDock, setShowRightBoardDock] = useState(true);
  const [showBottomConsole, setShowBottomConsole] = useState(true);

  // Fullscreen mode for the central window
  const [isCenterFullscreen, setIsCenterFullscreen] = useState(false);

  // Resizable panel dimensions
  const [leftWidth, setLeftWidth] = useState(248);
  const [rightWidth, setRightWidth] = useState(390);
  const [bottomHeight, setBottomHeight] = useState(215);

  const draggingRef = useRef<'left' | 'right' | 'bottom' | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const menuBarRef = useRef<HTMLDivElement | null>(null);

  // Deterministic Scan Cycle
  useEffect(() => {
    if (!isRunning) return;
    const intervalMs = Math.round(1000 / scanFreq);
    const timer = window.setInterval(() => {
      stepSingleScan();
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [isRunning, scanFreq, stepSingleScan]);

  // Close dropdown menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
        setShowExamplesSubmenu(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Drag resizing handler
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      if (draggingRef.current === 'left') {
        setLeftWidth(Math.max(180, Math.min(450, e.clientX)));
      } else if (draggingRef.current === 'right') {
        setRightWidth(Math.max(280, Math.min(620, window.innerWidth - e.clientX)));
      } else if (draggingRef.current === 'bottom') {
        setBottomHeight(Math.max(96, Math.min(500, window.innerHeight - e.clientY)));
      }
    };

    const onMouseUp = () => {
      draggingRef.current = null;
      document.body.style.cursor = '';
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  // Save .plno file
  const handleSavePlno = (customName?: string) => {
    const targetName = customName
      ? customName.endsWith('.plno')
        ? customName
        : `${customName}.plno`
      : projectFileName;
    if (customName) setProjectFileName(targetName);

    const content = exportPlnoString();
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = targetName;
    a.click();
    URL.revokeObjectURL(url);
    addLog('INFO', `Archivo guardado: ${targetName}`);
    setOpenMenu(null);
  };

  // Open .plno file from disk
  const handleOpenFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as PlnoProjectFile;
        if (Array.isArray(parsed.rungs)) {
          loadPlnoProject({
            ...parsed,
            fileName: file.name,
          });
        } else {
          addLog('ERROR', `El archivo ${file.name} no tiene una estructura .plno válida.`);
        }
      } catch {
        addLog('ERROR', `No se pudo leer el archivo ${file.name}.`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#f4f6f8] text-slate-800 overflow-hidden select-none">
      {/* Hidden File Input for Opening .plno Files */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".plno,.json"
        onChange={handleOpenFileChange}
        className="hidden"
      />

      {/* Row 1: Top Menu & Control Bar (Hidden when Central Window is in Fullscreen Mode) */}
      {!isCenterFullscreen && (
        <header className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2 bg-[#f1f5f9] border-b border-slate-300 z-30">
          {/* Left: PCLino Brand + Classic Desktop Dropdown Menus */}
          <div ref={menuBarRef} className="flex items-center gap-3 relative">
            <div className="flex items-center gap-2 mr-1">
              <div className="w-7 h-7 rounded-full bg-[#ea580c] flex items-center justify-center text-white shadow-2xs">
                <Cpu className="w-4 h-4" />
              </div>
              <span className="text-base font-extrabold tracking-tight text-slate-900">
                PCLino
              </span>
            </div>

            {/* Menu: Archivo */}
            <div className="relative">
              <button
                onClick={() => setOpenMenu(openMenu === 'archivo' ? null : 'archivo')}
                className={`px-2 py-1 rounded text-xs font-medium cursor-pointer ${
                  openMenu === 'archivo'
                    ? 'bg-slate-200 text-slate-900'
                    : 'text-slate-700 hover:bg-slate-200/60'
                }`}
              >
                Archivo
              </button>

              {openMenu === 'archivo' && (
                <div className="absolute left-0 top-full mt-1 w-64 bg-white border border-slate-300 rounded-lg shadow-xl py-1.5 text-xs z-50">
                  <button
                    onClick={() => {
                      newBlankProject();
                      setOpenMenu(null);
                    }}
                    className="w-full px-3 py-1.5 hover:bg-teal-50 flex items-center gap-2.5 text-left text-slate-700 cursor-pointer"
                  >
                    <FilePlus className="w-3.5 h-3.5 text-slate-500" />
                    <span>Nuevo proyecto (.plno)</span>
                  </button>

                  <button
                    onClick={() => {
                      fileInputRef.current?.click();
                      setOpenMenu(null);
                    }}
                    className="w-full px-3 py-1.5 hover:bg-teal-50 flex items-center gap-2.5 text-left text-slate-700 cursor-pointer"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-[#0f766e]" />
                    <span>Abrir archivo (.plno)...</span>
                  </button>

                  {/* Submenu: Ejemplos Clásicos de PLC */}
                  <div
                    onMouseEnter={() => setShowExamplesSubmenu(true)}
                    onMouseLeave={() => setShowExamplesSubmenu(false)}
                    className="relative"
                  >
                    <button
                      onClick={() => {
                        setShowExamplesModal(true);
                        setOpenMenu(null);
                      }}
                      className="w-full px-3 py-1.5 hover:bg-teal-50 flex items-center justify-between text-left text-slate-800 font-semibold cursor-pointer"
                    >
                      <span className="flex items-center gap-2.5">
                        <BookOpen className="w-3.5 h-3.5 text-[#ea580c]" />
                        <span>Abrir Ejemplos PLC (9)</span>
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                    </button>

                    {showExamplesSubmenu && (
                      <div className="absolute left-full top-0 ml-0.5 w-80 bg-white border border-slate-300 rounded-lg shadow-xl py-1.5 z-50">
                        <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                          Circuitos Clásicos de PLC (.plno)
                        </div>
                        {PLC_EXAMPLES.map((ex) => (
                          <button
                            key={ex.fileName}
                            onClick={() => {
                              loadPlnoProject(ex);
                              setOpenMenu(null);
                              setShowExamplesSubmenu(false);
                            }}
                            className="w-full px-3 py-1.5 hover:bg-teal-50 text-left flex flex-col cursor-pointer border-b border-slate-50 last:border-0"
                          >
                            <span className="font-semibold text-slate-800">{ex.title}</span>
                            <span className="text-[10px] text-slate-500 truncate">
                              {ex.description}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="my-1 border-t border-slate-200" />

                  <button
                    onClick={() => handleSavePlno()}
                    className="w-full px-3 py-1.5 hover:bg-teal-50 flex items-center justify-between text-left text-slate-700 cursor-pointer"
                  >
                    <span className="flex items-center gap-2.5">
                      <Save className="w-3.5 h-3.5 text-[#0f766e]" />
                      <span>Guardar ({projectFileName})</span>
                    </span>
                  </button>

                  <button
                    onClick={() => {
                      const custom = window.prompt(
                        'Nombre del archivo (.plno):',
                        projectFileName
                      );
                      if (custom) handleSavePlno(custom);
                    }}
                    className="w-full px-3 py-1.5 hover:bg-teal-50 flex items-center gap-2.5 text-left text-slate-700 cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5 text-slate-500" />
                    <span>Guardar como (.plno)...</span>
                  </button>

                  <button
                    onClick={() => {
                      setShowExportModal(true);
                      setOpenMenu(null);
                    }}
                    className="w-full px-3 py-1.5 hover:bg-teal-50 flex items-center gap-2.5 text-left text-slate-700 cursor-pointer"
                  >
                    <Cpu className="w-3.5 h-3.5 text-amber-600" />
                    <span>Exportar Firmware & HAL OpenPLC...</span>
                  </button>

                  <div className="my-1 border-t border-slate-200" />

                  <button
                    onClick={() => {
                      newBlankProject();
                      setOpenMenu(null);
                    }}
                    className="w-full px-3 py-1.5 hover:bg-rose-50 flex items-center gap-2.5 text-left text-rose-700 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Cerrar proyecto</span>
                  </button>
                </div>
              )}
            </div>

            {/* Menu: Editar */}
            <div className="relative">
              <button
                onClick={() => setOpenMenu(openMenu === 'editar' ? null : 'editar')}
                className={`px-2 py-1 rounded text-xs font-medium cursor-pointer ${
                  openMenu === 'editar'
                    ? 'bg-slate-200 text-slate-900'
                    : 'text-slate-700 hover:bg-slate-200/60'
                }`}
              >
                Editar
              </button>

              {openMenu === 'editar' && (
                <div className="absolute left-0 top-full mt-1 w-60 bg-white border border-slate-300 rounded-lg shadow-xl py-1.5 text-xs z-50">
                  <button
                    onClick={() => {
                      addRung();
                      setOpenMenu(null);
                    }}
                    className="w-full px-3 py-1.5 hover:bg-teal-50 text-left text-slate-700 cursor-pointer"
                  >
                    + Añadir Red (Rung)
                  </button>
                  <button
                    onClick={() => {
                      const targetId = selectedRungId ?? rungs[0]?.id;
                      if (targetId) toggleParallelBranch(targetId, '%QX0.0');
                      setOpenMenu(null);
                    }}
                    className="w-full px-3 py-1.5 hover:bg-teal-50 text-left text-slate-700 cursor-pointer"
                  >
                    Conmutar Rama Paralela OR
                  </button>
                  <button
                    onClick={() => {
                      syncLadderToST();
                      setOpenMenu(null);
                    }}
                    className="w-full px-3 py-1.5 hover:bg-teal-50 text-left text-slate-700 cursor-pointer"
                  >
                    Convertir Ladder → Structured Text (ST)
                  </button>
                  <div className="my-1 border-t border-slate-200" />
                  <button
                    onClick={() => {
                      resetMemory();
                      setOpenMenu(null);
                    }}
                    className="w-full px-3 py-1.5 hover:bg-teal-50 text-left text-slate-700 cursor-pointer"
                  >
                    Reiniciar Memoria del PLC
                  </button>
                  <button
                    onClick={() => {
                      clearLogs();
                      setOpenMenu(null);
                    }}
                    className="w-full px-3 py-1.5 hover:bg-teal-50 text-left text-slate-700 cursor-pointer"
                  >
                    Limpiar Historial de Logs
                  </button>
                </div>
              )}
            </div>

            {/* Menu: Ver (Window Activation & Fullscreen) */}
            <div className="relative">
              <button
                onClick={() => setOpenMenu(openMenu === 'ver' ? null : 'ver')}
                className={`px-2 py-1 rounded text-xs font-medium cursor-pointer ${
                  openMenu === 'ver'
                    ? 'bg-slate-200 text-slate-900'
                    : 'text-slate-700 hover:bg-slate-200/60'
                }`}
              >
                Ver
              </button>

              {openMenu === 'ver' && (
                <div className="absolute left-0 top-full mt-1 w-68 bg-white border border-slate-300 rounded-lg shadow-xl py-1.5 text-xs z-50">
                  <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Ventanas Acoplables
                  </div>
                  <button
                    onClick={() => setShowLeftSidebar(!showLeftSidebar)}
                    className="w-full px-3 py-1.5 hover:bg-teal-50 flex items-center justify-between text-left text-slate-700 cursor-pointer"
                  >
                    <span>Ventana Librería de Bloques (Izquierda)</span>
                    {showLeftSidebar && <Check className="w-3.5 h-3.5 text-[#0f766e]" />}
                  </button>

                  <button
                    onClick={() => setShowRightBoardDock(!showRightBoardDock)}
                    className="w-full px-3 py-1.5 hover:bg-teal-50 flex items-center justify-between text-left text-slate-700 cursor-pointer"
                  >
                    <span>Ventana Placa KC868-A16 (Derecha)</span>
                    {showRightBoardDock && <Check className="w-3.5 h-3.5 text-[#0f766e]" />}
                  </button>

                  <button
                    onClick={() => setShowBottomConsole(!showBottomConsole)}
                    className="w-full px-3 py-1.5 hover:bg-teal-50 flex items-center justify-between text-left text-slate-700 cursor-pointer"
                  >
                    <span>Ventana Diagnósticos y Logs (Inferior)</span>
                    {showBottomConsole && <Check className="w-3.5 h-3.5 text-[#0f766e]" />}
                  </button>

                  <div className="my-1 border-t border-slate-200" />

                  <button
                    onClick={() => {
                      setShowLeftSidebar(true);
                      setShowRightBoardDock(true);
                      setShowBottomConsole(true);
                      setIsCenterFullscreen(false);
                      setOpenMenu(null);
                    }}
                    className="w-full px-3 py-1.5 hover:bg-teal-50 text-left font-medium text-[#0f766e] cursor-pointer"
                  >
                    Activar Todas las Ventanas
                  </button>

                  <button
                    onClick={() => {
                      setIsCenterFullscreen(true);
                      setOpenMenu(null);
                    }}
                    className="w-full px-3 py-1.5 hover:bg-teal-50 flex items-center gap-2 text-left text-slate-800 font-semibold cursor-pointer"
                  >
                    <Maximize2 className="w-3.5 h-3.5 text-[#0f766e]" />
                    <span>Ventana Central en Pantalla Completa</span>
                  </button>
                </div>
              )}
            </div>

            {/* Menu: Simulación */}
            <div className="relative">
              <button
                onClick={() => setOpenMenu(openMenu === 'simulacion' ? null : 'simulacion')}
                className={`px-2 py-1 rounded text-xs font-medium cursor-pointer ${
                  openMenu === 'simulacion'
                    ? 'bg-slate-200 text-slate-900'
                    : 'text-slate-700 hover:bg-slate-200/60'
                }`}
              >
                Simulación
              </button>

              {openMenu === 'simulacion' && (
                <div className="absolute left-0 top-full mt-1 w-56 bg-white border border-slate-300 rounded-lg shadow-xl py-1.5 text-xs z-50">
                  <button
                    onClick={() => {
                      setRunning(!isRunning);
                      setOpenMenu(null);
                    }}
                    className="w-full px-3 py-1.5 hover:bg-teal-50 text-left font-semibold text-slate-800 cursor-pointer"
                  >
                    {isRunning ? 'Detener Simulación (STOP)' : 'Iniciar Simulación (RUN)'}
                  </button>
                  <button
                    onClick={() => {
                      stepSingleScan();
                      setOpenMenu(null);
                    }}
                    className="w-full px-3 py-1.5 hover:bg-teal-50 text-left text-slate-700 cursor-pointer"
                  >
                    Ejecutar 1 Ciclo de Scan (Paso)
                  </button>
                  <button
                    onClick={() => {
                      compileProgram();
                      setOpenMenu(null);
                    }}
                    className="w-full px-3 py-1.5 hover:bg-teal-50 text-left text-slate-700 cursor-pointer"
                  >
                    Compilar y Validar IEC 61131-3
                  </button>
                </div>
              )}
            </div>

            {/* Menu: Redes Industriales */}
            <div className="relative">
              <button
                onClick={() => setOpenMenu(openMenu === 'redes' ? null : 'redes')}
                className={`px-2 py-1 rounded text-xs font-semibold cursor-pointer ${
                  openMenu === 'redes'
                    ? 'bg-slate-200 text-[#0f766e]'
                    : 'text-[#0f766e] hover:bg-slate-200/60'
                }`}
              >
                Redes Industriales
              </button>

              {openMenu === 'redes' && (
                <div className="absolute left-0 top-full mt-1 w-64 bg-white border border-slate-300 rounded-lg shadow-xl py-1.5 text-xs z-50">
                  <button
                    onClick={() => {
                      setWorkspaceView('networks');
                      setOpenMenu(null);
                    }}
                    className="w-full px-3 py-1.5 hover:bg-teal-50 text-left font-semibold text-slate-800 cursor-pointer"
                  >
                    Abrir Laboratorio de Redes Industriales
                  </button>
                  <div className="my-1 border-t border-slate-200" />
                  <button
                    onClick={() => {
                      sendModbusTCPRequest(1, 0, 8);
                      setShowBottomConsole(true);
                      setOpenMenu(null);
                    }}
                    className="w-full px-3 py-1.5 hover:bg-teal-50 text-left text-slate-700 cursor-pointer"
                  >
                    Inyectar Petición Modbus TCP (Puerto 502)
                  </button>
                  <button
                    onClick={() => {
                      sendModbusRTURequest(3, 0, 4);
                      setShowBottomConsole(true);
                      setOpenMenu(null);
                    }}
                    className="w-full px-3 py-1.5 hover:bg-teal-50 text-left text-slate-700 cursor-pointer"
                  >
                    Inyectar Petición RS485 Modbus RTU
                  </button>
                  <button
                    onClick={() => {
                      captureI2CBusFrames();
                      setShowBottomConsole(true);
                      setOpenMenu(null);
                    }}
                    className="w-full px-3 py-1.5 hover:bg-teal-50 text-left text-slate-700 cursor-pointer"
                  >
                    Capturar Tramas Bus I²C 4×PCF8574
                  </button>
                </div>
              )}
            </div>

            {/* Quick Examples Button */}
            <button
              onClick={() => setShowExamplesModal(true)}
              className="px-2 py-1 rounded text-xs font-semibold text-[#ea580c] hover:bg-orange-50 cursor-pointer flex items-center gap-1"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Ejemplos</span>
            </button>
          </div>

          {/* Right: Segmented View Switcher + .plno Filename + Simular CTA */}
          <div className="flex items-center gap-2.5 flex-wrap">
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

            <span
              onClick={() => {
                const name = window.prompt('Nombre del proyecto (.plno):', projectFileName);
                if (name) setProjectFileName(name);
              }}
              title="Haz clic para renombrar el archivo .plno"
              className="hidden xl:inline text-xs font-mono text-slate-600 hover:text-[#0f766e] px-1 cursor-pointer"
            >
              {projectFileName}
            </span>

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
      )}

      {/* Row 2: Parameters Sub-bar (Hidden in Fullscreen) */}
      {!isCenterFullscreen && (
        <div className="flex items-center justify-between px-3.5 py-1.5 bg-[#f8fafc] border-b border-slate-300 text-xs">
          <div className="flex items-center gap-4 flex-wrap">
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
              Firmware & HAL OpenPLC
            </button>
          </div>

          <div className="font-mono text-xs text-slate-600">
            {isRunning
              ? `Simulación en curso (${scanFreq} Hz · Scan #${scanCount} · ${lastScanUs} µs)`
              : 'Simulación detenida.'}
          </div>
        </div>
      )}

      {/* Row 3: Central Window Tab Strip + Fullscreen Toggle Button */}
      <div className="flex items-center justify-between px-2 pt-1.5 bg-[#e9eef2] border-b border-slate-300 text-xs">
        <div className="flex items-center gap-1">
          <div className="px-3 py-1.5 rounded-t-md bg-white border-t border-x border-slate-300 font-medium text-slate-800 flex items-center gap-2 -mb-px">
            <span>
              {workspaceView === 'networks'
                ? 'Redes Industriales: Modbus TCP / RS485 RTU / I²C PCF8574'
                : workspaceView === 'board'
                ? 'Hardware: Placa KinCony KC868-A16 (ESP32)'
                : `${projectFileName} — ${language === 'LD' ? 'Diagrama Ladder' : 'Structured Text'}`}
            </span>
            <button
              onClick={newBlankProject}
              title="Cerrar proyecto actual y crear uno en blanco"
              className="p-0.5 rounded hover:bg-rose-100 text-slate-400 hover:text-rose-700 cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <button
            onClick={addRung}
            className="p-1.5 text-slate-600 hover:text-slate-900 cursor-pointer"
            title="Añadir nueva red"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Fullscreen / Restore Window Mode Icon Button */}
        <div className="flex items-center gap-2 mb-1 mr-2">
          {isCenterFullscreen ? (
            <button
              onClick={() => setIsCenterFullscreen(false)}
              title="Salir de pantalla completa y volver al modo ventanas"
              className="px-2.5 py-1 rounded bg-[#0f766e] hover:bg-[#115e59] text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <Minimize2 className="w-3.5 h-3.5" />
              <span>Volver a Modo Ventanas</span>
            </button>
          ) : (
            <button
              onClick={() => setIsCenterFullscreen(true)}
              title="Expandir ventana central a pantalla completa"
              className="px-2 py-0.5 rounded bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-[11px] font-medium flex items-center gap-1 cursor-pointer"
            >
              <Maximize2 className="w-3 h-3 text-[#0f766e]" />
              <span>Pantalla Completa</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Workspace with Resizable & Closable Windows */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Resizable Sidebar (Hidden when closed or when Central Window is Fullscreen) */}
        {!isCenterFullscreen && showLeftSidebar && (
          <>
            <LeftLibrarySidebar
              width={leftWidth}
              onClose={() => setShowLeftSidebar(false)}
            />
            <div
              onMouseDown={() => {
                draggingRef.current = 'left';
                document.body.style.cursor = 'col-resize';
              }}
              title="Arrastra para redimensionar la ventana de librería"
              className="w-1.5 bg-slate-200 hover:bg-[#0f766e]/60 cursor-col-resize transition-colors shrink-0 flex items-center justify-center"
            >
              <div className="w-0.5 h-8 bg-slate-400 rounded-full" />
            </div>
          </>
        )}

        {/* Center Window + Resizable Bottom Console */}
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

          {!isCenterFullscreen && showBottomConsole && (
            <>
              <div
                onMouseDown={() => {
                  draggingRef.current = 'bottom';
                  document.body.style.cursor = 'row-resize';
                }}
                title="Arrastra para redimensionar la ventana de mensajes y logs"
                className="h-2 bg-[#f1f5f9] hover:bg-[#0f766e]/30 border-t border-slate-300 cursor-row-resize transition-colors shrink-0 flex items-center justify-center"
              >
                <div className="w-10 h-1 bg-slate-300 rounded-full" />
              </div>
              <BottomConsole
                height={bottomHeight}
                onClose={() => setShowBottomConsole(false)}
              />
            </>
          )}
        </div>

        {/* Right Resizable KinCony KC868-A16 Board Window */}
        {!isCenterFullscreen && workspaceView === 'schematic' && showRightBoardDock && (
          <>
            <div
              onMouseDown={() => {
                draggingRef.current = 'right';
                document.body.style.cursor = 'col-resize';
              }}
              title="Arrastra para redimensionar la ventana de la placa KC868-A16"
              className="w-1.5 bg-slate-200 hover:bg-[#0f766e]/60 cursor-col-resize transition-colors shrink-0 flex items-center justify-center"
            >
              <div className="w-0.5 h-8 bg-slate-400 rounded-full" />
            </div>
            <div style={{ width: rightWidth }} className="shrink-0 h-full overflow-hidden">
              <BoardSimulator onClose={() => setShowRightBoardDock(false)} />
            </div>
          </>
        )}
      </div>

      {showExportModal && <ExportModal onClose={() => setShowExportModal(false)} />}
      {showExamplesModal && (
        <ExamplesModal
          onSelectExample={(ex) => loadPlnoProject(ex)}
          onClose={() => setShowExamplesModal(false)}
        />
      )}
    </div>
  );
};

export default App;
