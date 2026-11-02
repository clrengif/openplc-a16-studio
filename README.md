# OpenPLC A16 Studio — IDE IEC 61131-3 & Adaptación Hardware KinCony KC868-A16 (ESP32)

**OpenPLC A16 Studio** es un entorno web interactivo de programación y simulación industrial **IEC 61131-3** (**Ladder Diagram `LD`** + **Structured Text `ST`**) diseñado específicamente para la placa controladora **KinCony KC868-A16 (ESP32-WROOM-32E)** y su integración con **OpenPLC Runtime / OpenPLC Editor**.

---

## Características Principales

1. **Editor Gráfico Ladder (LD) en Tiempo Real:**
   - Contactos normalmente abiertos (`NO`), normalmente cerrados (`NC`), bobinas estándar (`COIL`), enclavamientos (`SET`/`RESET`), ramas paralelas `OR` y bloques funcionales (`TON`, `TOF`, `CTU`).
   - Visualización de flujo de energía en vivo durante el ciclo de scan (`RUN`).
2. **Editor Structured Text (ST) con Monaco Editor:**
   - Soporte para bloques `IF / ELSIF / ELSE / END_IF`, expresiones booleanas/relacionales, temporizadores `TON`/`TOF`, contadores `CTU` y transpilación directa `Ladder → ST`.
3. **Simulador Hardware de la Placa KinCony KC868-A16:**
   - **16 Entradas Digitales Optoacopladas (`DI1`–`DI16` / `%IX0.0`–`%IX1.7`)** con modo pulsador momentáneo o interruptor mantenido.
   - **16 Salidas Digitales Relé/MOSFET (`DO1`–`DO16` / `%QX0.0`–`%QX1.7`)** con indicadores LED.
   - **Monitor en vivo del Bus I2C `PCF8574`** (`0x22`, `0x21`, `0x24`, `0x25` en `SDA=GPIO4, SCL=GPIO5`) mostrando los bytes en hexadecimal con lógica activa-baja.
   - **4 Entradas Analógicas (`A1`–`A4` / `%IW0`–`%IW3`)** en `GPIO 36, 39, 34, 35` (ADC 12 bits).
4. **Firmware y Adaptación HAL para OpenPLC (`firmware/kincony_a16_openplc/`):**
   - [`openplc_custom_layer.cpp`](./firmware/kincony_a16_openplc/openplc_custom_layer.cpp): Driver C++ para la pestaña **Custom Hardware Layer** de OpenPLC Editor.
   - [`src/main.cpp`](./firmware/kincony_a16_openplc/src/main.cpp) y [`platformio.ini`](./firmware/kincony_a16_openplc/platformio.ini): Firmware completo para ESP32 con Ethernet `LAN8720`, servidor **Modbus TCP (puerto 502)** y telemetría Serial JSON.
   - Exportador integrado en la interfaz web para descargar `.cpp` (HAL OpenPLC), `.ino` (Firmware ESP32), `.st` (Structured Text) y `.xml` (PLCopen TC6 XML v2.01).

---

## Desarrollo Local

```bash
npm install
npm run dev
```

## Compilación de Producción

```bash
npm run build
```
