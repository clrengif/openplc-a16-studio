#ifndef HAL_KC868_A16_H
#define HAL_KC868_A16_H

#include <Arduino.h>
#include <Wire.h>

// ============================================================================
// MAPA DE PINES Y EXPANSORES I2C — KINCONY KC868-A16 (ESP32-WROOM-32E)
// ============================================================================

// Bus I2C Principal
#define KC868_I2C_SDA           4
#define KC868_I2C_SCL           5
#define KC868_I2C_FREQ          400000U

// Expansores I2C PCF8574 (Lógica Activa-Baja: 0 = Activado, 1 = Desactivado)
#define PCF8574_ADDR_DI_1_8     0x22  // Entradas Optoacopladas DI1..DI8   -> %IX0.0 .. %IX0.7
#define PCF8574_ADDR_DI_9_16    0x21  // Entradas Optoacopladas DI9..DI16  -> %IX1.0 .. %IX1.7
#define PCF8574_ADDR_DO_1_8     0x24  // Salidas MOSFET/Relé   DO1..DO8   -> %QX0.0 .. %QX0.7
#define PCF8574_ADDR_DO_9_16    0x25  // Salidas MOSFET/Relé   DO9..DO16  -> %QX1.0 .. %QX1.7

// Entradas Analógicas ADC1 (0-5V / 4-20mA) -> %IW0 .. %IW3
#define KC868_ADC_CH1_PIN       36
#define KC868_ADC_CH2_PIN       39
#define KC868_ADC_CH3_PIN       34
#define KC868_ADC_CH4_PIN       35

// Puerto RS485 Modbus RTU
#define KC868_RS485_RX_PIN      16
#define KC868_RS485_TX_PIN      13

// Ethernet RMII LAN8720A
#define KC868_ETH_PHY_ADDR      0
#define KC868_ETH_PHY_POWER    -1
#define KC868_ETH_PHY_MDC       23
#define KC868_ETH_PHY_MDIO      18

// Sensores 1-Wire / GPIOs Libres (HT1..HT3)
#define KC868_HT1_PIN           32
#define KC868_HT2_PIN           33
#define KC868_HT3_PIN           14

inline uint8_t kc868ReadPcfByte(uint8_t i2cAddr) {
  Wire.requestFrom(i2cAddr, (uint8_t)1);
  if (Wire.available()) {
    return Wire.read();
  }
  return 0xFF;
}

inline void kc868WritePcfByte(uint8_t i2cAddr, uint8_t data) {
  Wire.beginTransmission(i2cAddr);
  Wire.write(data);
  Wire.endTransmission();
}

#endif // HAL_KC868_A16_H
