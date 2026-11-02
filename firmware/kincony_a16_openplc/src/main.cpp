#include <Arduino.h>
#include <Wire.h>
#include <ETH.h>
#include <WiFi.h>
#include "hal_kc868_a16.h"

// ============================================================================
// FIRMWARE INDUSTRIAL KINCONY KC868-A16 — OPENPLC + MODBUS TCP + RS485 RTU
// ============================================================================
// - Bus I2C 4×PCF8574 (0x22, 0x21, 0x24, 0x25) en SDA=GPIO4, SCL=GPIO5
// - Ethernet RMII LAN8720 (Puerto 502: FC01, FC02, FC03, FC04, FC05, FC06)
// - RS485 Modbus RTU Slave en UART2 (RX=GPIO16, TX=GPIO13, 9600 8N1, CRC-16)
// - 4 Entradas Analógicas A1..A4 (GPIO 36, 39, 34, 35) -> %IW0..%IW3
// - 3 Puertos Sensores HT1..HT3 (GPIO 32, 33, 14) -> %IW4..%IW6
// ============================================================================

static const uint8_t ADC_PINS[4] = {
  KC868_ADC_CH1_PIN,
  KC868_ADC_CH2_PIN,
  KC868_ADC_CH3_PIN,
  KC868_ADC_CH4_PIN
};

bool IX[16] = { false };     // %IX0.0 .. %IX1.7 (Modbus 10001..10016)
bool QX[16] = { false };     // %QX0.0 .. %QX1.7 (Modbus 00001..00016)
bool MX[16] = { false };     // %MX0.0 .. %MX1.7
uint16_t IW[8] = { 0 };      // %IW0 .. %IW7     (Modbus 30001..30008)
int16_t MW[16] = { 0 };      // %MW0 .. %MW15    (Modbus 40001..40016)

struct TimerTON {
  bool IN;
  bool Q;
  unsigned long PT;
  unsigned long ET;
  unsigned long startMs;
  bool active;
} T0 = { false, false, 2500, 0, 0, false };

struct CounterCTU {
  bool CU;
  bool R;
  bool Q;
  int16_t PV;
  int16_t CV;
  bool prevCU;
} C0 = { false, false, false, 5, 0, false };

WiFiServer modbusServer(502);
unsigned long lastScanMs = 0;
unsigned long lastTelemetryMs = 0;

// --- Cálculo CRC-16/MODBUS (Polinomio 0xA001) para RS485 RTU ---
uint16_t modbusCRC16(const uint8_t *buf, uint16_t len) {
  uint16_t crc = 0xFFFF;
  for (uint16_t pos = 0; pos < len; pos++) {
    crc ^= (uint16_t)buf[pos];
    for (int i = 8; i != 0; i--) {
      if ((crc & 0x0001) != 0) {
        crc >>= 1;
        crc ^= 0xA001;
      } else {
        crc >>= 1;
      }
    }
  }
  return crc;
}

void scanHardwareInputs() {
  uint8_t rawLow  = ~kc868ReadPcfByte(PCF8574_ADDR_DI_1_8);
  uint8_t rawHigh = ~kc868ReadPcfByte(PCF8574_ADDR_DI_9_16);

  for (int i = 0; i < 8; i++) {
    IX[i]     = (rawLow  >> i) & 0x01;
    IX[i + 8] = (rawHigh >> i) & 0x01;
  }

  for (int ch = 0; ch < 4; ch++) {
    IW[ch] = analogRead(ADC_PINS[ch]);
  }
}

void updateHardwareOutputs() {
  uint8_t outLow  = 0xFF;
  uint8_t outHigh = 0xFF;

  for (int i = 0; i < 8; i++) {
    if (QX[i])     outLow  &= ~(1 << i);
    if (QX[i + 8]) outHigh &= ~(1 << i);
  }

  kc868WritePcfByte(PCF8574_ADDR_DO_1_8,  outLow);
  kc868WritePcfByte(PCF8574_ADDR_DO_9_16, outHigh);
}

void executeIecCycle(unsigned long nowMs) {
  // 1. Enclavamiento de Marcha (%IX0.0) / Paro (%IX0.1) -> %QX0.0
  QX[0] = (IX[0] || QX[0]) && !IX[1];

  // 2. Temporizador TON T0 (2500 ms) Estrella-Triángulo -> %QX0.1
  T0.IN = QX[0];
  if (!T0.IN) {
    T0.Q = false;
    T0.ET = 0;
    T0.active = false;
  } else {
    if (!T0.active) {
      T0.active = true;
      T0.startMs = nowMs;
      T0.ET = 0;
    } else {
      T0.ET = nowMs - T0.startMs;
      if (T0.ET >= T0.PT) {
        T0.ET = T0.PT;
        T0.Q = true;
      }
    }
  }
  QX[1] = T0.Q;

  // 3. Contador CTU C0 -> %QX0.2 y publicación en %MW0 (Modbus 40001)
  if (IX[3]) {
    C0.CV = 0;
  } else if (IX[2] && !C0.prevCU) {
    C0.CV++;
  }
  C0.prevCU = IX[2];
  C0.Q = (C0.CV >= C0.PV);
  QX[2] = C0.Q;
  MW[0] = C0.CV;

  // 4. Control de Nivel Set/Reset (%IX0.4 / %IX0.5) -> %QX0.3
  if (IX[4]) QX[3] = true;
  if (IX[5]) QX[3] = false;

  // 5. Comparador Analógico Presión A1 (%IW0 > 2800) -> %QX0.4
  QX[4] = (IW[0] > 2800);
}

// --- Procesador Común de PDU Modbus (Usado tanto por TCP como por RS485 RTU) ---
uint16_t processModbusPDU(const uint8_t *pdu, uint8_t *respPdu) {
  uint8_t fc = pdu[0];
  uint16_t startAddr = (pdu[1] << 8) | pdu[2];
  uint16_t param     = (pdu[3] << 8) | pdu[4];

  respPdu[0] = fc;

  if (fc == 0x01 || fc == 0x02) {
    // FC01 Read Coils (%QX) | FC02 Read Discrete Inputs (%IX)
    uint8_t byteCount = (param + 7) / 8;
    respPdu[1] = byteCount;
    memset(&respPdu[2], 0, byteCount);
    for (uint16_t i = 0; i < param; i++) {
      uint16_t idx = startAddr + i;
      bool bitVal = (fc == 0x01)
        ? ((idx < 16) ? QX[idx] : false)
        : ((idx < 16) ? IX[idx] : false);
      if (bitVal) respPdu[2 + (i / 8)] |= (1 << (i % 8));
    }
    return 2 + byteCount;
  } else if (fc == 0x03 || fc == 0x04) {
    // FC03 Read Holding Registers (%MW) | FC04 Read Input Registers (%IW)
    uint8_t count = (param > 16) ? 16 : param;
    respPdu[1] = count * 2;
    for (uint8_t i = 0; i < count; i++) {
      uint16_t idx = startAddr + i;
      uint16_t wordVal = (fc == 0x03)
        ? ((idx < 16) ? (uint16_t)MW[idx] : 0)
        : ((idx < 8)  ? IW[idx] : 0);
      respPdu[2 + i * 2]     = (wordVal >> 8) & 0xFF;
      respPdu[2 + i * 2 + 1] = wordVal & 0xFF;
    }
    return 2 + count * 2;
  } else if (fc == 0x05) {
    // FC05 Write Single Coil (%QX)
    if (startAddr < 16) {
      QX[startAddr] = (pdu[3] == 0xFF);
      updateHardwareOutputs();
    }
    memcpy(&respPdu[1], &pdu[1], 4);
    return 5;
  } else if (fc == 0x06) {
    // FC06 Write Single Holding Register (%MW)
    if (startAddr < 16) {
      MW[startAddr] = (int16_t)param;
    }
    memcpy(&respPdu[1], &pdu[1], 4);
    return 5;
  }

  // Excepción Illegal Function
  respPdu[0] = fc | 0x80;
  respPdu[1] = 0x01;
  return 2;
}

void handleModbusTCP() {
  WiFiClient client = modbusServer.available();
  if (!client || client.available() < 12) return;

  uint8_t req[64];
  int len = client.read(req, sizeof(req));
  if (len < 12) return;

  uint8_t resp[64];
  memcpy(resp, req, 7); // Copiar cabecera MBAP (TxID, ProtoID, UnitID)

  uint16_t pduLen = processModbusPDU(&req[7], &resp[7]);
  uint16_t mbapLen = 1 + pduLen;
  resp[4] = (mbapLen >> 8) & 0xFF;
  resp[5] = mbapLen & 0xFF;

  client.write(resp, 7 + pduLen);
}

void handleModbusRTU_RS485() {
  if (Serial2.available() < 8) return;

  uint8_t req[64];
  int len = Serial2.readBytes(req, 8);
  if (len < 8) return;

  uint8_t slaveId = req[0];
  if (slaveId != 1) return; // Slave ID por defecto = 1

  uint16_t rxCrc = req[len - 2] | (req[len - 1] << 8);
  uint16_t calcCrc = modbusCRC16(req, len - 2);
  if (rxCrc != calcCrc) return; // Trama descartada por error CRC-16

  uint8_t resp[64];
  resp[0] = slaveId;
  uint16_t pduLen = processModbusPDU(&req[1], &resp[1]);
  uint16_t respCrc = modbusCRC16(resp, 1 + pduLen);
  resp[1 + pduLen]     = respCrc & 0xFF;
  resp[1 + pduLen + 1] = (respCrc >> 8) & 0xFF;

  Serial2.write(resp, 1 + pduLen + 2);
}

void setup() {
  Serial.begin(115200);
  // Iniciar transceptor RS485 en UART2 (RX=GPIO16, TX=GPIO13, 9600 8N1)
  Serial2.begin(9600, SERIAL_8N1, KC868_RS485_RX_PIN, KC868_RS485_TX_PIN);

  Wire.begin(KC868_I2C_SDA, KC868_I2C_SCL, KC868_I2C_FREQ);

  kc868WritePcfByte(PCF8574_ADDR_DI_1_8,  0xFF);
  kc868WritePcfByte(PCF8574_ADDR_DI_9_16, 0xFF);
  kc868WritePcfByte(PCF8574_ADDR_DO_1_8,  0xFF);
  kc868WritePcfByte(PCF8574_ADDR_DO_9_16, 0xFF);

  analogReadResolution(12);

  ETH.begin(
    KC868_ETH_PHY_ADDR,
    KC868_ETH_PHY_POWER,
    KC868_ETH_PHY_MDC,
    KC868_ETH_PHY_MDIO,
    ETH_PHY_LAN8720,
    ETH_CLOCK_GPIO17_OUT
  );
  modbusServer.begin();
}

void loop() {
  unsigned long nowMs = millis();

  handleModbusTCP();
  handleModbusRTU_RS485();

  if (nowMs - lastScanMs >= 20) {
    lastScanMs = nowMs;
    scanHardwareInputs();
    executeIecCycle(nowMs);
    updateHardwareOutputs();
  }

  if (nowMs - lastTelemetryMs >= 100) {
    lastTelemetryMs = nowMs;
    Serial.print("{\"board\":\"KC868-A16\",\"ix\":[");
    for (int i = 0; i < 16; i++) {
      Serial.print(IX[i] ? 1 : 0);
      if (i < 15) Serial.print(",");
    }
    Serial.print("],\"qx\":[");
    for (int i = 0; i < 16; i++) {
      Serial.print(QX[i] ? 1 : 0);
      if (i < 15) Serial.print(",");
    }
    Serial.println("]}");
  }
}
