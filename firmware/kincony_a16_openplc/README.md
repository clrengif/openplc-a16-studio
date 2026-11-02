# Firmware y Adaptación Hardware (HAL) de KinCony KC868-A16 para OpenPLC

La tarjeta industrial **KinCony KC868-A16 (ESP32-WROOM-32E)** utiliza **4 circuitos expansores I2C `PCF8574`** en lugar de pines GPIO directos para sus 16 entradas optoacopladas y sus 16 salidas a MOSFET/Relé. Por ello, esta carpeta incluye tanto la **Capa de Adaptación Hardware (Custom Layer) para OpenPLC Editor** como el **Firmware autónomo PlatformIO/Arduino**.

---

## 1. Mapa de Hardware y Direcciones IEC 61131-3

| Bloque en KC868-A16 | Chip / Interfaz | Dirección I2C / GPIO | Dirección OpenPLC | Lógica Eléctrica |
| :--- | :--- | :--- | :--- | :--- |
| **Bus I2C** | `ESP32` | `SDA = GPIO 4`, `SCL = GPIO 5` | — | 400 kHz |
| **Entradas `DI1` – `DI8`** | `PCF8574` #1 | `0x22` | `%IX0.0` – `%IX0.7` | Activa en Bajo (`0` = ON) |
| **Entradas `DI9` – `DI16`** | `PCF8574` #2 | `0x21` | `%IX1.0` – `%IX1.7` | Activa en Bajo (`0` = ON) |
| **Salidas `DO1` – `DO8`** | `PCF8574` #3 | `0x24` | `%QX0.0` – `%QX0.7` | Activa en Bajo (`0` = ON) |
| **Salidas `DO9` – `DO16`** | `PCF8574` #4 | `0x25` | `%QX1.0` – `%QX1.7` | Activa en Bajo (`0` = ON) |
| **Analógicas `A1` – `A4`** | `ADC1` 12 bits | `GPIO 36, 39, 34, 35` | `%IW0` – `%IW3` | 0–5 V / 4–20 mA |
| **Ethernet RMII** | `LAN8720A` | `MDC=23, MDIO=18, CLK=17` | Modbus TCP (`502`) | 10/100 Mbps |
| **RS485 Modbus RTU** | `UART2` | `RX = GPIO 16`, `TX = GPIO 13` | Serial2 | Half-Duplex |

---

## 2. Opción A: Usar con OpenPLC Editor Oficial

1. En **OpenPLC A16 Studio**, exporta tu proyecto como **PLCopen XML (`.xml`)** o ábrelo en **OpenPLC Editor**.
2. Haz clic en el botón **Transfer Program to PLC** (icono de chip Arduino).
3. Selecciona **Board Type**: `ESP32 Dev Module` (o `NodeMCU-32S`).
4. Activa la casilla **Use Custom Hardware Layer** y pega el contenido íntegro de [`openplc_custom_layer.cpp`](./openplc_custom_layer.cpp).
5. Conecta la placa KinCony KC868-A16 por USB-C (driver `CH340`) y presiona **Transfer to PLC**.

---

## 3. Opción B: Compilar y Flashear directamente con PlatformIO

```bash
cd firmware/kincony_a16_openplc
pio run --target upload
pio device monitor
```
