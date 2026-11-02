import React, { useState } from 'react';
import {
  Network,
  Send,
  Cpu,
  Radio,
  Layers,
  Trash2,
  CheckCircle2,
  ArrowRightLeft,
} from 'lucide-react';
import { usePLCStore } from '../store/usePLCStore';
import { computeModbusCRC16, toHex } from '../utils/industrialNetworks';

export const IndustrialNetworksLab: React.FC = () => {
  const {
    inputs,
    outputs,
    analogs,
    words,
    hwConfig,
    networkTransactions,
    sendModbusTCPRequest,
    sendModbusRTURequest,
    captureI2CBusFrames,
    clearNetworkTransactions,
    updateHwConfig,
  } = usePLCStore();

  const [activeProto, setActiveProto] = useState<'MODBUS_TCP' | 'MODBUS_RTU' | 'I2C' | 'MQTT'>(
    'MODBUS_TCP'
  );
  const [fc, setFc] = useState<number>(1);
  const [startAddr, setStartAddr] = useState<number>(0);
  const [qtyOrVal, setQtyOrVal] = useState<number>(8);

  // Live preview of the frame about to be sent
  const ah = (startAddr >> 8) & 0xff;
  const al = startAddr & 0xff;
  const effectiveVal = fc === 5 ? (qtyOrVal ? 0xff00 : 0x0000) : qtyOrVal;
  const vh = (effectiveVal >> 8) & 0xff;
  const vl = effectiveVal & 0xff;
  const rtuCore = [hwConfig.rs485SlaveId & 0xff, fc & 0xff, ah, al, vh, vl];
  const rtuCrc = computeModbusCRC16(rtuCore);

  // Calculate active-low I2C bytes for the 4 PCF8574 expanders
  const calcPcfByte = (arr: boolean[], offset: number) => {
    let b = 0xff;
    for (let i = 0; i < 8; i++) {
      if (arr[offset + i]) b &= ~(1 << i);
    }
    return b;
  };

  const pcfBytes = [
    {
      chip: 'PCF8574 #1 (Entradas DI1..DI8)',
      addr: hwConfig.pcfIn1Addr,
      rw: 'READ (Bit 0 = 1)',
      iec: '%IX0.0 .. %IX0.7',
      modbus: '10001 .. 10008 (FC02)',
      byteVal: calcPcfByte(inputs, 0),
    },
    {
      chip: 'PCF8574 #2 (Entradas DI9..DI16)',
      addr: hwConfig.pcfIn2Addr,
      rw: 'READ (Bit 0 = 1)',
      iec: '%IX1.0 .. %IX1.7',
      modbus: '10009 .. 10016 (FC02)',
      byteVal: calcPcfByte(inputs, 8),
    },
    {
      chip: 'PCF8574 #3 (Salidas DO1..DO8)',
      addr: hwConfig.pcfOut1Addr,
      rw: 'WRITE (Bit 0 = 0)',
      iec: '%QX0.0 .. %QX0.7',
      modbus: '00001 .. 00008 (FC01/05)',
      byteVal: calcPcfByte(outputs, 0),
    },
    {
      chip: 'PCF8574 #4 (Salidas DO9..DO16)',
      addr: hwConfig.pcfOut2Addr,
      rw: 'WRITE (Bit 0 = 0)',
      iec: '%QX1.0 .. %QX1.7',
      modbus: '00009 .. 00016 (FC01/05)',
      byteVal: calcPcfByte(outputs, 8),
    },
  ];

  const mqttSparkplugJson = JSON.stringify(
    {
      topic: hwConfig.mqttTopicPrefix,
      timestamp: Date.now(),
      seq: networkTransactions.length + 1,
      node: 'KinCony_KC868_A16_ESP32',
      metrics: [
        { name: 'Inputs/DI1_8_Hex', type: 'String', value: `0x${toHex(calcPcfByte(inputs, 0))}` },
        { name: 'Outputs/DO1_8_Hex', type: 'String', value: `0x${toHex(calcPcfByte(outputs, 0))}` },
        { name: 'OpenPLC/%QX0.0_MainContactor', type: 'Boolean', value: outputs[0] },
        { name: 'OpenPLC/%QX0.1_StarDelta', type: 'Boolean', value: outputs[1] },
        { name: 'Analog/%IW0_Pressure_ADC1', type: 'Int16', value: analogs[0] },
        { name: 'Analog/%IW1_Flow_ADC2', type: 'Int16', value: analogs[1] },
        { name: '1Wire/%IW4_Temp_DS18B20_C', type: 'Float', value: Number((analogs[4] / 10).toFixed(1)) },
        { name: 'Holding/%MW0_BatchCount', type: 'Int16', value: words[0] },
      ],
    },
    null,
    2
  );

  return (
    <div className="flex flex-col h-full bg-[#f8fafc] overflow-y-auto p-4 space-y-4 select-none">
      {/* Top Educational Banner & Protocol Tabs */}
      <div className="bg-white rounded-lg border border-slate-300 p-3.5 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Network className="w-4 h-4 text-[#0f766e]" />
            <h2 className="text-sm font-bold text-slate-900">
              Laboratorio de Redes Industriales — KinCony KC868-A16 & OpenPLC
            </h2>
          </div>
          <p className="text-xs text-slate-600 mt-0.5">
            Inspecciona, construye y ejecuta tramas reales entre el bus de campo I²C, RS485 Modbus RTU, Ethernet Modbus TCP (LAN8720) e IIoT MQTT.
          </p>
        </div>

        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg border border-slate-300">
          {[
            { id: 'MODBUS_TCP', label: '1. Modbus TCP/IP (ETH 502)' },
            { id: 'MODBUS_RTU', label: '2. RS485 Modbus RTU (CRC-16)' },
            { id: 'I2C', label: '3. Bus I²C 4×PCF8574' },
            { id: 'MQTT', label: '4. MQTT Sparkplug B & Mapa' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveProto(tab.id as typeof activeProto)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
                activeProto === tab.id
                  ? 'bg-[#0f766e] text-white shadow-2xs'
                  : 'text-slate-700 hover:bg-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Section 1 & 2: Interactive Modbus TCP / RTU Frame Builder & Dissector */}
      {(activeProto === 'MODBUS_TCP' || activeProto === 'MODBUS_RTU') && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          {/* Frame Builder Card */}
          <div className="xl:col-span-5 bg-white rounded-lg border border-slate-300 p-4 shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#0f766e]">
                {activeProto === 'MODBUS_TCP'
                  ? 'Constructor de Trama Modbus TCP (Puerto 502)'
                  : 'Constructor de Trama RS485 Modbus RTU (UART2 GPIO16/13)'}
              </span>
              <span className="px-2 py-0.5 rounded bg-teal-50 border border-teal-200 text-[11px] font-mono text-teal-800">
                {activeProto === 'MODBUS_TCP' ? 'LAN8720 RMII' : `${hwConfig.rs485BaudRate} 8N1`}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <label className="flex flex-col gap-1 text-slate-700 font-medium col-span-2">
                <span>Código de Función (Function Code PDU):</span>
                <select
                  value={fc}
                  onChange={(e) => {
                    const nextFc = Number(e.target.value);
                    setFc(nextFc);
                    if (nextFc === 5) setQtyOrVal(1);
                    else if (nextFc === 6) setQtyOrVal(125);
                    else setQtyOrVal(8);
                  }}
                  className="px-2.5 py-1.5 rounded border border-slate-300 bg-white font-mono text-xs text-slate-900"
                >
                  <option value={1}>0x01 — Read Coils (Leer Salidas %QX0.0..%QX1.7)</option>
                  <option value={2}>0x02 — Read Discrete Inputs (Leer Entradas %IX0.0..%IX1.7)</option>
                  <option value={3}>0x03 — Read Holding Registers (Leer %MW0..%MW15)</option>
                  <option value={4}>0x04 — Read Input Registers (Leer Analógicas %IW0..%IW7)</option>
                  <option value={5}>0x05 — Write Single Coil (Forzar Salida %QX en vivo)</option>
                  <option value={6}>0x06 — Write Single Register (Escribir %MW en vivo)</option>
                </select>
              </label>

              <label className="flex flex-col gap-1 text-slate-700 font-medium">
                <span>Dirección Inicial (Offset 0..15):</span>
                <input
                  type="number"
                  min={0}
                  max={15}
                  value={startAddr}
                  onChange={(e) => setStartAddr(Math.max(0, Math.min(15, Number(e.target.value))))}
                  className="px-2.5 py-1.5 rounded border border-slate-300 bg-white font-mono font-bold text-slate-900"
                />
              </label>

              <label className="flex flex-col gap-1 text-slate-700 font-medium">
                <span>
                  {fc === 5
                    ? 'Valor Bobina (1=ON, 0=OFF):'
                    : fc === 6
                    ? 'Valor Registro (16-bit INT):'
                    : 'Cantidad a Leer (1..16):'}
                </span>
                <input
                  type="number"
                  min={fc === 5 ? 0 : 1}
                  max={fc === 5 ? 1 : fc === 6 ? 32767 : 16}
                  value={qtyOrVal}
                  onChange={(e) => setQtyOrVal(Number(e.target.value))}
                  className="px-2.5 py-1.5 rounded border border-slate-300 bg-white font-mono font-bold text-[#0f766e]"
                />
              </label>

              {activeProto === 'MODBUS_RTU' && (
                <>
                  <label className="flex flex-col gap-1 text-slate-700 font-medium">
                    <span>Slave ID RS485 (1..247):</span>
                    <input
                      type="number"
                      min={1}
                      max={247}
                      value={hwConfig.rs485SlaveId}
                      onChange={(e) =>
                        updateHwConfig({ rs485SlaveId: Math.max(1, Number(e.target.value)) })
                      }
                      className="px-2.5 py-1 rounded border border-slate-300 bg-white font-mono"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-slate-700 font-medium">
                    <span>Baudrate UART2 (GPIO16/13):</span>
                    <select
                      value={hwConfig.rs485BaudRate}
                      onChange={(e) =>
                        updateHwConfig({
                          rs485BaudRate: Number(e.target.value) as typeof hwConfig.rs485BaudRate,
                        })
                      }
                      className="px-2.5 py-1 rounded border border-slate-300 bg-white font-mono"
                    >
                      <option value={9600}>9600 bps (Silencio 3.5T = 4.01 ms)</option>
                      <option value={19200}>19200 bps (Silencio 3.5T = 2.00 ms)</option>
                      <option value={38400}>38400 bps (Silencio 3.5T = 1.75 ms)</option>
                      <option value={115200}>115200 bps (Silencio 3.5T = 1.75 ms)</option>
                    </select>
                  </label>
                </>
              )}
            </div>

            {/* Live Pre-flight Frame Breakdown */}
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
              <div className="text-[11px] font-semibold text-slate-600">
                Vista Previa de Trama en Bytes (Hexadecimal Big-Endian):
              </div>
              {activeProto === 'MODBUS_TCP' ? (
                <div className="flex flex-wrap gap-1.5 font-mono text-xs">
                  <span className="px-2 py-1 rounded bg-teal-100 border border-teal-300 text-teal-900" title="Transaction ID (2B)">
                    00 01 <small className="block text-[9px] font-sans">TxID</small>
                  </span>
                  <span className="px-2 py-1 rounded bg-sky-100 border border-sky-300 text-sky-900" title="Protocol ID (2B)">
                    00 00 <small className="block text-[9px] font-sans">Proto</small>
                  </span>
                  <span className="px-2 py-1 rounded bg-indigo-100 border border-indigo-300 text-indigo-900" title="Length (2B)">
                    00 06 <small className="block text-[9px] font-sans">Len</small>
                  </span>
                  <span className="px-2 py-1 rounded bg-purple-100 border border-purple-300 text-purple-900" title="Unit ID (1B)">
                    {toHex(hwConfig.rs485SlaveId)} <small className="block text-[9px] font-sans">Unit</small>
                  </span>
                  <span className="px-2 py-1 rounded bg-amber-100 border border-amber-300 text-amber-900" title="Function Code (1B)">
                    {toHex(fc)} <small className="block text-[9px] font-sans">FC</small>
                  </span>
                  <span className="px-2 py-1 rounded bg-rose-100 border border-rose-300 text-rose-900" title="Start Address (2B)">
                    {toHex(ah)} {toHex(al)} <small className="block text-[9px] font-sans">Addr</small>
                  </span>
                  <span className="px-2 py-1 rounded bg-emerald-100 border border-emerald-300 text-emerald-900" title="Data / Quantity (2B)">
                    {toHex(vh)} {toHex(vl)} <small className="block text-[9px] font-sans">Data</small>
                  </span>
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5 font-mono text-xs">
                  <span className="px-2 py-1 rounded bg-purple-100 border border-purple-300 text-purple-900">
                    {toHex(hwConfig.rs485SlaveId)} <small className="block text-[9px] font-sans">Slave</small>
                  </span>
                  <span className="px-2 py-1 rounded bg-amber-100 border border-amber-300 text-amber-900">
                    {toHex(fc)} <small className="block text-[9px] font-sans">FC</small>
                  </span>
                  <span className="px-2 py-1 rounded bg-rose-100 border border-rose-300 text-rose-900">
                    {toHex(ah)} {toHex(al)} <small className="block text-[9px] font-sans">Addr</small>
                  </span>
                  <span className="px-2 py-1 rounded bg-emerald-100 border border-emerald-300 text-emerald-900">
                    {toHex(vh)} {toHex(vl)} <small className="block text-[9px] font-sans">Data</small>
                  </span>
                  <span className="px-2 py-1 rounded bg-teal-100 border border-teal-400 text-teal-900 font-bold">
                    {toHex(rtuCrc.lo)} {toHex(rtuCrc.hi)}{' '}
                    <small className="block text-[9px] font-sans">CRC-16 (Lo/Hi)</small>
                  </span>
                </div>
              )}
            </div>

            <button
              onClick={() =>
                activeProto === 'MODBUS_TCP'
                  ? sendModbusTCPRequest(fc, startAddr, qtyOrVal)
                  : sendModbusRTURequest(fc, startAddr, qtyOrVal)
              }
              className="w-full py-2 px-4 rounded-lg bg-[#0f766e] hover:bg-[#115e59] text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              <Send className="w-3.5 h-3.5" />
              <span>
                Enviar Petición {activeProto === 'MODBUS_TCP' ? 'Modbus TCP' : 'Modbus RTU'} y Capturar Respuesta
              </span>
            </button>
          </div>

          {/* Live Packet Sniffer / Dissector */}
          <div className="xl:col-span-7 bg-white rounded-lg border border-slate-300 p-4 shadow-2xs flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-3">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-[#0f766e]" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Analizador de Tramas en Tiempo Real (Petición Maestro ↔ Respuesta Esclavo KC868-A16)
                </span>
              </div>
              <button
                onClick={clearNetworkTransactions}
                className="px-2 py-0.5 rounded border border-slate-300 hover:bg-slate-100 text-[11px] text-slate-600 flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" /> Limpiar
              </button>
            </div>

            <div className="flex-1 space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
              {networkTransactions.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-300 rounded-lg">
                  Presiona el botón <strong>"Enviar Petición"</strong> a la izquierda para capturar y diseccionar una transacción real contra la memoria del PLC.
                </div>
              ) : (
                networkTransactions.map((tx) => (
                  <div
                    key={tx.id}
                    className={`p-3 rounded-lg border text-xs ${
                      tx.direction.startsWith('TX')
                        ? 'bg-slate-50 border-slate-300'
                        : 'bg-teal-50/40 border-teal-300'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-slate-500">
                          [{tx.timestamp}]
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] ${
                            tx.direction.startsWith('TX')
                              ? 'bg-slate-800 text-white'
                              : 'bg-[#0f766e] text-white'
                          }`}
                        >
                          {tx.direction}
                        </span>
                        <span className="font-semibold text-slate-800">{tx.summary}</span>
                      </div>
                      <span className="flex items-center gap-1 text-[11px] text-emerald-700 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {tx.protocol === 'MODBUS_RTU' ? 'CRC-16 OK' : 'ACK OK'}
                      </span>
                    </div>

                    <div className="font-mono text-xs bg-white px-2.5 py-1.5 rounded border border-slate-200 text-slate-900 mb-2">
                      Trama Hex: <strong>{tx.rawHex}</strong>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-1.5">
                      {tx.fields.map((f, idx) => (
                        <div
                          key={idx}
                          className="p-1.5 rounded bg-white border border-slate-200 flex flex-col justify-between"
                        >
                          <div className="text-[10px] font-semibold text-slate-500">{f.name}</div>
                          <div
                            className="font-mono font-bold text-xs my-0.5"
                            style={{ color: f.color }}
                          >
                            {f.hex}
                          </div>
                          <div className="text-[10px] text-slate-600 leading-tight">
                            {f.description}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Section 3: Bus I2C PCF8574 Hardware Frame Analyzer */}
      {activeProto === 'I2C' && (
        <div className="bg-white rounded-lg border border-slate-300 p-4 shadow-2xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Cpu className="w-4 h-4 text-[#0f766e]" />
                Arquitectura del Bus I²C en KinCony KC868-A16 (`SDA = GPIO 4`, `SCL = GPIO 5` @ 400 kHz)
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                El ESP32 no tiene 32 GPIOs libres para 16 entradas + 16 salidas + Ethernet; por eso multiplexa las E/S mediante 4 expansores de 8 bits PCF8574 con lógica activa en BAJO (`0` = ON, `1` = OFF).
              </p>
            </div>
            <button
              onClick={captureI2CBusFrames}
              className="px-3 py-1.5 rounded-lg bg-[#0f766e] hover:bg-[#115e59] text-white font-bold text-xs cursor-pointer"
            >
              Capturar Ráfaga de Scan I²C
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {pcfBytes.map((item) => {
              const bin = item.byteVal.toString(2).padStart(8, '0');
              return (
                <div
                  key={item.addr}
                  className="p-3.5 rounded-lg bg-slate-50 border border-slate-300 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">{item.chip}</span>
                    <span className="px-2 py-0.5 rounded bg-[#0f766e] text-white font-mono text-xs font-bold">
                      Addr {item.addr}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-600 font-mono">
                    <span>IEC: {item.iec}</span>
                    <span>Modbus: {item.modbus}</span>
                  </div>
                  <div className="p-2 rounded bg-white border border-slate-200 font-mono text-xs flex items-center justify-between">
                    <span>
                      Trama I²C: <strong>[S] → {item.addr} → [ACK] → 0x{toHex(item.byteVal)} → [P]</strong>
                    </span>
                    <span className="text-[#0f766e] font-bold">{bin}b</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Section 4: MQTT Sparkplug B / OPC UA & Full OpenPLC Address Map */}
      {activeProto === 'MQTT' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-lg border border-slate-300 p-4 shadow-2xs space-y-2">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
              <Radio className="w-4 h-4 text-[#0f766e]" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Payload IIoT MQTT / Sparkplug B en Tiempo Real
              </h3>
            </div>
            <pre className="p-3 rounded bg-slate-900 text-emerald-300 font-mono text-xs overflow-x-auto leading-relaxed">
              {mqttSparkplugJson}
            </pre>
          </div>

          <div className="bg-white rounded-lg border border-slate-300 p-4 shadow-2xs space-y-2">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
              <Layers className="w-4 h-4 text-[#0f766e]" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Tabla Maestra de Direccionamiento OpenPLC ↔ Redes Industriales
              </h3>
            </div>
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-300 bg-slate-100 text-slate-700">
                  <th className="py-1.5 px-2">Hardware KC868-A16</th>
                  <th className="py-1.5 px-2">I²C / GPIO</th>
                  <th className="py-1.5 px-2">IEC 61131-3</th>
                  <th className="py-1.5 px-2">Modbus (TCP/RTU)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-mono text-[11px]">
                <tr>
                  <td className="py-1.5 px-2 font-sans font-medium">Entradas DI1 – DI8</td>
                  <td className="py-1.5 px-2">PCF8574 0x22</td>
                  <td className="py-1.5 px-2 text-[#0f766e] font-bold">%IX0.0 – %IX0.7</td>
                  <td className="py-1.5 px-2">10001 – 10008 (FC02)</td>
                </tr>
                <tr>
                  <td className="py-1.5 px-2 font-sans font-medium">Entradas DI9 – DI16</td>
                  <td className="py-1.5 px-2">PCF8574 0x21</td>
                  <td className="py-1.5 px-2 text-[#0f766e] font-bold">%IX1.0 – %IX1.7</td>
                  <td className="py-1.5 px-2">10009 – 10016 (FC02)</td>
                </tr>
                <tr>
                  <td className="py-1.5 px-2 font-sans font-medium">Salidas DO1 – DO8</td>
                  <td className="py-1.5 px-2">PCF8574 0x24</td>
                  <td className="py-1.5 px-2 text-amber-800 font-bold">%QX0.0 – %QX0.7</td>
                  <td className="py-1.5 px-2">00001 – 00008 (FC01/05/15)</td>
                </tr>
                <tr>
                  <td className="py-1.5 px-2 font-sans font-medium">Salidas DO9 – DO16</td>
                  <td className="py-1.5 px-2">PCF8574 0x25</td>
                  <td className="py-1.5 px-2 text-amber-800 font-bold">%QX1.0 – %QX1.7</td>
                  <td className="py-1.5 px-2">00009 – 00016 (FC01/05/15)</td>
                </tr>
                <tr>
                  <td className="py-1.5 px-2 font-sans font-medium">Analógicas A1 – A4</td>
                  <td className="py-1.5 px-2">GPIO 36,39,34,35</td>
                  <td className="py-1.5 px-2 text-indigo-800 font-bold">%IW0 – %IW3</td>
                  <td className="py-1.5 px-2">30001 – 30004 (FC04)</td>
                </tr>
                <tr>
                  <td className="py-1.5 px-2 font-sans font-medium">Sensores 1-Wire HT1–HT3</td>
                  <td className="py-1.5 px-2">GPIO 32, 33, 14</td>
                  <td className="py-1.5 px-2 text-indigo-800 font-bold">%IW4 – %IW6</td>
                  <td className="py-1.5 px-2">30005 – 30007 (FC04)</td>
                </tr>
                <tr>
                  <td className="py-1.5 px-2 font-sans font-medium">Holding Registers PLC</td>
                  <td className="py-1.5 px-2">RAM ESP32</td>
                  <td className="py-1.5 px-2 text-purple-800 font-bold">%MW0 – %MW15</td>
                  <td className="py-1.5 px-2">40001 – 40016 (FC03/06/16)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
