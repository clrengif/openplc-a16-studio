import { LadderRung, VariableSymbol } from '../types/plc';

export function indexToIECAddress(prefix: '%IX' | '%QX' | '%MX', index: number): string {
  const byteIndex = Math.floor(index / 8);
  const bitIndex = index % 8;
  return `${prefix}${byteIndex}.${bitIndex}`;
}

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
  { address: '%IX0.0', name: 'START_BTN', type: 'BOOL', modbusAddress: '10001 (FC02)', comment: 'Pulsador Marcha NA (DI1 - PCF8574 0x22)' },
  { address: '%IX0.1', name: 'STOP_BTN', type: 'BOOL', modbusAddress: '10002 (FC02)', comment: 'Pulsador Paro / Emergencia (DI2)' },
  { address: '%IX0.2', name: 'PULSE_SENSOR', type: 'BOOL', modbusAddress: '10003 (FC02)', comment: 'Sensor Óptico Conteo Piezas (DI3)' },
  { address: '%IX0.3', name: 'RESET_CNT', type: 'BOOL', modbusAddress: '10004 (FC02)', comment: 'Reset Manual Contador (DI4)' },
  { address: '%IX0.4', name: 'LEVEL_HIGH', type: 'BOOL', modbusAddress: '10005 (FC02)', comment: 'Boya Nivel Alto Tanque (DI5)' },
  { address: '%IX0.5', name: 'LEVEL_LOW', type: 'BOOL', modbusAddress: '10006 (FC02)', comment: 'Boya Nivel Bajo Tanque (DI6)' },
  { address: '%QX0.0', name: 'MAIN_CONTACTOR', type: 'BOOL', modbusAddress: '00001 (FC01/05)', comment: 'Contactor Motor Principal (DO1 - PCF8574 0x24)' },
  { address: '%QX0.1', name: 'STAR_DELTA_K2', type: 'BOOL', modbusAddress: '00002 (FC01/05)', comment: 'Contactor Triángulo Retardo TON (DO2)' },
  { address: '%QX0.2', name: 'BATCH_COMPLETE', type: 'BOOL', modbusAddress: '00003 (FC01/05)', comment: 'Indicador Lote Completado CTU (DO3)' },
  { address: '%QX0.3', name: 'DRAIN_VALVE', type: 'BOOL', modbusAddress: '00004 (FC01/05)', comment: 'Válvula Drenaje Tanque (DO4)' },
  { address: '%QX0.4', name: 'PRESSURE_ALARM', type: 'BOOL', modbusAddress: '00005 (FC01/05)', comment: 'Alarma Sobrepresión Analógica A1 (DO5)' },
  { address: '%IW0', name: 'PRESSURE_ADC1', type: 'INT', modbusAddress: '30001 (FC04)', comment: 'Transmisor Presión 4-20mA (A1 - GPIO36)' },
  { address: '%IW1', name: 'FLOW_ADC2', type: 'INT', modbusAddress: '30002 (FC04)', comment: 'Caudalímetro Analógico 0-5V (A2 - GPIO39)' },
  { address: '%IW4', name: 'TEMP_DS18B20', type: 'INT', modbusAddress: '30005 (FC04)', comment: 'Temperatura 1-Wire HT1 (GPIO32 ×0.1°C)' },
  { address: '%MW0', name: 'MODBUS_BATCH_REG', type: 'INT', modbusAddress: '40001 (FC03/06)', comment: 'Holding Register SCADA Piezas Contadas' },
  { address: '%MW1', name: 'PRESSURE_SETPOINT', type: 'INT', modbusAddress: '40002 (FC03/06)', comment: 'Holding Register Umbral Alarma Presión' },
  { address: '%MX0.0', name: 'REMOTE_SCADA_EN', type: 'BOOL', modbusAddress: '00101 (Internal)', comment: 'Permisivo Remoto Modbus TCP / MQTT' },
];

export const DEFAULT_LADDER_RUNGS: LadderRung[] = [
  {
    id: 'rung-1',
    number: 1,
    sheet: 1,
    comment: 'Enclavamiento Marcha/Paro del Motor Principal (%QX0.0) con retención en paralelo',
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
    sheet: 1,
    comment: 'Temporizador a la Conexión (TON T0 - 2500ms): Conmutación Estrella-Triángulo (%QX0.1)',
    elements: [
      { id: 'el-201', type: 'NO', variable: '%QX0.0', label: 'MAIN_CONTACTOR' },
      { id: 'el-202', type: 'TON', variable: 'T0', label: 'STAR_DELTA_TMR', presetMs: 2500 },
      { id: 'el-203', type: 'COIL', variable: '%QX0.1', label: 'STAR_DELTA_K2' },
    ],
  },
  {
    id: 'rung-3',
    number: 3,
    sheet: 1,
    comment: 'Control de Nivel por Histéresis Set/Reset con Boyas (%IX0.4 Nivel Alto / %IX0.5 Nivel Bajo)',
    elements: [
      { id: 'el-401', type: 'NO', variable: '%IX0.4', label: 'LEVEL_HIGH' },
      { id: 'el-402', type: 'SR', variable: '%QX0.3', label: 'DRAIN_VALVE', resetVariable: '%IX0.5' },
    ],
  },
  {
    id: 'rung-4',
    number: 4,
    sheet: 2,
    comment: 'Contador Ascendente de Lote (CTU C0 - 5 pulsos en %IX0.2, Reset en %IX0.3) -> Activa %QX0.2',
    elements: [
      { id: 'el-301', type: 'NO', variable: '%IX0.2', label: 'PULSE_SENSOR' },
      { id: 'el-302', type: 'CTU', variable: 'C0', label: 'BATCH_COUNTER', presetCount: 5, resetVariable: '%IX0.3' },
      { id: 'el-303', type: 'COIL', variable: '%QX0.2', label: 'BATCH_COMPLETE' },
    ],
  },
  {
    id: 'rung-5',
    number: 5,
    sheet: 2,
    comment: 'Comparador Analógico GT (>): Si Presión A1 (%IW0) > 2800 activa Alarma (%QX0.4)',
    elements: [
      { id: 'el-501', type: 'GT', variable: '%IW0', label: 'CMP_PRESSURE', auxVariable: '2800' },
      { id: 'el-502', type: 'COIL', variable: '%QX0.4', label: 'PRESSURE_ALARM' },
    ],
  },
  {
    id: 'rung-6',
    number: 6,
    sheet: 3,
    comment: 'Telemetría Modbus TCP: Copiar conteo actual (C0.CV) al Holding Register %MW0 (40001)',
    elements: [
      { id: 'el-601', type: 'NO', variable: '%QX0.0', label: 'MAIN_CONTACTOR' },
      { id: 'el-602', type: 'MOVE', variable: 'C0.CV', label: 'PUB_MODBUS', destVariable: '%MW0' },
      { id: 'el-603', type: 'COIL', variable: '%MX0.0', label: 'REMOTE_SCADA_EN' },
    ],
  },
];

export const DEFAULT_ST_CODE = `(* ============================================================================
 * PROGRAMA IEC 61131-3: AUTOMATIZACIÓN & REDES INDUSTRIALES KINCONY KC868-A16
 * Soporta: TON, TOF, TP, CTU, CTD, CTUD, R_TRIG, F_TRIG, SR, RS, IF/CASE/FOR
 * ============================================================================ *)
PROGRAM KinCony_A16_Main
VAR
  START_BTN        AT %IX0.0 : BOOL; (* DI1 - PCF8574 0x22 - Modbus 10001 *)
  STOP_BTN         AT %IX0.1 : BOOL; (* DI2 - PCF8574 0x22 - Modbus 10002 *)
  PULSE_SENSOR     AT %IX0.2 : BOOL; (* DI3 - PCF8574 0x22 - Modbus 10003 *)
  RESET_CNT        AT %IX0.3 : BOOL; (* DI4 - PCF8574 0x22 - Modbus 10004 *)
  LEVEL_HIGH       AT %IX0.4 : BOOL; (* DI5 - PCF8574 0x22 - Modbus 10005 *)
  LEVEL_LOW        AT %IX0.5 : BOOL; (* DI6 - PCF8574 0x22 - Modbus 10006 *)

  MAIN_CONTACTOR   AT %QX0.0 : BOOL; (* DO1 - PCF8574 0x24 - Modbus 00001 *)
  STAR_DELTA_K2    AT %QX0.1 : BOOL; (* DO2 - PCF8574 0x24 - Modbus 00002 *)
  BATCH_COMPLETE   AT %QX0.2 : BOOL; (* DO3 - PCF8574 0x24 - Modbus 00003 *)
  DRAIN_VALVE      AT %QX0.3 : BOOL; (* DO4 - PCF8574 0x24 - Modbus 00004 *)
  PRESSURE_ALARM   AT %QX0.4 : BOOL; (* DO5 - PCF8574 0x24 - Modbus 00005 *)

  PRESSURE_ADC1    AT %IW0   : INT;  (* ADC1 GPIO36 - Modbus 30001 *)
  MODBUS_BATCH_REG AT %MW0   : INT;  (* Holding Reg - Modbus 40001 *)

  T0 : TON;
  C0 : CTU;
END_VAR

(* 1. Enclavamiento de Marcha / Paro Motor Principal *)
%QX0.0 := (%IX0.0 OR %QX0.0) AND NOT %IX0.1;

(* 2. Temporizador TON T0 (2500 ms) para Estrella-Triángulo *)
T0(IN := %QX0.0, PT := T#2500ms);
%QX0.1 := T0.Q;

(* 3. Contador CTU C0 (5 pulsos en %IX0.2, Reset en %IX0.3) *)
C0(CU := %IX0.2, R := %IX0.3, PV := 5);
%QX0.2 := C0.Q;

(* 4. Publicar cuenta en Holding Register Modbus 40001 (%MW0) *)
%MW0 := C0.CV;

(* 5. Supervisión Analógica de Presión (%IW0 > 2800) *)
IF %IW0 > 2800 THEN
  %QX0.4 := TRUE;
ELSE
  %QX0.4 := FALSE;
END_IF;

(* 6. Control de Nivel con Histéresis *)
IF %IX0.4 THEN
  %QX0.3 := TRUE;
END_IF;

IF %IX0.5 THEN
  %QX0.3 := FALSE;
END_IF;

END_PROGRAM
`;
