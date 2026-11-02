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
} from 'lucide-react';
import { usePLCStore } from '../store/usePLCStore';
import { indexToIECAddress } from '../utils/defaultProgram';

export const BoardSimulator: React.FC = () => {
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

  // Calculate the active-low 8-bit register values on the 4 PCF8574 I2C expanders (0 = ON, 1 = OFF)
  const calcPcfByteHex = (bits: boolean[], offset: number): string => {
    let byteVal = 0xff;
    for (let b = 0; b < 8; b++) {
      if (bits[offset + b]) {
        byteVal &= ~(1 << b); // Active low on KC868-A16 PCF8574
      }
    }
    return '0x' + byteVal.toString(16).toUpperCase().padStart(2, '0');
  };

  const pcfIn1Hex = calcPcfByteHex(inputs, 0);   // 0x22 (DI1..DI8)
  const pcfIn2Hex = calcPcfByteHex(inputs, 8);   // 0x21 (DI9..DI16)
  const pcfOut1Hex = calcPcfByteHex(outputs, 0); // 0x24 (DO1..DO8)
  const pcfOut2Hex = calcPcfByteHex(outputs, 8); // 0x25 (DO9..DO16)

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
        addLog('WS', `Intentando conexión WebSocket a ${hwConfig.wsUrl}...`);
        const ws = new WebSocket(hwConfig.wsUrl);
        ws.onopen = () => {
          setHwConnected(true);
        };
        ws.onmessage = (ev) => {
          try {
            const data = JSON.parse(String(ev.data));
            if (Array.isArray(data.ix) && Array.isArray(data.qx)) {
              applyHardwareTelemetry(data.ix, data.qx, data.iw);
            }
          } catch {
            // Ignore malformed frame
          }
        };
        ws.onerror = () => {
          addLog(
            'WARN',
            `No se detectó servidor WebSocket en ${hwConfig.wsUrl}. Continuando en modo Simulador Virtual KC868-A16.`
          );
          setHwConnected(false);
        };
        ws.onclose = () => {
          setHwConnected(false);
        };
        wsRef.current = ws;
      } catch {
        addLog('ERROR', 'URL WebSocket inválida.');
      }
    } else {
      // Web Serial API connection to USB-C CH340 on KinCony KC868-A16
      const nav = navigator as unknown as {
        serial?: { requestPort: () => Promise<{ open: (opts: { baudRate: number }) => Promise<void> }> };
      };
      if (!nav.serial) {
        addLog('WARN', 'Web Serial API requiere Chrome/Edge de escritorio. Usando simulador virtual.');
        return;
      }
      try {
        const port = await nav.serial.requestPort();
        await port.open({ baudRate: 115200 });
        setHwConnected(true);
        addLog('WS', 'Puerto USB-Serial CH340 (115200 bps) abierto con KinCony KC868-A16.');
      } catch {
        addLog('WARN', 'Selección de puerto USB-Serial cancelada por el usuario.');
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 border-l border-slate-800 select-none overflow-y-auto">
      {/* Board Header */}
      <div className="px-3.5 py-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-100">
                KinCony KC868-A16
              </h2>
              <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-slate-800 text-emerald-300 border border-slate-700">
                ESP32 + 4×PCF8574
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-mono">
              SDA=GPIO{hwConfig.i2cSdaPin} · SCL=GPIO{hwConfig.i2cSclPin} · LAN8720 ETH
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowHwConfig(!showHwConfig)}
            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] text-slate-300 cursor-pointer"
          >
            Red / I2C
          </button>
          <button
            onClick={handleConnectHardware}
            className={`px-2.5 py-1 rounded text-[11px] font-semibold flex items-center gap-1 border cursor-pointer transition-colors ${
              hwConnected
                ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300'
                : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
            }`}
          >
            {hwConnected ? (
              <>
                <Unplug className="w-3.5 h-3.5 text-emerald-400" />
                <span>Online</span>
              </>
            ) : (
              <>
                <Wifi className="w-3.5 h-3.5 text-sky-400" />
                <span>Conectar Placa</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Collapsible Hardware Link & I2C Config */}
      {showHwConfig && (
        <div className="p-3 bg-slate-900/90 border-b border-slate-800 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-300">Enlace Físico ESP32 (OpenPLC HAL)</span>
            <div className="flex gap-1">
              <button
                onClick={() => updateHwConfig({ transport: 'websocket' })}
                className={`px-2 py-0.5 rounded text-[11px] flex items-center gap-1 cursor-pointer ${
                  hwConfig.transport === 'websocket'
                    ? 'bg-sky-600 text-white'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                <Wifi className="w-3 h-3" /> WebSocket
              </button>
              <button
                onClick={() => updateHwConfig({ transport: 'serial' })}
                className={`px-2 py-0.5 rounded text-[11px] flex items-center gap-1 cursor-pointer ${
                  hwConfig.transport === 'serial'
                    ? 'bg-sky-600 text-white'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                <Usb className="w-3 h-3" /> USB Serial (CH340)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-0.5 text-[11px] text-slate-400">
              <span>WebSocket URL (ESP32):</span>
              <input
                type="text"
                value={hwConfig.wsUrl}
                onChange={(e) => updateHwConfig({ wsUrl: e.target.value })}
                className="px-2 py-1 rounded bg-slate-950 border border-slate-700 text-slate-200 font-mono"
              />
            </label>
            <label className="flex flex-col gap-0.5 text-[11px] text-slate-400">
              <span>Modbus TCP IP (Puerto 502):</span>
              <input
                type="text"
                value={hwConfig.modbusIp}
                onChange={(e) => updateHwConfig({ modbusIp: e.target.value })}
                className="px-2 py-1 rounded bg-slate-950 border border-slate-700 text-slate-200 font-mono"
              />
            </label>
          </div>
        </div>
      )}

      <div className="p-3.5 space-y-4">
        {/* Live I2C PCF8574 Bus Register Monitor */}
        <div className="rounded-lg bg-slate-900/90 border border-slate-800 p-2.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-sky-400" />
              Bus I2C PCF8574 (Lógica Activa-Baja: 0=ON, 1=OFF)
            </span>
            <span className="text-[10px] font-mono text-slate-500">400 kHz</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5 text-center font-mono text-xs">
            <div className="p-1.5 rounded bg-slate-950 border border-slate-800">
              <div className="text-[10px] text-slate-400">DI1..8 ({hwConfig.pcfIn1Addr})</div>
              <div className="text-emerald-400 font-bold mt-0.5">{pcfIn1Hex}</div>
            </div>
            <div className="p-1.5 rounded bg-slate-950 border border-slate-800">
              <div className="text-[10px] text-slate-400">DI9..16 ({hwConfig.pcfIn2Addr})</div>
              <div className="text-emerald-400 font-bold mt-0.5">{pcfIn2Hex}</div>
            </div>
            <div className="p-1.5 rounded bg-slate-950 border border-slate-800">
              <div className="text-[10px] text-slate-400">DO1..8 ({hwConfig.pcfOut1Addr})</div>
              <div className="text-amber-400 font-bold mt-0.5">{pcfOut1Hex}</div>
            </div>
            <div className="p-1.5 rounded bg-slate-950 border border-slate-800">
              <div className="text-[10px] text-slate-400">DO9..16 ({hwConfig.pcfOut2Addr})</div>
              <div className="text-amber-400 font-bold mt-0.5">{pcfOut2Hex}</div>
            </div>
          </div>
        </div>

        {/* 16 Relay / MOSFET Outputs (%QX0.0 .. %QX1.7) */}
        <div className="rounded-xl bg-[#0b2319] border-2 border-emerald-800/70 p-3 shadow-inner">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-200 flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-amber-400" />
              16 Salidas Digitales Relé / MOSFET (%QX0.0 – %QX1.7)
            </span>
            <span className="text-[10px] font-mono text-emerald-300/80">
              {outputs.filter(Boolean).length}/16 Activas
            </span>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {outputs.map((active, idx) => {
              const iecAddr = indexToIECAddress('%QX', idx);
              const tag = getTag(iecAddr);
              return (
                <div
                  key={iecAddr}
                  className={`rounded-md p-2 border transition-all flex flex-col justify-between ${
                    active
                      ? 'bg-amber-500/20 border-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.3)]'
                      : 'bg-slate-950/75 border-emerald-900/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono font-bold text-slate-200">
                      DO{idx + 1}
                    </span>
                    <span
                      className={`w-2.5 h-2.5 rounded-full transition-all ${
                        active
                          ? 'bg-amber-400 shadow-[0_0_8px_#fbbf24]'
                          : 'bg-slate-800 border border-slate-700'
                      }`}
                    />
                  </div>
                  <div className="text-[10px] font-mono text-amber-300/90 mt-0.5">{iecAddr}</div>
                  <div className="text-[9px] text-slate-400 truncate mt-0.5" title={tag}>
                    {tag || '—'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 16 Opto-Isolated Digital Inputs (%IX0.0 .. %IX1.7) */}
        <div className="rounded-xl bg-[#0b2319] border-2 border-emerald-800/70 p-3 shadow-inner">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-200">
              16 Entradas Optoacopladas (%IX0.0 – %IX1.7)
            </span>
            <span className="text-[10px] text-emerald-300/80">
              Clic = Activar · Icono = Pulsador / Interruptor
            </span>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {inputs.map((active, idx) => {
              const iecAddr = indexToIECAddress('%IX', idx);
              const isMomentary = momentaryMask[idx];
              const tag = getTag(iecAddr);

              return (
                <div
                  key={iecAddr}
                  className={`rounded-md p-2 border transition-all flex flex-col justify-between ${
                    active
                      ? 'bg-emerald-500/25 border-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.35)]'
                      : 'bg-slate-950/80 border-emerald-900/60 hover:border-emerald-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-mono font-bold text-slate-200">
                      DI{idx + 1}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleMomentaryMode(idx);
                      }}
                      title={
                        isMomentary
                          ? 'Modo Pulsador Momentáneo (Mantener presionado)'
                          : 'Modo Interruptor Mantenido (Clic alterna ON/OFF)'
                      }
                      className="p-0.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 cursor-pointer"
                    >
                      {isMomentary ? (
                        <Hand className="w-3 h-3 text-sky-400" />
                      ) : (
                        <ToggleLeft className="w-3 h-3 text-emerald-400" />
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
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-slate-900 hover:bg-slate-800 text-emerald-300 border border-slate-800'
                    }`}
                  >
                    {iecAddr}
                  </button>

                  <div className="text-[9px] text-slate-400 truncate mt-1" title={tag}>
                    {tag || (isMomentary ? 'Pulsador NA' : 'Interruptor')}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 4 Analog Inputs A1..A4 (ADC1 GPIO 36, 39, 34, 35) */}
        <div className="rounded-lg bg-slate-900/90 border border-slate-800 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5 text-cyan-400" />
              Entradas Analógicas KC868-A16 (%IW0 – %IW3 · 12-bit ADC)
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {analogs.map((val, ch) => {
              const pins = [36, 39, 34, 35];
              const volts = ((val / 4095) * 5).toFixed(2);
              return (
                <div
                  key={ch}
                  className="p-2 rounded bg-slate-950 border border-slate-800 flex flex-col gap-1"
                >
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="text-cyan-300 font-bold">
                      A{ch + 1} (%IW{ch} · GPIO{pins[ch]})
                    </span>
                    <span className="text-slate-300">
                      {val} ({volts}V)
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={4095}
                    value={val}
                    onChange={(e) => setAnalogChannel(ch, Number(e.target.value))}
                    className="w-full accent-cyan-400 cursor-pointer h-1.5"
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
