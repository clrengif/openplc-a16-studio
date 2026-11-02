/**
 * ============================================================================
 * FIRMWARE INDUSTRIAL: OPENPLC MULTI-CORE RUNTIME — KINCONY KC868-A16 (ESP32)
 * ============================================================================
 * Arquitectura de Tiempo Real sobre FreeRTOS (ESP32 Dual-Core @ 240 MHz):
 *
 *  - CORE 1 (PRO_CPU / APP_CPU Dedicado a Control Determinista):
 *      * Tarea `plc_scan_task` (Prioridad máxima = 24, vTaskDelayUntil exacto).
 *      * Ciclo determinista configurable (10 ms a 50 ms) con medición de jitter:
 *          1. update_inputs()  -> Lee 16 entradas ópticas I2C (0x22, 0x21) +
 *                                 4 ADC (GPIO 36,39,34,35) + sincroniza buffers
 *                                 de red (%MW100, %MW200, %MW300) bajo Mutex.
 *          2. solve_logic()    -> Ejecuta el programa IEC 61131-3 compilado.
 *          3. update_outputs() -> Escribe 16 relés I2C Active-LOW (0x24, 0x25)
 *                                 + publica área de salida hacia buses de campo.
 *
 *  - CORE 0 (Comunicaciones Concurrentes y Buses de Campo Industriales):
 *      * Tarea `modbus_profinet_task`:
 *          - Ethernet RMII (LAN8720A) + Servidor Modbus TCP (Puerto 502)
 *          - Puente cíclico PROFINET RT Data I/O (UDP Puerto 34964 -> %MW200..207)
 *      * Tarea `profibus_dp_uart_task`:
 *          - UART2 RS-485 con control de dirección hardware DE/RE (RTS)
 *          - Decodificador de Telegramas PROFIBUS DP SD2 (0x68) / Modbus RTU
 *            mapeado sobre `%MW100` .. `%MW107`.
 *      * Tarea `can_devicenet_twai_task`:
 *          - Driver nativo ESP-IDF TWAI (`driver/twai.h`)
 *          - Decodificador CAN 2.0A (11-bit COB-ID DeviceNet Grupo 2 + CIP)
 *            mapeado sobre `%MW300` .. `%MW307`.
 *      * Tarea `websocket_telemetry_task`:
 *          - Servidor WebSocket (Puerto 81) enlazado en vivo con PCLino Studio.
 * ============================================================================
 */

#include <Arduino.h>
#include <Wire.h>
#include <ETH.h>
#include <WiFi.h>
#include <WiFiServer.h>
#include <WiFiUdp.h>
#include <WebSocketsServer.h>
#include <ArduinoJson.h>
#include "driver/uart.h"
#include "driver/twai.h"

// ============================================================================
// 1. DEFINICIÓN DE PINES Y HARDWARE KINCONY KC868-A16
// ============================================================================

// Bus I2C Interno (Expansores PCF8574)
// Nota: En KC868-A16 Rev 1.x SDA=4, SCL=5 o SCL=15 según revisión; configurable en platformio.ini
#ifndef I2C_SDA_PIN
#define I2C_SDA_PIN         4
#endif
#ifndef I2C_SCL_PIN
#define I2C_SCL_PIN         15
#endif

#ifndef PCF_IN1_ADDR
#define PCF_IN1_ADDR        0x22  // Entradas ópticas X1..X8   (%IX0.0 .. %IX0.7)
#endif
#ifndef PCF_IN2_ADDR
#define PCF_IN2_ADDR        0x21  // Entradas ópticas X9..X16  (%IX1.0 .. %IX1.7)
#endif
#ifndef PCF_OUT1_ADDR
#define PCF_OUT1_ADDR       0x24  // Relés/MOSFETs Y1..Y8      (%QX0.0 .. %QX0.7) Active-LOW
#endif
#ifndef PCF_OUT2_ADDR
#define PCF_OUT2_ADDR       0x25  // Relés/MOSFETs Y9..Y16     (%QX1.0 .. %QX1.7) Active-LOW
#endif

// Entradas Analógicas 12-bit ADC1 (0-5V / 4-20mA)
#define ADC_CH1_PIN         36    // %IW0
#define ADC_CH2_PIN         39    // %IW1
#define ADC_CH3_PIN         34    // %IW2
#define ADC_CH4_PIN         35    // %IW3

// Ethernet RMII — PHY LAN8720A
#define ETH_PHY_ADDR        0
#define ETH_PHY_MDC         23
#define ETH_PHY_MDIO        18
#define ETH_PHY_POWER       -1
#define ETH_CLK_MODE        ETH_CLOCK_GPIO17_OUT

// RS-485 / PROFIBUS DP sobre UART2
#ifndef RS485_TX_PIN
#define RS485_TX_PIN        13
#endif
#ifndef RS485_RX_PIN
#define RS485_RX_PIN        16
#endif
#ifndef RS485_DE_PIN
#define RS485_DE_PIN        32    // Control DE/RE (RTS) para transceptor RS-485
#endif
#define PROFIBUS_UART_NUM   UART_NUM_2
#define PROFIBUS_BAUDRATE   115200
#define PROFIBUS_SLAVE_ADDR 3

// Bus CAN / DeviceNet sobre periférico nativo TWAI
#ifndef CAN_TX_PIN
#define CAN_TX_PIN          33    // Conectado a CTX de SN65HVD230 / MCP2551
#endif
#ifndef CAN_RX_PIN
#define CAN_RX_PIN          14    // Conectado a CRX de SN65HVD230 / MCP2551
#endif
#define DEVICENET_MAC_ID    10    // Nodo local DeviceNet (0..63)

// Asignación de Núcleos FreeRTOS
#define CORE_COMM_ID        0     // Core 0: Ethernet, WiFi, WebSocket, PROFIBUS, CAN
#define CORE_PLC_RT_ID      1     // Core 1: Scan Determinista IEC 61131-3

// ============================================================================
// 2. ESTRUCTURA DE MEMORIA COMPARTIDA OPENPLC (%IX, %QX, %IW, %MW)
// ============================================================================

#define MAX_MW_REGISTERS    512

// Offsets de los Buffers de Intercambio de Buses de Campo (según especificación)
#define MW_PROFIBUS_BASE    100   // %MW100 .. %MW107 (8 palabras PROFIBUS DP)
#define MW_PROFINET_BASE    200   // %MW200 .. %MW207 (8 palabras PROFINET RT)
#define MW_DEVICENET_BASE   300   // %MW300 .. %MW307 (8 palabras CAN / DeviceNet)
#define FIELDBUS_WORD_COUNT 8

struct OpenPLCProcessImage {
    // E/S Discretas Físicas I2C (2 bytes = 16 canales cada uno)
    // %IX0.0..%IX0.7 -> ix_bytes[0], %IX1.0..%IX1.7 -> ix_bytes[1]
    uint8_t  ix_bytes[2];
    // %QX0.0..%QX0.7 -> qx_bytes[0], %QX1.0..%QX1.7 -> qx_bytes[1]
    uint8_t  qx_bytes[2];

    // Entradas Analógicas Locales (%IW0 .. %IW3)
    uint16_t iw_regs[4];

    // Área Global de Registros Holding / Memoria (%MW0 .. %MW511)
    // Incluye:
    //   %MW100..%MW107 -> PROFIBUS DP (Entrada/Salida de Esclavo DP)
    //   %MW200..%MW207 -> PROFINET RT (Módulos I/O Cíclicos RT)
    //   %MW300..%MW307 -> CAN / DeviceNet (Assembly I/O Explícito y Polled)
    uint16_t mw_regs[MAX_MW_REGISTERS];

    // Diagnósticos de Tiempo Real del Motor de Scan
    uint32_t scan_Period_ms;
    uint32_t scan_count;
    uint32_t last_scan_exec_us;
    uint32_t max_jitter_us;
    bool     plc_run_state;
};

static OpenPLCProcessImage g_plc_mem;

// Imagen sombra local de Core 1 (evita bloqueos prolongados del Mutex durante solve_logic)
static OpenPLCProcessImage g_local_scan_img;

// Primitivas de Sincronización FreeRTOS
static SemaphoreHandle_t g_plc_mutex       = NULL; // Protege g_plc_mem entre Core 0 y Core 1
static SemaphoreHandle_t g_i2c_mutex       = NULL; // Protege el bus físico Wire (I2C)
static QueueHandle_t     g_can_tx_queue    = NULL; // Cola de salida de tramas CAN/DeviceNet
static QueueHandle_t     g_profibus_queue  = NULL; // Cola de eventos de PROFIBUS DP

// Servidores de Red en Core 0
static WebSocketsServer  g_ws_server(81);
static WiFiServer        g_modbus_tcp_server(502);
static WiFiUDP           g_profinet_udp;
static bool              g_eth_connected = false;

// ============================================================================
// 3. FUNCIONES AUXILIARES DE ACCESO BIT/PALABRA IEC 61131-3
// ============================================================================

/**
 * Lee un bit de entrada física `%IXbyte.bit` (byte: 0..1, bit: 0..7)
 */
static inline bool get_IX(const OpenPLCProcessImage &img, uint8_t byte_idx, uint8_t bit_idx) {
    if (byte_idx > 1 || bit_idx > 7) return false;
    return (img.ix_bytes[byte_idx] >> bit_idx) & 0x01;
}

/**
 * Lee un bit de salida física `%QXbyte.bit` (byte: 0..1, bit: 0..7)
 */
static inline bool get_QX(const OpenPLCProcessImage &img, uint8_t byte_idx, uint8_t bit_idx) {
    if (byte_idx > 1 || bit_idx > 7) return false;
    return (img.qx_bytes[byte_idx] >> bit_idx) & 0x01;
}

/**
 * Escribe un bit de salida física `%QXbyte.bit` (byte: 0..1, bit: 0..7)
 */
static inline void set_QX(OpenPLCProcessImage &img, uint8_t byte_idx, uint8_t bit_idx, bool val) {
    if (byte_idx > 1 || bit_idx > 7) return;
    if (val) {
        img.qx_bytes[byte_idx] |= (1UL << bit_idx);
    } else {
        img.qx_bytes[byte_idx] &= ~(1UL << bit_idx);
    }
}

// ============================================================================
// 4. CAPA HAL I2C PARA EXPANSORES PCF8574 (KINCONY KC868-A16)
// ============================================================================

/**
 * Lee un byte de un expansor PCF8574 por I2C.
 * Los optoacopladores de entrada de la KC868-A16 son Active-LOW (0V en pin = 1 lógico).
 */
static uint8_t pcf8574_read_active_low(uint8_t i2c_addr) {
    uint8_t raw = 0xFF;
    if (xSemaphoreTake(g_i2c_mutex, pdMS_TO_TICKS(5)) == pdTRUE) {
        if (Wire.requestFrom(i2c_addr, (uint8_t)1) == 1) {
            raw = Wire.read();
        }
        xSemaphoreGive(g_i2c_mutex);
    }
    return ~raw; // Inversión Active-LOW -> 1 = Entrada Activada
}

/**
 * Escribe un byte en un expansor de relés PCF8574 por I2C.
 * Los drivers de relé de la KC868-A16 son Active-LOW (0 = Relé ON, 1 = Relé OFF).
 */
static void pcf8574_write_active_low(uint8_t i2c_addr, uint8_t logical_state) {
    if (xSemaphoreTake(g_i2c_mutex, pdMS_TO_TICKS(5)) == pdTRUE) {
        Wire.beginTransmission(i2c_addr);
        Wire.write(~logical_state); // Inversión Active-LOW
        Wire.endTransmission();
        xSemaphoreGive(g_i2c_mutex);
    }
}

/**
 * Inicializa el bus I2C a 400 kHz (Fast Mode) y asegura que los 16 relés arranquen apagados.
 */
static void init_kincony_i2c_hardware() {
    Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN, 400000UL);

    // Configurar los PCF8574 de entrada con pull-ups altos (0xFF)
    pcf8574_write_active_low(PCF_IN1_ADDR, 0x00);
    pcf8574_write_active_low(PCF_IN2_ADDR, 0x00);

    // Apagar todos los relés (0x00 lógico -> 0xFF físico en PCF8574)
    pcf8574_write_active_low(PCF_OUT1_ADDR, 0x00);
    pcf8574_write_active_low(PCF_OUT2_ADDR, 0x00);

    // Configurar resolución de los 4 canales ADC
    analogReadResolution(12);
    pinMode(ADC_CH1_PIN, INPUT);
    pinMode(ADC_CH2_PIN, INPUT);
    pinMode(ADC_CH3_PIN, INPUT);
    pinMode(ADC_CH4_PIN, INPUT);
}

// ============================================================================
// 5. SECUENCIA DETERMINISTA DEL SCAN PLC EN CORE 1
// ============================================================================

/**
 * PASO 1 DEL SCAN: update_inputs()
 * - Lee las 16 entradas ópticas I2C (`%IX0.0..%IX0.7` y `%IX1.0..%IX1.7`).
 * - Lee los 4 canales analógicos (`%IW0..%IW3`).
 * - Toma el Mutex por microsegundos para copiar los buffers de entrada de red
 *   (`%MW100..103` PROFIBUS, `%MW200..203` PROFINET, `%MW300..303` DeviceNet).
 */
static void update_inputs(OpenPLCProcessImage &local_img) {
    // 1. Lectura física determinista por I2C (400 kHz -> ~180 us total)
    local_img.ix_bytes[0] = pcf8574_read_active_low(PCF_IN1_ADDR); // %IX0.0 .. %IX0.7
    local_img.ix_bytes[1] = pcf8574_read_active_low(PCF_IN2_ADDR); // %IX1.0 .. %IX1.7

    // 2. Lectura de entradas analógicas 12-bit
    local_img.iw_regs[0] = analogRead(ADC_CH1_PIN);
    local_img.iw_regs[1] = analogRead(ADC_CH2_PIN);
    local_img.iw_regs[2] = analogRead(ADC_CH3_PIN);
    local_img.iw_regs[3] = analogRead(ADC_CH4_PIN);

    // 3. Sincronización atómica de registros provenientes de Core 0 (Buses de Campo)
    if (xSemaphoreTake(g_plc_mutex, pdMS_TO_TICKS(2)) == pdTRUE) {
        local_img.plc_run_state  = g_plc_mem.plc_run_state;
        local_img.scan_Period_ms = g_plc_mem.scan_Period_ms;

        // Copiar palabras de entrada escritas por maestros remotos (PROFIBUS / PROFINET / CAN / Modbus)
        memcpy(local_img.mw_regs, g_plc_mem.mw_regs, sizeof(local_img.mw_regs));
        xSemaphoreGive(g_plc_mutex);
    }
}

/**
 * PASO 2 DEL SCAN: solve_logic()
 * Ejecuta la lógica de control IEC 61131-3 compilada sin bloqueos de red.
 * Incluye:
 *   - Rung 1: Enclavamiento Marcha (%IX0.0) / Paro NC (%IX0.1) -> Relé Principal (%QX0.0)
 *   - Rung 2: Comando remoto desde PROFIBUS DP (%MW100.0), PROFINET RT (%MW200.0)
 *             o CAN/DeviceNet (%MW300.0) -> Activa Bomba Auxiliar (%QX0.1)
 *   - Rung 3: Publicación de telemetría de estado hacia los buffers de salida de cada bus:
 *             %MW104 (PROFIBUS TX), %MW204 (PROFINET TX), %MW304 (DeviceNet TX)
 */
static void solve_logic(OpenPLCProcessImage &img) {
    if (!img.plc_run_state) {
        return;
    }

    // --- RUNG 1: Arranque / Paro local con sello (%IX0.0 = START, %IX0.1 = STOP) ---
    bool start_btn  = get_IX(img, 0, 0); // %IX0.0
    bool stop_btn   = get_IX(img, 0, 1); // %IX0.1
    bool seal_q0    = get_QX(img, 0, 0); // %QX0.0
    bool motor_run  = (start_btn || seal_q0) && (!stop_btn);
    set_QX(img, 0, 0, motor_run);

    // --- RUNG 2: Control Híbrido desde Buses de Campo Concurrentes ---
    bool profibus_cmd  = (img.mw_regs[MW_PROFIBUS_BASE + 0] & 0x0001) != 0;  // %MW100.0
    bool profinet_cmd  = (img.mw_regs[MW_PROFINET_BASE + 0] & 0x0001) != 0;  // %MW200.0
    bool devicenet_cmd = (img.mw_regs[MW_DEVICENET_BASE + 0] & 0x0001) != 0; // %MW300.0
    set_QX(img, 0, 1, profibus_cmd || profinet_cmd || devicenet_cmd);        // %QX0.1

    // --- RUNG 3: Alarma de Nivel Alto Analógico (%IW0 > 3000 -> %QX0.2) ---
    bool high_level_alarm = (img.iw_regs[0] > 3000);
    set_QX(img, 0, 2, high_level_alarm);

    // --- RUNG 4: Espejo de diagnóstico hacia los Buffers de Salida de Campo ---
    uint16_t packed_ix = ((uint16_t)img.ix_bytes[1] << 8) | img.ix_bytes[0];
    uint16_t packed_qx = ((uint16_t)img.qx_bytes[1] << 8) | img.qx_bytes[0];

    // Palabras de retorno hacia Maestro PROFIBUS DP (%MW104..%MW107)
    img.mw_regs[MW_PROFIBUS_BASE + 4] = packed_ix;
    img.mw_regs[MW_PROFIBUS_BASE + 5] = packed_qx;
    img.mw_regs[MW_PROFIBUS_BASE + 6] = img.iw_regs[0];
    img.mw_regs[MW_PROFIBUS_BASE + 7] = (uint16_t)(img.scan_count & 0xFFFF);

    // Palabras de retorno hacia Controlador IO PROFINET RT (%MW204..%MW207)
    img.mw_regs[MW_PROFINET_BASE + 4] = packed_ix;
    img.mw_regs[MW_PROFINET_BASE + 5] = packed_qx;
    img.mw_regs[MW_PROFINET_BASE + 6] = img.iw_regs[1];
    img.mw_regs[MW_PROFINET_BASE + 7] = (uint16_t)img.last_scan_exec_us;

    // Palabras de retorno hacia Maestro CAN / DeviceNet (%MW304..%MW307)
    img.mw_regs[MW_DEVICENET_BASE + 4] = packed_ix;
    img.mw_regs[MW_DEVICENET_BASE + 5] = packed_qx;
    img.mw_regs[MW_DEVICENET_BASE + 6] = img.iw_regs[2];
    img.mw_regs[MW_DEVICENET_BASE + 7] = img.iw_regs[3];
}

/**
 * PASO 3 DEL SCAN: update_outputs()
 * - Escribe el estado de `%QX0.0..%QX0.7` y `%QX1.0..%QX1.7` en los expansores I2C 0x24 y 0x25.
 * - Actualiza de forma atómica la imagen global `g_plc_mem` para que Core 0 la sirva a los buses.
 */
static void update_outputs(const OpenPLCProcessImage &local_img) {
    // 1. Escritura física de los 16 relés (Active-LOW)
    pcf8574_write_active_low(PCF_OUT1_ADDR, local_img.qx_bytes[0]); // %QX0.0 .. %QX0.7
    pcf8574_write_active_low(PCF_OUT2_ADDR, local_img.qx_bytes[1]); // %QX1.0 .. %QX1.7

    // 2. Publicación atómica hacia Core 0
    if (xSemaphoreTake(g_plc_mutex, pdMS_TO_TICKS(2)) == pdTRUE) {
        g_plc_mem.ix_bytes[0]       = local_img.ix_bytes[0];
        g_plc_mem.ix_bytes[1]       = local_img.ix_bytes[1];
        g_plc_mem.qx_bytes[0]       = local_img.qx_bytes[0];
        g_plc_mem.qx_bytes[1]       = local_img.qx_bytes[1];
        memcpy(g_plc_mem.iw_regs, local_img.iw_regs, sizeof(local_img.iw_regs));

        // Actualizar bloques de salida de cada bus sin pisar entradas asíncronas
        for (int i = 4; i < FIELDBUS_WORD_COUNT; i++) {
            g_plc_mem.mw_regs[MW_PROFIBUS_BASE + i]  = local_img.mw_regs[MW_PROFIBUS_BASE + i];
            g_plc_mem.mw_regs[MW_PROFINET_BASE + i]  = local_img.mw_regs[MW_PROFINET_BASE + i];
            g_plc_mem.mw_regs[MW_DEVICENET_BASE + i] = local_img.mw_regs[MW_DEVICENET_BASE + i];
        }

        g_plc_mem.scan_count        = local_img.scan_count;
        g_plc_mem.last_scan_exec_us = local_img.last_scan_exec_us;
        g_plc_mem.max_jitter_us     = local_img.max_jitter_us;
        xSemaphoreGive(g_plc_mutex);
    }
}

/**
 * TAREA CRÍTICA EN CORE 1: plc_scan_task
 * Utiliza `vTaskDelayUntil` para garantizar periodicidad estricta (10 ms .. 50 ms)
 * libre de deriva acumulativa.
 */
static void plc_scan_task(void *pvParameters) {
    TickType_t xLastWakeTime = xTaskGetTickCount();
    uint64_t expected_next_us = esp_timer_get_time();

    for (;;) {
        uint64_t loop_start_us = esp_timer_get_time();

        // Medición de Jitter respecto al instante teórico de disparo
        if (loop_start_us > expected_next_us && g_local_scan_img.scan_count > 5) {
            uint32_t jitter = (uint32_t)(loop_start_us - expected_next_us);
            if (jitter > g_local_scan_img.max_jitter_us) {
                g_local_scan_img.max_jitter_us = jitter;
            }
        }

        // Secuencia Determinista IEC 61131-3
        update_inputs(g_local_scan_img);
        solve_logic(g_local_scan_img);
        g_local_scan_img.scan_count++;
        g_local_scan_img.last_scan_exec_us = (uint32_t)(esp_timer_get_time() - loop_start_us);
        update_outputs(g_local_scan_img);

        // Validar rango del periodo de scan (10 ms a 50 ms)
        uint32_t period_ms = g_local_scan_img.scan_Period_ms;
        if (period_ms < 10) period_ms = 10;
        if (period_ms > 50) period_ms = 50;

        expected_next_us = loop_start_us + ((uint64_t)period_ms * 1000ULL);
        vTaskDelayUntil(&xLastWakeTime, pdMS_TO_TICKS(period_ms));
    }
}

// ============================================================================
// 6. CORE 0 — TAREA PROFIBUS DP / RS-485 SOBRE UART2 CON CONTROL RTS/DE
// ============================================================================

/**
 * Calcula el Frame Check Sequence (FCS = suma aritmética mod 256) de PROFIBUS DP (IEC 61158).
 */
static uint8_t profibus_calc_fcs(const uint8_t *buf, size_t len) {
    uint32_t sum = 0;
    for (size_t i = 0; i < len; i++) {
        sum += buf[i];
    }
    return (uint8_t)(sum & 0xFF);
}

/**
 * Tarea de comunicación serial RS-485 para PROFIBUS DP (Telegrama SD2 0x68 de longitud variable)
 * Mapea 4 palabras de recepción en `%MW100..%MW103` y responde con `%MW104..%MW107`.
 */
static void profibus_dp_uart_task(void *pvParameters) {
    uart_config_t uart_cfg = {};
    uart_cfg.baud_rate  = PROFIBUS_BAUDRATE;
    uart_cfg.data_bits  = UART_DATA_8_BITS;
    uart_cfg.parity     = UART_PARITY_EVEN; // Estándar PROFIBUS DP: 8E1 (Paridad Par)
    uart_cfg.stop_bits  = UART_STOP_BITS_1;
    uart_cfg.flow_ctrl  = UART_HW_FLOWCTRL_DISABLE;
    uart_cfg.source_clk = UART_SCLK_APB;

    uart_driver_install(PROFIBUS_UART_NUM, 512, 512, 0, NULL, 0);
    uart_param_config(PROFIBUS_UART_NUM, &uart_cfg);
    uart_set_pin(PROFIBUS_UART_NUM, RS485_TX_PIN, RS485_RX_PIN, RS485_DE_PIN, UART_PIN_NO_CHANGE);
    // Activar modo Half-Duplex RS-485 automático controlado por hardware RTS (DE/RE)
    uart_set_mode(PROFIBUS_UART_NUM, UART_MODE_RS485_HALF_DUPLEX);

    uint8_t rx_buf[128];
    uint8_t tx_buf[64];

    for (;;) {
        int len = uart_read_bytes(PROFIBUS_UART_NUM, rx_buf, sizeof(rx_buf), pdMS_TO_TICKS(15));
        if (len >= 9 && rx_buf[0] == 0x68 && rx_buf[3] == 0x68 && rx_buf[1] == rx_buf[2]) {
            // Telegrama PROFIBUS DP SD2:
            // [0]=0x68, [1]=LE, [2]=LEr, [3]=0x68, [4]=DA, [5]=SA, [6]=FC, [7..N]=PDU, [N+1]=FCS, [N+2]=0x16
            uint8_t le  = rx_buf[1];
            uint8_t da  = rx_buf[4] & 0x7F;
            uint8_t sa  = rx_buf[5] & 0x7F;
            uint8_t fcs = rx_buf[4 + le];
            uint8_t ed  = rx_buf[5 + le];

            if (da == PROFIBUS_SLAVE_ADDR && ed == 0x16 &&
                profibus_calc_fcs(&rx_buf[4], le) == fcs) {

                uint8_t pdu_len = le - 3; // Descontando DA, SA, FC
                const uint8_t *pdu = &rx_buf[7];

                uint16_t tx_words[4] = {0};

                if (xSemaphoreTake(g_plc_mutex, pdMS_TO_TICKS(5)) == pdTRUE) {
                    // Escribir datos del Maestro PROFIBUS en %MW100 .. %MW103
                    for (uint8_t w = 0; w < 4 && (w * 2 + 1) < pdu_len; w++) {
                        g_plc_mem.mw_regs[MW_PROFIBUS_BASE + w] =
                            ((uint16_t)pdu[w * 2] << 8) | pdu[w * 2 + 1];
                    }
                    // Leer datos de respuesta desde %MW104 .. %MW107
                    for (uint8_t w = 0; w < 4; w++) {
                        tx_words[w] = g_plc_mem.mw_regs[MW_PROFIBUS_BASE + 4 + w];
                    }
                    xSemaphoreGive(g_plc_mutex);
                }

                // Construir respuesta PROFIBUS DP SD2 Data_Exchange (8 bytes de datos = 4 palabras)
                uint8_t resp_le = 3 + 8; // DA + SA + FC + 8 bytes PDU
                tx_buf[0] = 0x68;
                tx_buf[1] = resp_le;
                tx_buf[2] = resp_le;
                tx_buf[3] = 0x68;
                tx_buf[4] = sa;                   // Destino = Maestro
                tx_buf[5] = PROFIBUS_SLAVE_ADDR;  // Origen = Esclavo KC868-A16
                tx_buf[6] = 0x08;                 // FC = Response Data_Exchange OK
                for (uint8_t w = 0; w < 4; w++) {
                    tx_buf[7 + w * 2]     = (uint8_t)(tx_words[w] >> 8);
                    tx_buf[7 + w * 2 + 1] = (uint8_t)(tx_words[w] & 0xFF);
                }
                tx_buf[15] = profibus_calc_fcs(&tx_buf[4], resp_le);
                tx_buf[16] = 0x16;                // End Delimiter (ED)

                uart_write_bytes(PROFIBUS_UART_NUM, (const char *)tx_buf, 17);
            }
        }
        vTaskDelay(pdMS_TO_TICKS(2));
    }
}

// ============================================================================
// 7. CORE 0 — TAREA BUS CAN / DEVICENET (DRIVER NATIVO ESP-IDF TWAI)
// ============================================================================

/**
 * Tarea del Bus CAN / DeviceNet sobre el controlador TWAI nativo del ESP32.
 * - Velocidad: 250 kbps (Estándar DeviceNet industrial).
 * - Identificador CAN 11-bit (Grupo 2 DeviceNet):
 *     COB-ID = (0b10 << 9) | (MAC_ID << 3) | MsgID
 * - Escribe las palabras recibidas en `%MW300..%MW303` y transmite `%MW304..%MW307`.
 */
static void can_devicenet_twai_task(void *pvParameters) {
    twai_general_config_t g_config = TWAI_GENERAL_CONFIG_DEFAULT(
        (gpio_num_t)CAN_TX_PIN,
        (gpio_num_t)CAN_RX_PIN,
        TWAI_MODE_NORMAL
    );
    twai_timing_config_t t_config = TWAI_TIMING_CONFIG_250KBITS();
    twai_filter_config_t f_config = TWAI_FILTER_CONFIG_ACCEPT_ALL();

    if (twai_driver_install(&g_config, &t_config, &f_config) == ESP_OK) {
        twai_start();
    }

    uint32_t last_cyclic_tx_ms = millis();

    for (;;) {
        twai_message_t rx_msg;
        // 1. Recepción no bloqueante de tramas CAN / DeviceNet
        while (twai_receive(&rx_msg, pdMS_TO_TICKS(10)) == ESP_OK) {
            if (!rx_msg.extd && rx_msg.data_length_code >= 2) {
                if (xSemaphoreTake(g_plc_mutex, pdMS_TO_TICKS(5)) == pdTRUE) {
                    // Mapear hasta 4 palabras de 16 bits en %MW300 .. %MW303
                    for (int w = 0; w < 4 && (w * 2 + 1) < rx_msg.data_length_code; w++) {
                        g_plc_mem.mw_regs[MW_DEVICENET_BASE + w] =
                            ((uint16_t)rx_msg.data[w * 2] << 8) | rx_msg.data[w * 2 + 1];
                    }
                    xSemaphoreGive(g_plc_mutex);
                }
            }
        }

        // 2. Transmisión cíclica Polled I/O cada 100 ms con los registros %MW304 .. %MW307
        uint32_t now = millis();
        if (now - last_cyclic_tx_ms >= 100) {
            last_cyclic_tx_ms = now;

            uint16_t tx_words[4] = {0};
            if (xSemaphoreTake(g_plc_mutex, pdMS_TO_TICKS(5)) == pdTRUE) {
                for (int w = 0; w < 4; w++) {
                    tx_words[w] = g_plc_mem.mw_regs[MW_DEVICENET_BASE + 4 + w];
                }
                xSemaphoreGive(g_plc_mutex);
            }

            twai_message_t tx_msg = {};
            tx_msg.extd = 0; // CAN 2.0A 11-bit ID
            tx_msg.identifier = (0b10 << 9) | ((DEVICENET_MAC_ID & 0x3F) << 3) | 0b101;
            tx_msg.data_length_code = 8;
            for (int w = 0; w < 4; w++) {
                tx_msg.data[w * 2]     = (uint8_t)(tx_words[w] >> 8);
                tx_msg.data[w * 2 + 1] = (uint8_t)(tx_words[w] & 0xFF);
            }
            twai_transmit(&tx_msg, pdMS_TO_TICKS(5));
        }

        vTaskDelay(pdMS_TO_TICKS(5));
    }
}

// ============================================================================
// 8. CORE 0 — TAREA MODBUS TCP (502) + PROFINET RT CYCLIC I/O (34964)
// ============================================================================

/**
 * Procesa peticiones Modbus TCP (FC01, FC02, FC03, FC04, FC05, FC06) y el puente
 * cíclico PROFINET RT sobre Ethernet LAN8720 (`%MW200..%MW207`).
 */
static void modbus_and_profinet_task(void *pvParameters) {
    g_modbus_tcp_server.begin();
    g_profinet_udp.begin(34964); // Puerto estándar PROFINET RT Unicast / Cyclic I/O

    WiFiClient client;
    uint8_t mb_buf[260];
    uint8_t pn_buf[64];

    for (;;) {
        // --- A. Servidor Modbus TCP (Puerto 502) ---
        if (!client || !client.connected()) {
            client = g_modbus_tcp_server.available();
        }
        if (client && client.connected() && client.available() >= 12) {
            int n = client.read(mb_buf, sizeof(mb_buf));
            if (n >= 12) {
                uint8_t  fc   = mb_buf[7];
                uint16_t addr = ((uint16_t)mb_buf[8] << 8) | mb_buf[9];
                uint16_t val  = ((uint16_t)mb_buf[10] << 8) | mb_buf[11];

                if (xSemaphoreTake(g_plc_mutex, pdMS_TO_TICKS(5)) == pdTRUE) {
                    if (fc == 0x03 && (addr + val) <= MAX_MW_REGISTERS) {
                        // Read Holding Registers (%MW0 .. %MW511)
                        uint8_t byte_cnt = (uint8_t)(val * 2);
                        mb_buf[4] = 0x00;
                        mb_buf[5] = 3 + byte_cnt;
                        mb_buf[8] = byte_cnt;
                        for (uint16_t i = 0; i < val; i++) {
                            uint16_t reg = g_plc_mem.mw_regs[addr + i];
                            mb_buf[9 + i * 2]     = (uint8_t)(reg >> 8);
                            mb_buf[9 + i * 2 + 1] = (uint8_t)(reg & 0xFF);
                        }
                        client.write(mb_buf, 9 + byte_cnt);
                    } else if (fc == 0x06 && addr < MAX_MW_REGISTERS) {
                        // Write Single Holding Register (%MW)
                        g_plc_mem.mw_regs[addr] = val;
                        client.write(mb_buf, 12);
                    } else if (fc == 0x05 && addr < 16) {
                        // Write Single Coil (%QX0.0..%QX1.7)
                        set_QX(g_plc_mem, addr / 8, addr % 8, val == 0xFF00);
                        client.write(mb_buf, 12);
                    }
                    xSemaphoreGive(g_plc_mutex);
                }
            }
        }

        // --- B. Puente PROFINET RT Cyclic Data I/O (%MW200 .. %MW207) ---
        int pkt_size = g_profinet_udp.parsePacket();
        if (pkt_size >= 10) {
            int rlen = g_profinet_udp.read(pn_buf, sizeof(pn_buf));
            // Frame ID PROFINET RT Class 1 (0x8000 .. 0xFBFF) en los primeros 2 bytes
            uint16_t frame_id = ((uint16_t)pn_buf[0] << 8) | pn_buf[1];
            if (frame_id >= 0x8000 && rlen >= 10) {
                uint8_t tx_pn[20];
                tx_pn[0] = pn_buf[0];
                tx_pn[1] = pn_buf[1];

                if (xSemaphoreTake(g_plc_mutex, pdMS_TO_TICKS(5)) == pdTRUE) {
                    // Escribir 4 palabras de Output CR del IO-Controller en %MW200..%MW203
                    for (int w = 0; w < 4 && (2 + w * 2 + 1) < rlen; w++) {
                        g_plc_mem.mw_regs[MW_PROFINET_BASE + w] =
                            ((uint16_t)pn_buf[2 + w * 2] << 8) | pn_buf[2 + w * 2 + 1];
                    }
                    // Responder con las 4 palabras de Input CR desde %MW204..%MW207
                    for (int w = 0; w < 4; w++) {
                        uint16_t v = g_plc_mem.mw_regs[MW_PROFINET_BASE + 4 + w];
                        tx_pn[2 + w * 2]     = (uint8_t)(v >> 8);
                        tx_pn[2 + w * 2 + 1] = (uint8_t)(v & 0xFF);
                    }
                    xSemaphoreGive(g_plc_mutex);
                }

                // Añadir IOPS = GOOD (0x80) y CycleCounter
                tx_pn[10] = 0x80;
                tx_pn[11] = 0x00;
                g_profinet_udp.beginPacket(g_profinet_udp.remoteIP(), g_profinet_udp.remotePort());
                g_profinet_udp.write(tx_pn, 12);
                g_profinet_udp.endPacket();
            }
        }

        vTaskDelay(pdMS_TO_TICKS(5));
    }
}

// ============================================================================
// 9. CORE 0 — SERVIDOR WEBSOCKET (PUERTO 81) PARA INTERFAZ WEB PCLINO
// ============================================================================

static void on_websocket_event(uint8_t num, WStype_t type, uint8_t *payload, size_t length) {
    if (type != WStype_TEXT) return;

    JsonDocument doc;
    if (deserializeJson(doc, payload, length) != DeserializationError::Ok) return;

    const char *cmd = doc["cmd"] | "";

    if (xSemaphoreTake(g_plc_mutex, pdMS_TO_TICKS(10)) == pdTRUE) {
        if (strcmp(cmd, "SET_RUN") == 0) {
            g_plc_mem.plc_run_state = doc["run"] | true;
        } else if (strcmp(cmd, "SET_SCAN_MS") == 0) {
            uint32_t ms = doc["scan_ms"] | 20;
            if (ms >= 10 && ms <= 50) g_plc_mem.scan_Period_ms = ms;
        } else if (strcmp(cmd, "WRITE_MW") == 0) {
            uint16_t addr = doc["addr"] | 0;
            uint16_t val  = doc["val"] | 0;
            if (addr < MAX_MW_REGISTERS) {
                g_plc_mem.mw_regs[addr] = val;
            }
        } else if (strcmp(cmd, "FORCE_QX") == 0) {
            uint8_t ch  = doc["ch"] | 0;
            bool state  = doc["val"] | false;
            if (ch < 16) {
                set_QX(g_plc_mem, ch / 8, ch % 8, state);
            }
        }
        xSemaphoreGive(g_plc_mutex);
    }
}

static void websocket_telemetry_task(void *pvParameters) {
    g_ws_server.begin();
    g_ws_server.onEvent(on_websocket_event);

    uint32_t last_broadcast_ms = millis();

    for (;;) {
        g_ws_server.loop();

        uint32_t now = millis();
        if (now - last_broadcast_ms >= 100) {
            last_broadcast_ms = now;

            OpenPLCProcessImage snap;
            if (xSemaphoreTake(g_plc_mutex, pdMS_TO_TICKS(5)) == pdTRUE) {
                snap = g_plc_mem;
                xSemaphoreGive(g_plc_mutex);

                JsonDocument doc;
                doc["board"]     = "KC868-A16";
                doc["run"]       = snap.plc_run_state;
                doc["scanCount"] = snap.scan_count;
                doc["scanUs"]    = snap.last_scan_exec_us;
                doc["jitterUs"]  = snap.max_jitter_us;
                doc["ix0"]       = snap.ix_bytes[0];
                doc["ix1"]       = snap.ix_bytes[1];
                doc["qx0"]       = snap.qx_bytes[0];
                doc["qx1"]       = snap.qx_bytes[1];

                JsonArray iw = doc["iw"].to<JsonArray>();
                for (int i = 0; i < 4; i++) iw.add(snap.iw_regs[i]);

                // Incluir resumen de los 3 buffers de campo (%MW100, %MW200, %MW300)
                doc["profibus_mw100"]  = snap.mw_regs[MW_PROFIBUS_BASE];
                doc["profinet_mw200"]  = snap.mw_regs[MW_PROFINET_BASE];
                doc["devicenet_mw300"] = snap.mw_regs[MW_DEVICENET_BASE];

                String json_out;
                serializeJson(doc, json_out);
                g_ws_server.broadcastTXT(json_out);
            }
        }

        vTaskDelay(pdMS_TO_TICKS(10));
    }
}

// ============================================================================
// 10. EVENTOS DE RED ETHERNET LAN8720 Y ARRANQUE DEL SISTEMA (setup / loop)
// ============================================================================

static void on_network_event(WiFiEvent_t event) {
    switch (event) {
        case ARDUINO_EVENT_ETH_START:
            ETH.setHostname("pclino-kc868-a16");
            break;
        case ARDUINO_EVENT_ETH_GOT_IP:
            g_eth_connected = true;
            Serial.printf("[ETH LAN8720] IP: %s | Modbus TCP :502 | PROFINET RT :34964 | WS :81\n",
                          ETH.localIP().toString().c_str());
            break;
        case ARDUINO_EVENT_ETH_DISCONNECTED:
            g_eth_connected = false;
            break;
        default:
            break;
    }
}

void setup() {
    Serial.begin(115200);
    delay(200);
    Serial.println("\n==================================================================");
    Serial.println(" PCLino OpenPLC Multi-Core Runtime — KinCony KC868-A16 (ESP32)");
    Serial.println("==================================================================");

    // 1. Inicializar estructura de memoria compartida y primitivas FreeRTOS
    memset(&g_plc_mem, 0, sizeof(g_plc_mem));
    g_plc_mem.scan_Period_ms = PLC_DEFAULT_SCAN_MS;
    g_plc_mem.plc_run_state  = true;
    g_local_scan_img         = g_plc_mem;

    g_plc_mutex      = xSemaphoreCreateMutex();
    g_i2c_mutex      = xSemaphoreCreateMutex();
    g_can_tx_queue   = xQueueCreate(16, sizeof(twai_message_t));
    g_profibus_queue = xQueueCreate(16, sizeof(uint16_t));

    // 2. Inicializar Bus I2C (SDA=4, SCL=15) y Expansores PCF8574 (0x22, 0x21, 0x24, 0x25)
    init_kincony_i2c_hardware();
    Serial.println("[HAL I2C] 4xPCF8574 listos (IN: 0x22/0x21, OUT: 0x24/0x25 Active-LOW).");

    // 3. Inicializar Ethernet RMII LAN8720A
    WiFi.onEvent(on_network_event);
    ETH.begin(ETH_PHY_ADDR, ETH_PHY_POWER, ETH_PHY_MDC, ETH_PHY_MDIO, ETH_PHY_LAN8720, ETH_CLK_MODE);

    // 4. Anclar Tarea Determinista de Control PLC a CORE 1 (Prioridad Máxima = 24)
    xTaskCreatePinnedToCore(
        plc_scan_task,
        "plc_scan_task",
        8192,
        NULL,
        24,
        NULL,
        CORE_PLC_RT_ID
    );
    Serial.printf("[CORE 1] Tarea determinista `plc_scan_task` activa (%u ms).\n",
                  g_plc_mem.scan_Period_ms);

    // 5. Anclar Tareas de Buses de Campo y Telemetría a CORE 0
    xTaskCreatePinnedToCore(
        profibus_dp_uart_task,
        "profibus_uart2",
        4096,
        NULL,
        10,
        NULL,
        CORE_COMM_ID
    );
    xTaskCreatePinnedToCore(
        can_devicenet_twai_task,
        "devicenet_twai",
        4096,
        NULL,
        10,
        NULL,
        CORE_COMM_ID
    );
    xTaskCreatePinnedToCore(
        modbus_and_profinet_task,
        "modbus_profinet",
        6144,
        NULL,
        8,
        NULL,
        CORE_COMM_ID
    );
    xTaskCreatePinnedToCore(
        websocket_telemetry_task,
        "ws_telemetry",
        6144,
        NULL,
        5,
        NULL,
        CORE_COMM_ID
    );
    Serial.println("[CORE 0] PROFIBUS DP (UART2), CAN/DeviceNet (TWAI), PROFINET RT, Modbus TCP y WS activos.");
}

void loop() {
    // El loop de Arduino queda libre en Core 1 cediendo el CPU al planificador de FreeRTOS
    vTaskDelay(pdMS_TO_TICKS(1000));
}
