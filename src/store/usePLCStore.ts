import { create } from 'zustand';
import {
  CompileDiagnostic,
  CounterBlockState,
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
  validateSTCode,
} from '../engine/plcEngine';
import { generateSTFromLadder } from '../utils/codeExporter';
import {
  buildI2CTransaction,
  executeModbusRTUTransaction,
  executeModbusTCPTransaction,
} from '../utils/industrialNetworks';

interface PLCStoreState {
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
  analogs: number[];        // 8 Input Words: %IW0..3 (ADC A1..4), %IW4..6 (HT1..3 1-Wire), %IW7 (RF433)
  timers: Record<string, TimerBlockState>;
  counters: Record<string, CounterBlockState>;
  edgeMemory: Record<string, boolean>;
  symbols: VariableSymbol[];

  // Oscilloscope & Probes (Simulino style)
  oscSamples: OscilloscopeSample[];
  activeProbes: string[];

  // Industrial Network Frame Log (Modbus TCP, RS485 RTU, I2C PCF8574)
  networkTransactions: NetworkTransaction[];
  modbusTxSeq: number;

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
  setWorkspaceView: (view: WorkspaceView) => void;
  setLanguage: (lang: PLCLanguage) => void;
  setActiveSheet: (sheet: number) => void;
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
  setCoilValue: (index: number, value: boolean) => void;

  // Oscilloscope actions
  toggleProbe: (probeName: string) => void;
  clearOscilloscope: () => void;

  // Industrial Network actions
  sendModbusTCPRequest: (fc: number, startAddr: number, quantityOrVal: number) => void;
  sendModbusRTURequest: (fc: number, startAddr: number, quantityOrVal: number) => void;
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

const nowTimeStr = (): string => {
  const d = new Date();
  return d.toTimeString().split(' ')[0] + '.' + String(d.getMilliseconds()).padStart(3, '0');
};

const createSeedOscSamples = (): OscilloscopeSample[] => {
  const arr: OscilloscopeSample[] = [];
  for (let i = 0; i < 60; i++) {
    arr.push({
      timeSec: i * 0.05,
      signals: {
        '%IX0.0': 0,
        '%QX0.0': 0,
        '%QX0.1': 0,
        'T0.ET': 0,
        '%IW0': 1850,
      },
    });
  }
  return arr;
};

export const usePLCStore = create<PLCStoreState>((set, get) => ({
  workspaceView: 'schematic',
  language: 'LD',
  activeSheet: 0, // 0 = Todas las hojas, 1..3 = Hoja específica
  isRunning: false,
  scanFreq: 50,
  scanCount: 0,
  lastScanUs: 38,

  inputs: Array(16).fill(false),
  momentaryMask: [true, true, true, true, false, false, false, false, false, false, false, false, false, false, false, false],
  outputs: Array(16).fill(false),
  markers: Array(16).fill(false),
  words: [0, 2800, 50, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  // %IW0..3 = ADC1..4 (0..4095), %IW4..6 = DS18B20/DHT22 (x0.1°C -> 245 = 24.5°C), %IW7 = RF433
  analogs: [1850, 2048, 960, 3200, 245, 580, 228, 0],
  timers: createInitialTimers(),
  counters: createInitialCounters(),
  edgeMemory: {},
  symbols: DEFAULT_SYMBOLS,

  oscSamples: createSeedOscSamples(),
  activeProbes: ['%IX0.0', '%QX0.0', 'T0.ET', '%IW0'],

  networkTransactions: [],
  modbusTxSeq: 1,

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
      message: 'OpenPLC A16 Studio listo. Placa: KinCony KC868-A16 (ESP32 + 4×PCF8574 I2C + LAN8720 ETH + RS485).',
    },
    {
      id: 'init-2',
      timestamp: nowTimeStr(),
      level: 'NET',
      message: 'Laboratorio de Redes Industriales activo: Modbus TCP (502), Modbus RTU RS485 (CRC-16), I2C (0x22..0x25) y MQTT Sparkplug B.',
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
    const nextTimers = { ...state.timers };
    const nextCounters = { ...state.counters };
    const nextEdges = { ...state.edgeMemory };

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
      analogs: state.analogs,
      timers: nextTimers,
      counters: nextCounters,
      edgeMemory: nextEdges,
      symbols: state.symbols,
    };

    let nextRungs = state.rungs;
    if (state.language === 'ST') {
      executeSTScan(state.stCode, mem, t0);
      nextRungs = executeLadderScan(state.rungs, mem, t0);
    } else {
      nextRungs = executeLadderScan(state.rungs, mem, t0);
    }

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

    const elapsedUs = Math.max(14, Math.round((performance.now() - t0) * 1000));
    const nextScanCount = state.scanCount + 1;

    // Record oscilloscope sample
    const lastTime = state.oscSamples[state.oscSamples.length - 1]?.timeSec ?? 0;
    const newSample: OscilloscopeSample = {
      timeSec: Number((lastTime + 1 / state.scanFreq).toFixed(3)),
      signals: {
        '%IX0.0': mem.inputs[0] ? 1 : 0,
        '%IX0.2': mem.inputs[2] ? 1 : 0,
        '%QX0.0': mem.outputs[0] ? 1 : 0,
        '%QX0.1': mem.outputs[1] ? 1 : 0,
        '%QX0.2': mem.outputs[2] ? 1 : 0,
        '%QX0.4': mem.outputs[4] ? 1 : 0,
        'T0.ET': Math.round(mem.timers.T0?.ET ?? 0),
        '%IW0': state.analogs[0] ?? 0,
        '%MW0': mem.words[0] ?? 0,
      },
    };

    set({
      inputs: mem.inputs,
      outputs: mem.outputs,
      markers: mem.markers,
      words: mem.words,
      timers: mem.timers,
      counters: mem.counters,
      edgeMemory: nextEdges,
      rungs: nextRungs,
      scanCount: nextScanCount,
      lastScanUs: elapsedUs,
      oscSamples: [...state.oscSamples.slice(-119), newSample],
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
      oscSamples: createSeedOscSamples(),
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
    get().addLog('WARN', 'Memoria de imagen de proceso y osciloscopio reiniciados.');
  },

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
      if (cur.length > 1) {
        set({ activeProbes: cur.filter((p) => p !== probeName) });
      }
    } else {
      set({ activeProbes: [...cur, probeName] });
    }
  },

  clearOscilloscope: () => set({ oscSamples: createSeedOscSamples() }),

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
      }
    );
    set({
      modbusTxSeq: seq + 1,
      networkTransactions: [response, request, ...state.networkTransactions.slice(0, 48)],
    });
    get().addLog('NET', `Modbus TCP [TxID=${seq}]: ${request.rawHex} -> ${response.rawHex}`);
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
      }
    );
    set({
      networkTransactions: [response, request, ...state.networkTransactions.slice(0, 48)],
    });
    get().addLog('NET', `RS485 Modbus RTU: ${request.rawHex} -> ${response.rawHex}`);
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
    const f1 = buildI2CTransaction('PCF8574_DI_1_8', state.hwConfig.pcfIn1Addr, true, calcByte(state.inputs, 0));
    const f2 = buildI2CTransaction('PCF8574_DI_9_16', state.hwConfig.pcfIn2Addr, true, calcByte(state.inputs, 8));
    const f3 = buildI2CTransaction('PCF8574_DO_1_8', state.hwConfig.pcfOut1Addr, false, calcByte(state.outputs, 0));
    const f4 = buildI2CTransaction('PCF8574_DO_9_16', state.hwConfig.pcfOut2Addr, false, calcByte(state.outputs, 8));

    set({
      networkTransactions: [f4, f3, f2, f1, ...state.networkTransactions.slice(0, 46)],
    });
    get().addLog('NET', 'Capturadas 4 tramas I2C a 400 kHz de los expansores PCF8574 (0x22, 0x21, 0x24, 0x25).');
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
      comment: `Rung ${nextNum}: Lógica de control auxiliar`,
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
            message: `Rung #${r.number}: Rung vacío.`,
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
