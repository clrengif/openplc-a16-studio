export type AppMode = 'editor' | 'simulation' | 'hardware';
export type PLCLanguage = 'LD' | 'ST';
export type ScanFrequency = 10 | 20 | 50 | 100;

export type LadderElementType =
  | 'NO'    // Normally Open Contact --[ ]--
  | 'NC'    // Normally Closed Contact --[/]--
  | 'COIL'  // Standard Coil --( )--
  | 'SET'   // Set (Latch) Coil --(S)--
  | 'RESET' // Reset (Unlatch) Coil --(R)--
  | 'TON'   // Timer On Delay Function Block
  | 'TOF'   // Timer Off Delay Function Block
  | 'CTU';  // Counter Up Function Block

export interface LadderElement {
  id: string;
  type: LadderElementType;
  variable: string;      // e.g. '%IX0.0', '%QX0.0', '%MX0.0', 'T0', 'C0'
  label?: string;        // Symbolic tag e.g. 'START_BTN', 'PUMP_MOTOR'
  presetMs?: number;     // For TON / TOF (e.g. 2000 ms)
  presetCount?: number;  // For CTU (e.g. 5 pulses)
  resetVariable?: string;// For CTU reset input (e.g. '%IX0.2')
  // Live runtime states evaluated during scan
  energized?: boolean;   // Element state active
  powerIn?: boolean;     // Incoming rung wire energized
  powerOut?: boolean;    // Outgoing rung wire energized
}

export interface LadderRung {
  id: string;
  number: number;
  comment: string;
  elements: LadderElement[];
  branchElements?: LadderElement[]; // Optional parallel OR branch across first contact(s)
  energized?: boolean;
}

export interface TimerBlockState {
  id: string;            // 'T0' .. 'T7'
  type: 'TON' | 'TOF';
  IN: boolean;
  Q: boolean;
  PT: number;            // Preset time in ms
  ET: number;            // Elapsed time in ms
  startTime: number | null;
}

export interface CounterBlockState {
  id: string;            // 'C0' .. 'C7'
  CU: boolean;
  R: boolean;
  Q: boolean;
  PV: number;            // Preset value
  CV: number;            // Current value
  prevCU: boolean;       // Edge detection
}

export interface VariableSymbol {
  address: string;       // e.g. '%IX0.0', '%QX0.0', '%MX0.0', '%MW0'
  name: string;          // e.g. 'START_BTN', 'STOP_BTN', 'MOTOR_1'
  type: 'BOOL' | 'INT' | 'TIME';
  comment: string;
  forced?: boolean;
  forcedValue?: boolean | number;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'SCAN' | 'WS';
  message: string;
}

export interface CompileDiagnostic {
  line?: number;
  rung?: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

export interface CompilationResult {
  success: boolean;
  diagnostics: CompileDiagnostic[];
  generatedST?: string;
  generatedCpp?: string;
  generatedXml?: string;
}
