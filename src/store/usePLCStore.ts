import { create } from 'zustand';
import {
  CompileDiagnostic,
  CounterBlockState,
  ExternalHardwareModule,
  FaultInjectionConfig,
  GrafcetStep,
  KinConyHardwareConfig,
  LadderElement,
  LadderElementType,
  LadderRung,
  LogEntry,
  NetworkTransaction,
  OscilloscopeSample,
  PLCLanguage,
  ScanFrequency,
  TimerBlockState,
  VariableSymbol,
  WorkspaceView,
} from '../types/plc';
import {
  DEFAULT_LADDER_RUNGS,
  DEFAULT_ST_CODE,
  DEFAULT_SYMBOLS,
  iecAddressToIndex,
} from '../utils/defaultProgram';
import {
  executeLadderScan,
  executeSTScan,
  PLCMemorySnapshot,
   readBooleanVariable,
  validateSTCode,
  writeBooleanVariable,
} from '../engine/plcEngine';
import { generateSTFromLadder } from '../utils/codeExporter';
import {
  buildDeviceNetTransaction,
  buildHartTransaction,
  buildI2CTransaction,
  executeModbusRTUTransaction,
  executeModbusTCPTransaction,
} from '../utils/industrialNetworks';
import { PlnoProjectFile } from '../utils/plcExamples';

export type ScanHookCallback = (mem: PLCMemorySnapshot, scanCount: number) => void;
const externalScanHooks = new Set<ScanHookCallback>();

export function registerExternalScanHook(cb: ScanHookCallback): () => void {
  externalScanHooks.add(cb);
  return () => externalScanHooks.delete(cb);
}

interface PLCStoreState {
  projectFileName: string;
  workspaceView: WorkspaceView;
  language: PLCLanguage;
  activeSheet: number;
  isRunning: boolean;
  scanFreq: ScanFrequency;
  scanCount: number;
  lastScanUs: number;

  // Process image memory
  inputs: boolean[];
  momentaryMask: boolean[];
  outputs: boolean[];
  markers: boolean[];
  words: number[];
  analogs: number[];
  timers: Record<string, TimerBlockState>;
  counters: Record<string, CounterBlockState>;
  edgeMemory: Record<string, boolean>;
  symbols: VariableSymbol[];

  // Digital Twin 2D Plant Simulation State
  autoPlantTwin: boolean;
  tankLevelPct: number;       // 0..100 %
  conveyorBoxes: number[];    // Positions 0..100 % along belt

  // GRAFCET / SFC Sequential Steps
  grafcetSteps: GrafcetStep[];

  // External SDK Hardware Modules
  externalModules: ExternalHardwareModule[];

  // Oscilloscope / History buffer
  oscSamples: OscilloscopeSample[];
  activeProbes: string[];

  // Industrial Network Frame Log & Fault Injection
  networkTransactions: NetworkTransaction[];
  modbusTxSeq: number;
  faults: FaultInjectionConfig;

  // Programs
  rungs: LadderRung[];
  stCode: string;
  selectedRungId: string | null;
  selectedElementId: string | null;

  // Diagnostics & Logs
  diagnostics: CompileDiagnostic[];
  logs: LogEntry[];

  // KinCony KC868-A16 Hardware Link
  hwConfig: KinConyHardwareConfig;
  hwConnected: boolean;

  // Actions
  setProjectFileName: (name: string) => void;
  loadPlnoProject: (proj: PlnoProjectFile) => void;
  newBlankProject: () => void;
  exportPlnoString: () => string;
  setWorkspaceView: (view: WorkspaceView) => void;
  setLanguage: (lang: PLCLanguage) => void;
  setActiveSheet: (sheet: number) => void;
  setRunning: (run: boolean) => void;
  setScanFreq: (freq: ScanFrequency) => void;
  stepSingleScan: () => void;
  resetMemory: () => void;

  // Digital Twin & GRAFCET actions
  setAutoPlantTwin: (enabled: boolean) => void;
  setTankLevelPct: (pct: number) => void;
  updateGrafcetStep: (id: string, patch: Partial<GrafcetStep>) => void;
  addGrafcetStep: () => void;
  compileGrafcetToLadder: () => void;

  // External Modules & SDK actions
  registerModule: (mod: ExternalHardwareModule) => void;
  toggleModule: (id: string) => void;

  // I/O actions
  toggleInput: (index: number) => void;
  setInputState: (index: number, val: boolean) => void;
  toggleMomentaryMode: (index: number) => void;
  setAnalogChannel: (ch: number, value: number) => void;
  setWordValue: (index: number, value: number) => void;
  setCoilValue: (index: number, value: boolean) => void;

  // Probe actions
  toggleProbe: (probeName: string) => void;
  clearOscilloscope: () => void;

  // Industrial Network & Fault Injection actions
  updateFaults: (patch: Partial<FaultInjectionConfig>) => void;
  sendModbusTCPRequest: (fc: number, startAddr: number, quantityOrVal: number) => void;
  sendModbusRTURequest: (fc: number, startAddr: number, quantityOrVal: number) => void;
  sendHartCommand: (pollingAddr: number, cmd: 0 | 1 | 2 | 3) => void;
  sendDeviceNetFrame: (macId: number, mode: 'POLLED_IO' | 'EXPLICIT_CIP') => void;
  captureI2CBusFrames: () => void;
  clearNetworkTransactions: () => void;

  // Variable Symbol & Force actions
  updateSymbol: (address: string, patch: Partial<VariableSymbol>) => void;
  addSymbol: (symbol: VariableSymbol) => void;
  toggleForceVariable: (address: string, forcedValue?: boolean | number) => void;

  // Ladder Editor actions
  selectRung: (rungId: string | null) => void;
  selectElement: (rungId: string | null, elementId: string | null) => void;
  addRung: () => void;
  deleteRung: (rungId: string) => void;
  updateRungComment: (rungId: string, comment: string) => void;
  addElementToRung: (rungId: string, type: LadderElementType) => void;
  updateElement: (rungId: string, elementId: string, patch: Partial<LadderElement>) => void;
  deleteElement: (rungId: string, elementId: string) => void;
  toggleParallelBranch: (rungId: string, branchVariable?: string) => void;

  // ST Editor & Compiler actions
  setSTCode: (code: string) => void;
  syncLadderToST: () => void;
  compileProgram: () => boolean;

  // Hardware Config & Logs
  updateHwConfig: (patch: Partial<KinConyHardwareConfig>) => void;
  setHwConnected: (connected: boolean) => void;
  applyHardwareTelemetry: (ix: number[], qx: number[], iw?: number[]) => void;
  addLog: (level: LogEntry['level'], message: string) => void;
  clearLogs: () => void;
}

const createInitialTimers = (): Record<string, TimerBlockState> => ({
  T0: { id: 'T0', type: 'TON', IN: false, Q: false, PT: 2500, ET: 0, startTime: null },
  T1: { id: 'T1', type: 'TOF', IN: false, Q: false, PT: 1500, ET: 0, startTime: null },
  T2: { id: 'T2', type: 'TP', IN: false, Q: false, PT: 1000, ET: 0, startTime: null, prevIN: false },
});

const createInitialCounters = (): Record<string, CounterBlockState> => ({
  C0: { id: 'C0', type: 'CTU', CU: false, R: false, Q: false, PV: 5, CV: 0, prevCU: false },
  C1: { id: 'C1', type: 'CTD', CU: false, CD: false, R: false, LD: false, Q: false, PV: 5, CV: 5, prevCU: false, prevCD: false },
  C2: { id: 'C2', type: 'CTUD', CU: false, CD: false, R: false, Q: false, QD: true, PV: 10, CV: 0, prevCU: false, prevCD: false },
});

const DEFAULT_GRAFCET_STEPS: GrafcetStep[] = [
  {
    id: 'g-step-0',
    stepNumber: 0,
    name: 'Reposo / Espera',
    isInitial: true,
    active: true,
    actionCoil: '',
    actionDescription: 'Sistema listo esperando pulsador de marcha (%IX0.0)',
    transitionCondition: '%IX0.0',
    transitionComment: 'Pulsador Marcha DI1 (%IX0.0 = 1)',
    nextStepNumber: 1,
  },
  {
    id: 'g-step-1',
    stepNumber: 1,
    name: 'Llenado & Cinta',
    active: false,
    actionCoil: '%QX0.0',
    actionDescription: 'Activar Motor Principal / Bomba Llenado (%QX0.0)',
    transitionCondition: '%IX0.4',
    transitionComment: 'Sensor Nivel Alto Tanque (%IX0.4 = 1)',
    nextStepNumber: 2,
  },
  {
    id: 'g-step-2',
    stepNumber: 2,
    name: 'Mezclado Estrella-Triángulo',
    active: false,
    actionCoil: '%QX0.1',
    actionDescription: 'Activar AgitadorAlta Velocidad (%QX0.1)',
    transitionCondition: '%IX0.2',
    transitionComment: 'Confirmación Sensor Óptico (%IX0.2 = 1)',
    nextStepNumber: 3,
  },
  {
    id: 'g-step-3',
    stepNumber: 3,
    name: 'Drenaje de Tanque',
    active: false,
    actionCoil: '%QX0.3',
    actionDescription: 'Abrir Válvula de Drenaje (%QX0.3)',
    transitionCondition: '%IX0.5',
    transitionComment: 'Boya Nivel Bajo alcanzada (%IX0.5 = 1)',
    nextStepNumber: 0,
  },
];

const DEFAULT_EXTERNAL_MODULES: ExternalHardwareModule[] = [
  {
    id: 'mod-dac-mcp4725',
    name: 'DAC Analógico 0-10V (MCP4725)',
    bus: 'I2C',
    address: '0x60',
    description: 'Salida analógica I²C 12-bit para variador de frecuencia VFD',
    enabled: true,
    registers: { '%QW0_DAC': 2048 },
  },
  {
    id: 'mod-vfd-modbus',
    name: 'Variador VFD (RS485 Slave #2)',
    bus: 'RS485',
    address: 'Slave 2',
    description: 'Variador trifásico controlado por Modbus RTU en GPIO16/13',
    enabled: true,
    registers: { FreqHz: 50, CurrentAmp: 4.2 },
  },
  {
    id: 'mod-can-devicenet',
    name: 'Isla Válvulas Neumáticas (DeviceNet)',
    bus: 'CAN_TWAI',
    address: 'MAC #12',
    description: 'Transceptor SN65HVD230 en GPIO32/33 a 125 kbps',
    enabled: true,
    registers: { ValveByte: 0x05 },
  },
];

const nowTimeStr = (): string => {
  const d = new Date();
  return d.toTimeString().split(' ')[0] + '.' + String(d.getMilliseconds()).padStart(3, '0');
};

export const usePLCStore = create<PLCStoreState>((set, get) => ({
  projectFileName: 'planta_kc868.plno',
  workspaceView: 'schematic',
  language: 'LD',
  activeSheet: 0,
  isRunning: false,
  scanFreq: 50,
  scanCount: 0,
  lastScanUs: 38,

  inputs: Array(16).fill(false),
  momentaryMask: [true, true, true, true, false, false, false, false, false, false, false, false, false, false, false, false],
  outputs: Array(16).fill(false),
  markers: Array(16).fill(false),
  words: [0, 2800, 50, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  analogs: [1850, 2048, 960, 3200, 245, 580, 228, 0],
  timers: createInitialTimers(),
  counters: createInitialCounters(),
  edgeMemory: {},
  symbols: DEFAULT_SYMBOLS,

  autoPlantTwin: true,
  tankLevelPct: 32,
  conveyorBoxes: [12, 48, 78],

  grafcetSteps: DEFAULT_GRAFCET_STEPS,
  externalModules: DEFAULT_EXTERNAL_MODULES,

  oscSamples: [],
  activeProbes: ['%IX0.0', '%QX0.0'],

  networkTransactions: [],
  modbusTxSeq: 1,
  faults: {
    corruptCrc16: false,
    forceModbusException: 0,
    i2cNackFault: false,
    rs485PolaritySwap: false,
  },

  rungs: DEFAULT_LADDER_RUNGS,
  stCode: DEFAULT_ST_CODE,
  selectedRungId: 'rung-1',
  selectedElementId: null,

  diagnostics: [],
  logs: [
    {
      id: 'init-1',
      timestamp: nowTimeStr(),
      level: 'INFO',
      message: 'PCLino inicializado. Placa: KinCony KC868-A16 (ESP32 + 4×PCF8574 I²C + LAN8720 ETH + RS485 + CAN TWAI).',
    },
    {
      id: 'init-2',
      timestamp: nowTimeStr(),
      level: 'MCP',
      message: 'API SDK (window.pclino) y Servidor MCP listos para programar módulos externos, Gemelo 2D y GRAFCET.',
    },
  ],

  hwConfig: {
    transport: 'websocket',
    wsUrl: 'ws://192.168.1.50:81',
    modbusIp: '192.168.1.50',
    modbusPort: 502,
    rs485BaudRate: 9600,
    rs485SlaveId: 1,
    mqttBroker: 'mqtt://192.168.1.10:1883',
    mqttTopicPrefix: 'spBv1.0/KinConyPlanta/NDATA/KC868_A16',
    useEthernet: true,
    i2cSdaPin: 4,
    i2cSclPin: 5,
    pcfIn1Addr: '0x22',
    pcfIn2Addr: '0x21',
    pcfOut1Addr: '0x24',
    pcfOut2Addr: '0x25',
  },
  hwConnected: false,

  setProjectFileName: (name) =>
    set({ projectFileName: name.endsWith('.plno') ? name : `${name}.plno` }),

  loadPlnoProject: (proj) => {
    get().resetMemory();
    set({
      projectFileName: proj.fileName.endsWith('.plno')
        ? proj.fileName
        : `${proj.fileName}.plno`,
      language: proj.language || 'LD',
      activeSheet: 0,
      rungs: proj.rungs,
      stCode: proj.stCode,
      symbols: proj.symbols || DEFAULT_SYMBOLS,
      selectedRungId: proj.rungs[0]?.id ?? null,
      selectedElementId: null,
      workspaceView: 'schematic',
    });
    get().addLog(
      'INFO',
      `Proyecto cargado: "${proj.title}" (${proj.fileName}) — ${proj.description}`
    );
  },

  newBlankProject: () => {
    get().resetMemory();
    const blankRung: LadderRung = {
      id: `rung-${Date.now()}`,
      number: 1,
      sheet: 1,
      comment: 'Red 1: Nuevo circuito de control',
      elements: [
        { id: `el-${Date.now()}-1`, type: 'NO', variable: '%IX0.0', label: 'START_BTN' },
        { id: `el-${Date.now()}-2`, type: 'COIL', variable: '%QX0.0', label: 'MAIN_CONTACTOR' },
      ],
    };
    set({
      projectFileName: 'nuevo_proyecto.plno',
      language: 'LD',
      activeSheet: 0,
      rungs: [blankRung],
      stCode: `PROGRAM Nuevo_Proyecto\nVAR\n  START_BTN AT %IX0.0 : BOOL;\n  MAIN_CONTACTOR AT %QX0.0 : BOOL;\nEND_VAR\n\n%QX0.0 := %IX0.0;\n\nEND_PROGRAM`,
      selectedRungId: blankRung.id,
      selectedElementId: null,
      workspaceView: 'schematic',
    });
    get().addLog('INFO', 'Proyecto cerrado / reiniciado a nuevo_proyecto.plno.');
  },

  exportPlnoString: () => {
    const s = get();
    const payload: PlnoProjectFile = {
      format: 'PCLINO_PROJECT',
      version: '1.0',
      fileName: s.projectFileName,
      title: s.projectFileName.replace(/\.plno$/i, ''),
      category: 'Usuario',
      description: 'Proyecto guardado desde PCLino Studio',
      language: s.language,
      rungs: s.rungs,
      stCode: s.stCode,
      symbols: s.symbols,
      hwConfig: s.hwConfig,
    };
    return JSON.stringify(payload, null, 2);
  },

  setWorkspaceView: (view) => set({ workspaceView: view }),

  setLanguage: (lang) => {
    set({ language: lang });
    get().addLog('INFO', `Vista de programación cambiada a ${lang}.`);
  },

  setActiveSheet: (sheet) => set({ activeSheet: sheet }),

  setRunning: (run) => {
    if (run) {
      const ok = get().compileProgram();
      if (!ok) {
        get().addLog('ERROR', 'No se puede iniciar Simulación: existen errores en el programa.');
        return;
      }
      set({ isRunning: true });
      get().addLog('SCAN', `Simulación en tiempo real iniciada (${get().scanFreq} Hz).`);
    } else {
      set({ isRunning: false });
      get().addLog('SCAN', 'Simulación detenida.');
    }
  },

  setScanFreq: (freq) => set({ scanFreq: freq }),

  stepSingleScan: () => {
    const state = get();
    const t0 = performance.now();

    const nextInputs = [...state.inputs];
    const nextOutputs = [...state.outputs];
    const nextMarkers = [...state.markers];
    const nextWords = [...state.words];
    const nextAnalogs = [...state.analogs];
    const nextTimers = { ...state.timers };
    const nextCounters = { ...state.counters };
    const nextEdges = { ...state.edgeMemory };

    // Closed-loop 2D Digital Twin physics when running and autoPlantTwin is active
    let nextTankLevel = state.tankLevelPct;
    let nextBoxes = [...state.conveyorBoxes];

    if (state.isRunning && state.autoPlantTwin) {
      // Tank physics: %QX0.0 fills (+0.35% per scan), %QX0.3 drains (-0.55% per scan)
      if (nextOutputs[0]) nextTankLevel = Math.min(100, nextTankLevel + 0.35);
      if (nextOutputs[3]) nextTankLevel = Math.max(0, nextTankLevel - 0.55);

      // Update level float sensors %IX0.4 (High >= 85%) and %IX0.5 (Low <= 18%)
      nextInputs[4] = nextTankLevel >= 85;
      nextInputs[5] = nextTankLevel <= 18 && state.tankLevelPct > 18;

      // Update analog pressure transmitter A1 (%IW0) proportional to tank level (400..3950 ADC)
      nextAnalogs[0] = Math.round(400 + (nextTankLevel / 100) * 3550);

      // Conveyor belt physics: move boxes when motor %QX0.0 is ON
      if (nextOutputs[0]) {
        const speed = nextOutputs[1] ? 1.1 : 0.6; // Faster in Delta (%QX0.1) than Star
        let sensorHit = false;
        nextBoxes = nextBoxes.map((pos) => {
          const nextPos = pos + speed;
          if (nextPos >= 68 && nextPos <= 73) {
            sensorHit = true; // Optical sensor at 70% of belt
          }
          return nextPos > 100 ? 0 : Number(nextPos.toFixed(2));
        });
        nextInputs[2] = sensorHit; // %IX0.2 PULSE_SENSOR
      }
    }

    // Apply forced inputs
    state.symbols.forEach((sym) => {
      if (sym.forced && sym.forcedValue !== undefined) {
        const parsed = iecAddressToIndex(sym.address);
        if (parsed && parsed.prefix === '%IX') {
          nextInputs[parsed.index] = Boolean(sym.forcedValue);
        }
      }
    });

    const mem: PLCMemorySnapshot = {
      inputs: nextInputs,
      outputs: nextOutputs,
      markers: nextMarkers,
      words: nextWords,
      analogs: nextAnalogs,
      timers: nextTimers,
      counters: nextCounters,
      edgeMemory: nextEdges,
      symbols: state.symbols,
    };

    // Evaluate GRAFCET steps if user is on GRAFCET view
    let nextGrafcetSteps = state.grafcetSteps;
    if (state.workspaceView === 'grafcet') {
      const activeStep = state.grafcetSteps.find((s) => s.active) ?? state.grafcetSteps[0];
      if (activeStep) {
        // Execute action of active step
        state.grafcetSteps.forEach((s) => {
          if (s.actionCoil) {
            writeBooleanVariable(s.actionCoil, s.id === activeStep.id, mem);
          }
        });
        // Check transition condition
        const condMet = readBooleanVariable(activeStep.transitionCondition, mem);
        if (condMet) {
          nextGrafcetSteps = state.grafcetSteps.map((s) => ({
            ...s,
            active: s.stepNumber === activeStep.nextStepNumber,
          }));
        }
      }
    }

    let nextRungs = state.rungs;
    if (state.language === 'ST') {
      executeSTScan(state.stCode, mem, t0);
      nextRungs = executeLadderScan(state.rungs, mem, t0);
    } else if (state.workspaceView !== 'grafcet') {
      nextRungs = executeLadderScan(state.rungs, mem, t0);
    }

    // Apply forced outputs
    state.symbols.forEach((sym) => {
      if (sym.forced && sym.forcedValue !== undefined) {
        const parsed = iecAddressToIndex(sym.address);
        if (parsed) {
          if (parsed.prefix === '%QX') mem.outputs[parsed.index] = Boolean(sym.forcedValue);
          if (parsed.prefix === '%MX') mem.markers[parsed.index] = Boolean(sym.forcedValue);
        } else if (sym.address.toUpperCase().startsWith('%MW')) {
          const mwIdx = parseInt(sym.address.slice(3), 10);
          if (mwIdx >= 0 && mwIdx < 16) mem.words[mwIdx] = Number(sym.forcedValue);
        }
      }
    });

    // Invoke registered external SDK scan hooks (window.pclino.onScan)
    const nextScanCount = state.scanCount + 1;
    externalScanHooks.forEach((cb) => {
      try {
        cb(mem, nextScanCount);
      } catch {
        // ignore plugin error
      }
    });

    const elapsedUs = Math.max(14, Math.round((performance.now() - t0) * 1000));

    set({
      inputs: mem.inputs,
      outputs: mem.outputs,
      markers: mem.markers,
      words: mem.words,
      analogs: nextAnalogs,
      timers: mem.timers,
      counters: mem.counters,
      edgeMemory: nextEdges,
      rungs: nextRungs,
      grafcetSteps: nextGrafcetSteps,
      tankLevelPct: Number(nextTankLevel.toFixed(1)),
      conveyorBoxes: nextBoxes,
      scanCount: nextScanCount,
      lastScanUs: elapsedUs,
    });
  },

  resetMemory: () => {
    set({
      isRunning: false,
      scanCount: 0,
      inputs: Array(16).fill(false),
      outputs: Array(16).fill(false),
      markers: Array(16).fill(false),
      words: [0, 2800, 50, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      timers: createInitialTimers(),
      counters: createInitialCounters(),
      edgeMemory: {},
      tankLevelPct: 32,
      grafcetSteps: DEFAULT_GRAFCET_STEPS,
      rungs: get().rungs.map((r) => ({
        ...r,
        energized: false,
        elements: r.elements.map((e) => ({ ...e, energized: false, powerIn: false, powerOut: false })),
        branchElements: r.branchElements?.map((b) => ({
          ...b,
          energized: false,
          powerIn: false,
          powerOut: false,
        })),
      })),
    });
    get().addLog('WARN', 'Memoria de imagen de proceso reiniciada.');
  },

  setAutoPlantTwin: (enabled) => set({ autoPlantTwin: enabled }),
  setTankLevelPct: (pct) => set({ tankLevelPct: Math.max(0, Math.min(100, pct)) }),

  updateGrafcetStep: (id, patch) =>
    set({
      grafcetSteps: get().grafcetSteps.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }),

  addGrafcetStep: () => {
    const steps = get().grafcetSteps;
    const nextNum = steps.length;
    const newStep: GrafcetStep = {
      id: `g-step-${Date.now()}`,
      stepNumber: nextNum,
      name: `Etapa ${nextNum}`,
      active: false,
      actionCoil: '%QX0.2',
      actionDescription: `Activar salida %QX0.2 en Etapa ${nextNum}`,
      transitionCondition: '%IX0.1',
      transitionComment: 'Condición de transición',
      nextStepNumber: 0,
    };
    set({ grafcetSteps: [...steps, newStep] });
  },

  compileGrafcetToLadder: () => {
    const steps = get().grafcetSteps;
    const generatedRungs: LadderRung[] = steps
      .filter((s) => s.actionCoil)
      .map((s, idx) => ({
        id: `sfc-rung-${idx + 1}`,
        number: idx + 1,
        sheet: 1,
        comment: `GRAFCET Etapa ${s.stepNumber} (${s.name}): ${s.actionDescription} -> Transición: ${s.transitionCondition}`,
        elements: [
          {
            id: `sfc-el-${idx}-1`,
            type: 'NO',
            variable: s.transitionCondition || '%IX0.0',
            label: `TRANS_E${s.stepNumber}`,
          },
          {
            id: `sfc-el-${idx}-2`,
            type: 'COIL',
            variable: s.actionCoil || '%QX0.0',
            label: s.name.toUpperCase().replace(/\s+/g, '_'),
          },
        ],
      }));

    if (generatedRungs.length > 0) {
      set({
        rungs: generatedRungs,
        workspaceView: 'schematic',
        language: 'LD',
      });
      get().addLog('INFO', `GRAFCET compilado a ${generatedRungs.length} redes Ladder (LD).`);
    }
  },

  registerModule: (mod) => {
    const exists = get().externalModules.some((m) => m.id === mod.id);
    if (exists) {
      set({
        externalModules: get().externalModules.map((m) => (m.id === mod.id ? mod : m)),
      });
    } else {
      set({ externalModules: [...get().externalModules, mod] });
    }
    get().addLog('MCP', `Módulo externo registrado vía API: ${mod.name} (${mod.bus} - ${mod.address}).`);
  },

  toggleModule: (id) =>
    set({
      externalModules: get().externalModules.map((m) =>
        m.id === id ? { ...m, enabled: !m.enabled } : m
      ),
    }),

  toggleInput: (index) => {
    const next = [...get().inputs];
    next[index] = !next[index];
    set({ inputs: next });
    if (!get().isRunning) get().stepSingleScan();
  },

  setInputState: (index, val) => {
    if (get().inputs[index] === val) return;
    const next = [...get().inputs];
    next[index] = val;
    set({ inputs: next });
    if (!get().isRunning) get().stepSingleScan();
  },

  toggleMomentaryMode: (index) => {
    const next = [...get().momentaryMask];
    next[index] = !next[index];
    set({ momentaryMask: next });
  },

  setAnalogChannel: (ch, value) => {
    const next = [...get().analogs];
    next[ch] = Math.max(0, Math.min(4095, value));
    set({ analogs: next });
    if (!get().isRunning) get().stepSingleScan();
  },

  setWordValue: (index, value) => {
    const next = [...get().words];
    next[index] = value;
    set({ words: next });
  },

  setCoilValue: (index, value) => {
    const next = [...get().outputs];
    next[index] = value;
    set({ outputs: next });
  },

  toggleProbe: (probeName) => {
    const cur = get().activeProbes;
    if (cur.includes(probeName)) {
      if (cur.length > 1) set({ activeProbes: cur.filter((p) => p !== probeName) });
    } else {
      set({ activeProbes: [...cur, probeName] });
    }
  },

  clearOscilloscope: () => set({ oscSamples: [] }),

  updateFaults: (patch) => {
    const next = { ...get().faults, ...patch };
    set({ faults: next });
    get().addLog('WARN', `Configuración de Inyección de Fallas actualizada: ${JSON.stringify(patch)}`);
  },

  sendModbusTCPRequest: (fc, startAddr, quantityOrVal) => {
    const state = get();
    const seq = state.modbusTxSeq;
    const { request, response } = executeModbusTCPTransaction(
      seq,
      state.hwConfig.rs485SlaveId,
      fc,
      startAddr,
      quantityOrVal,
      {
        inputs: state.inputs,
        outputs: state.outputs,
        analogs: state.analogs,
        words: state.words,
        writeCoil: (idx, val) => state.setCoilValue(idx, val),
        writeWord: (idx, val) => state.setWordValue(idx, val),
        faults: state.faults,
      }
    );
    set({
      modbusTxSeq: seq + 1,
      networkTransactions: [response, request, ...state.networkTransactions.slice(0, 48)],
    });
    get().addLog(
      response.validCrcOrAck ? 'NET' : 'ERROR',
      `Modbus TCP [TxID=${seq}]: ${request.rawHex} -> ${response.summary}`
    );
  },

  sendModbusRTURequest: (fc, startAddr, quantityOrVal) => {
    const state = get();
    const { request, response } = executeModbusRTUTransaction(
      state.hwConfig.rs485SlaveId,
      fc,
      startAddr,
      quantityOrVal,
      {
        inputs: state.inputs,
        outputs: state.outputs,
        analogs: state.analogs,
        words: state.words,
        writeCoil: (idx, val) => state.setCoilValue(idx, val),
        writeWord: (idx, val) => state.setWordValue(idx, val),
        faults: state.faults,
      }
    );
    set({
      networkTransactions: [response, request, ...state.networkTransactions.slice(0, 48)],
    });
    get().addLog(
      response.validCrcOrAck ? 'NET' : 'ERROR',
      `RS485 Modbus RTU: ${request.rawHex} -> ${response.summary}`
    );
  },

  sendHartCommand: (pollingAddr, cmd) => {
    const state = get();
    const { request, response } = buildHartTransaction(
      pollingAddr,
      cmd,
      state.analogs[0] ?? 1850,
      state.analogs[4] ?? 245
    );
    set({
      networkTransactions: [response, request, ...state.networkTransactions.slice(0, 48)],
    });
    get().addLog('NET', `HART FSK Bell 202 (Cmd ${cmd}): ${response.summary}`);
  },

  sendDeviceNetFrame: (macId, mode) => {
    const state = get();
    const { request, response } = buildDeviceNetTransaction(
      macId,
      mode,
      state.inputs,
      state.outputs
    );
    set({
      networkTransactions: [response, request, ...state.networkTransactions.slice(0, 48)],
    });
    get().addLog('NET', `DeviceNet CAN 11-bit (MAC #${macId}): ${response.summary}`);
  },

  captureI2CBusFrames: () => {
    const state = get();
    const calcByte = (bits: boolean[], offset: number) => {
      let b = 0xff;
      for (let i = 0; i < 8; i++) {
        if (bits[offset + i]) b &= ~(1 << i);
      }
      return b;
    };
    const nack = state.faults.i2cNackFault;
    const f1 = buildI2CTransaction('PCF8574_DI_1_8', state.hwConfig.pcfIn1Addr, true, calcByte(state.inputs, 0), false);
    const f2 = buildI2CTransaction('PCF8574_DI_9_16', state.hwConfig.pcfIn2Addr, true, calcByte(state.inputs, 8), nack);
    const f3 = buildI2CTransaction('PCF8574_DO_1_8', state.hwConfig.pcfOut1Addr, false, calcByte(state.outputs, 0), false);
    const f4 = buildI2CTransaction('PCF8574_DO_9_16', state.hwConfig.pcfOut2Addr, false, calcByte(state.outputs, 8), nack);

    set({
      networkTransactions: [f4, f3, f2, f1, ...state.networkTransactions.slice(0, 46)],
    });
    get().addLog(
      nack ? 'ERROR' : 'NET',
      nack
        ? 'Fallo I²C NACK detectado en expansor PCF8574 (Simulación de desconexión activa).'
        : 'Capturadas 4 tramas I²C a 400 kHz de los expansores PCF8574.'
    );
  },

  clearNetworkTransactions: () => set({ networkTransactions: [] }),

  updateSymbol: (address, patch) => {
    set({
      symbols: get().symbols.map((s) => (s.address === address ? { ...s, ...patch } : s)),
    });
  },

  addSymbol: (symbol) => {
    const exists = get().symbols.some((s) => s.address.toUpperCase() === symbol.address.toUpperCase());
    if (exists) return;
    set({ symbols: [...get().symbols, symbol] });
  },

  toggleForceVariable: (address, forcedValue) => {
    const nextSymbols = get().symbols.map((s) => {
      if (s.address !== address) return s;
      const nextForced = forcedValue !== undefined ? true : !s.forced;
      return {
        ...s,
        forced: nextForced,
        forcedValue: forcedValue !== undefined ? forcedValue : !s.forcedValue,
      };
    });
    set({ symbols: nextSymbols });
    get().stepSingleScan();
  },

  selectRung: (rungId) => set({ selectedRungId: rungId }),

  selectElement: (rungId, elementId) =>
    set({ selectedRungId: rungId, selectedElementId: elementId }),

  addRung: () => {
    const current = get().rungs;
    const nextNum = current.length + 1;
    const sheet = get().activeSheet === 0 ? 1 : get().activeSheet;
    const newRung: LadderRung = {
      id: `rung-${Date.now()}`,
      number: nextNum,
      sheet,
      comment: `Red ${nextNum}: Lógica de control auxiliar`,
      elements: [
        { id: `el-${Date.now()}-1`, type: 'NO', variable: '%IX0.6', label: 'AUX_IN' },
        { id: `el-${Date.now()}-2`, type: 'COIL', variable: '%QX0.5', label: 'AUX_OUT' },
      ],
    };
    set({ rungs: [...current, newRung], selectedRungId: newRung.id });
  },

  deleteRung: (rungId) => {
    const filtered = get()
      .rungs.filter((r) => r.id !== rungId)
      .map((r, idx) => ({ ...r, number: idx + 1 }));
    set({
      rungs: filtered,
      selectedRungId: filtered[0]?.id ?? null,
      selectedElementId: null,
    });
  },

  updateRungComment: (rungId, comment) => {
    set({
      rungs: get().rungs.map((r) => (r.id === rungId ? { ...r, comment } : r)),
    });
  },

  addElementToRung: (rungId, type) => {
    const defaultVarByType: Record<LadderElementType, string> = {
      NO: '%IX0.0',
      NC: '%IX0.1',
      R_TRIG: '%IX0.2',
      F_TRIG: '%IX0.2',
      COIL: '%QX0.0',
      NEG_COIL: '%QX0.5',
      SET: '%QX0.3',
      RESET: '%QX0.3',
      SR: '%QX0.3',
      RS: '%QX0.3',
      TON: 'T0',
      TOF: 'T1',
      TP: 'T2',
      CTU: 'C0',
      CTD: 'C1',
      CTUD: 'C2',
      EQ: '%IW0',
      NE: '%IW0',
      GT: '%IW0',
      GE: '%IW0',
      LT: '%IW0',
      LE: '%IW0',
      ADD: '%MW0',
      SUB: '%MW0',
      MUL: '%MW0',
      DIV: '%MW0',
      MOVE: 'C0.CV',
    };

    const isComparator = ['EQ', 'NE', 'GT', 'GE', 'LT', 'LE'].includes(type);
    const isMath = ['ADD', 'SUB', 'MUL', 'DIV', 'MOVE'].includes(type);

    const newEl: LadderElement = {
      id: `el-${Date.now()}`,
      type,
      variable: defaultVarByType[type],
      label: type,
      ...(type === 'TON' || type === 'TOF' || type === 'TP' ? { presetMs: 2000 } : {}),
      ...(type === 'CTU' || type === 'CTD' || type === 'CTUD'
        ? { presetCount: 5, resetVariable: '%IX0.3', auxVariable: '%IX0.7' }
        : {}),
      ...(type === 'SR' || type === 'RS' ? { resetVariable: '%IX0.5' } : {}),
      ...(isComparator ? { auxVariable: '2500' } : {}),
      ...(isMath ? { auxVariable: '10', destVariable: '%MW0' } : {}),
    };

    set({
      rungs: get().rungs.map((r) => {
        if (r.id !== rungId) return r;
        const isOutputCoil = ['COIL', 'NEG_COIL', 'SET', 'RESET', 'SR', 'RS'].includes(type);
        if (isOutputCoil) {
          return { ...r, elements: [...r.elements, newEl] };
        }
        const coilIdx = r.elements.findIndex((e) =>
          ['COIL', 'NEG_COIL', 'SET', 'RESET', 'SR', 'RS'].includes(e.type)
        );
        if (coilIdx === -1) {
          return { ...r, elements: [...r.elements, newEl] };
        }
        const copy = [...r.elements];
        copy.splice(coilIdx, 0, newEl);
        return { ...r, elements: copy };
      }),
      selectedElementId: newEl.id,
    });
  },

  updateElement: (rungId, elementId, patch) => {
    set({
      rungs: get().rungs.map((r) => {
        if (r.id !== rungId) return r;
        return {
          ...r,
          elements: r.elements.map((el) => (el.id === elementId ? { ...el, ...patch } : el)),
          branchElements: r.branchElements?.map((b) =>
            b.id === elementId ? { ...b, ...patch } : b
          ),
        };
      }),
    });
  },

  deleteElement: (rungId, elementId) => {
    set({
      rungs: get().rungs.map((r) => {
        if (r.id !== rungId) return r;
        return {
          ...r,
          elements: r.elements.filter((el) => el.id !== elementId),
          branchElements: r.branchElements?.filter((b) => b.id !== elementId),
        };
      }),
      selectedElementId: null,
    });
  },

  toggleParallelBranch: (rungId, branchVariable = '%QX0.0') => {
    set({
      rungs: get().rungs.map((r) => {
        if (r.id !== rungId) return r;
        if (r.branchElements && r.branchElements.length > 0) {
          return { ...r, branchElements: undefined };
        }
        return {
          ...r,
          branchElements: [
            {
              id: `br-${Date.now()}`,
              type: 'NO',
              variable: branchVariable,
              label: 'RETENCION',
            },
          ],
        };
      }),
    });
  },

  setSTCode: (code) => set({ stCode: code }),

  syncLadderToST: () => {
    const st = generateSTFromLadder(get().rungs, get().symbols);
    set({ stCode: st, language: 'ST' });
    get().addLog('INFO', 'Diagrama Ladder transpilado a Structured Text (ST).');
  },

  compileProgram: () => {
    const state = get();
    const diags: CompileDiagnostic[] = [];

    if (state.language === 'ST') {
      diags.push(...validateSTCode(state.stCode));
    } else {
      state.rungs.forEach((r) => {
        if (r.elements.length === 0) {
          diags.push({
            rung: r.number,
            severity: 'warning',
            message: `Red #${r.number}: Red vacía.`,
          });
        }
      });
    }

    if (diags.length === 0) {
      diags.push({
        severity: 'info',
        message: 'Compilación IEC 61131-3 completada sin errores (0 errores).',
      });
    }

    set({ diagnostics: diags });
    return !diags.some((d) => d.severity === 'error');
  },

  updateHwConfig: (patch) =>
    set({ hwConfig: { ...get().hwConfig, ...patch } }),

  setHwConnected: (connected) => set({ hwConnected: connected }),

  applyHardwareTelemetry: (ix, qx, iw) => {
    set({
      inputs: ix.slice(0, 16).map(Boolean),
      outputs: qx.slice(0, 16).map(Boolean),
      ...(iw ? { analogs: iw.slice(0, 8) } : {}),
    });
  },

  addLog: (level, message) => {
    const entry: LogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: nowTimeStr(),
      level,
      message,
    };
    set({ logs: [entry, ...get().logs.slice(0, 119)] });
  },

  clearLogs: () => set({ logs: [] }),
}));
