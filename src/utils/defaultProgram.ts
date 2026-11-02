import { LadderRung, VariableSymbol } from '../types/plc';

/**
 * Helper to convert 0..15 index to IEC 61131-3 bit address (%IX0.0 .. %IX1.7 or %QX0.0 .. %QX1.7)
 */
export function indexToIECAddress(prefix: '%IX' | '%QX' | '%MX', index: number): string {
  const byteIndex = Math.floor(index / 8);
  const bitIndex = index % 8;
  return `${prefix}${byteIndex}.${bitIndex}`;
}

/**
 * Helper to parse IEC bit address (%IX0.0 .. %IX1.7) into 0..15 index
 */
export function iecAddressToIndex(address: string): { prefix: string; index: number } | null {
  const normalized = address.trim().toUpperCase();
  const match = normalized.match(/^(%[IQM]X)(\d+)\.(\d+)$/);
  if (!match) return null;
  const prefix = match[1];
  const byteIndex = parseInt(match[2], 10);
  const bitIndex = parseInt(match[3], 10);
  if (bitIndex < 0 || bitIndex > 7) return null;
  const index = byteIndex * 8 + bitIndex;
  return { prefix, index };
}

export const DEFAULT_SYMBOLS: VariableSymbol[] = [
  { address: '%IX0.0', name: 'START_BTN', type: 'BOOL', comment: 'Pulsador Marcha NA (DI1)' },
  { address: '%IX0.1', name: 'STOP_BTN', type: 'BOOL', comment: 'Pulsador Paro / Emergencia (DI2)' },
  { address: '%IX0.2', name: 'PULSE_SENSOR', type: 'BOOL', comment: 'Sensor Óptico Conteo Piezas (DI3)' },
  { address: '%IX0.3', name: 'RESET_CNT', type: 'BOOL', comment: 'Reset Manual Contador (DI4)' },
  { address: '%IX0.4', name: 'LEVEL_HIGH', type: 'BOOL', comment: 'Boya Nivel Alto Tanque (DI5)' },
  { address: '%IX0.5', name: 'LEVEL_LOW', type: 'BOOL', comment: 'Boya Nivel Bajo Tanque (DI6)' },
  { address: '%QX0.0', name: 'MAIN_CONTACTOR', type: 'BOOL', comment: 'Contactor Motor Principal (DO1)' },
  { address: '%QX0.1', name: 'STAR_DELTA_K2', type: 'BOOL', comment: 'Contactor Triángulo Retardo TON (DO2)' },
  { address: '%QX0.2', name: 'BATCH_COMPLETE', type: 'BOOL', comment: 'Indicador Lote Completado CTU (DO3)' },
  { address: '%QX0.3', name: 'DRAIN_VALVE', type: 'BOOL', comment: 'Válvula Drenaje Tanque (DO4)' },
  { address: '%MX0.0', name: 'SYS_RUN_MEM', type: 'BOOL', comment: 'Marca Interna Sistema Activo' },
  { address: '%MW0', name: 'PROD_TARGET', type: 'INT', comment: 'Registro Palabra Producción' },
];

export const DEFAULT_LADDER_RUNGS: LadderRung[] = [
  {
    id: 'rung-1',
    number: 1,
    comment: 'Enclavamiento de Marcha/Paro del Contactor Principal (%QX0.0) con paralelo de retención',
    elements: [
      { id: 'el-101', type: 'NO', variable: '%IX0.0', label: 'START_BTN' },
      { id: 'el-102', type: 'NC', variable: '%IX0.1', label: 'STOP_BTN' },
      { id: 'el-103', type: 'COIL', variable: '%QX0.0', label: 'MAIN_CONTACTOR' },
    ],
    branchElements: [
      { id: 'el-104', type: 'NO', variable: '%QX0.0', label: 'MAIN_CONTACTOR' },
    ],
  },
  {
    id: 'rung-2',
    number: 2,
    comment: 'Temporizador a la Conexión (TON T0 - 2500ms): Conmutación Estrella-Triángulo tras arranque',
    elements: [
      { id: 'el-201', type: 'NO', variable: '%QX0.0', label: 'MAIN_CONTACTOR' },
      { id: 'el-202', type: 'TON', variable: 'T0', label: 'STAR_DELTA_TMR', presetMs: 2500 },
      { id: 'el-203', type: 'COIL', variable: '%QX0.1', label: 'STAR_DELTA_K2' },
    ],
  },
  {
    id: 'rung-3',
    number: 3,
    comment: 'Contador Ascendente de Lote (CTU C0 - 5 pulsos en %IX0.2, Reset en %IX0.3) -> Activa %QX0.2',
    elements: [
      { id: 'el-301', type: 'NO', variable: '%IX0.2', label: 'PULSE_SENSOR' },
      { id: 'el-302', type: 'CTU', variable: 'C0', label: 'BATCH_COUNTER', presetCount: 5, resetVariable: '%IX0.3' },
      { id: 'el-303', type: 'COIL', variable: '%QX0.2', label: 'BATCH_COMPLETE' },
    ],
  },
  {
    id: 'rung-4',
    number: 4,
    comment: 'Control de Válvula de Drenaje por Set/Reset con Boyas de Nivel (%IX0.4 Set / %IX0.5 Reset)',
    elements: [
      { id: 'el-401', type: 'NO', variable: '%IX0.4', label: 'LEVEL_HIGH' },
      { id: 'el-402', type: 'SET', variable: '%QX0.3', label: 'DRAIN_VALVE' },
    ],
  },
  {
    id: 'rung-5',
    number: 5,
    comment: 'Desactivación (Reset) de Válvula de Drenaje cuando se activa Boya Nivel Bajo (%IX0.5)',
    elements: [
      { id: 'el-501', type: 'NO', variable: '%IX0.5', label: 'LEVEL_LOW' },
      { id: 'el-502', type: 'RESET', variable: '%QX0.3', label: 'DRAIN_VALVE' },
    ],
  },
];

export const DEFAULT_ST_CODE = `(* ============================================================================
 * PROGRAMA IEC 61131-3: AUTOMATIZACIÓN INDUSTRIAL KINCONY KC868-A16 (ESP32)
 * Compatible con OpenPLC Runtime & Simulador Determinista en Tiempo Real
 * ============================================================================ *)
PROGRAM KinCony_A16_Main
VAR
  (* Entradas Digitales Optoacopladas (%IX0.0 a %IX1.7) *)
  START_BTN      AT %IX0.0 : BOOL; (* Pulsador Marcha NA *)
  STOP_BTN       AT %IX0.1 : BOOL; (* Pulsador Paro *)
  PULSE_SENSOR   AT %IX0.2 : BOOL; (* Sensor Conteo *)
  RESET_CNT      AT %IX0.3 : BOOL; (* Reset Contador *)
  LEVEL_HIGH     AT %IX0.4 : BOOL; (* Nivel Alto *)
  LEVEL_LOW      AT %IX0.5 : BOOL; (* Nivel Bajo *)

  (* Salidas de Relé PCF8574 I2C (%QX0.0 a %QX1.7) *)
  MAIN_CONTACTOR AT %QX0.0 : BOOL; (* Motor Principal *)
  STAR_DELTA_K2  AT %QX0.1 : BOOL; (* Contactor Triángulo *)
  BATCH_COMPLETE AT %QX0.2 : BOOL; (* Lote Terminado *)
  DRAIN_VALVE    AT %QX0.3 : BOOL; (* Válvula Drenaje *)

  (* Bloques Funcionales Estándar IEC 61131-3 *)
  T0 : TON; (* Temporizador Estrella-Triángulo *)
  C0 : CTU; (* Contador de Piezas *)
END_VAR

(* 1. Enclavamiento de Marcha / Paro Motor Principal *)
%QX0.0 := (%IX0.0 OR %QX0.0) AND NOT %IX0.1;

(* 2. Temporizador TON T0 (2500 ms) para entrada de Triángulo *)
T0(IN := %QX0.0, PT := T#2500ms);
%QX0.1 := T0.Q;

(* 3. Contador CTU C0 (Meta = 5 pulsos en %IX0.2, Reset con %IX0.3) *)
C0(CU := %IX0.2, R := %IX0.3, PV := 5);
%QX0.2 := C0.Q;

(* 4. Control de Nivel con histéresis Set / Reset *)
IF %IX0.4 THEN
  %QX0.3 := TRUE;
END_IF;

IF %IX0.5 THEN
  %QX0.3 := FALSE;
END_IF;

END_PROGRAM
`;
