import { usePLCStore, registerExternalScanHook, ScanHookCallback } from '../store/usePLCStore';
import { ExternalHardwareModule, LadderRung } from '../types/plc';
import { iecAddressToIndex } from '../utils/defaultProgram';

export interface PclinoGlobalSDK {
  version: string;
  board: string;
  /** Lee cualquier bit IEC (%IX0.0..15, %QX0.0..15, %MX0.0..15) */
  readBit: (address: string) => boolean;
  /** Fuerza o escribe una entrada digital física (%IX0.0..%IX0.15) */
  writeInput: (address: string, value: boolean) => void;
  /** Escribe una bobina interna o salida (%MX0.0..%MX0.15 / %QX0.0..%QX0.15) */
  writeBit: (address: string, value: boolean) => void;
  /** Lee una palabra de 16 bits (%IW0..3, %MW0..15) */
  readWord: (address: string) => number;
  /** Escribe una palabra de 16 bits (%IW0..3, %MW0..15) */
  writeWord: (address: string, value: number) => void;
  /** Arranca o detiene el ciclo de Scan del PLC */
  setRunState: (run: boolean) => void;
  /** Registra un nuevo módulo externo de hardware (I2C, RS485, CAN_TWAI, GPIO) */
  registerModule: (mod: ExternalHardwareModule) => void;
  /** Suscribe un callback JS que se ejecuta en cada ciclo de Scan del PLC */
  onScan: (callback: ScanHookCallback) => () => void;
  /** Inyecta una trama Modbus TCP */
  sendModbusTCP: (fc: number, address: number, value: number) => void;
  /** Inyecta un comando HART FSK 1200 baud sobre el lazo 4-20mA */
  sendHartCommand: (cmd: 0 | 1 | 2 | 3, pollingAddr?: number) => void;
  /** Inyecta una trama CAN DeviceNet CIP */
  sendDeviceNet: (macId: number, mode: 'POLLED_IO' | 'EXPLICIT_CIP') => void;
  /** Obtiene una instantánea completa del estado de memoria e I/O */
  getSnapshot: () => {
    isRunning: boolean;
    scanCount: number;
    inputs: boolean[];
    outputs: boolean[];
    markers: boolean[];
    analogs: number[];
    words: number[];
    tankLevelPct: number;
  };
  /** Reemplaza o carga peldaños Ladder desde código externo o agente MCP */
  loadRungs: (name: string, rungs: LadderRung[], stCode?: string) => void;
}

declare global {
  interface Window {
    pclino?: PclinoGlobalSDK;
  }
}

export function initPclinoGlobalApi(): PclinoGlobalSDK {
  const sdk: PclinoGlobalSDK = {
    version: '2.0.0-mcp',
    board: 'KinCony KC868-A16 (ESP32-WROOM-32E)',

    readBit: (address: string) => {
      const s = usePLCStore.getState();
      const parsed = iecAddressToIndex(address.trim().toUpperCase());
      if (!parsed) return false;
      if (parsed.prefix === 'IX') return Boolean(s.inputs[parsed.index]);
      if (parsed.prefix === 'QX') return Boolean(s.outputs[parsed.index]);
      if (parsed.prefix === 'MX') return Boolean(s.markers[parsed.index]);
      return false;
    },

    writeInput: (address: string, value: boolean) => {
      const s = usePLCStore.getState();
      const parsed = iecAddressToIndex(address.trim().toUpperCase());
      if (parsed?.prefix === 'IX') {
        s.setInputState(parsed.index, Boolean(value));
      }
    },

    writeBit: (address: string, value: boolean) => {
      const s = usePLCStore.getState();
      const parsed = iecAddressToIndex(address.trim().toUpperCase());
      if (!parsed) return;
      if (parsed.prefix === 'QX') {
        s.setCoilValue(parsed.index, Boolean(value));
      } else if (parsed.prefix === 'MX') {
        const next = [...s.markers];
        next[parsed.index] = Boolean(value);
        usePLCStore.setState({ markers: next });
      }
    },

    readWord: (address: string) => {
      const s = usePLCStore.getState();
      const parsed = iecAddressToIndex(address.trim().toUpperCase());
      if (!parsed) return 0;
      if (parsed.prefix === 'IW') return s.analogs[parsed.index] ?? 0;
      if (parsed.prefix === 'MW') return s.words[parsed.index] ?? 0;
      return 0;
    },

    writeWord: (address: string, value: number) => {
      const s = usePLCStore.getState();
      const parsed = iecAddressToIndex(address.trim().toUpperCase());
      if (!parsed) return;
      if (parsed.prefix === 'IW') {
        s.setAnalogChannel(parsed.index, value);
      } else if (parsed.prefix === 'MW') {
        s.setWordValue(parsed.index, value);
      }
    },

    setRunState: (run: boolean) => {
      usePLCStore.getState().setRunning(run);
    },

    registerModule: (mod: ExternalHardwareModule) => {
      usePLCStore.getState().registerModule(mod);
    },

    onScan: (callback: ScanHookCallback) => {
      return registerExternalScanHook(callback);
    },

    sendModbusTCP: (fc: number, address: number, value: number) => {
      usePLCStore.getState().sendModbusTCPRequest(fc, address, value);
    },

    sendHartCommand: (cmd: 0 | 1 | 2 | 3, pollingAddr = 0) => {
      usePLCStore.getState().sendHartCommand(pollingAddr, cmd);
    },

    sendDeviceNet: (macId: number, mode: 'POLLED_IO' | 'EXPLICIT_CIP' = 'POLLED_IO') => {
      usePLCStore.getState().sendDeviceNetFrame(macId, mode);
    },

    getSnapshot: () => {
      const s = usePLCStore.getState();
      return {
        isRunning: s.isRunning,
        scanCount: s.scanCount,
        inputs: [...s.inputs],
        outputs: [...s.outputs],
        markers: [...s.markers],
        analogs: [...s.analogs],
        words: [...s.words],
        tankLevelPct: s.tankLevelPct,
      };
    },

    loadRungs: (name: string, rungs: LadderRung[], stCode?: string) => {
      usePLCStore.setState({
        projectFileName: name.endsWith('.plno') ? name : `${name}.plno`,
        rungs,
        stCode: stCode || usePLCStore.getState().stCode,
      });
    },
  };

  if (typeof window !== 'undefined') {
    window.pclino = sdk;
  }
  return sdk;
}
