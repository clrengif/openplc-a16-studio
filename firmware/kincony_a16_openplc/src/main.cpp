#include <Arduino.h>
#include <Wire.h>
#include <ETH.h>
#include <WiFi.h>
#include "hal_kc868_a16.h"

// ============================================================================
// FIRMWARE KINCONY KC868-A16 — OPENPLC RUNTIME + MODBUS TCP + STUDIO BRIDGE
// ============================================================================

static const uint8_t ADC_PINS[4] = {
  KC868_ADC_CH1_PIN,
  KC868_ADC_CH2_PIN,
  KC868_ADC_CH3_PIN,
  KC868_ADC_CH4_PIN
};

bool IX[16] = { false };
bool QX[16] = { false };
bool MX[16] = { false };
uint16_t IW[4] = { 0 };

bool forceIXMask[16] = { false };
bool forceIXVal[16]  = { false };

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

void scanHardwareInputs() {
  uint8_t rawLow  = ~kc868ReadPcfByte(PCF8574_ADDR_DI_1_8);
  uint8_t rawHigh = ~kc868ReadPcfByte(PCF8574_ADDR_DI_9_16);

  for (int i = 0; i < 8; i++) {
    IX[i]     = forceIXMask[i]     ? forceIXVal[i]     : ((rawLow  >> i) & 0x01);
    IX[i + 8] = forceIXMask[i + 8] ? forceIXVal[i + 8] : ((rawHigh >> i) & 0x01);
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

void executeDefaultIecCycle(unsigned long nowMs) {
  // 1. Enclavamiento de Marcha (%IX0.0) / Paro (%IX0.1) -> %QX0.0
  QX[0] = (IX[0] || QX[0]) && !IX[1];

  // 2. Temporizador TON T0 (2500 ms) para Estrella-Triángulo -> %QX0.1
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

  // 3. Contador CTU C0 (5 pulsos en %IX0.2, Reset en %IX0.3) -> %QX0.2
  if (IX[3]) {
    C0.CV = 0;
  } else if (IX[2] && !C0.prevCU) {
    C0.CV++;
  }
  C0.prevCU = IX[2];
  C0.Q = (C0.CV >= C0.PV);
  QX[2] = C0.Q;

  // 4. Control de Válvula de Drenaje Set (%IX0.4) / Reset (%IX0.5) -> %QX0.3
  if (IX[4]) QX[3] = true;
  if (IX[5]) QX[3] = false;
}

void handleModbusTCP() {
  WiFiClient client = modbusServer.available();
  if (!client || client.available() < 12) return;

  uint8_t req[64];
  int len = client.read(req, sizeof(req));
  if (len < 12) return;

  uint8_t fc = req[7];
  uint16_t startAddr = (req[8] << 8) | req[9];
  uint16_t count     = (req[10] << 8) | req[11];

  uint8_t resp[64];
  memcpy(resp, req, 8);

  if (fc == 0x01 || fc == 0x02) {
    uint8_t byteCount = (count + 7) / 8;
    resp[4] = 0;
    resp[5] = 3 + byteCount;
    resp[8] = byteCount;
    memset(&resp[9], 0, byteCount);
    for (uint16_t i = 0; i < count; i++) {
      uint16_t idx = startAddr + i;
      bool v = (fc == 0x01)
        ? ((idx < 16) ? QX[idx] : false)
        : ((idx < 16) ? IX[idx] : false);
      if (v) resp[9 + (i / 8)] |= (1 << (i % 8));
    }
    client.write(resp, 9 + byteCount);
  } else if (fc == 0x05) {
    if (startAddr < 16) {
      QX[startAddr] = (req[10] == 0xFF);
      updateHardwareOutputs();
    }
    client.write(req, 12);
  }
}

void setup() {
  Serial.begin(115200);
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

  if (nowMs - lastScanMs >= 20) {
    lastScanMs = nowMs;
    scanHardwareInputs();
    executeDefaultIecCycle(nowMs);
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
