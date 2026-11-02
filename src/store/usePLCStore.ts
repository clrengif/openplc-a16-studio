import { create } from 'zustand';
import {
  CompileDiagnostic,
  CounterBlockState,
  KinConyHardwareConfig,
  LadderElement,
  LadderElementType,
  LadderRung,
  LogEntry,
  PLCLanguage,
  ScanFrequency,
  TimerBlockState,
  VariableSymbol,
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
  validateSTCode,
} from '../engine/plcEngine';
import { generateSTFromLadder } from '../utils/codeExporter';

interface PLCStoreState {
  language: PLCLanguage;
  isRunning: boolean;
  scanFreq: ScanFrequency;
  scanCount: number;
  lastScanUs: number;

  // Process image memory
  inputs: boolean[];
  momentaryMask: boolean[]; // True = push button (momentary), False = selector switch (maintained)
  outputs: boolean[];
  markers: boolean[];
  words: number[];
  analogs: number[];        // 4 ADC channels A1..A4 (0..4095)
  timers: Record<string, TimerBlockState>;
  counters: Record<string, CounterBlockState>;
  symbols: VariableSymbol[];

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
  setLanguage: (lang: PLCLanguage) => void;
  setRunning: (run: boolean) => void;
  setScanFreq: (freq: ScanFrequency) => void;
  stepSingleScan: () => void;
  resetMemory: () => void;

  // I/O actions
  toggleInput: (index: number) => void;
  setInputState: (index: number, val: boolean) => void;
  toggleMomentaryMode: (index: number) => void;
  setAnalogChannel: (ch: number, value: number) => void;
  setWordValue: (index: number, value: number) => void;

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
  T1: { id: 'T1', type: 'TON', IN: false, Q: false, PT: 1000, ET: 0, startTime: null },
  T2: { id: 'T2', type: 'TOF', IN: false, Q: false, PT: 1500, ET: 0, startTime: null },
});

const createInitialCounters = (): Record<string, CounterBlockState> => ({
  C0: { id: 'C0', CU: false, R: false, Q: false, PV: 5, CV: 0, prevCU: false },
  C1: { id: 'C1', CU: false, R: false, Q: false, PV: 10, CV: 0, prevCU: false },
});

const nowTimeStr = (): string => {
  const d = new Date();
  return d.toTimeString().split(' ')[0] + '.' + String(d.getMilliseconds()).padStart(3, '0');
};

export const usePLCStore = create<PLCStoreState>((set, get) => ({
  language: 'LD',
  isRunning: false,
  scanFreq: 50,
  scanCount: 0,
  lastScanUs: 42,

  inputs: Array(16).fill(false),
  momentaryMask: [true, true, true, true, false, false, false, false, false, false, false, false, false, false, false, false],
  outputs: Array(16).fill(false),
  markers: Array(16).fill(false),
  words: Array(16).fill(0),
  analogs: [1240, 2048, 512, 3680],
  timers: createInitialTimers(),
  counters: createInitialCounters(),
  symbols: DEFAULT_SYMBOLS,

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
      message: 'OpenPLC A16 Studio inicializado. Target: KinCony KC868-A16 (ESP32 + 4x PCF8574 I2C).',
    },
    {
      id: 'init-2',
      timestamp: nowTimeStr(),
      level: 'INFO',
      message: 'Mapeo HAL I2C listo: DI1..8 (0x22), DI9..16 (0x21), DO1..8 (0x24), DO9..16 (0x25).',
    },
  ],

  hwConfig: {
    transport: 'websocket',
    wsUrl: 'ws://192.168.1.50:81',
    modbusIp: '192.168.1.50',
    modbusPort: 502,
    useEthernet: true,
    i2cSdaPin: 4,
    i2cSclPin: 5,
    pcfIn1Addr: '0x22',
    pcfIn2Addr: '0x21',
    pcfOut1Addr: '0x24',
    pcfOut2Addr: '0x25',
  },
  hwConnected: false,

  setLanguage: (lang) => {
    set({ language: lang });
    get().addLog('INFO', `Lenguaje activo cambiado a ${lang === 'LD' ? 'Ladder Diagram (LD)' : 'Structured Text (ST)'}.`);
  },

  setRunning: (run) => {
    if (run) {
      const ok = get().compileProgram();
      if (!ok) {
        get().addLog('ERROR', 'No se puede iniciar RUN: existen errores de compilación en el programa.');
        return;
      }
      set({ isRunning: true });
      get().addLog('SCAN', `PLC en modo RUN (${get().scanFreq} Hz / ciclo determinista de ${1000 / get().scanFreq} ms).`);
    } else {
      set({ isRunning: false });
      get().addLog('SCAN', 'PLC en modo STOP. Salidas mantenidas en estado seguro.');
    }
  },

  setScanFreq: (freq) => {
    set({ scanFreq: freq });
    get().addLog('INFO', `Frecuencia de muestreo ajustada a ${freq} Hz (${1000 / freq} ms).`);
  },

  stepSingleScan: () => {
    const state = get();
    const t0 = performance.now();

    // Clone memory for deterministic scan evaluation
    const nextInputs = [...state.inputs];
    const nextOutputs = [...state.outputs];
    const nextMarkers = [...state.markers];
    const nextWords = [...state.words];
    const nextTimers = { ...state.timers };
    const nextCounters = { ...state.counters };

    // Apply forced inputs before scan
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
      timers: nextTimers,
      counters: nextCounters,
      symbols: state.symbols,
    };

    let nextRungs = state.rungs;
    if (state.language === 'LD') {
      nextRungs = executeLadderScan(state.rungs, mem, t0);
    } else {
      executeSTScan(state.stCode, mem, t0);
      // Also update Ladder visual power state so switching tabs keeps live telemetry
      nextRungs = executeLadderScan(state.rungs, mem, t0);
    }

    // Apply forced outputs/markers/words after scan
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

    const elapsedUs = Math.max(12, Math.round((performance.now() - t0) * 1000));

    set({
      inputs: mem.inputs,
      outputs: mem.outputs,
      markers: mem.markers,
      words: mem.words,
      timers: mem.timers,
      counters: mem.counters,
      rungs: nextRungs,
      scanCount: state.scanCount + 1,
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
      words: Array(16).fill(0),
      timers: createInitialTimers(),
      counters: createInitialCounters(),
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
    get().addLog('WARN', 'Memoria de imagen de proceso (%IX, %QX, %MX, %MW, T, C) reiniciada a cero.');
  },

  toggleInput: (index) => {
    const next = [...get().inputs];
    next[index] = !next[index];
    set({ inputs: next });
    if (!get().isRunning) {
      get().stepSingleScan();
    }
  },

  setInputState: (index, val) => {
    if (get().inputs[index] === val) return;
    const next = [...get().inputs];
    next[index] = val;
    set({ inputs: next });
    if (!get().isRunning) {
      get().stepSingleScan();
    }
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
  },

  setWordValue: (index, value) => {
    const next = [...get().words];
    next[index] = value;
    set({ words: next });
  },

  updateSymbol: (address, patch) => {
    set({
      symbols: get().symbols.map((s) => (s.address === address ? { ...s, ...patch } : s)),
    });
  },

  addSymbol: (symbol) => {
    const exists = get().symbols.some((s) => s.address.toUpperCase() === symbol.address.toUpperCase());
    if (exists) return;
    set({ symbols: [...get().symbols, symbol] });
    get().addLog('INFO', `Símbolo agregado: ${symbol.name} (${symbol.address}).`);
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
    const newRung: LadderRung = {
      id: `rung-${Date.now()}`,
      number: nextNum,
      comment: `Rung ${nextNum}: Lógica de control auxiliar`,
      elements: [
        { id: `el-${Date.now()}-1`, type: 'NO', variable: '%IX0.6', label: 'AUX_IN' },
        { id: `el-${Date.now()}-2`, type: 'COIL', variable: '%QX0.4', label: 'AUX_RELAY' },
      ],
    };
    set({ rungs: [...current, newRung], selectedRungId: newRung.id });
    get().addLog('INFO', `Rung #${nextNum} añadido al diagrama Ladder.`);
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
    get().addLog('WARN', `Rung eliminado del diagrama Ladder.`);
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
      COIL: '%QX0.0',
      SET: '%QX0.3',
      RESET: '%QX0.3',
      TON: 'T1',
      TOF: 'T2',
      CTU: 'C1',
    };

    const newEl: LadderElement = {
      id: `el-${Date.now()}`,
      type,
      variable: defaultVarByType[type],
      label: type,
      ...(type === 'TON' || type === 'TOF' ? { presetMs: 2000 } : {}),
      ...(type === 'CTU' ? { presetCount: 5, resetVariable: '%IX0.3' } : {}),
    };

    set({
      rungs: get().rungs.map((r) => {
        if (r.id !== rungId) return r;
        const isCoil = type === 'COIL' || type === 'SET' || type === 'RESET';
        if (isCoil) {
          return { ...r, elements: [...r.elements, newEl] };
        }
        // Insert before first coil so coils stay on the right side of the rung
        const coilIdx = r.elements.findIndex(
          (e) => e.type === 'COIL' || e.type === 'SET' || e.type === 'RESET'
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
              label: 'HOLD_LATCH',
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
    get().addLog('INFO', 'Diagrama Ladder transpilado a código IEC 61131-3 Structured Text (ST).');
  },

  compileProgram: () => {
    const state = get();
    const diags: CompileDiagnostic[] = [];

    if (state.language === 'LD') {
      state.rungs.forEach((r) => {
        if (r.elements.length === 0) {
          diags.push({
            rung: r.number,
            severity: 'warning',
            message: `Rung #${r.number}: Rung vacío sin contactos ni bobinas.`,
          });
          return;
        }
        const hasCoil = r.elements.some(
          (e) => e.type === 'COIL' || e.type === 'SET' || e.type === 'RESET'
        );
        if (!hasCoil) {
          diags.push({
            rung: r.number,
            severity: 'error',
            message: `Rung #${r.number}: Falta bobina de salida (COIL, SET o RESET) en el extremo derecho.`,
          });
        }
      });
    } else {
      diags.push(...validateSTCode(state.stCode));
    }

    if (diags.length === 0) {
      diags.push({
        severity: 'info',
        message: `Compilación IEC 61131-3 exitosa (0 errores). Binario virtual listo para KinCony KC868-A16.`,
      });
    }

    set({ diagnostics: diags });
    const hasErrors = diags.some((d) => d.severity === 'error');
    get().addLog(
      hasErrors ? 'ERROR' : 'INFO',
      hasErrors
        ? `Compilación fallida con ${diags.filter((d) => d.severity === 'error').length} error(es).`
        : 'Compilación verificada correctamente. HAL I2C PCF8574 vinculada.'
    );
    return !hasErrors;
  },

  updateHwConfig: (patch) =>
    set({ hwConfig: { ...get().hwConfig, ...patch } }),

  setHwConnected: (connected) => {
    set({ hwConnected: connected });
    get().addLog(
      'WS',
      connected
        ? `Conectado en tiempo real a placa KinCony KC868-A16 (${get().hwConfig.transport.toUpperCase()}).`
        : 'Enlace hardware con placa KinCony KC868-A16 desconectado.'
    );
  },

  applyHardwareTelemetry: (ix, qx, iw) => {
    set({
      inputs: ix.slice(0, 16).map(Boolean),
      outputs: qx.slice(0, 16).map(Boolean),
      ...(iw ? { analogs: iw.slice(0, 4) } : {}),
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
