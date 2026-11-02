// ============================================================================
// CAPA DE ADAPTACIÓN HARDWARE (CUSTOM LAYER) DE KINCONY KC868-A16 PARA OPENPLC
// ============================================================================
// Cómo usar en OpenPLC Editor:
// 1. Abre tu proyecto en OpenPLC Editor y haz clic en el icono "Upload to Arduino/ESP32".
// 2. Elige la placa: "ESP32 Dev Module" (o NodeMCU-32S).
// 3. Habilita "WiFi / Ethernet Modbus TCP" según tu red.
// 4. Haz clic en la pestaña "Custom Hardware Layer" y pega íntegramente este archivo.
// ============================================================================

#include <Arduino.h>
#include <Wire.h>

#define KC868_I2C_SDA           4
#define KC868_I2C_SCL           5
#define PCF8574_ADDR_DI_1_8     0x22  // %IX0.0 .. %IX0.7
#define PCF8574_ADDR_DI_9_16    0x21  // %IX1.0 .. %IX1.7
#define PCF8574_ADDR_DO_1_8     0x24  // %QX0.0 .. %QX0.7
#define PCF8574_ADDR_DO_9_16    0x25  // %QX1.0 .. %QX1.7

static const uint8_t KC868_ADC_PINS[4] = { 36, 39, 34, 35 };

// Buffers globales del runtime OpenPLC en ESP32
extern uint8_t *bool_input[2][8];
extern uint8_t *bool_output[2][8];
extern uint16_t *int_input[4];

static uint8_t pcfRead(uint8_t addr) {
  Wire.requestFrom(addr, (uint8_t)1);
  if (Wire.available()) {
    return Wire.read();
  }
  return 0xFF;
}

static void pcfWrite(uint8_t addr, uint8_t val) {
  Wire.beginTransmission(addr);
  Wire.write(val);
  Wire.endTransmission();
}

void hardwareInit() {
  Wire.begin(KC868_I2C_SDA, KC868_I2C_SCL, 400000U);

  // Configurar los PCF8574 de entradas con pull-up alto (0xFF)
  pcfWrite(PCF8574_ADDR_DI_1_8,  0xFF);
  pcfWrite(PCF8574_ADDR_DI_9_16, 0xFF);

  // Asegurar que las 16 salidas inicien apagadas (0xFF = OFF por lógica activa-baja)
  pcfWrite(PCF8574_ADDR_DO_1_8,  0xFF);
  pcfWrite(PCF8574_ADDR_DO_9_16, 0xFF);

  analogReadResolution(12);
}

void updateInputBuffers() {
  // Los optoacopladores de la KC868-A16 entregan 0 cuando hay +12V/+24V en la entrada
  uint8_t diLow  = ~pcfRead(PCF8574_ADDR_DI_1_8);
  uint8_t diHigh = ~pcfRead(PCF8574_ADDR_DI_9_16);

  for (int bit = 0; bit < 8; bit++) {
    if (bool_input[0][bit] != NULL) {
      *bool_input[0][bit] = (diLow >> bit) & 0x01;
    }
    if (bool_input[1][bit] != NULL) {
      *bool_input[1][bit] = (diHigh >> bit) & 0x01;
    }
  }

  // Entradas analógicas A1..A4 -> %IW0..%IW3 (escaladas de 12-bit a 16-bit IEC)
  for (int ch = 0; ch < 4; ch++) {
    if (int_input[ch] != NULL) {
      uint16_t raw12 = analogRead(KC868_ADC_PINS[ch]);
      *int_input[ch] = (uint16_t)(raw12 << 4);
    }
  }
}

void updateOutputBuffers() {
  uint8_t doLow  = 0xFF;
  uint8_t doHigh = 0xFF;

  for (int bit = 0; bit < 8; bit++) {
    if (bool_output[0][bit] != NULL && *bool_output[0][bit]) {
      doLow &= ~(1 << bit); // Poner bit en 0 activa la salida en el PCF8574
    }
    if (bool_output[1][bit] != NULL && *bool_output[1][bit]) {
      doHigh &= ~(1 << bit);
    }
  }

  pcfWrite(PCF8574_ADDR_DO_1_8,  doLow);
  pcfWrite(PCF8574_ADDR_DO_9_16, doHigh);
}
