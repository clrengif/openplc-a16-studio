export type WorkspaceView = 'schematic' | 'grafcet' | 'twin2d' | 'networks' | 'board' | 'api_mcp';
export type PLCLanguage = 'LD' | 'FBD' | 'ST' | 'SFC';
export type ScanFrequency = 10 | 20 | 50 | 100;

export type LadderElementType =
  | 'NO'
  | 'NC'
  | 'R_TRIG'
  | 'F_TRIG'
  | 'COIL'
  | 'NEG_COIL'
  | 'SET'
  | 'RESET'
  | 'SR'
  | 'RS'
  | 'TON'
  | 'TOF'
  | 'TP'
  | 'CTU'
  | 'CTD'
  | 'CTUD'
  | 'EQ'
  | 'NE'
  | 'GT'
  | 'GE'
  | 'LT'
  | 'LE'
  | 'ADD'
  | 'SUB'
  | 'MUL'
  | 'DIV'
  | 'MOVE';

export interface LadderElement {
  id: string;
  type: LadderElementType;
  variable: string;
  label?: string;
  presetMs?: number;
  presetCount?: number;
  resetVariable?: string;
  auxVariable?: string;
  destVariable?: string;
  energized?: boolean;
  powerIn?: boolean;
  powerOut?: boolean;
  lastNumericResult?: number;
}

export interface LadderRung {
  id: string;
  number: number;
  sheet?: number;
  comment: string;
  elements: LadderElement[];
  branchElements?: LadderElement[];
  energized?: boolean;
}

export interface GrafcetStep {
  id: string;
  stepNumber: number;
  name: string;
  isInitial?: boolean;
  active: boolean;
  actionCoil?: string;       // e.g. '%QX0.0'
  actionDescription: string; // e.g. 'Activar Bomba de Llenado (%QX0.0)'
  transitionCondition: string; // e.g. '%IX0.0' or '%IX0.4' or 'T0.Q'
  transitionComment: string;
  nextStepNumber: number;
}

export interface TimerBlockState {
  id: string;
  type: 'TON' | 'TOF' | 'TP';
  IN: boolean;
  Q: boolean;
  PT: number;
  ET: number;
  startTime: number | null;
  prevIN?: boolean;
}

export interface CounterBlockState {
  id: string;
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
  address: string;
  name: string;
  type: 'BOOL' | 'INT' | 'WORD' | 'TIME';
  comment: string;
  modbusAddress?: string;
  forced?: boolean;
  forcedValue?: boolean | number;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'SCAN' | 'WS' | 'NET' | 'MCP';
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

export type IndustrialProtocol =
  | 'MODBUS_TCP'
  | 'MODBUS_RTU'
  | 'I2C_PCF8574'
  | 'MQTT_SPARKPLUG'
  | 'HART_FSK'
  | 'DEVICENET_CAN'
  | 'OPC_UA';

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
  direction: 'TX (Master → KC868-A16)' | 'RX (KC868-A16 → Master)' | 'FAULT (Error en Red)';
  summary: string;
  rawHex: string;
  fields: NetworkFrameField[];
  validCrcOrAck: boolean;
}

export interface FaultInjectionConfig {
  corruptCrc16: boolean;        // Simulates EM noise corrupting RS485 CRC-16
  forceModbusException: number; // 0 = None, 1 = Illegal Function, 2 = Illegal Data Address, 6 = Slave Busy
  i2cNackFault: boolean;        // Simulates disconnected PCF8574 expander
  rs485PolaritySwap: boolean;   // Simulates swapped A+/B- lines
}

export interface ExternalHardwareModule {
  id: string;
  name: string;
  bus: 'I2C' | 'RS485' | 'CAN_TWAI' | 'GPIO';
  address: string;
  description: string;
  enabled: boolean;
  registers: Record<string, number | boolean>;
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
  pcfIn1Addr: string;
  pcfIn2Addr: string;
  pcfOut1Addr: string;
  pcfOut2Addr: string;
}
