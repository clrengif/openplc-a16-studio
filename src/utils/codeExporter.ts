import { KinConyHardwareConfig, LadderRung, VariableSymbol } from '../types/plc';

/**
 * Convert Ladder Diagram Rungs into standard IEC 61131-3 Structured Text (ST)
 */
export function generateSTFromLadder(rungs: LadderRung[], symbols: VariableSymbol[]): string {
  const varLines = symbols.map((sym) => {
    const padName = sym.name.padEnd(16, ' ');
    const padAddr = sym.address.padEnd(7, ' ');
    return `  ${padName} AT ${padAddr} : ${sym.type}; (* ${sym.comment} *)`;
  });

  // Collect any timers and counters used in rungs
  const fbDecls: string[] = [];
  const seenFb = new Set<string>();
  rungs.forEach((r) => {
    r.elements.forEach((el) => {
      if ((el.type === 'TON' || el.type === 'TOF' || el.type === 'CTU') && !seenFb.has(el.variable)) {
        seenFb.add(el.variable);
        fbDecls.push(`  ${el.variable.padEnd(16, ' ')} : ${el.type}; (* ${el.label || el.type} *)`);
      }
    });
  });

  const bodyLines: string[] = [];

  rungs.forEach((rung) => {
    bodyLines.push(`(* Rung ${rung.number}: ${rung.comment} *)`);
    if (rung.elements.length === 0) return;

    const contacts = rung.elements.filter((e) => e.type === 'NO' || e.type === 'NC');
    const fbs = rung.elements.filter((e) => e.type === 'TON' || e.type === 'TOF' || e.type === 'CTU');
    const coils = rung.elements.filter((e) => e.type === 'COIL' || e.type === 'SET' || e.type === 'RESET');

    // Build condition expression from contacts and parallel branch
    const formatContact = (type: 'NO' | 'NC', variable: string) =>
      type === 'NC' ? `NOT ${variable}` : variable;

    let exprParts: string[] = [];
    contacts.forEach((c, idx) => {
      const baseExpr = formatContact(c.type as 'NO' | 'NC', c.variable);
      if (idx === 0 && rung.branchElements && rung.branchElements.length > 0) {
        const branchExpr = rung.branchElements
          .map((b) => formatContact(b.type as 'NO' | 'NC', b.variable))
          .join(' AND ');
        exprParts.push(`(${baseExpr} OR ${branchExpr})`);
      } else {
        exprParts.push(baseExpr);
      }
    });

    let rungExpr = exprParts.length > 0 ? exprParts.join(' AND ') : 'TRUE';

    // Function blocks in rung
    fbs.forEach((fb) => {
      if (fb.type === 'TON' || fb.type === 'TOF') {
        const pt = fb.presetMs ?? 2000;
        bodyLines.push(`${fb.variable}(IN := ${rungExpr}, PT := T#${pt}ms);`);
        rungExpr = `${fb.variable}.Q`;
      } else if (fb.type === 'CTU') {
        const pv = fb.presetCount ?? 5;
        const resetVar = fb.resetVariable || 'FALSE';
        bodyLines.push(`${fb.variable}(CU := ${rungExpr}, R := ${resetVar}, PV := ${pv});`);
        rungExpr = `${fb.variable}.Q`;
      }
    });

    // Coils
    coils.forEach((coil) => {
      if (coil.type === 'COIL') {
        bodyLines.push(`${coil.variable} := ${rungExpr};`);
      } else if (coil.type === 'SET') {
        bodyLines.push(`IF ${rungExpr} THEN\n  ${coil.variable} := TRUE;\nEND_IF;`);
      } else if (coil.type === 'RESET') {
        bodyLines.push(`IF ${rungExpr} THEN\n  ${coil.variable} := FALSE;\nEND_IF;`);
      }
    });

    bodyLines.push('');
  });

  return [
    '(* ============================================================================',
    ' * PROGRAMA IEC 61131-3 GENERADO DESDE OPENPLC A16 STUDIO',
    ' * Target Hardware: KinCony KC868-A16 (ESP32 + 4x PCF8574 I2C + LAN8720 ETH)',
    ' * ============================================================================ *)',
    'PROGRAM KinCony_A16_Main',
    'VAR',
    ...varLines,
    ...(fbDecls.length > 0 ? ['  (* Bloques Funcionales *)', ...fbDecls] : []),
    'END_VAR',
    '',
    ...bodyLines,
    'END_PROGRAM',
  ].join('\n');
}

/**
 * Generate PLCopen TC6 XML v2.01 compatible with OpenPLC Editor
 */
export function generatePLCopenXML(
  rungs: LadderRung[],
  symbols: VariableSymbol[],
  stCode: string
): string {
  const nowIso = new Date().toISOString().split('.')[0];
  const varsXml = symbols
    .map(
      (s) => `            <variable name="${s.name}" address="${s.address}">
              <type>
                <${s.type} />
              </type>
              <documentation>
                <xhtml:p><![CDATA[${s.comment}]]></xhtml:p>
              </documentation>
            </variable>`
    )
    .join('\n');

  return `<?xml version='1.0' encoding='utf-8'?>
<project xmlns:ns1="http://www.plcopen.org/xml/tc6_0201" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns="http://www.plcopen.org/xml/tc6_0201">
  <fileHeader companyName="OpenPLC A16 Studio" productName="KinCony KC868-A16 IDE" productVersion="1.0" creationDateTime="${nowIso}" />
  <contentHeader name="KinCony_KC868_A16_Project" modificationDateTime="${nowIso}">
    <coordinateInfo>
      <fbd><scaling x="10" y="10" /></fbd>
      <ld><scaling x="10" y="10" /></ld>
      <sfc><scaling x="10" y="10" /></sfc>
    </coordinateInfo>
  </contentHeader>
  <types>
    <dataTypes />
    <pous>
      <pou name="KinCony_A16_Main" pouType="program">
        <interface>
          <localVars>
${varsXml}
          </localVars>
        </interface>
        <body>
          <ST>
            <xhtml:p><![CDATA[
${stCode}
]]></xhtml:p>
          </ST>
        </body>
      </pou>
    </pous>
  </types>
  <instances>
    <configurations>
      <configuration name="Config0">
        <resource name="Res0">
          <task name="task0" priority="0" interval="T#20ms">
            <pouInstance name="instance0" typeName="KinCony_A16_Main" />
          </task>
        </resource>
      </configuration>
    </configurations>
  </instances>
</project>`;
}

/**
 * Generate the OpenPLC Hardware Adaptation Layer (HAL) C++ driver for KinCony KC868-A16
 * Directly usable in OpenPLC Editor -> Hardware -> ESP32 Custom Layer
 */
export function generateOpenPLCHalCode(hwConfig: KinConyHardwareConfig): string {
  return `// ============================================================================
// OPENPLC HARDWARE ADAPTATION LAYER (HAL) PARA KINCONY KC868-A16 (ESP32)
// ============================================================================
// Instrucciones para OpenPLC Editor:
// 1. En OpenPLC Editor, abre el diálogo "Transfer Program to PLC" (Arduino/ESP32).
// 2. Selecciona Board: "ESP32 Dev Module" (o NodeMCU-32S / KinCony KC868-A16).
// 3. Activa la pestaña "Custom Hardware Layer" y pega este código completo.
// ============================================================================

#include <Arduino.h>
#include <Wire.h>

// Pines I2C del bus KinCony KC868-A16
#define KC868_I2C_SDA        ${hwConfig.i2cSdaPin}
#define KC868_I2C_SCL        ${hwConfig.i2cSclPin}

// Direcciones I2C de los 4 expansores PCF8574 (Lógica Activa-Baja: 0 = ON, 1 = OFF)
#define PCF8574_DI_1_8       ${hwConfig.pcfIn1Addr}  // %IX0.0 .. %IX0.7 (DI1 .. DI8)
#define PCF8574_DI_9_16      ${hwConfig.pcfIn2Addr}  // %IX1.0 .. %IX1.7 (DI9 .. DI16)
#define PCF8574_DO_1_8       ${hwConfig.pcfOut1Addr} // %QX0.0 .. %QX0.7 (DO1 .. DO8)
#define PCF8574_DO_9_16      ${hwConfig.pcfOut2Addr} // %QX1.0 .. %QX1.7 (DO9 .. DO16)

// Entradas Analógicas ADC1 (0-5V / 4-20mA) -> %IW0 .. %IW3
static const uint8_t KC868_ANALOG_PINS[4] = { 36, 39, 34, 35 };

// Punteros de memoria interna de OpenPLC Runtime
extern uint8_t *bool_input[2][8];
extern uint8_t *bool_output[2][8];
extern uint16_t *int_input[4];

static uint8_t pcfReadByte(uint8_t addr) {
  Wire.requestFrom(addr, (uint8_t)1);
  if (Wire.available()) {
    return Wire.read();
  }
  return 0xFF; // Pull-up por defecto (todas desactivadas)
}

static void pcfWriteByte(uint8_t addr, uint8_t data) {
  Wire.beginTransmission(addr);
  Wire.write(data);
  Wire.endTransmission();
}

void hardwareInit() {
  Wire.begin(KC868_I2C_SDA, KC868_I2C_SCL, 400000U);

  // Inicializar entradas en HIGH (modo lectura cuasi-bidireccional PCF8574)
  pcfWriteByte(PCF8574_DI_1_8, 0xFF);
  pcfWriteByte(PCF8574_DI_9_16, 0xFF);

  // Apagar todas las salidas inicialmente (HIGH = relé/MOSFET apagado)
  pcfWriteByte(PCF8574_DO_1_8, 0xFF);
  pcfWriteByte(PCF8574_DO_9_16, 0xFF);

  // Configurar resolución ADC ESP32 a 12 bits (0..4095) escalado a 16 bits IEC (0..65535)
  analogReadResolution(12);
}

void updateInputBuffers() {
  // Leer %IX0.0 .. %IX0.7 (DI1..DI8) e invertir porque el optoacoplador es activo en BAJO
  uint8_t rawInLow = ~pcfReadByte(PCF8574_DI_1_8);
  // Leer %IX1.0 .. %IX1.7 (DI9..DI16)
  uint8_t rawInHigh = ~pcfReadByte(PCF8574_DI_9_16);

  for (int bit = 0; bit < 8; bit++) {
    if (bool_input[0][bit] != NULL) {
      *bool_input[0][bit] = (rawInLow >> bit) & 0x01;
    }
    if (bool_input[1][bit] != NULL) {
      *bool_input[1][bit] = (rawInHigh >> bit) & 0x01;
    }
  }

  // Leer las 4 entradas analógicas A1..A4 -> %IW0..%IW3
  for (int ch = 0; ch < 4; ch++) {
    if (int_input[ch] != NULL) {
      uint16_t adc12 = analogRead(KC868_ANALOG_PINS[ch]);
      *int_input[ch] = (uint16_t)(adc12 << 4); // Escala 0..4095 a 0..65520
    }
  }
}

void updateOutputBuffers() {
  uint8_t outLow = 0xFF;  // Todos apagados (1 = OFF)
  uint8_t outHigh = 0xFF;

  for (int bit = 0; bit < 8; bit++) {
    if (bool_output[0][bit] != NULL && *bool_output[0][bit]) {
      outLow &= ~(1 << bit); // Poner bit a 0 para activar MOSFET/Relé
    }
    if (bool_output[1][bit] != NULL && *bool_output[1][bit]) {
      outHigh &= ~(1 << bit);
    }
  }

  pcfWriteByte(PCF8574_DO_1_8, outLow);
  pcfWriteByte(PCF8574_DO_9_16, outHigh);
}
`;
}

/**
 * Generate Complete Standalone Arduino / PlatformIO Firmware (.ino / .cpp)
 * for KinCony KC868-A16 including I2C PCF8574 HAL, LAN8720 Ethernet,
 * OpenPLC Modbus TCP Slave (Port 502), and WebSocket / Serial Studio Bridge.
 */
export function generateKinConyInoFirmware(
  rungs: LadderRung[],
  hwConfig: KinConyHardwareConfig
): string {
  // Generate C++ evaluation lines from current Ladder rungs
  const cppRungLines: string[] = [];
  rungs.forEach((r) => {
    cppRungLines.push(`  // Rung ${r.number}: ${r.comment}`);
    const contacts = r.elements.filter((e) => e.type === 'NO' || e.type === 'NC');
    const fbs = r.elements.filter((e) => e.type === 'TON' || e.type === 'TOF' || e.type === 'CTU');
    const coils = r.elements.filter((e) => e.type === 'COIL' || e.type === 'SET' || e.type === 'RESET');

    const addrToCppRead = (v: string, type: 'NO' | 'NC') => {
      const inv = type === 'NC' ? '!' : '';
      return `${inv}readBit("${v}")`;
    };

    const condParts: string[] = [];
    contacts.forEach((c, idx) => {
      const base = addrToCppRead(c.variable, c.type as 'NO' | 'NC');
      if (idx === 0 && r.branchElements && r.branchElements.length > 0) {
        const br = r.branchElements
          .map((b) => addrToCppRead(b.variable, b.type as 'NO' | 'NC'))
          .join(' && ');
        condParts.push(`(${base} || (${br}))`);
      } else {
        condParts.push(base);
      }
    });

    let rungVar = `rung_${r.number}_pwr`;
    cppRungLines.push(`  bool ${rungVar} = ${condParts.length > 0 ? condParts.join(' && ') : 'true'};`);

    fbs.forEach((fb) => {
      const idx = parseInt(fb.variable.slice(1), 10) || 0;
      if (fb.type === 'TON') {
        cppRungLines.push(`  ${rungVar} = evalTON(${idx}, ${rungVar}, ${fb.presetMs ?? 2000}UL, nowMs);`);
      } else if (fb.type === 'TOF') {
        cppRungLines.push(`  ${rungVar} = evalTOF(${idx}, ${rungVar}, ${fb.presetMs ?? 2000}UL, nowMs);`);
      } else if (fb.type === 'CTU') {
        const rst = fb.resetVariable ? `readBit("${fb.resetVariable}")` : 'false';
        cppRungLines.push(`  ${rungVar} = evalCTU(${idx}, ${rungVar}, ${rst}, ${fb.presetCount ?? 5});`);
      }
    });

    coils.forEach((c) => {
      if (c.type === 'COIL') {
        cppRungLines.push(`  writeBit("${c.variable}", ${rungVar});`);
      } else if (c.type === 'SET') {
        cppRungLines.push(`  if (${rungVar}) writeBit("${c.variable}", true);`);
      } else if (c.type === 'RESET') {
        cppRungLines.push(`  if (${rungVar}) writeBit("${c.variable}", false);`);
      }
    });
    cppRungLines.push('');
  });

  return `/* ============================================================================
 * FIRMWARE INTEGRAL OPENPLC + KINCONY KC868-A16 (ESP32-WROOM-32E)
 * ============================================================================
 * Placa: KinCony KC868-A16
 * - Bus I2C: SDA = GPIO ${hwConfig.i2cSdaPin}, SCL = GPIO ${hwConfig.i2cSclPin} (400 kHz)
 * - PCF8574 Entradas DI1..DI8   (${hwConfig.pcfIn1Addr}) -> %IX0.0 .. %IX0.7
 * - PCF8574 Entradas DI9..DI16  (${hwConfig.pcfIn2Addr}) -> %IX1.0 .. %IX1.7
 * - PCF8574 Salidas  DO1..DO8   (${hwConfig.pcfOut1Addr}) -> %QX0.0 .. %QX0.7
 * - PCF8574 Salidas  DO9..DO16  (${hwConfig.pcfOut2Addr}) -> %QX1.0 .. %QX1.7
 * - Entradas Analógicas A1..A4  (GPIO 36, 39, 34, 35) -> %IW0 .. %IW3
 * - Ethernet RMII LAN8720       (MDC=23, MDIO=18, CLK=17_OUT, ADDR=0)
 * - RS485 Modbus RTU            (RX=16, TX=13)
 * - Servidor Modbus TCP         Puerto ${hwConfig.modbusPort} (Compatible con OpenPLC / ScadaBR)
 * - Telemetría JSON Serial      115200 baudios (Compatible con Web Serial en OpenPLC A16 Studio)
 * ============================================================================ */

#include <Arduino.h>
#include <Wire.h>
#include <ETH.h>
#include <WiFi.h>

// Configuración Ethernet LAN8720 para KinCony KC868-A16
#define ETH_PHY_ADDR        0
#define ETH_PHY_POWER      -1
#define ETH_PHY_MDC        23
#define ETH_PHY_MDIO       18
#define ETH_PHY_TYPE       ETH_PHY_LAN8720
#define ETH_CLK_MODE       ETH_CLOCK_GPIO17_OUT

// Bus I2C y expansores PCF8574
#define I2C_SDA_PIN         ${hwConfig.i2cSdaPin}
#define I2C_SCL_PIN         ${hwConfig.i2cSclPin}
#define ADDR_PCF_DI_LOW     ${hwConfig.pcfIn1Addr}
#define ADDR_PCF_DI_HIGH    ${hwConfig.pcfIn2Addr}
#define ADDR_PCF_DO_LOW     ${hwConfig.pcfOut1Addr}
#define ADDR_PCF_DO_HIGH    ${hwConfig.pcfOut2Addr}

static const uint8_t ANALOG_PINS[4] = { 36, 39, 34, 35 };

// Memoria de Imagen de Proceso IEC 61131-3
bool IX[16] = { false };     // %IX0.0 .. %IX1.7
bool QX[16] = { false };     // %QX0.0 .. %QX1.7
bool MX[16] = { false };     // %MX0.0 .. %MX1.7
uint16_t IW[4] = { 0 };      // %IW0 .. %IW3 (ADC 12-bit)
int16_t MW[16] = { 0 };      // %MW0 .. %MW15

// Máscara de forzado remoto desde OpenPLC A16 Studio
bool forceIXMask[16] = { false };
bool forceIXVal[16]  = { false };

struct TimerTONState {
  bool IN;
  bool Q;
  unsigned long PT;
  unsigned long ET;
  unsigned long startMs;
  bool running;
} timers[8];

struct CounterCTUState {
  bool CU;
  bool R;
  bool Q;
  int16_t PV;
  int16_t CV;
  bool prevCU;
} counters[8];

WiFiServer modbusServer(${hwConfig.modbusPort});

// --- Funciones I2C PCF8574 ---
uint8_t readPCF8574(uint8_t address) {
  Wire.requestFrom(address, (uint8_t)1);
  if (Wire.available()) {
    return Wire.read();
  }
  return 0xFF;
}

void writePCF8574(uint8_t address, uint8_t value) {
  Wire.beginTransmission(address);
  Wire.write(value);
  Wire.endTransmission();
}

// --- Resolución de Direcciones IEC ---
int parseIecBitIndex(const char* addr) {
  // Ejemplo: "%IX0.2" -> byte 0, bit 2 => index 2
  if (strlen(addr) < 6) return -1;
  int byteIdx = addr[3] - '0';
  int bitIdx  = addr[5] - '0';
  int idx = byteIdx * 8 + bitIdx;
  return (idx >= 0 && idx < 16) ? idx : -1;
}

bool readBit(const char* addr) {
  if (strncmp(addr, "%IX", 3) == 0) {
    int idx = parseIecBitIndex(addr);
    return (idx >= 0) ? IX[idx] : false;
  }
  if (strncmp(addr, "%QX", 3) == 0) {
    int idx = parseIecBitIndex(addr);
    return (idx >= 0) ? QX[idx] : false;
  }
  if (strncmp(addr, "%MX", 3) == 0) {
    int idx = parseIecBitIndex(addr);
    return (idx >= 0) ? MX[idx] : false;
  }
  if (addr[0] == 'T') {
    int tIdx = atoi(addr + 1);
    return (tIdx >= 0 && tIdx < 8) ? timers[tIdx].Q : false;
  }
  if (addr[0] == 'C') {
    int cIdx = atoi(addr + 1);
    return (cIdx >= 0 && cIdx < 8) ? counters[cIdx].Q : false;
  }
  return false;
}

void writeBit(const char* addr, bool val) {
  if (strncmp(addr, "%QX", 3) == 0) {
    int idx = parseIecBitIndex(addr);
    if (idx >= 0) QX[idx] = val;
  } else if (strncmp(addr, "%MX", 3) == 0) {
    int idx = parseIecBitIndex(addr);
    if (idx >= 0) MX[idx] = val;
  }
}

// --- Bloques Funcionales IEC 61131-3 ---
bool evalTON(int id, bool in, unsigned long pt, unsigned long nowMs) {
  TimerTONState &t = timers[id];
  t.IN = in;
  t.PT = pt;
  if (!in) {
    t.Q = false;
    t.ET = 0;
    t.running = false;
  } else {
    if (!t.running) {
      t.running = true;
      t.startMs = nowMs;
      t.ET = 0;
      t.Q = (pt == 0);
    } else {
      t.ET = nowMs - t.startMs;
      if (t.ET >= pt) {
        t.ET = pt;
        t.Q = true;
      }
    }
  }
  return t.Q;
}

bool evalTOF(int id, bool in, unsigned long pt, unsigned long nowMs) {
  TimerTONState &t = timers[id];
  bool prevIn = t.IN;
  t.IN = in;
  t.PT = pt;
  if (in) {
    t.Q = true;
    t.ET = 0;
    t.running = false;
  } else {
    if (prevIn && !in) {
      t.running = true;
      t.startMs = nowMs;
      t.ET = 0;
      t.Q = (pt > 0);
    } else if (t.running) {
      t.ET = nowMs - t.startMs;
      if (t.ET >= pt) {
        t.ET = pt;
        t.Q = false;
        t.running = false;
      }
    }
  }
  return t.Q;
}

bool evalCTU(int id, bool cu, bool r, int16_t pv) {
  CounterCTUState &c = counters[id];
  c.CU = cu;
  c.R = r;
  c.PV = pv;
  if (r) {
    c.CV = 0;
  } else if (cu && !c.prevCU) {
    if (c.CV < 32767) c.CV++;
  }
  c.prevCU = cu;
  c.Q = (c.CV >= c.PV);
  return c.Q;
}

// --- Lectura y Escritura de Hardware KC868-A16 ---
void scanPhysicalInputs() {
  uint8_t inLow  = ~readPCF8574(ADDR_PCF_DI_LOW);  // Activo en BAJO -> invertir
  uint8_t inHigh = ~readPCF8574(ADDR_PCF_DI_HIGH);

  for (int i = 0; i < 8; i++) {
    IX[i]     = forceIXMask[i]     ? forceIXVal[i]     : ((inLow  >> i) & 0x01);
    IX[i + 8] = forceIXMask[i + 8] ? forceIXVal[i + 8] : ((inHigh >> i) & 0x01);
  }

  for (int ch = 0; ch < 4; ch++) {
    IW[ch] = analogRead(ANALOG_PINS[ch]);
  }
}

void flushPhysicalOutputs() {
  uint8_t outLow  = 0xFF; // 1 = OFF
  uint8_t outHigh = 0xFF;

  for (int i = 0; i < 8; i++) {
    if (QX[i])     outLow  &= ~(1 << i); // 0 = ON
    if (QX[i + 8]) outHigh &= ~(1 << i);
  }

  writePCF8574(ADDR_PCF_DO_LOW,  outLow);
  writePCF8574(ADDR_PCF_DO_HIGH, outHigh);
}

// --- Ciclo Determinista PLC (Programa Compilado desde OpenPLC A16 Studio) ---
void executePlcProgram(unsigned long nowMs) {
${cppRungLines.join('\n')}
}

// --- Servidor Modbus TCP Estándar (Puerto 502) para OpenPLC / ScadaBR ---
void handleModbusTCP() {
  WiFiClient client = modbusServer.available();
  if (!client) return;
  if (client.available() >= 12) {
    uint8_t req[64];
    int len = client.read(req, sizeof(req));
    if (len < 12) return;

    uint8_t fc = req[7];
    uint16_t startAddr = (req[8] << 8) | req[9];
    uint16_t count     = (req[10] << 8) | req[11];

    uint8_t resp[64];
    // Copiar Transaction ID, Protocol ID, Unit ID
    memcpy(resp, req, 8);

    if (fc == 0x01 || fc == 0x02) {
      // Read Coils (%QX) o Read Discrete Inputs (%IX)
      uint8_t byteCount = (count + 7) / 8;
      resp[4] = 0;
      resp[5] = 3 + byteCount;
      resp[8] = byteCount;
      memset(&resp[9], 0, byteCount);
      for (uint16_t i = 0; i < count; i++) {
        uint16_t idx = startAddr + i;
        bool val = (fc == 0x01)
          ? ((idx < 16) ? QX[idx] : false)
          : ((idx < 16) ? IX[idx] : false);
        if (val) resp[9 + (i / 8)] |= (1 << (i % 8));
      }
      client.write(resp, 9 + byteCount);
    } else if (fc == 0x05) {
      // Write Single Coil (%QX)
      if (startAddr < 16) {
        QX[startAddr] = (req[10] == 0xFF);
        flushPhysicalOutputs();
      }
      client.write(req, 12);
    }
  }
}

// --- Puente Serial JSON (115200 bps) con OpenPLC A16 Studio ---
void handleStudioSerialBridge() {
  while (Serial.available()) {
    String cmd = Serial.readStringUntil('\\n');
    cmd.trim();
    // Ejemplo de comando desde Studio: {"cmd":"FORCE_IX","index":0,"value":true}
    if (cmd.indexOf("\\"FORCE_IX\\"") != -1) {
      int idxPos = cmd.indexOf("\\"index\\":");
      int valPos = cmd.indexOf("\\"value\\":");
      if (idxPos != -1 && valPos != -1) {
        int idx = cmd.substring(idxPos + 8).toInt();
        bool val = cmd.substring(valPos + 8).startsWith("true");
        if (idx >= 0 && idx < 16) {
          forceIXMask[idx] = true;
          forceIXVal[idx]  = val;
        }
      }
    } else if (cmd.indexOf("\\"CLEAR_FORCE\\"") != -1) {
      memset(forceIXMask, 0, sizeof(forceIXMask));
    }
  }
}

void emitTelemetryJSON() {
  Serial.print("{\\"board\\":\\"KC868-A16\\",\\"ix\\":[");
  for (int i = 0; i < 16; i++) {
    Serial.print(IX[i] ? 1 : 0);
    if (i < 15) Serial.print(",");
  }
  Serial.print("],\\"qx\\":[");
  for (int i = 0; i < 16; i++) {
    Serial.print(QX[i] ? 1 : 0);
    if (i < 15) Serial.print(",");
  }
  Serial.print("],\\"iw\\":[");
  for (int i = 0; i < 4; i++) {
    Serial.print(IW[i]);
    if (i < 3) Serial.print(",");
  }
  Serial.println("]}");
}

unsigned long lastScanMs = 0;
unsigned long lastTelemetryMs = 0;

void setup() {
  Serial.begin(115200);
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN, 400000U);

  // Inicializar los 4 expansores PCF8574 en HIGH (desactivados)
  writePCF8574(ADDR_PCF_DI_LOW,  0xFF);
  writePCF8574(ADDR_PCF_DI_HIGH, 0xFF);
  writePCF8574(ADDR_PCF_DO_LOW,  0xFF);
  writePCF8574(ADDR_PCF_DO_HIGH, 0xFF);

  analogReadResolution(12);

  // Iniciar Ethernet LAN8720 si está habilitado
  ${hwConfig.useEthernet ? 'ETH.begin(ETH_PHY_ADDR, ETH_PHY_POWER, ETH_PHY_MDC, ETH_PHY_MDIO, ETH_PHY_TYPE, ETH_CLK_MODE);' : '// Ethernet deshabilitado por configuración'}
  modbusServer.begin();
}

void loop() {
  unsigned long nowMs = millis();

  handleStudioSerialBridge();
  handleModbusTCP();

  // Ciclo de Scan Determinista cada 20 ms (50 Hz)
  if (nowMs - lastScanMs >= 20) {
    lastScanMs = nowMs;
    scanPhysicalInputs();
    executePlcProgram(nowMs);
    flushPhysicalOutputs();
  }

  // Telemetría en tiempo real cada 100 ms
  if (nowMs - lastTelemetryMs >= 100) {
    lastTelemetryMs = nowMs;
    emitTelemetryJSON();
  }
}
`;
}
