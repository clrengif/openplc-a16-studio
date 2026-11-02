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
  AlertOctagon,
  ShieldAlert,
  Activity,
  GitCommitHorizontal,
} from 'lucide-react';
import { usePLCStore } from '../store/usePLCStore';
import { computeModbusCRC16, toHex } from '../utils/industrialNetworks';

type LabProtocolTab =
  | 'MODBUS_TCP'
  | 'MODBUS_RTU'
  | 'HART'
  | 'DEVICENET'
  | 'OPC_UA'
  | 'I2C'
  | 'MQTT';

export const IndustrialNetworksLab: React.FC = () => {
  const {
    inputs,
    outputs,
    analogs,
    words,
    hwConfig,
    faults,
    networkTransactions,
    updateFaults,
    sendModbusTCPRequest,
    sendModbusRTURequest,
    sendHartCommand,
    sendDeviceNetFrame,
    captureI2CBusFrames,
    clearNetworkTransactions,
    updateHwConfig,
    setCoilValue,
    setWordValue,
  } = usePLCStore();

  const [activeProto, setActiveProto] = useState<LabProtocolTab>('MODBUS_TCP');
  const [fc, setFc] = useState<number>(1);
  const [startAddr, setStartAddr] = useState<number>(0);
  const [qtyOrVal, setQtyOrVal] = useState<number>(8);

  // HART state
  const [hartPollAddr, setHartPollAddr] = useState<number>(0);
  const [hartCmd, setHartCmd] = useState<0 | 1 | 2 | 3>(3);

  // DeviceNet state
  const [dnetMacId, setDnetMacId] = useState<number>(12);
  const [dnetMode, setDnetMode] = useState<'POLLED_IO' | 'EXPLICIT_CIP'>('POLLED_IO');

  const ah = (startAddr >> 8) & 0xff;
  const al = startAddr & 0xff;
  const effectiveVal = fc === 5 ? (qtyOrVal ? 0xff00 : 0x0000) : qtyOrVal;
  const vh = (effectiveVal >> 8) & 0xff;
  const vl = effectiveVal & 0xff;
  const rtuCore = [hwConfig.rs485SlaveId & 0xff, fc & 0xff, ah, al, vh, vl];
  const rtuCrc = computeModbusCRC16(rtuCore);

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
      iec: '%IX0.0 .. %IX0.7',
      modbus: '10001 .. 10008 (FC02)',
      byteVal: calcPcfByte(inputs, 0),
    },
    {
      chip: 'PCF8574 #2 (Entradas DI9..DI16)',
      addr: hwConfig.pcfIn2Addr,
      iec: '%IX1.0 .. %IX1.7',
      modbus: '10009 .. 10016 (FC02)',
      byteVal: calcPcfByte(inputs, 8),
    },
    {
      chip: 'PCF8574 #3 (Salidas DO1..DO8)',
      addr: hwConfig.pcfOut1Addr,
      iec: '%QX0.0 .. %QX0.7',
      modbus: '00001 .. 00008 (FC01/05)',
      byteVal: calcPcfByte(outputs, 0),
    },
    {
      chip: 'PCF8574 #4 (Salidas DO9..DO16)',
      addr: hwConfig.pcfOut2Addr,
      iec: '%QX1.0 .. %QX1.7',
      modbus: '00009 .. 00016 (FC01/05)',
      byteVal: calcPcfByte(outputs, 8),
    },
  ];

  const hasActiveFault =
    faults.corruptCrc16 ||
    faults.forceModbusException > 0 ||
    faults.i2cNackFault ||
    faults.rs485PolaritySwap;

  const loopMa = (4 + ((analogs[0] ?? 1850) / 4095) * 16).toFixed(2);
  const loopPct = (((analogs[0] ?? 1850) / 4095) * 100).toFixed(1);
  const pressureBar = (((analogs[0] ?? 1850) / 4095) * 10).toFixed(2);

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
        { name: 'Analog/%IW0_Pressure_ADC1', type: 'Int16', value: analogs[0] },
        { name: '1Wire/%IW4_Temp_DS18B20_C', type: 'Float', value: Number((analogs[4] / 10).toFixed(1)) },
        { name: 'Holding/%MW0_BatchCount', type: 'Int16', value: words[0] },
      ],
    },
    null,
    2
  );

  return (
    <div className="flex flex-col h-full bg-[#f8fafc] overflow-y-auto p-4 space-y-3.5 select-none">
      {/* Header + 7 Industrial Protocol Selector Tabs */}
      <div className="bg-white rounded-lg border border-slate-300 p-3 shadow-2xs space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Network className="w-4 h-4 text-[#0f766e]" />
              <h2 className="text-sm font-bold text-slate-900">
                Laboratorio Completo de Redes Industriales — KinCony KC868-A16 & OpenPLC
              </h2>
            </div>
            <p className="text-xs text-slate-600">
              Modbus TCP · RS485 Modbus RTU · HART 4–20 mA FSK · DeviceNet CAN 11-Bit · OPC UA · Bus I²C · MQTT Sparkplug B
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-300">
          {[
            { id: 'MODBUS_TCP', label: '1. Modbus TCP (502)' },
            { id: 'MODBUS_RTU', label: '2. RS485 RTU (CRC16)' },
            { id: 'HART', label: '3. HART (4-20mA FSK)' },
            { id: 'DEVICENET', label: '4. DeviceNet (CAN CIP)' },
            { id: 'OPC_UA', label: '5. OPC UA (4840)' },
            { id: 'I2C', label: '6. Bus I²C PCF8574' },
            { id: 'MQTT', label: '7. MQTT Sparkplug B' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveProto(tab.id as LabProtocolTab)}
              className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer transition-colors ${
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

      {/* Industrial Network Fault Injector Bar ("Modo Troubleshooting / Diagnóstico de Fallas") */}
      <div
        className={`rounded-lg border p-3 transition-colors ${
          hasActiveFault
            ? 'bg-rose-50/90 border-rose-300'
            : 'bg-white border-slate-300'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldAlert
              className={`w-4 h-4 ${hasActiveFault ? 'text-rose-600' : 'text-amber-600'}`}
            />
            <span className="text-xs font-bold text-slate-900">
              Inyector de Fallas de Red Industrial (Modo Troubleshooting):
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={faults.corruptCrc16}
                onChange={(e) => updateFaults({ corruptCrc16: e.target.checked })}
                className="accent-rose-600"
              />
              <span className="font-medium text-slate-700">Ruido EM (Corromper CRC-16 RS485)</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={faults.rs485PolaritySwap}
                onChange={(e) => updateFaults({ rs485PolaritySwap: e.target.checked })}
                className="accent-rose-600"
              />
              <span className="font-medium text-slate-700">Invertir Cables RS485 A+/B-</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={faults.i2cNackFault}
                onChange={(e) => updateFaults({ i2cNackFault: e.target.checked })}
                className="accent-rose-600"
              />
              <span className="font-medium text-slate-700">Fallo I²C NACK (Expansor desconectado)</span>
            </label>

            <label className="flex items-center gap-1.5">
              <span className="font-medium text-slate-700">Excepción Modbus:</span>
              <select
                value={faults.forceModbusException}
                onChange={(e) => updateFaults({ forceModbusException: Number(e.target.value) })}
                className="px-2 py-0.5 rounded bg-white border border-slate-300 font-mono text-xs"
              >
                <option value={0}>0x00 Ninguna (Normal)</option>
                <option value={1}>0x01 Illegal Function</option>
                <option value={2}>0x02 Illegal Data Address</option>
                <option value={6}>0x06 Slave Device Busy</option>
              </select>
            </label>
          </div>
        </div>
      </div>

      {/* Main Content Grid: Left = Active Protocol Builder/Inspector, Right = Real-Time Frame Dissector */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Left Column (5 cols): Protocol-Specific Interactive Builder */}
        <div className="xl:col-span-5 bg-white rounded-lg border border-slate-300 p-4 shadow-2xs space-y-3">
          {/* 1 & 2: MODBUS TCP & MODBUS RTU */}
          {(activeProto === 'MODBUS_TCP' || activeProto === 'MODBUS_RTU') && (
            <>
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#0f766e]">
                  {activeProto === 'MODBUS_TCP'
                    ? 'Constructor Modbus TCP/IP (Puerto 502)'
                    : 'Constructor RS485 Modbus RTU (UART2 GPIO16/13)'}
                </span>
                <span className="px-2 py-0.5 rounded bg-teal-50 border border-teal-200 text-[11px] font-mono text-teal-800">
                  {activeProto === 'MODBUS_TCP' ? 'LAN8720 ETH' : `${hwConfig.rs485BaudRate} 8N1`}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <label className="flex flex-col gap-1 text-slate-700 font-medium col-span-2">
                  <span>Function Code (PDU):</span>
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
                    <option value={1}>0x01 — Read Coils (%QX0.0..%QX1.7)</option>
                    <option value={2}>0x02 — Read Discrete Inputs (%IX0.0..%IX1.7)</option>
                    <option value={3}>0x03 — Read Holding Registers (%MW0..%MW15)</option>
                    <option value={4}>0x04 — Read Input Registers (%IW0..%IW7)</option>
                    <option value={5}>0x05 — Write Single Coil (Forzar %QX en vivo)</option>
                    <option value={6}>0x06 — Write Single Register (Escribir %MW en vivo)</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-slate-700 font-medium">
                  <span>Dirección Inicial (0..15):</span>
                  <input
                    type="number"
                    min={0}
                    max={15}
                    value={startAddr}
                    onChange={(e) => setStartAddr(Math.max(0, Math.min(15, Number(e.target.value))))}
                    className="px-2.5 py-1.5 rounded border border-slate-300 bg-white font-mono font-bold"
                  />
                </label>

                <label className="flex flex-col gap-1 text-slate-700 font-medium">
                  <span>{fc === 5 ? 'Valor (1=ON, 0=OFF):' : fc === 6 ? 'Valor Entero:' : 'Cantidad:'}</span>
                  <input
                    type="number"
                    value={qtyOrVal}
                    onChange={(e) => setQtyOrVal(Number(e.target.value))}
                    className="px-2.5 py-1.5 rounded border border-slate-300 bg-white font-mono font-bold text-[#0f766e]"
                  />
                </label>
              </div>

              <div className="p-2.5 rounded bg-slate-50 border border-slate-200 font-mono text-xs">
                {activeProto === 'MODBUS_TCP' ? (
                  <div>
                    MBAP+PDU: <strong>00 01 00 00 00 06 {toHex(hwConfig.rs485SlaveId)} {toHex(fc)} {toHex(ah)} {toHex(al)} {toHex(vh)} {toHex(vl)}</strong>
                  </div>
                ) : (
                  <div>
                    RTU+CRC16: <strong>{toHex(hwConfig.rs485SlaveId)} {toHex(fc)} {toHex(ah)} {toHex(al)} {toHex(vh)} {toHex(vl)} [{toHex(rtuCrc.lo)} {toHex(rtuCrc.hi)}]</strong>
                  </div>
                )}
              </div>

              <button
                onClick={() =>
                  activeProto === 'MODBUS_TCP'
                    ? sendModbusTCPRequest(fc, startAddr, qtyOrVal)
                    : sendModbusRTURequest(fc, startAddr, qtyOrVal)
                }
                className="w-full py-2 px-4 rounded-lg bg-[#0f766e] hover:bg-[#115e59] text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Enviar Trama {activeProto === 'MODBUS_TCP' ? 'Modbus TCP' : 'RS485 RTU'}</span>
              </button>
            </>
          )}

          {/* 3: HART Protocol (4-20 mA + FSK Bell 202) */}
          {activeProto === 'HART' && (
            <>
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#0f766e]">
                  Protocolo HART sobre Lazo 4–20 mA (Canal A1 %IW0)
                </span>
                <span className="px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-[11px] font-mono text-amber-800">
                  FSK 1200/2200 Hz
                </span>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
                <div className="flex justify-between font-mono">
                  <span className="text-slate-600">Señal Analógica DC (A1 GPIO36):</span>
                  <strong className="text-[#0f766e]">{loopMa} mA ({loopPct} %)</strong>
                </div>
                <div className="flex justify-between font-mono">
                  <span className="text-slate-600">Variable Primaria Digital (PV):</span>
                  <strong className="text-amber-800">{pressureBar} Bar (IEEE-754 Float)</strong>
                </div>
                <div className="flex justify-between font-mono">
                  <span className="text-slate-600">Variable Secundaria (SV Temp HT1):</span>
                  <strong className="text-indigo-800">{((analogs[4] ?? 245) / 10).toFixed(1)} °C</strong>
                </div>
              </div>

              <div className="space-y-2 text-xs">
                <label className="flex flex-col gap-1 text-slate-700 font-medium">
                  <span>Dirección Polling del Transmisor (0 = Lazo 4-20mA, 1..63 = Multidrop):</span>
                  <input
                    type="number"
                    min={0}
                    max={63}
                    value={hartPollAddr}
                    onChange={(e) => setHartPollAddr(Math.max(0, Math.min(63, Number(e.target.value))))}
                    className="px-2.5 py-1 rounded border border-slate-300 font-mono"
                  />
                </label>

                <label className="flex flex-col gap-1 text-slate-700 font-medium">
                  <span>Comando Universal HART:</span>
                  <select
                    value={hartCmd}
                    onChange={(e) => setHartCmd(Number(e.target.value) as 0 | 1 | 2 | 3)}
                    className="px-2.5 py-1.5 rounded border border-slate-300 bg-white font-mono text-xs"
                  >
                    <option value={0}>Cmd 0 — Leer Identificador Único y Fabricante</option>
                    <option value={1}>Cmd 1 — Leer Variable Primaria (PV en Bar)</option>
                    <option value={2}>Cmd 2 — Leer Corriente de Lazo (mA) y Porcentaje (%)</option>
                    <option value={3}>Cmd 3 — Leer Corriente + Variables Dinámicas (PV + SV)</option>
                  </select>
                </label>
              </div>

              <button
                onClick={() => sendHartCommand(hartPollAddr, hartCmd)}
                className="w-full py-2 px-4 rounded-lg bg-[#0f766e] hover:bg-[#115e59] text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Modular Trama FSK HART sobre Lazo 4–20 mA</span>
              </button>
            </>
          )}

          {/* 4: DeviceNet (CIP over CAN Bus 11-bit) */}
          {activeProto === 'DEVICENET' && (
            <>
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#0f766e]">
                  DeviceNet (CIP sobre CAN Bus 11-Bit — ESP32 TWAI)
                </span>
                <span className="px-2 py-0.5 rounded bg-purple-50 border border-purple-200 text-[11px] font-mono text-purple-800">
                  GPIO32/33 · 125 kbps
                </span>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                El controlador <strong>CAN 2.0B (TWAI)</strong> integrado en el ESP32 de la KC868-A16 codifica el <strong>Grupo de Mensaje</strong> y el <strong>MAC ID (0..63)</strong> dentro del identificador CAN de 11 bits para intercambiar ensamblados CIP de E/S.
              </p>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <label className="flex flex-col gap-1 text-slate-700 font-medium">
                  <span>MAC ID del Nodo (0..63):</span>
                  <input
                    type="number"
                    min={0}
                    max={63}
                    value={dnetMacId}
                    onChange={(e) => setDnetMacId(Math.max(0, Math.min(63, Number(e.target.value))))}
                    className="px-2.5 py-1.5 rounded border border-slate-300 font-mono font-bold"
                  />
                </label>

                <label className="flex flex-col gap-1 text-slate-700 font-medium">
                  <span>Tipo de Conexión CIP:</span>
                  <select
                    value={dnetMode}
                    onChange={(e) => setDnetMode(e.target.value as 'POLLED_IO' | 'EXPLICIT_CIP')}
                    className="px-2 py-1.5 rounded border border-slate-300 font-mono text-xs"
                  >
                    <option value="POLLED_IO">Implícito: Polled I/O (Grupo 2 Msg 5)</option>
                    <option value="EXPLICIT_CIP">Explícito: Get_Attribute_Single (0x0E)</option>
                  </select>
                </label>
              </div>

              <button
                onClick={() => sendDeviceNetFrame(dnetMacId, dnetMode)}
                className="w-full py-2 px-4 rounded-lg bg-[#0f766e] hover:bg-[#115e59] text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                <GitCommitHorizontal className="w-4 h-4" />
                <span>Transmitir Trama CAN 11-Bit DeviceNet</span>
              </button>
            </>
          )}

          {/* 5: OPC UA (IEC 62541 Address Space) */}
          {activeProto === 'OPC_UA' && (
            <>
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#0f766e]">
                  Servidor OPC UA (IEC 62541 — Endpoint opc.tcp://KC868:4840)
                </span>
              </div>

              <div className="space-y-1.5 text-xs font-mono max-h-[300px] overflow-y-auto">
                {[
                  {
                    nodeId: 'ns=2;s=KC868.DI1_StartBtn',
                    iec: '%IX0.0',
                    type: 'Boolean',
                    val: String(inputs[0]),
                    writable: false,
                  },
                  {
                    nodeId: 'ns=2;s=KC868.DO1_MainContactor',
                    iec: '%QX0.0',
                    type: 'Boolean',
                    val: String(outputs[0]),
                    writable: true,
                    onToggle: () => setCoilValue(0, !outputs[0]),
                  },
                  {
                    nodeId: 'ns=2;s=KC868.DO4_DrainValve',
                    iec: '%QX0.3',
                    type: 'Boolean',
                    val: String(outputs[3]),
                    writable: true,
                    onToggle: () => setCoilValue(3, !outputs[3]),
                  },
                  {
                    nodeId: 'ns=2;s=KC868.ADC1_Pressure',
                    iec: '%IW0',
                    type: 'UInt16',
                    val: String(analogs[0]),
                    writable: false,
                  },
                  {
                    nodeId: 'ns=2;s=KC868.HT1_TempDS18B20',
                    iec: '%IW4',
                    type: 'Double',
                    val: `${((analogs[4] ?? 245) / 10).toFixed(1)} °C`,
                    writable: false,
                  },
                  {
                    nodeId: 'ns=2;s=KC868.Holding_BatchCount',
                    iec: '%MW0',
                    type: 'Int16',
                    val: String(words[0]),
                    writable: true,
                    onToggle: () => setWordValue(0, (words[0] ?? 0) + 1),
                  },
                ].map((n) => (
                  <div
                    key={n.nodeId}
                    className="p-2 rounded bg-slate-50 border border-slate-200 flex items-center justify-between gap-2"
                  >
                    <div>
                      <div className="font-bold text-slate-800">{n.nodeId}</div>
                      <div className="text-[10px] text-slate-500">
                        IEC: {n.iec} · Tipo: {n.type}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-white border border-slate-300 font-bold text-[#0f766e]">
                        {n.val}
                      </span>
                      {n.writable && (
                        <button
                          onClick={n.onToggle}
                          className="px-2 py-0.5 rounded bg-[#0f766e] text-white text-[10px] font-sans font-semibold cursor-pointer"
                        >
                          Write
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* 6: Bus I2C 4xPCF8574 */}
          {activeProto === 'I2C' && (
            <>
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#0f766e]">
                  Bus I²C Interno 4×PCF8574 (SDA=4, SCL=5 @ 400 kHz)
                </span>
                <button
                  onClick={captureI2CBusFrames}
                  className="px-2.5 py-1 rounded bg-[#0f766e] text-white text-xs font-bold cursor-pointer"
                >
                  Capturar Ráfaga I²C
                </button>
              </div>
              <div className="space-y-2">
                {pcfBytes.map((item) => (
                  <div
                    key={item.addr}
                    className="p-2.5 rounded bg-slate-50 border border-slate-200 text-xs font-mono flex items-center justify-between"
                  >
                    <div>
                      <div className="font-sans font-bold text-slate-800">{item.chip}</div>
                      <div className="text-[10px] text-slate-500">
                        Addr {item.addr} · {item.iec}
                      </div>
                    </div>
                    <span className="px-2 py-1 rounded bg-white border border-slate-300 font-bold text-[#0f766e]">
                      0x{toHex(item.byteVal)} ({item.byteVal.toString(2).padStart(8, '0')}b)
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* 7: MQTT Sparkplug B */}
          {activeProto === 'MQTT' && (
            <>
              <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                <Radio className="w-4 h-4 text-[#0f766e]" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Payload IIoT MQTT Sparkplug B (`NDATA`)
                </span>
              </div>
              <pre className="p-2.5 rounded bg-slate-900 text-emerald-300 font-mono text-[11px] overflow-x-auto leading-relaxed max-h-[280px]">
                {mqttSparkplugJson}
              </pre>
            </>
          )}
        </div>

        {/* Right Column (7 cols): Real-Time Packet Dissector (Wireshark Style) */}
        <div className="xl:col-span-7 bg-white rounded-lg border border-slate-300 p-4 shadow-2xs flex flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-3">
            <div className="flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-[#0f766e]" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Inspector de Tramas y Diagnóstico de Errores (Maestro ↔ Esclavo KC868-A16)
              </span>
            </div>
            <button
              onClick={clearNetworkTransactions}
              className="px-2 py-0.5 rounded border border-slate-300 hover:bg-slate-100 text-[11px] text-slate-600 flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3 h-3" /> Limpiar
            </button>
          </div>

          <div className="flex-1 space-y-2.5 max-h-[430px] overflow-y-auto pr-1">
            {networkTransactions.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-300 rounded-lg">
                Envía una trama desde el panel izquierdo (Modbus TCP, RS485 RTU, HART, DeviceNet o I²C) para diseccionar cada byte y probar el inyector de fallas.
              </div>
            ) : (
              networkTransactions.map((tx) => (
                <div
                  key={tx.id}
                  className={`p-3 rounded-lg border text-xs ${
                    !tx.validCrcOrAck
                      ? 'bg-rose-50/80 border-rose-400'
                      : tx.direction.startsWith('TX')
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
                          !tx.validCrcOrAck
                            ? 'bg-rose-600 text-white'
                            : tx.direction.startsWith('TX')
                            ? 'bg-slate-800 text-white'
                            : 'bg-[#0f766e] text-white'
                        }`}
                      >
                        {tx.protocol} · {tx.direction}
                      </span>
                      <span className="font-semibold text-slate-800">{tx.summary}</span>
                    </div>
                    <span
                      className={`flex items-center gap-1 text-[11px] font-bold ${
                        tx.validCrcOrAck ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {tx.validCrcOrAck ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>TRAMA VÁLIDA</span>
                        </>
                      ) : (
                        <>
                          <AlertOctagon className="w-3.5 h-3.5" />
                          <span>ERROR DETECTADO</span>
                        </>
                      )}
                    </span>
                  </div>

                  <div className="font-mono text-xs bg-white px-2.5 py-1.5 rounded border border-slate-200 text-slate-900 mb-2">
                    Trama: <strong>{tx.rawHex}</strong>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-1.5">
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
    </div>
  );
};
