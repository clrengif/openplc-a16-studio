export type WorkspaceView = 'schematic' | 'board' | 'networks';
export type PLCLanguage = 'LD' | 'FBD' | 'ST' | 'SFC';
export type ScanFrequency = 10 | 20 | 50 | 100;

export type LadderElementType =
  // Contacts & Edge Detectors
  | 'NO'       // Normally Open Contact --| |--
  | 'NC'       // Normally Closed Contact --|/|--
  | 'R_TRIG'   // Rising Edge Detector --|P|--
  | 'F_TRIG'   // Falling Edge Detector --|N|--
  // Coils & Bistables
  | 'COIL'     // Standard Coil --( )--
  | 'NEG_COIL' // Negated Coil --(/)--
  | 'SET'      // Set (Latch) Coil --(S)--
  | 'RESET'    // Reset (Unlatch) Coil --(R)--
  | 'SR'       // Set-Dominant Bistable Latch
  | 'RS'       // Reset-Dominant Bistable Latch
  // Timers IEC 61131-3
  | 'TON'      // Timer On Delay
  | 'TOF'      // Timer Off Delay
  | 'TP'       // Pulse Timer
  // Counters IEC 61131-3
  | 'CTU'      // Count Up
  | 'CTD'      // Count Down
  | 'CTUD'     // Count Up / Down
  // Comparators (Analog / Word)
  | 'EQ'       // IN1 == IN2
  | 'NE'       // IN1 <> IN2
  | 'GT'       // IN1 >  IN2
  | 'GE'       // IN1 >= IN2
  | 'LT'       // IN1 <  IN2
  | 'LE'       // IN1 <= IN2
  // Math & Move Operations
  | 'ADD'      // DEST := IN1 + IN2
  | 'SUB'      // DEST := IN1 - IN2
  | 'MUL'      // DEST := IN1 * IN2
  | 'DIV'      // DEST := IN1 / IN2
  | 'MOVE';    // DEST := IN1

export interface LadderElement {
  id: string;
  type: LadderElementType;
  variable: string;       // Primary address/instance: '%IX0.0', '%QX0.0', 'T0', 'C0', '%IW0', '%MW0'
  label?: string;         // Symbolic tag: 'START_BTN', 'MAIN_CONTACTOR'
  presetMs?: number;      // For TON / TOF / TP (ms)
  presetCount?: number;   // For CTU / CTD / CTUD (pulses)
  resetVariable?: string; // For CTU.R / CTD.LD / SR.R1 / RS.R
  auxVariable?: string;   // For CTUD.CD or Comparator/Math IN2 (e.g. '2500' or '%MW1')
  destVariable?: string;  // For Math/MOVE output destination (e.g. '%MW0')
  // Live runtime states evaluated during scan
  energized?: boolean;
  powerIn?: boolean;
  powerOut?: boolean;
  lastNumericResult?: number;
}

export interface LadderRung {
  id: string;
  number: number;
  sheet?: number;         // Sheet tab index (1, 2, 3)
  comment: string;
  elements: LadderElement[];
  branchElements?: LadderElement[];
  energized?: boolean;
}

export interface TimerBlockState {
  id: string;             // 'T0' .. 'T7'
  type: 'TON' | 'TOF' | 'TP';
  IN: boolean;
  Q: boolean;
  PT: number;             // Preset time in ms
  ET: number;             // Elapsed time in ms
  startTime: number | null;
  prevIN?: boolean;
}

export interface CounterBlockState {
  id: string;             // 'C0' .. 'C7'
  type?: 'CTU' | 'CTD' | 'CTUD';
  CU: boolean;
  CD?: boolean;
  R: boolean;
  LD?: boolean;
  Q: boolean;
  QD?: boolean;
  PV: number;
  CV: number;
  prevCU: boolean;
  prevCD?: boolean;
}

export interface VariableSymbol {
  address: string;        // '%IX0.0', '%QX0.0', '%IW0', '%MW0', '%MX0.0'
  name: string;
  type: 'BOOL' | 'INT' | 'WORD' | 'TIME';
  comment: string;
  modbusAddress?: string; // '10001', '00001', '30001', '40001'
  forced?: boolean;
  forcedValue?: boolean | number;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'SCAN' | 'WS' | 'NET';
  message: string;
}

export interface CompileDiagnostic {
  line?: number;
  rung?: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

export interface OscilloscopeSample {
  timeSec: number;
  signals: Record<string, number>;
}

export type IndustrialProtocol = 'MODBUS_TCP' | 'MODBUS_RTU' | 'I2C_PCF8574' | 'MQTT_SPARKPLUG';

export interface NetworkFrameField {
  name: string;
  hex: string;
  description: string;
  color: string;
}

export interface NetworkTransaction {
  id: string;
  timestamp: string;
  protocol: IndustrialProtocol;
  direction: 'TX (Master → KC868-A16)' | 'RX (KC868-A16 → Master)';
  summary: string;
  rawHex: string;
  fields: NetworkFrameField[];
  validCrcOrAck: boolean;
}

export interface KinConyHardwareConfig {
  transport: 'websocket' | 'serial';
  wsUrl: string;
  modbusIp: string;
  modbusPort: number;
  rs485BaudRate: 9600 | 19200 | 38400 | 115200;
  rs485SlaveId: number;
  mqttBroker: string;
  mqttTopicPrefix: string;
  useEthernet: boolean;
  i2cSdaPin: number;
  i2cSclPin: number;
  pcfIn1Addr: string;     // '0x22'
  pcfIn2Addr: string;     // '0x21'
  pcfOut1Addr: string;    // '0x24'
  pcfOut2Addr: string;    // '0x25'
}
