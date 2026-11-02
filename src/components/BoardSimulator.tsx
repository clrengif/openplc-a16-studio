import React, { useRef, useState } from 'react';
import {
  Cpu,
  Wifi,
  Usb,
  Radio,
  Gauge,
  ToggleLeft,
  Hand,
  Activity,
  Unplug,
  Thermometer,
  X,
} from 'lucide-react';
import { usePLCStore } from '../store/usePLCStore';
import { indexToIECAddress } from '../utils/defaultProgram';

interface BoardSimulatorProps {
  onClose?: () => void;
}

export const BoardSimulator: React.FC<BoardSimulatorProps> = ({ onClose }) => {
  const {
    inputs,
    momentaryMask,
    outputs,
    analogs,
    symbols,
    hwConfig,
    hwConnected,
    toggleInput,
    setInputState,
    toggleMomentaryMode,
    setAnalogChannel,
    updateHwConfig,
    setHwConnected,
    applyHardwareTelemetry,
    addLog,
  } = usePLCStore();

  const [showHwConfig, setShowHwConfig] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const calcPcfByteHex = (bits: boolean[], offset: number): string => {
    let byteVal = 0xff;
    for (let b = 0; b < 8; b++) {
      if (bits[offset + b]) {
        byteVal &= ~(1 << b);
      }
    }
    return '0x' + byteVal.toString(16).toUpperCase().padStart(2, '0');
  };

  const pcfIn1Hex = calcPcfByteHex(inputs, 0);
  const pcfIn2Hex = calcPcfByteHex(inputs, 8);
  const pcfOut1Hex = calcPcfByteHex(outputs, 0);
  const pcfOut2Hex = calcPcfByteHex(outputs, 8);

  const getTag = (addr: string) =>
    symbols.find((s) => s.address.toUpperCase() === addr.toUpperCase())?.name;

  const handleConnectHardware = async () => {
    if (hwConnected) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setHwConnected(false);
      return;
    }

    if (hwConfig.transport === 'websocket') {
      try {
        addLog('WS', `Conectando WebSocket a ${hwConfig.wsUrl}...`);
        const ws = new WebSocket(hwConfig.wsUrl);
        ws.onopen = () => setHwConnected(true);
        ws.onmessage = (ev) => {
          try {
            const data = JSON.parse(String(ev.data));
            if (Array.isArray(data.ix) && Array.isArray(data.qx)) {
              applyHardwareTelemetry(data.ix, data.qx, data.iw);
            }
          } catch {
            // ignore
          }
        };
        ws.onerror = () => {
          addLog('WARN', `Sin respuesta en ${hwConfig.wsUrl}. Continuando en Simulador Virtual.`);
          setHwConnected(false);
        };
        ws.onclose = () => setHwConnected(false);
        wsRef.current = ws;
      } catch {
        addLog('ERROR', 'URL WebSocket inválida.');
      }
    } else {
      const nav = navigator as unknown as {
        serial?: { requestPort: () => Promise<{ open: (opts: { baudRate: number }) => Promise<void> }> };
      };
      if (!nav.serial) {
        addLog('WARN', 'Web Serial API requiere Chrome o Edge.');
        return;
      }
      try {
        const port = await nav.serial.requestPort();
        await port.open({ baudRate: 115200 });
        setHwConnected(true);
      } catch {
        addLog('WARN', 'Conexión USB Serial cancelada.');
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#f4f6f8] border-l border-slate-300 select-none overflow-y-auto">
      {/* Header */}
      <div className="px-3.5 py-2 bg-[#f8fafc] border-b border-slate-300 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded bg-[#0f766e]/10 border border-[#0f766e]/30 text-[#0f766e]">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                KinCony KC868-A16
              </h2>
              <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-teal-50 text-[#0f766e] border border-teal-200 font-semibold">
                ESP32 + 4×PCF8574
              </span>
            </div>
            <p className="text-[10px] text-slate-500 font-mono">
              I²C (GPIO 4/5) · LAN8720 ETH · RS485 (GPIO 16/13)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowHwConfig(!showHwConfig)}
            className="px-2 py-1 rounded bg-white hover:bg-slate-100 border border-slate-300 text-[11px] font-medium text-slate-700 cursor-pointer"
          >
            Red
          </button>
          <button
            onClick={handleConnectHardware}
            className={`px-2.5 py-1 rounded text-[11px] font-semibold flex items-center gap-1 border cursor-pointer transition-colors ${
              hwConnected
                ? 'bg-[#0f766e] border-[#0f766e] text-white'
                : 'bg-white hover:bg-slate-100 border-slate-300 text-slate-800'
            }`}
          >
            {hwConnected ? (
              <>
                <Unplug className="w-3 h-3" />
                <span>Online</span>
              </>
            ) : (
              <>
                <Wifi className="w-3 h-3 text-[#0f766e]" />
                <span>Conectar</span>
              </>
            )}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              title="Cerrar ventana de placa KC868-A16 (Activar en menú Ver)"
              className="p-1 rounded hover:bg-rose-100 text-slate-500 hover:text-rose-700 cursor-pointer ml-0.5 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Collapsible Network & Hardware Config */}
      {showHwConfig && (
        <div className="p-3 bg-white border-b border-slate-300 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-700">Enlace Hardware KC868-A16</span>
            <div className="flex gap-1">
              <button
                onClick={() => updateHwConfig({ transport: 'websocket' })}
                className={`px-2 py-0.5 rounded text-[11px] flex items-center gap-1 cursor-pointer ${
                  hwConfig.transport === 'websocket'
                    ? 'bg-[#0f766e] text-white'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                <Wifi className="w-3 h-3" /> WebSocket
              </button>
              <button
                onClick={() => updateHwConfig({ transport: 'serial' })}
                className={`px-2 py-0.5 rounded text-[11px] flex items-center gap-1 cursor-pointer ${
                  hwConfig.transport === 'serial'
                    ? 'bg-[#0f766e] text-white'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                <Usb className="w-3 h-3" /> USB CH340
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-0.5 text-[11px] text-slate-600">
              <span>WebSocket ESP32:</span>
              <input
                type="text"
                value={hwConfig.wsUrl}
                onChange={(e) => updateHwConfig({ wsUrl: e.target.value })}
                className="px-2 py-1 rounded bg-slate-50 border border-slate-300 text-slate-800 font-mono"
              />
            </label>
            <label className="flex flex-col gap-0.5 text-[11px] text-slate-600">
              <span>IP Modbus TCP (502):</span>
              <input
                type="text"
                value={hwConfig.modbusIp}
                onChange={(e) => updateHwConfig({ modbusIp: e.target.value })}
                className="px-2 py-1 rounded bg-slate-50 border border-slate-300 text-slate-800 font-mono"
              />
            </label>
          </div>
        </div>
      )}

      <div className="p-3 space-y-3">
        {/* Live I2C PCF8574 Bus Register Monitor */}
        <div className="rounded-lg bg-white border border-slate-300 p-2.5 shadow-2xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-[#0f766e]" />
              Registros Bus I²C PCF8574 (Activo-Bajo: 0=ON)
            </span>
            <span className="text-[10px] font-mono text-slate-500">400 kHz</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5 text-center font-mono text-xs">
            <div className="p-1.5 rounded bg-slate-50 border border-slate-200">
              <div className="text-[10px] text-slate-500">DI1..8 ({hwConfig.pcfIn1Addr})</div>
              <div className="text-[#0f766e] font-bold mt-0.5">{pcfIn1Hex}</div>
            </div>
            <div className="p-1.5 rounded bg-slate-50 border border-slate-200">
              <div className="text-[10px] text-slate-500">DI9..16 ({hwConfig.pcfIn2Addr})</div>
              <div className="text-[#0f766e] font-bold mt-0.5">{pcfIn2Hex}</div>
            </div>
            <div className="p-1.5 rounded bg-slate-50 border border-slate-200">
              <div className="text-[10px] text-slate-500">DO1..8 ({hwConfig.pcfOut1Addr})</div>
              <div className="text-amber-700 font-bold mt-0.5">{pcfOut1Hex}</div>
            </div>
            <div className="p-1.5 rounded bg-slate-50 border border-slate-200">
              <div className="text-[10px] text-slate-500">DO9..16 ({hwConfig.pcfOut2Addr})</div>
              <div className="text-amber-700 font-bold mt-0.5">{pcfOut2Hex}</div>
            </div>
          </div>
        </div>

        {/* 16 Opto-Isolated Digital Inputs (%IX0.0 .. %IX1.7) */}
        <div className="rounded-lg bg-white border border-slate-300 p-2.5 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-800">
              16 Entradas Optoacopladas (%IX0.0 – %IX1.7)
            </span>
            <span className="text-[10px] text-slate-500">
              Modbus 10001–10016
            </span>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {inputs.map((active, idx) => {
              const iecAddr = indexToIECAddress('%IX', idx);
              const isMomentary = momentaryMask[idx];
              const tag = getTag(iecAddr);

              return (
                <div
                  key={iecAddr}
                  className={`rounded p-1.5 border transition-all flex flex-col justify-between ${
                    active
                      ? 'bg-[#ccfbf1]/70 border-[#0f766e]'
                      : 'bg-slate-50/80 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-mono font-bold text-slate-700">
                      DI{idx + 1}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleMomentaryMode(idx);
                      }}
                      title={isMomentary ? 'Pulsador Momentáneo' : 'Interruptor Mantenido'}
                      className="p-0.5 rounded hover:bg-slate-200 text-slate-500 cursor-pointer"
                    >
                      {isMomentary ? (
                        <Hand className="w-3 h-3 text-sky-700" />
                      ) : (
                        <ToggleLeft className="w-3 h-3 text-[#0f766e]" />
                      )}
                    </button>
                  </div>

                  <button
                    onMouseDown={() => {
                      if (isMomentary) setInputState(idx, true);
                      else toggleInput(idx);
                    }}
                    onMouseUp={() => {
                      if (isMomentary) setInputState(idx, false);
                    }}
                    onMouseLeave={() => {
                      if (isMomentary && active) setInputState(idx, false);
                    }}
                    className={`w-full py-1 rounded text-[11px] font-mono font-bold transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#0f766e] text-white'
                        : 'bg-white hover:bg-teal-50 text-slate-800 border border-slate-300'
                    }`}
                  >
                    {iecAddr}
                  </button>

                  <div className="text-[9px] text-slate-500 truncate mt-0.5" title={tag}>
                    {tag || (isMomentary ? 'Pulsador' : 'Switch')}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 16 Relay / MOSFET Outputs (%QX0.0 .. %QX1.7) */}
        <div className="rounded-lg bg-white border border-slate-300 p-2.5 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-[#ea580c]" />
              16 Salidas MOSFET / Relé (%QX0.0 – %QX1.7)
            </span>
            <span className="text-[10px] font-mono text-slate-500">
              Modbus 00001–00016 · {outputs.filter(Boolean).length}/16 ON
            </span>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {outputs.map((active, idx) => {
              const iecAddr = indexToIECAddress('%QX', idx);
              const tag = getTag(iecAddr);
              return (
                <div
                  key={iecAddr}
                  className={`rounded p-1.5 border transition-all flex flex-col justify-between ${
                    active
                      ? 'bg-amber-50 border-amber-500 shadow-2xs'
                      : 'bg-slate-50/80 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold text-slate-700">
                      DO{idx + 1}
                    </span>
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        active
                          ? 'bg-[#ea580c] shadow-[0_0_6px_#ea580c]'
                          : 'bg-slate-300'
                      }`}
                    />
                  </div>
                  <div
                    className={`text-[10px] font-mono font-bold mt-0.5 ${
                      active ? 'text-amber-800' : 'text-slate-600'
                    }`}
                  >
                    {iecAddr}
                  </div>
                  <div className="text-[9px] text-slate-500 truncate" title={tag}>
                    {tag || '—'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 4 Analog Inputs A1..A4 + 1-Wire Sensors HT1..HT3 */}
        <div className="rounded-lg bg-white border border-slate-300 p-2.5 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5 text-[#0f766e]" />
              Analógicas A1–A4 (%IW0..3) & 1-Wire HT1–HT3 (%IW4..6)
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[0, 1, 2, 3].map((ch) => {
              const val = analogs[ch] ?? 0;
              const pins = [36, 39, 34, 35];
              const volts = ((val / 4095) * 5).toFixed(2);
              return (
                <div
                  key={ch}
                  className="p-1.5 rounded bg-slate-50 border border-slate-200 flex flex-col gap-1"
                >
                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span className="text-slate-800 font-bold">
                      A{ch + 1} (%IW{ch}·G{pins[ch]})
                    </span>
                    <span className="text-[#0f766e] font-bold">
                      {val} ({volts}V)
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={4095}
                    value={val}
                    onChange={(e) => setAnalogChannel(ch, Number(e.target.value))}
                    className="w-full accent-[#0f766e] cursor-pointer h-1.5"
                  />
                </div>
              );
            })}
          </div>

          {/* 1-Wire DS18B20 / DHT22 Sensor Simulator */}
          <div className="pt-1.5 border-t border-slate-200 flex items-center justify-between gap-2 text-[11px]">
            <span className="flex items-center gap-1 font-medium text-slate-700">
              <Thermometer className="w-3.5 h-3.5 text-[#ea580c]" />
              HT1 DS18B20 (%IW4 · GPIO32):
            </span>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={1000}
                value={analogs[4] ?? 245}
                onChange={(e) => setAnalogChannel(4, Number(e.target.value))}
                className="w-24 accent-[#ea580c] cursor-pointer h-1.5"
              />
              <span className="font-mono font-bold text-[#ea580c] w-14 text-right">
                {((analogs[4] ?? 245) / 10).toFixed(1)} °C
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
