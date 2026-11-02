import { KinConyHardwareConfig, LadderRung, PLCLanguage, VariableSymbol } from '../types/plc';
import { DEFAULT_LADDER_RUNGS, DEFAULT_ST_CODE, DEFAULT_SYMBOLS } from './defaultProgram';

export interface PlnoProjectFile {
  format: 'PCLINO_PROJECT';
  version: '1.0';
  fileName: string;
  title: string;
  category: string;
  description: string;
  language: PLCLanguage;
  rungs: LadderRung[];
  stCode: string;
  symbols: VariableSymbol[];
  hwConfig?: Partial<KinConyHardwareConfig>;
}

export const PLC_EXAMPLES: PlnoProjectFile[] = [
  {
    format: 'PCLINO_PROJECT',
    version: '1.0',
    fileName: '01_marcha_paro_enclavamiento.plno',
    title: '1. Marcha / Paro con Enclavamiento (NO, NC, Rama OR)',
    category: 'Control Básico de Motores',
    description: 'Circuito clásico de arranque directo de motor trifásico con contacto auxiliar de retención en paralelo (%QX0.0) y pulsador NC de paro (%IX0.1).',
    language: 'LD',
    symbols: DEFAULT_SYMBOLS,
    rungs: [
      {
        id: 'ex1-r1',
        number: 1,
        sheet: 1,
        comment: 'Marcha (%IX0.0) con retención (%QX0.0) y Paro NC (%IX0.1) -> Contactor Principal (%QX0.0)',
        elements: [
          { id: 'ex1-1', type: 'NO', variable: '%IX0.0', label: 'START_BTN' },
          { id: 'ex1-2', type: 'NC', variable: '%IX0.1', label: 'STOP_BTN' },
          { id: 'ex1-3', type: 'COIL', variable: '%QX0.0', label: 'MAIN_CONTACTOR' },
        ],
        branchElements: [
          { id: 'ex1-b1', type: 'NO', variable: '%QX0.0', label: 'MAIN_CONTACTOR' },
        ],
      },
      {
        id: 'ex1-r2',
        number: 2,
        sheet: 1,
        comment: 'Lámpara Piloto de Motor Detenido (Bobina Negada sobre %QX0.0 -> %QX0.1)',
        elements: [
          { id: 'ex1-4', type: 'NO', variable: '%QX0.0', label: 'MAIN_CONTACTOR' },
          { id: 'ex1-5', type: 'NEG_COIL', variable: '%QX0.1', label: 'PILOTO_PARO' },
        ],
      },
    ],
    stCode: `PROGRAM Marcha_Paro
VAR
  START_BTN      AT %IX0.0 : BOOL;
  STOP_BTN       AT %IX0.1 : BOOL;
  MAIN_CONTACTOR AT %QX0.0 : BOOL;
  PILOTO_PARO    AT %QX0.1 : BOOL;
END_VAR

%QX0.0 := (%IX0.0 OR %QX0.0) AND NOT %IX0.1;
%QX0.1 := NOT %QX0.0;

END_PROGRAM`,
  },
  {
    format: 'PCLINO_PROJECT',
    version: '1.0',
    fileName: '02_arranque_estrella_triangulo_ton.plno',
    title: '2. Arranque Estrella-Triángulo (Temporizador TON)',
    category: 'Temporizadores IEC 61131-3',
    description: 'Arranque de motor con contactor principal (%QX0.0) y conmutación automática a contactor Triángulo (%QX0.1) tras 2500 ms mediante bloque TON.',
    language: 'LD',
    symbols: DEFAULT_SYMBOLS,
    rungs: [
      {
        id: 'ex2-r1',
        number: 1,
        sheet: 1,
        comment: 'Enclavamiento del Contactor de Línea Principal (%QX0.0)',
        elements: [
          { id: 'ex2-1', type: 'NO', variable: '%IX0.0', label: 'START_BTN' },
          { id: 'ex2-2', type: 'NC', variable: '%IX0.1', label: 'STOP_BTN' },
          { id: 'ex2-3', type: 'COIL', variable: '%QX0.0', label: 'MAIN_CONTACTOR' },
        ],
        branchElements: [
          { id: 'ex2-b1', type: 'NO', variable: '%QX0.0', label: 'MAIN_CONTACTOR' },
        ],
      },
      {
        id: 'ex2-r2',
        number: 2,
        sheet: 1,
        comment: 'Temporizador TON T0 (2500 ms) activa Contactor Triángulo (%QX0.1)',
        elements: [
          { id: 'ex2-4', type: 'NO', variable: '%QX0.0', label: 'MAIN_CONTACTOR' },
          { id: 'ex2-5', type: 'TON', variable: 'T0', label: 'TMR_ESTRELLA_TRI', presetMs: 2500 },
          { id: 'ex2-6', type: 'COIL', variable: '%QX0.1', label: 'STAR_DELTA_K2' },
        ],
      },
      {
        id: 'ex2-r3',
        number: 3,
        sheet: 1,
        comment: 'Contactor Estrella (%QX0.2) activo solo mientras el motor arranca y aún no entra Triángulo',
        elements: [
          { id: 'ex2-7', type: 'NO', variable: '%QX0.0', label: 'MAIN_CONTACTOR' },
          { id: 'ex2-8', type: 'NC', variable: '%QX0.1', label: 'STAR_DELTA_K2' },
          { id: 'ex2-9', type: 'COIL', variable: '%QX0.2', label: 'CONTACTOR_ESTRELLA' },
        ],
      },
    ],
    stCode: `PROGRAM Estrella_Triangulo
VAR
  T0 : TON;
END_VAR

%QX0.0 := (%IX0.0 OR %QX0.0) AND NOT %IX0.1;
T0(IN := %QX0.0, PT := T#2500ms);
%QX0.1 := T0.Q;
%QX0.2 := %QX0.0 AND NOT %QX0.1;

END_PROGRAM`,
  },
  {
    format: 'PCLINO_PROJECT',
    version: '1.0',
    fileName: '03_postenfriamiento_ventilador_tof.plno',
    title: '3. Post-Enfriamiento de Horno (Temporizador TOF)',
    category: 'Temporizadores IEC 61131-3',
    description: 'Uso del bloque TOF (Off-Delay): cuando se apaga el quemador (%IX0.0), el extractor de enfriamiento (%QX0.1) sigue encendido durante 3000 ms.',
    language: 'LD',
    symbols: DEFAULT_SYMBOLS,
    rungs: [
      {
        id: 'ex3-r1',
        number: 1,
        sheet: 1,
        comment: 'Mando directo del Quemador Principal (%IX0.0 -> %QX0.0)',
        elements: [
          { id: 'ex3-1', type: 'NO', variable: '%IX0.0', label: 'SW_QUEMADOR' },
          { id: 'ex3-2', type: 'COIL', variable: '%QX0.0', label: 'QUEMADOR_ON' },
        ],
      },
      {
        id: 'ex3-r2',
        number: 2,
        sheet: 1,
        comment: 'Temporizador a la Desconexión TOF T1 (3000 ms): Mantiene ventilador (%QX0.1) tras apagar quemador',
        elements: [
          { id: 'ex3-3', type: 'NO', variable: '%QX0.0', label: 'QUEMADOR_ON' },
          { id: 'ex3-4', type: 'TOF', variable: 'T1', label: 'POST_COOLING_TOF', presetMs: 3000 },
          { id: 'ex3-5', type: 'COIL', variable: '%QX0.1', label: 'VENTILADOR_ENFRIA' },
        ],
      },
    ],
    stCode: `PROGRAM Post_Enfriamiento_TOF
VAR
  T1 : TOF;
END_VAR

%QX0.0 := %IX0.0;
T1(IN := %QX0.0, PT := T#3000ms);
%QX0.1 := T1.Q;

END_PROGRAM`,
  },
  {
    format: 'PCLINO_PROJECT',
    version: '1.0',
    fileName: '04_dosificador_inyeccion_tp.plno',
    title: '4. Dosificador por Pulso Exacto (Temporizador TP)',
    category: 'Temporizadores IEC 61131-3',
    description: 'El bloque TP genera un pulso de inyección de exactamente 1800 ms en la electroválvula (%QX0.0) ante cualquier toque en el pulsador (%IX0.0).',
    language: 'LD',
    symbols: DEFAULT_SYMBOLS,
    rungs: [
      {
        id: 'ex4-r1',
        number: 1,
        sheet: 1,
        comment: 'Temporizador de Pulso TP T2 (1800 ms): Apertura calibrada de Electroválvula Dosificadora (%QX0.0)',
        elements: [
          { id: 'ex4-1', type: 'NO', variable: '%IX0.0', label: 'GATILLO_DOSIS' },
          { id: 'ex4-2', type: 'TP', variable: 'T2', label: 'PULSO_DOSIS', presetMs: 1800 },
          { id: 'ex4-3', type: 'COIL', variable: '%QX0.0', label: 'VALVULA_DOSIS' },
        ],
      },
    ],
    stCode: `PROGRAM Dosificador_TP
VAR
  T2 : TP;
END_VAR

T2(IN := %IX0.0, PT := T#1800ms);
%QX0.0 := T2.Q;

END_PROGRAM`,
  },
  {
    format: 'PCLINO_PROJECT',
    version: '1.0',
    fileName: '05_empacadora_lotes_ctu_flanco.plno',
    title: '5. Empacadora por Lotes con Flanco (R_TRIG + CTU)',
    category: 'Contadores y Flancos',
    description: 'Detecta flancos de subida (R_TRIG) del sensor óptico (%IX0.2), cuenta 5 piezas con CTU C0, activa banda de cierre (%QX0.2) y publica la cuenta en %MW0.',
    language: 'LD',
    symbols: DEFAULT_SYMBOLS,
    rungs: [
      {
        id: 'ex5-r1',
        number: 1,
        sheet: 1,
        comment: 'Detector de Flanco R_TRIG + Contador Ascendente CTU C0 (Meta PV=5, Reset en %IX0.3) -> %QX0.2',
        elements: [
          { id: 'ex5-1', type: 'R_TRIG', variable: '%IX0.2', label: 'FLANCO_PIEZA' },
          { id: 'ex5-2', type: 'CTU', variable: 'C0', label: 'CONTADOR_CAJA', presetCount: 5, resetVariable: '%IX0.3' },
          { id: 'ex5-3', type: 'COIL', variable: '%QX0.2', label: 'BATCH_COMPLETE' },
        ],
      },
      {
        id: 'ex5-r2',
        number: 2,
        sheet: 1,
        comment: 'Transferir conteo actual C0.CV al registro Holding Modbus %MW0 (40001)',
        elements: [
          { id: 'ex5-4', type: 'MOVE', variable: 'C0.CV', label: 'COPIAR_CUENTA', destVariable: '%MW0' },
          { id: 'ex5-5', type: 'COIL', variable: '%MX0.0', label: 'TELEMETRIA_OK' },
        ],
      },
    ],
    stCode: `PROGRAM Empacadora_CTU
VAR
  C0 : CTU;
END_VAR

C0(CU := %IX0.2, R := %IX0.3, PV := 5);
%QX0.2 := C0.Q;
%MW0 := C0.CV;

END_PROGRAM`,
  },
  {
    format: 'PCLINO_PROJECT',
    version: '1.0',
    fileName: '06_aforo_parking_reversible_ctud.plno',
    title: '6. Control de Aforo Reversible (Contador CTUD + CTD)',
    category: 'Contadores y Flancos',
    description: 'Contador bidireccional CTUD C2: incrementa con barrera de entrada (%IX0.0), descuenta con barrera de salida (%IX0.7) y enciende cartel LLENO (%QX0.2).',
    language: 'LD',
    symbols: DEFAULT_SYMBOLS,
    rungs: [
      {
        id: 'ex6-r1',
        number: 1,
        sheet: 1,
        comment: 'Contador Bidireccional CTUD C2 (CU=%IX0.0 Entrada, CD=%IX0.7 Salida, R=%IX0.3, PV=5)',
        elements: [
          { id: 'ex6-1', type: 'NO', variable: '%IX0.0', label: 'BARRERA_ENTRADA' },
          {
            id: 'ex6-2',
            type: 'CTUD',
            variable: 'C2',
            label: 'AFORO_PARKING',
            presetCount: 5,
            auxVariable: '%IX0.7',
            resetVariable: '%IX0.3',
          },
          { id: 'ex6-3', type: 'COIL', variable: '%QX0.2', label: 'CARTEL_LLENO' },
        ],
      },
    ],
    stCode: `PROGRAM Aforo_Parking
VAR
  C0 : CTU;
END_VAR

C0(CU := %IX0.0, R := %IX0.3, PV := 5);
%QX0.2 := C0.Q;

END_PROGRAM`,
  },
  {
    format: 'PCLINO_PROJECT',
    version: '1.0',
    fileName: '07_control_nivel_tanque_bistable_sr.plno',
    title: '7. Control de Nivel de Tanque con Histéresis (SR / SET / RESET)',
    category: 'Biestables y Procesos',
    description: 'Vaciado automático de tanque industrial: activa bomba de drenaje (%QX0.3) cuando se alcanza Nivel Alto (%IX0.4) y corta solo al llegar a Nivel Bajo (%IX0.5).',
    language: 'LD',
    symbols: DEFAULT_SYMBOLS,
    rungs: [
      {
        id: 'ex7-r1',
        number: 1,
        sheet: 1,
        comment: 'Biestable SR (Set Dominante): Boya Nivel Alto (%IX0.4) enclava válvula %QX0.3; Nivel Bajo (%IX0.5) resetea',
        elements: [
          { id: 'ex7-1', type: 'NO', variable: '%IX0.4', label: 'LEVEL_HIGH' },
          { id: 'ex7-2', type: 'SR', variable: '%QX0.3', label: 'DRAIN_VALVE', resetVariable: '%IX0.5' },
        ],
      },
      {
        id: 'ex7-r2',
        number: 2,
        sheet: 1,
        comment: 'Alarma por Rebose si ambas boyas están activas simultáneamente',
        elements: [
          { id: 'ex7-3', type: 'NO', variable: '%IX0.4', label: 'LEVEL_HIGH' },
          { id: 'ex7-4', type: 'NO', variable: '%IX0.5', label: 'LEVEL_LOW' },
          { id: 'ex7-5', type: 'COIL', variable: '%QX0.4', label: 'ALARMA_BOYAS' },
        ],
      },
    ],
    stCode: `PROGRAM Control_Nivel_Tanque
IF %IX0.4 THEN
  %QX0.3 := TRUE;
ELSIF %IX0.5 THEN
  %QX0.3 := FALSE;
END_IF;
END_PROGRAM`,
  },
  {
    format: 'PCLINO_PROJECT',
    version: '1.0',
    fileName: '08_supervision_analogica_4_20ma.plno',
    title: '8. Supervisión Analógica 4–20 mA y Escalado (GT, LT, DIV)',
    category: 'Analógicas y Aritmética',
    description: 'Monitorea el transmisor de presión A1 (%IW0 en GPIO36) y temperatura 1-Wire DS18B20 (%IW4 en GPIO32) activando alarmas por umbral alto/bajo.',
    language: 'LD',
    symbols: DEFAULT_SYMBOLS,
    rungs: [
      {
        id: 'ex8-r1',
        number: 1,
        sheet: 1,
        comment: 'Alarma de Sobrepresión (> 2800 cuentas ADC en canal A1 %IW0 -> Activa %QX0.4)',
        elements: [
          { id: 'ex8-1', type: 'GT', variable: '%IW0', label: 'PRESION_ALTA', auxVariable: '2800' },
          { id: 'ex8-2', type: 'COIL', variable: '%QX0.4', label: 'PRESSURE_ALARM' },
        ],
      },
      {
        id: 'ex8-r2',
        number: 2,
        sheet: 1,
        comment: 'Alarma de Baja Presión de Línea (< 600 cuentas ADC en %IW0 -> Activa %QX0.5)',
        elements: [
          { id: 'ex8-3', type: 'LT', variable: '%IW0', label: 'PRESION_BAJA', auxVariable: '600' },
          { id: 'ex8-4', type: 'COIL', variable: '%QX0.5', label: 'LOW_PRESS_WARN' },
        ],
      },
      {
        id: 'ex8-r3',
        number: 3,
        sheet: 1,
        comment: 'Escalado de ADC1 (%IW0 / 41 -> Porcentaje 0..100% en registro Modbus %MW2)',
        elements: [
          { id: 'ex8-5', type: 'DIV', variable: '%IW0', label: 'ESCALAR_PCT', auxVariable: '41', destVariable: '%MW2' },
          { id: 'ex8-6', type: 'COIL', variable: '%MX0.0', label: 'CALC_ACTIVE' },
        ],
      },
    ],
    stCode: `PROGRAM Supervision_Analogica
IF %IW0 > 2800 THEN
  %QX0.4 := TRUE;
ELSE
  %QX0.4 := FALSE;
END_IF;

%MW2 := %IW0 / 41;
END_PROGRAM`,
  },
  {
    format: 'PCLINO_PROJECT',
    version: '1.0',
    fileName: '09_planta_completa_redes_kc868.plno',
    title: '9. Planta Industrial Completa + Telemetría Redes (Proyecto Base)',
    category: 'Redes Industriales & SCADA',
    description: 'Proyecto integral con 3 hojas (Potencia, Analógicas y Telemetría Modbus) diseñado para ensayar tramas Modbus TCP, RS485 RTU e I²C PCF8574.',
    language: 'LD',
    symbols: DEFAULT_SYMBOLS,
    rungs: DEFAULT_LADDER_RUNGS,
    stCode: DEFAULT_ST_CODE,
  },
];
