import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Plus,
  Check,
  Maximize2,
  Minimize2,
  ChevronRight,
  Globe,
} from 'lucide-react';
import { usePLCStore } from './store/usePLCStore';
import { LeftLibrarySidebar } from './components/LeftLibrarySidebar';
import { LadderEditor } from './components/LadderEditor';
import { STEditor } from './components/STEditor';
import { BoardSimulator } from './components/BoardSimulator';
import { IndustrialNetworksLab } from './components/IndustrialNetworksLab';
import { GrafcetEditor } from './components/GrafcetEditor';
import { PlantTwin2D } from './components/PlantTwin2D';
import { ApiAndMcpHub } from './components/ApiAndMcpHub';
import { BottomConsole } from './components/BottomConsole';
import { ExportModal } from './components/ExportModal';
import { ExamplesModal } from './components/ExamplesModal';
import { PLC_EXAMPLES, PlnoProjectFile } from './utils/plcExamples';
import { PLCLanguage, ScanFrequency } from './types/plc';
import { initPclinoGlobalApi } from './sdk/pclinoApi';
import { LOCALES, LocaleCode, translateText } from './utils/i18n';

type OpenMenuId = 'archivo' | 'editar' | 'ver' | 'simulacion' | 'herramientas' | 'ayuda' | null;

export const App: React.FC = () => {
  const {
    uiLocale,
    projectFileName,
    workspaceView,
    language,
    isRunning,
    scanFreq,
    scanCount,
    lastScanUs,
    rungs,
    selectedRungId,
    setUiLocale,
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

  const t = (text: string) => translateText(uiLocale, text);

  const [openMenu, setOpenMenu] = useState<OpenMenuId>(null);
  const [showExamplesSubmenu, setShowExamplesSubmenu] = useState(false);
  const [showLangSubmenu, setShowLangSubmenu] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showExamplesModal, setShowExamplesModal] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);

  // Window visibility states (controlled via X buttons on windows and the "Ver" menu)
  const [showLeftSidebar, setShowLeftSidebar] = useState(true);
  const [showRightBoardDock, setShowRightBoardDock] = useState(true);
  const [showBottomConsole, setShowBottomConsole] = useState(true);

  // Fullscreen mode for the central window
  const [isCenterFullscreen, setIsCenterFullscreen] = useState(false);

  // Resizable panel dimensions
  const [leftWidth, setLeftWidth] = useState(236);
  const [rightWidth, setRightWidth] = useState(380);
  const [bottomHeight, setBottomHeight] = useState(215);

  const draggingRef = useRef<'left' | 'right' | 'bottom' | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const menuBarRef = useRef<HTMLDivElement | null>(null);

  // Initialize Global Public SDK API (window.pclino)
  useEffect(() => {
    initPclinoGlobalApi();
  }, []);

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
        setShowLangSubmenu(false);
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
        setLeftWidth(Math.max(180, Math.min(440, e.clientX)));
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
    addLog('INFO', `${t('Guardar')}: ${targetName}`);
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
          addLog('ERROR', `Invalid .plno file: ${file.name}`);
        }
      } catch {
        addLog('ERROR', `Could not read file: ${file.name}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#e6eaee] text-[#18232e] overflow-hidden select-none">
      {/* Hidden File Input for Opening .plno Files */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".plno,.json"
        onChange={handleOpenFileChange}
        className="hidden"
      />

      {/* Top Header Bar (#top) — Identical layout & identity to Simulino */}
      {!isCenterFullscreen && (
        <header className="bg-[#f3f5f7] border-b border-[#cbd3db] px-4 py-2 flex flex-wrap items-center gap-x-3.5 gap-y-2 z-30">
          {/* 1. Brand Logo + PCLino Title (Barlow Condensed 21px) */}
          <h1 className="inline-flex items-center gap-1.5 m-0 mr-1">
            <img src="/pclino_icono.svg" alt="" className="w-[26px] h-[26px]" />
            <span className="simulino-brand">PCLino</span>
          </h1>

          {/* 2. Classic 6-Menu Bar (#menubar: Archivo, Editar, Ver, Simulación, Herramientas, Ayuda) */}
          <nav
            ref={menuBarRef}
            role="menubar"
            aria-label="Menú principal"
            className="flex flex-wrap items-center gap-0 -ml-1.5 relative text-[13.5px]"
          >
            {/* Menu 1: Archivo / File */}
            <div className="relative">
              <button
                onClick={() => setOpenMenu(openMenu === 'archivo' ? null : 'archivo')}
                onMouseEnter={() => openMenu && setOpenMenu('archivo')}
                className={`px-2.5 py-1 rounded cursor-pointer transition-colors ${
                  openMenu === 'archivo' ? 'bg-[#d4e9ec]' : 'hover:bg-[#d4e9ec]'
                }`}
              >
                {t('Archivo')}
              </button>

              {openMenu === 'archivo' && (
                <div className="absolute left-0 top-full mt-0.5 min-w-[230px] bg-[#f3f5f7] border border-[#cbd3db] rounded-md shadow-xl p-1 text-[13px] z-50">
                  <button
                    onClick={() => {
                      newBlankProject();
                      setOpenMenu(null);
                    }}
                    className="w-full px-2.5 py-1 rounded hover:bg-[#d4e9ec] flex items-center justify-between text-left cursor-pointer"
                  >
                    <span>{t('Nuevo proyecto (.plno)')}</span>
                  </button>

                  <button
                    onClick={() => {
                      fileInputRef.current?.click();
                      setOpenMenu(null);
                    }}
                    className="w-full px-2.5 py-1 rounded hover:bg-[#d4e9ec] flex items-center justify-between text-left cursor-pointer"
                  >
                    <span>{t('Abrir archivo (.plno)...')}</span>
                    <span className="text-[11px] font-mono text-[#5a6875] pl-4">⌘O</span>
                  </button>

                  <button
                    onClick={() => handleSavePlno()}
                    className="w-full px-2.5 py-1 rounded hover:bg-[#d4e9ec] flex items-center justify-between text-left cursor-pointer"
                  >
                    <span>
                      {t('Guardar')} ({projectFileName})
                    </span>
                    <span className="text-[11px] font-mono text-[#5a6875] pl-4">⌘S</span>
                  </button>

                  <button
                    onClick={() => {
                      const custom = window.prompt(
                        uiLocale === 'en' ? 'File name (.plno):' : 'Nombre del archivo (.plno):',
                        projectFileName
                      );
                      if (custom) handleSavePlno(custom);
                    }}
                    className="w-full px-2.5 py-1 rounded hover:bg-[#d4e9ec] flex items-center justify-between text-left cursor-pointer"
                  >
                    <span>{t('Guardar como (.plno)...')}</span>
                    <span className="text-[11px] font-mono text-[#5a6875] pl-4">⌘⇧S</span>
                  </button>

                  <hr className="my-1 border-t border-[#cbd3db]" />

                  {/* Submenu: Ejemplos */}
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
                      className="w-full px-2.5 py-1 rounded hover:bg-[#d4e9ec] flex items-center justify-between text-left cursor-pointer"
                    >
                      <span>{t('Ejemplos PLC (9)')}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-[#5a6875]" />
                    </button>

                    {showExamplesSubmenu && (
                      <div className="absolute left-full top-0 ml-0.5 w-80 bg-[#f3f5f7] border border-[#cbd3db] rounded-md shadow-xl p-1 z-50">
                        <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#5a6875] border-b border-[#cbd3db]">
                          {t('Circuitos Clásicos de PLC (.plno)')}
                        </div>
                        {PLC_EXAMPLES.map((ex) => (
                          <button
                            key={ex.fileName}
                            onClick={() => {
                              loadPlnoProject(ex);
                              setOpenMenu(null);
                              setShowExamplesSubmenu(false);
                            }}
                            className="w-full px-2.5 py-1.5 rounded hover:bg-[#d4e9ec] text-left flex flex-col cursor-pointer"
                          >
                            <span className="font-medium text-[#18232e]">{ex.title}</span>
                            <span className="text-[11px] text-[#5a6875] truncate">
                              {ex.description}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <hr className="my-1 border-t border-[#cbd3db]" />

                  <button
                    onClick={() => {
                      setShowExportModal(true);
                      setOpenMenu(null);
                    }}
                    className="w-full px-2.5 py-1 rounded hover:bg-[#d4e9ec] flex items-center justify-between text-left cursor-pointer"
                  >
                    <span>{t('Exportar Firmware & HAL OpenPLC...')}</span>
                  </button>

                  <hr className="my-1 border-t border-[#cbd3db]" />

                  <button
                    onClick={() => {
                      newBlankProject();
                      setOpenMenu(null);
                    }}
                    className="w-full px-2.5 py-1 rounded hover:bg-[#d4e9ec] flex items-center justify-between text-left text-[#ae2c2c] cursor-pointer"
                  >
                    <span>{t('Cerrar proyecto')}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Menu 2: Editar / Edit */}
            <div className="relative">
              <button
                onClick={() => setOpenMenu(openMenu === 'editar' ? null : 'editar')}
                onMouseEnter={() => openMenu && setOpenMenu('editar')}
                className={`px-2.5 py-1 rounded cursor-pointer transition-colors ${
                  openMenu === 'editar' ? 'bg-[#d4e9ec]' : 'hover:bg-[#d4e9ec]'
                }`}
              >
                {t('Editar')}
              </button>

              {openMenu === 'editar' && (
                <div className="absolute left-0 top-full mt-0.5 min-w-[240px] bg-[#f3f5f7] border border-[#cbd3db] rounded-md shadow-xl p-1 text-[13px] z-50">
                  <button
                    onClick={() => {
                      addRung();
                      setOpenMenu(null);
                    }}
                    className="w-full px-2.5 py-1 rounded hover:bg-[#d4e9ec] text-left cursor-pointer"
                  >
                    {t('+ Añadir Red (Rung)')}
                  </button>
                  <button
                    onClick={() => {
                      const targetId = selectedRungId ?? rungs[0]?.id;
                      if (targetId) toggleParallelBranch(targetId, '%QX0.0');
                      setOpenMenu(null);
                    }}
                    className="w-full px-2.5 py-1 rounded hover:bg-[#d4e9ec] text-left cursor-pointer"
                  >
                    {t('Conmutar Rama Paralela OR')}
                  </button>
                  <button
                    onClick={() => {
                      syncLadderToST();
                      setOpenMenu(null);
                    }}
                    className="w-full px-2.5 py-1 rounded hover:bg-[#d4e9ec] text-left cursor-pointer"
                  >
                    {t('Convertir Ladder → Structured Text (ST)')}
                  </button>
                  <hr className="my-1 border-t border-[#cbd3db]" />
                  <button
                    onClick={() => {
                      resetMemory();
                      setOpenMenu(null);
                    }}
                    className="w-full px-2.5 py-1 rounded hover:bg-[#d4e9ec] text-left cursor-pointer"
                  >
                    {t('Reiniciar Memoria del PLC')}
                  </button>
                  <button
                    onClick={() => {
                      clearLogs();
                      setOpenMenu(null);
                    }}
                    className="w-full px-2.5 py-1 rounded hover:bg-[#d4e9ec] text-left cursor-pointer"
                  >
                    {t('Limpiar Historial de Logs')}
                  </button>
                </div>
              )}
            </div>

            {/* Menu 3: Ver / View */}
            <div className="relative">
              <button
                onClick={() => setOpenMenu(openMenu === 'ver' ? null : 'ver')}
                onMouseEnter={() => openMenu && setOpenMenu('ver')}
                className={`px-2.5 py-1 rounded cursor-pointer transition-colors ${
                  openMenu === 'ver' ? 'bg-[#d4e9ec]' : 'hover:bg-[#d4e9ec]'
                }`}
              >
                {t('Ver')}
              </button>

              {openMenu === 'ver' && (
                <div className="absolute left-0 top-full mt-0.5 min-w-[265px] bg-[#f3f5f7] border border-[#cbd3db] rounded-md shadow-xl p-1 text-[13px] z-50">
                  <button
                    onClick={() => setShowLeftSidebar(!showLeftSidebar)}
                    className="w-full px-2.5 py-1 rounded hover:bg-[#d4e9ec] flex items-center gap-2 text-left cursor-pointer"
                  >
                    <span className="w-4 text-[#0b6b78] font-bold">
                      {showLeftSidebar ? '✓' : ''}
                    </span>
                    <span>{t('Panel de componentes (Izquierda)')}</span>
                  </button>

                  <button
                    onClick={() => setShowRightBoardDock(!showRightBoardDock)}
                    className="w-full px-2.5 py-1 rounded hover:bg-[#d4e9ec] flex items-center gap-2 text-left cursor-pointer"
                  >
                    <span className="w-4 text-[#0b6b78] font-bold">
                      {showRightBoardDock ? '✓' : ''}
                    </span>
                    <span>{t('Panel de placa KC868-A16 (Derecha)')}</span>
                  </button>

                  <button
                    onClick={() => setShowBottomConsole(!showBottomConsole)}
                    className="w-full px-2.5 py-1 rounded hover:bg-[#d4e9ec] flex items-center gap-2 text-left cursor-pointer"
                  >
                    <span className="w-4 text-[#0b6b78] font-bold">
                      {showBottomConsole ? '✓' : ''}
                    </span>
                    <span>{t('Panel de diagnósticos y registro (Inferior)')}</span>
                  </button>

                  <hr className="my-1 border-t border-[#cbd3db]" />

                  <button
                    onClick={() => {
                      setShowLeftSidebar(true);
                      setShowRightBoardDock(true);
                      setShowBottomConsole(true);
                      setIsCenterFullscreen(false);
                      setOpenMenu(null);
                    }}
                    className="w-full px-2.5 py-1 rounded hover:bg-[#d4e9ec] pl-6 text-left cursor-pointer"
                  >
                    {t('Mostrar todos los paneles')}
                  </button>

                  <button
                    onClick={() => {
                      setIsCenterFullscreen(true);
                      setOpenMenu(null);
                    }}
                    className="w-full px-2.5 py-1 rounded hover:bg-[#d4e9ec] pl-6 text-left cursor-pointer"
                  >
                    {t('Ventana central en pantalla completa')}
                  </button>
                </div>
              )}
            </div>

            {/* Menu 4: Simulación / Simulation */}
            <div className="relative">
              <button
                onClick={() => setOpenMenu(openMenu === 'simulacion' ? null : 'simulacion')}
                onMouseEnter={() => openMenu && setOpenMenu('simulacion')}
                className={`px-2.5 py-1 rounded cursor-pointer transition-colors ${
                  openMenu === 'simulacion' ? 'bg-[#d4e9ec]' : 'hover:bg-[#d4e9ec]'
                }`}
              >
                {t('Simulación')}
              </button>

              {openMenu === 'simulacion' && (
                <div className="absolute left-0 top-full mt-0.5 min-w-[230px] bg-[#f3f5f7] border border-[#cbd3db] rounded-md shadow-xl p-1 text-[13px] z-50">
                  <button
                    onClick={() => {
                      setRunning(!isRunning);
                      setOpenMenu(null);
                    }}
                    className="w-full px-2.5 py-1 rounded hover:bg-[#d4e9ec] text-left font-medium cursor-pointer"
                  >
                    {isRunning ? t('Detener simulación') : t('Simular en vivo')}
                  </button>
                  <button
                    onClick={() => {
                      stepSingleScan();
                      setOpenMenu(null);
                    }}
                    className="w-full px-2.5 py-1 rounded hover:bg-[#d4e9ec] text-left cursor-pointer"
                  >
                    {t('Ejecutar 1 ciclo de Scan (Calcular)')}
                  </button>
                  <button
                    onClick={() => {
                      compileProgram();
                      setOpenMenu(null);
                    }}
                    className="w-full px-2.5 py-1 rounded hover:bg-[#d4e9ec] text-left cursor-pointer"
                  >
                    {t('Compilar y validar IEC 61131-3')}
                  </button>
                </div>
              )}
            </div>

            {/* Menu 5: Herramientas / Tools (Simulino style: houses all specialized workspaces & instruments) */}
            <div className="relative">
              <button
                onClick={() => setOpenMenu(openMenu === 'herramientas' ? null : 'herramientas')}
                onMouseEnter={() => openMenu && setOpenMenu('herramientas')}
                className={`px-2.5 py-1 rounded cursor-pointer transition-colors ${
                  openMenu === 'herramientas' ? 'bg-[#d4e9ec]' : 'hover:bg-[#d4e9ec]'
                }`}
              >
                {t('Herramientas')}
              </button>

              {openMenu === 'herramientas' && (
                <div className="absolute left-0 top-full mt-0.5 min-w-[270px] bg-[#f3f5f7] border border-[#cbd3db] rounded-md shadow-xl p-1 text-[13px] z-50">
                  <button
                    onClick={() => {
                      setWorkspaceView('schematic');
                      setOpenMenu(null);
                    }}
                    className="w-full px-2.5 py-1 rounded hover:bg-[#d4e9ec] flex items-center gap-2 text-left cursor-pointer"
                  >
                    <span className="w-4 text-[#0b6b78] font-bold">
                      {workspaceView === 'schematic' ? '✓' : ''}
                    </span>
                    <span>{t('Esquemático Ladder / ST')}</span>
                  </button>

                  <button
                    onClick={() => {
                      setWorkspaceView('grafcet');
                      setOpenMenu(null);
                    }}
                    className="w-full px-2.5 py-1 rounded hover:bg-[#d4e9ec] flex items-center gap-2 text-left cursor-pointer"
                  >
                    <span className="w-4 text-[#0b6b78] font-bold">
                      {workspaceView === 'grafcet' ? '✓' : ''}
                    </span>
                    <span>{t('Editor GRAFCET / SFC')}</span>
                  </button>

                  <button
                    onClick={() => {
                      setWorkspaceView('twin2d');
                      setOpenMenu(null);
                    }}
                    className="w-full px-2.5 py-1 rounded hover:bg-[#d4e9ec] flex items-center gap-2 text-left cursor-pointer"
                  >
                    <span className="w-4 text-[#0b6b78] font-bold">
                      {workspaceView === 'twin2d' ? '✓' : ''}
                    </span>
                    <span>{t('Gemelo Digital 2D de Planta')}</span>
                  </button>

                  <button
                    onClick={() => {
                      setWorkspaceView('networks');
                      setOpenMenu(null);
                    }}
                    className="w-full px-2.5 py-1 rounded hover:bg-[#d4e9ec] flex items-center gap-2 text-left cursor-pointer"
                  >
                    <span className="w-4 text-[#0b6b78] font-bold">
                      {workspaceView === 'networks' ? '✓' : ''}
                    </span>
                    <span>{t('Laboratorio de Redes Industriales')}</span>
                  </button>

                  <button
                    onClick={() => {
                      setWorkspaceView('board');
                      setOpenMenu(null);
                    }}
                    className="w-full px-2.5 py-1 rounded hover:bg-[#d4e9ec] flex items-center gap-2 text-left cursor-pointer"
                  >
                    <span className="w-4 text-[#0b6b78] font-bold">
                      {workspaceView === 'board' ? '✓' : ''}
                    </span>
                    <span>{t('Vista Placa KinCony KC868-A16')}</span>
                  </button>

                  <button
                    onClick={() => {
                      setWorkspaceView('api_mcp');
                      setOpenMenu(null);
                    }}
                    className="w-full px-2.5 py-1 rounded hover:bg-[#d4e9ec] flex items-center gap-2 text-left cursor-pointer"
                  >
                    <span className="w-4 text-[#0b6b78] font-bold">
                      {workspaceView === 'api_mcp' ? '✓' : ''}
                    </span>
                    <span>{t('Consola SDK API & Servidor MCP')}</span>
                  </button>

                  <hr className="my-1 border-t border-[#cbd3db]" />

                  <button
                    onClick={() => {
                      sendModbusTCPRequest(1, 0, 8);
                      setShowBottomConsole(true);
                      setOpenMenu(null);
                    }}
                    className="w-full px-2.5 py-1 rounded hover:bg-[#d4e9ec] pl-6 text-left cursor-pointer"
                  >
                    {t('Inyectar trama Modbus TCP (502)')}
                  </button>

                  <button
                    onClick={() => {
                      sendModbusRTURequest(3, 0, 4);
                      setShowBottomConsole(true);
                      setOpenMenu(null);
                    }}
                    className="w-full px-2.5 py-1 rounded hover:bg-[#d4e9ec] pl-6 text-left cursor-pointer"
                  >
                    {t('Inyectar trama RS485 Modbus RTU')}
                  </button>

                  <button
                    onClick={() => {
                      captureI2CBusFrames();
                      setShowBottomConsole(true);
                      setOpenMenu(null);
                    }}
                    className="w-full px-2.5 py-1 rounded hover:bg-[#d4e9ec] pl-6 text-left cursor-pointer"
                  >
                    {t('Capturar bus I²C 4×PCF8574')}
                  </button>

                  <hr className="my-1 border-t border-[#cbd3db]" />

                  <button
                    onClick={() => {
                      setShowExportModal(true);
                      setOpenMenu(null);
                    }}
                    className="w-full px-2.5 py-1 rounded hover:bg-[#d4e9ec] pl-6 text-left cursor-pointer"
                  >
                    {t('Firmware ESP32 & Flasheo WebSerial...')}
                  </button>
                </div>
              )}
            </div>

            {/* Menu 6: Ayuda / Help (Includes Idioma / Language submenu exactly like Simulino) */}
            <div className="relative">
              <button
                onClick={() => setOpenMenu(openMenu === 'ayuda' ? null : 'ayuda')}
                onMouseEnter={() => openMenu && setOpenMenu('ayuda')}
                className={`px-2.5 py-1 rounded cursor-pointer transition-colors ${
                  openMenu === 'ayuda' ? 'bg-[#d4e9ec]' : 'hover:bg-[#d4e9ec]'
                }`}
              >
                {t('Ayuda')}
              </button>

              {openMenu === 'ayuda' && (
                <div className="absolute left-0 top-full mt-0.5 min-w-[215px] bg-[#f3f5f7] border border-[#cbd3db] rounded-md shadow-xl p-1 text-[13px] z-50">
                  {/* Idioma / Language Submenu */}
                  <div
                    onMouseEnter={() => setShowLangSubmenu(true)}
                    onMouseLeave={() => setShowLangSubmenu(false)}
                    className="relative"
                  >
                    <button className="w-full px-2.5 py-1 rounded hover:bg-[#d4e9ec] flex items-center justify-between text-left cursor-pointer">
                      <span>{t('Idioma')}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-[#5a6875]" />
                    </button>

                    {showLangSubmenu && (
                      <div className="absolute left-full top-0 ml-0.5 min-w-[150px] bg-[#f3f5f7] border border-[#cbd3db] rounded-md shadow-xl p-1 z-50">
                        {(Object.entries(LOCALES) as [LocaleCode, string][]).map(([code, label]) => (
                          <button
                            key={code}
                            onClick={() => {
                              setUiLocale(code);
                              setOpenMenu(null);
                              setShowLangSubmenu(false);
                            }}
                            className="w-full px-2.5 py-1 rounded hover:bg-[#d4e9ec] flex items-center gap-2 text-left cursor-pointer"
                          >
                            <span className="w-4 text-[#0b6b78] font-bold">
                              {uiLocale === code ? '✓' : ''}
                            </span>
                            <span>{label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <hr className="my-1 border-t border-[#cbd3db]" />

                  <button
                    onClick={() => {
                      setShowExamplesModal(true);
                      setOpenMenu(null);
                    }}
                    className="w-full px-2.5 py-1 rounded hover:bg-[#d4e9ec] text-left cursor-pointer"
                  >
                    {t('Galería de ejemplos PLC...')}
                  </button>

                  <button
                    onClick={() => {
                      setShowAboutModal(true);
                      setOpenMenu(null);
                    }}
                    className="w-full px-2.5 py-1 rounded hover:bg-[#d4e9ec] text-left cursor-pointer"
                  >
                    {t('Acerca de PCLino')}
                  </button>
                </div>
              )}
            </div>
          </nav>

          {/* 3. Simulino's 2-button Segmented View Toggle (#viewseg: Esquemático | Placa) */}
          <div
            role="group"
            aria-label={uiLocale === 'en' ? 'View' : 'Vista'}
            className="inline-flex border border-[#cbd3db] rounded-[6px] overflow-hidden bg-[#fbfcfd] text-[13px]"
          >
            <button
              onClick={() => setWorkspaceView('schematic')}
              className={`px-2.5 py-1 cursor-pointer transition-colors ${
                workspaceView === 'schematic'
                  ? 'bg-[#0b6b78] text-white font-medium'
                  : 'text-[#5a6875] hover:text-[#18232e]'
              }`}
            >
              {uiLocale === 'en' ? 'Schematic' : 'Esquemático'}
            </button>
            <button
              onClick={() => setWorkspaceView('board')}
              className={`px-2.5 py-1 border-l border-[#cbd3db] cursor-pointer transition-colors ${
                workspaceView === 'board'
                  ? 'bg-[#0b6b78] text-white font-medium'
                  : 'text-[#5a6875] hover:text-[#18232e]'
              }`}
            >
              {uiLocale === 'en' ? 'Board' : 'Placa'}
            </button>
          </div>

          {/* 4. Open Filename (#fname) */}
          <span
            onClick={() => {
              const name = window.prompt(
                uiLocale === 'en' ? 'Project name (.plno):' : 'Nombre del proyecto (.plno):',
                projectFileName
              );
              if (name) setProjectFileName(name);
            }}
            title={uiLocale === 'en' ? 'Open file (click to rename)' : 'Archivo abierto (clic para renombrar)'}
            className="font-mono text-[12px] text-[#5a6875] hover:text-[#0b6b78] cursor-pointer max-w-[22ch] truncate"
          >
            {projectFileName}
          </span>

          {/* 5. Simulino Run / Calculate / Profile Group */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setRunning(!isRunning)}
              className={`px-3.5 py-1 rounded-[4px] border text-[13.5px] font-semibold cursor-pointer transition-colors ${
                isRunning
                  ? 'bg-[#ae2c2c] border-[#ae2c2c] text-white'
                  : 'bg-[#0b6b78] border-[#0b6b78] text-white hover:bg-[#095964]'
              }`}
            >
              {isRunning ? t('Detener') : t('Simular')}
            </button>

            <button
              onClick={() => {
                compileProgram();
                stepSingleScan();
              }}
              className="px-2.5 py-1 rounded-[4px] bg-[#fbfcfd] border border-[#cbd3db] hover:border-[#0b6b78] text-[13.5px] text-[#18232e] cursor-pointer"
            >
              {t('Calcular')}
            </button>

            <select
              value={language}
              onChange={(e) => {
                setLanguage(e.target.value as PLCLanguage);
                setWorkspaceView('schematic');
              }}
              aria-label="Lenguaje IEC"
              className="px-2 py-1 rounded-[4px] bg-[#fbfcfd] border border-[#cbd3db] hover:border-[#0b6b78] text-[13.5px] text-[#18232e] cursor-pointer"
            >
              <option value="LD">{uiLocale === 'en' ? 'Ladder (LD)' : 'Escalera (LD)'}</option>
              <option value="ST">{uiLocale === 'en' ? 'Structured Text (ST)' : 'Texto Estructurado (ST)'}</option>
            </select>

            <button
              onClick={() => setShowExportModal(true)}
              title={t('Exportar Firmware & HAL OpenPLC...')}
              className="px-2.5 py-1 rounded-[4px] bg-[#fbfcfd] border border-[#cbd3db] hover:border-[#0b6b78] text-[13.5px] text-[#18232e] cursor-pointer"
            >
              ⚙
            </button>
          </div>

          {/* 6. Simulino Window & Speed Group + Optional Language Toggle (ES / EN) + Right Status */}
          <div className="w-full flex flex-wrap items-center justify-between gap-2 pt-0.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              <label className="simulino-lab">{t('VENTANA')}</label>
              <select
                value={scanFreq}
                onChange={(e) => setScanFreq(Number(e.target.value) as ScanFrequency)}
                className="px-2 py-1 rounded-[4px] bg-[#fbfcfd] border border-[#cbd3db] font-mono text-[12.5px] text-[#18232e] w-[84px]"
              >
                <option value={10}>100 ms</option>
                <option value={20}>50 ms</option>
                <option value={50}>20 ms</option>
                <option value={100}>10 ms</option>
              </select>

              <label className="simulino-lab ml-1">{t('VELOCIDAD')}</label>
              <select
                defaultValue="1"
                className="px-2 py-1 rounded-[4px] bg-[#fbfcfd] border border-[#cbd3db] text-[13px] text-[#18232e]"
              >
                <option value="1">{t('Tiempo real')}</option>
                <option value="0.1">1/10</option>
                <option value="0.01">1/100</option>
              </select>

              {/* If viewing a specialized tool from Herramientas, show a clean 'Volver al esquemático' button like Simulino */}
              {workspaceView !== 'schematic' && (
                <button
                  onClick={() => setWorkspaceView('schematic')}
                  className="ml-2 px-2.5 py-1 rounded-[4px] bg-[#d4e9ec] border border-[#0b6b78] text-[#0b6b78] text-[12.5px] font-medium cursor-pointer"
                >
                  ← {t('Volver al esquemático')}
                </button>
              )}
            </div>

            <div className="flex items-center gap-3 ml-auto">
              {/* Optional Language Switcher (ES | EN) */}
              <button
                onClick={() => setUiLocale(uiLocale === 'es' ? 'en' : 'es')}
                title={uiLocale === 'es' ? 'Switch to English' : 'Cambiar a Español'}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] bg-[#fbfcfd] border border-[#cbd3db] hover:border-[#0b6b78] font-mono text-[11.5px] text-[#5a6875] hover:text-[#18232e] cursor-pointer"
              >
                <Globe className="w-3 h-3 text-[#0b6b78]" />
                <span className={uiLocale === 'es' ? 'font-bold text-[#0b6b78]' : ''}>ES</span>
                <span>/</span>
                <span className={uiLocale === 'en' ? 'font-bold text-[#0b6b78]' : ''}>EN</span>
              </button>

              {/* Status text (#status) */}
              <div
                role="status"
                className={`font-mono text-[12px] text-right truncate ${
                  isRunning ? 'text-[#1f7a4d]' : 'text-[#5a6875]'
                }`}
              >
                {isRunning
                  ? `${t('Simulación en curso')} (${scanFreq} Hz · Scan #${scanCount} · ${lastScanUs} µs)`
                  : t('Simulación detenida.')}
              </div>
            </div>
          </div>

          {/* 7. Simulino Project Tab Strip (#projtabs) */}
          <div
            role="tablist"
            aria-label="Proyectos abiertos"
            className="w-full flex items-center justify-between gap-1 -mb-2 pt-0.5 overflow-x-auto"
          >
            <div className="flex items-center gap-0.5">
              <div
                role="tab"
                aria-selected="true"
                className="flex items-center gap-2 max-w-[260px] px-2.5 py-1 border border-[#cbd3db] border-b-0 rounded-t-[6px] bg-[#e6eaee] text-[#18232e] text-[12px] font-medium shadow-[inset_0_2px_0_#0b6b78]"
              >
                <span className="truncate">
                  {workspaceView === 'networks'
                    ? t('Laboratorio de Redes Industriales')
                    : workspaceView === 'grafcet'
                    ? t('Editor GRAFCET / SFC')
                    : workspaceView === 'twin2d'
                    ? t('Gemelo Digital 2D de Planta')
                    : workspaceView === 'api_mcp'
                    ? t('Consola SDK API & Servidor MCP')
                    : workspaceView === 'board'
                    ? t('Vista Placa KinCony KC868-A16')
                    : projectFileName}
                </span>
                <button
                  onClick={newBlankProject}
                  title={t('Cerrar proyecto')}
                  className="px-1 rounded hover:bg-[#cbd3db] text-[#5a6875] hover:text-[#18232e] cursor-pointer"
                >
                  ×
                </button>
              </div>
              <button
                onClick={addRung}
                title={t('+ Añadir Red (Rung)')}
                className="px-2.5 py-0.5 text-[15px] text-[#5a6875] hover:text-[#18232e] cursor-pointer"
              >
                +
              </button>
            </div>

            <button
              onClick={() => setIsCenterFullscreen(true)}
              title={t('Ventana central en pantalla completa')}
              className="mb-1 px-2 py-0.5 rounded-[4px] bg-[#fbfcfd] hover:border-[#0b6b78] border border-[#cbd3db] text-[#5a6875] hover:text-[#18232e] text-[11px] flex items-center gap-1 cursor-pointer"
            >
              <Maximize2 className="w-3 h-3 text-[#0b6b78]" />
              <span>{t('Pantalla Completa')}</span>
            </button>
          </div>
        </header>
      )}

      {/* Fullscreen Restore Bar when in Fullscreen Mode */}
      {isCenterFullscreen && (
        <div className="flex items-center justify-between px-3 py-1 bg-[#f3f5f7] border-b border-[#cbd3db] text-xs">
          <div className="flex items-center gap-2">
            <img src="/pclino_icono.svg" alt="" className="w-4 h-4" />
            <span className="font-semibold text-[#18232e]">PCLino — {projectFileName}</span>
          </div>
          <button
            onClick={() => setIsCenterFullscreen(false)}
            className="px-2.5 py-1 rounded-[4px] bg-[#0b6b78] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Minimize2 className="w-3.5 h-3.5" />
            <span>{t('Volver a Modo Ventanas')}</span>
          </button>
        </div>
      )}

      {/* Main Workspace with Resizable & Closable Windows */}
      <div className="flex-1 flex overflow-hidden relative border-t border-[#cbd3db]">
        {/* Left Resizable Sidebar (#tools) */}
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
              title="Drag to resize"
              className="w-1.5 bg-[#e6eaee] hover:bg-[#0b6b78]/50 border-x border-[#cbd3db] cursor-col-resize transition-colors shrink-0"
            />
          </>
        )}

        {/* Center Window (#sheet) + Resizable Bottom Console (#scopeWrap) */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#fbfcfd]">
          <div className="flex-1 overflow-hidden flex flex-col">
            {workspaceView === 'networks' ? (
              <IndustrialNetworksLab />
            ) : workspaceView === 'grafcet' ? (
              <GrafcetEditor />
            ) : workspaceView === 'twin2d' ? (
              <PlantTwin2D />
            ) : workspaceView === 'api_mcp' ? (
              <ApiAndMcpHub />
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
                title={uiLocale === 'en' ? 'Drag to change height' : 'Arrastra para cambiar la altura'}
                className="h-[7px] bg-[#f3f5f7] hover:bg-[#d4e9ec] border-t border-[#cbd3db] cursor-row-resize transition-colors shrink-0 flex items-center justify-center"
              >
                <div className="w-[34px] h-[3px] bg-[#cbd3db] rounded-xs" />
              </div>
              <BottomConsole
                height={bottomHeight}
                onClose={() => setShowBottomConsole(false)}
              />
            </>
          )}
        </div>

        {/* Right Resizable KinCony KC868-A16 Board Window (#side) */}
        {!isCenterFullscreen && workspaceView === 'schematic' && showRightBoardDock && (
          <>
            <div
              onMouseDown={() => {
                draggingRef.current = 'right';
                document.body.style.cursor = 'col-resize';
              }}
              title="Drag to resize"
              className="w-1.5 bg-[#e6eaee] hover:bg-[#0b6b78]/50 border-x border-[#cbd3db] cursor-col-resize transition-colors shrink-0"
            />
            <div style={{ width: rightWidth }} className="shrink-0 h-full overflow-hidden">
              <BoardSimulator onClose={() => setShowRightBoardDock(false)} />
            </div>
          </>
        )}
      </div>

      {/* Export Firmware / HAL / WebSerial Modal */}
      {showExportModal && <ExportModal onClose={() => setShowExportModal(false)} />}

      {/* PLC Examples Modal */}
      {showExamplesModal && (
        <ExamplesModal
          onSelectExample={(ex) => loadPlnoProject(ex)}
          onClose={() => setShowExamplesModal(false)}
        />
      )}

      {/* About PCLino Dialog (Identical style to Simulino's #info dialog) */}
      {showAboutModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-[#f3f5f7] text-[#18232e] border border-[#cbd3db] rounded-lg p-5 max-w-md w-full shadow-xl">
            <img
              src="/pclino_icono.svg"
              alt="PCLino"
              className="w-24 h-24 mx-auto mb-3 p-2 bg-white rounded-lg border border-[#cbd3db]"
            />
            <h2 className="simulino-brand text-center mb-2">PCLino</h2>
            <p className="text-xs text-[#5a6875] text-center leading-relaxed mb-4">
              {uiLocale === 'en'
                ? 'IEC 61131-3 PLC Studio & Industrial Networks Simulator for KinCony KC868-A16 (ESP32). Part of the Simulino laboratory suite.'
                : 'Entorno IEC 61131-3 y Simulador de Redes Industriales para la placa KinCony KC868-A16 (ESP32). Con la identidad visual de Simulino.'}
            </p>
            <div className="flex justify-end">
              <button
                onClick={() => setShowAboutModal(false)}
                className="px-3.5 py-1 rounded-[4px] bg-[#0b6b78] text-white text-xs font-semibold cursor-pointer"
              >
                {uiLocale === 'en' ? 'Close' : 'Cerrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
