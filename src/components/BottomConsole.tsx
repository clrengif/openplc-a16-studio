import React, { useState } from 'react';
import {
  Activity,
  Network,
  Table,
  AlertTriangle,
  Lock,
  Unlock,
  Plus,
  Trash2,
} from 'lucide-react';
import { usePLCStore } from '../store/usePLCStore';
import { iecAddressToIndex } from '../utils/defaultProgram';

const PROBE_CATALOG: { id: string; label: string; color: string; scaleMax: number; unit: string }[] = [
  { id: '%IX0.0', label: 'Marcha (%IX0.0)', color: '#0f766e', scaleMax: 1, unit: 'bit' },
  { id: '%QX0.0', label: 'Motor (%QX0.0)', color: '#0d9488', scaleMax: 1, unit: 'bit' },
  { id: '%QX0.1', label: 'Triángulo (%QX0.1)', color: '#2563eb', scaleMax: 1, unit: 'bit' },
  { id: 'T0.ET', label: 'Timer T0.ET', color: '#d97706', scaleMax: 2500, unit: 'ms' },
  { id: '%IW0', label: 'Presión A1 (%IW0)', color: '#ea580c', scaleMax: 4095, unit: 'ADC' },
  { id: '%MW0', label: 'Lote Modbus (%MW0)', color: '#7c3aed', scaleMax: 10, unit: 'cnt' },
];

export const BottomConsole: React.FC = () => {
  const {
    symbols,
    inputs,
    outputs,
    markers,
    words,
    analogs,
    oscSamples,
    activeProbes,
    networkTransactions,
    diagnostics,
    logs,
    toggleProbe,
    clearOscilloscope,
    sendModbusTCPRequest,
    sendModbusRTURequest,
    captureI2CBusFrames,
    updateSymbol,
    addSymbol,
    toggleForceVariable,
    clearLogs,
  } = usePLCStore();

  const [activeTab, setActiveTab] = useState<'osc' | 'net' | 'watch' | 'diag'>('osc');
  const [splitTraces, setSplitTraces] = useState(false);
  const [newAddr, setNewAddr] = useState('%MX0.1');
  const [newName, setNewName] = useState('AUX_FLAG');
  const [newComment, setNewComment] = useState('Marca auxiliar');

  const getLiveValue = (address: string): string => {
    const parsed = iecAddressToIndex(address);
    if (parsed) {
      if (parsed.prefix === '%IX') return inputs[parsed.index] ? 'TRUE (1)' : 'FALSE (0)';
      if (parsed.prefix === '%QX') return outputs[parsed.index] ? 'TRUE (1)' : 'FALSE (0)';
      if (parsed.prefix === '%MX') return markers[parsed.index] ? 'TRUE (1)' : 'FALSE (0)';
    }
    if (address.toUpperCase().startsWith('%IW')) {
      const idx = parseInt(address.slice(3), 10);
      return String(analogs[idx] ?? 0);
    }
    if (address.toUpperCase().startsWith('%MW')) {
      const idx = parseInt(address.slice(3), 10);
      return String(words[idx] ?? 0);
    }
    return 'FALSE (0)';
  };

  const latestSample = oscSamples[oscSamples.length - 1];

  return (
    <div className="flex flex-col h-64 bg-white border-t border-slate-300 select-none">
      {/* Simulino-style Bottom Bar Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 bg-[#f8fafc] border-b border-slate-300">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setActiveTab('osc')}
            className={`py-1 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'osc'
                ? 'border-[#0f766e] text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-[#0f766e]" />
            <span>Osciloscopio PLC</span>
          </button>

          <button
            onClick={() => setActiveTab('net')}
            className={`py-1 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'net'
                ? 'border-[#0f766e] text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Network className="w-3.5 h-3.5 text-[#0f766e]" />
            <span>Tramas de Red ({networkTransactions.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('watch')}
            className={`py-1 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'watch'
                ? 'border-[#0f766e] text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Table className="w-3.5 h-3.5 text-[#0f766e]" />
            <span>Símbolos y Forzado ({symbols.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('diag')}
            className={`py-1 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'diag'
                ? 'border-[#0f766e] text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            <span>Diagnósticos & Logs ({logs.length})</span>
          </button>
        </div>

        {/* Right Controls & Live Probe Readouts (Simulino style) */}
        <div className="flex items-center gap-2 text-xs">
          {activeTab === 'osc' && (
            <>
              <button
                onClick={() => setSplitTraces(!splitTraces)}
                className={`px-2.5 py-0.5 rounded border text-xs cursor-pointer ${
                  splitTraces
                    ? 'bg-[#0f766e] border-[#0f766e] text-white'
                    : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                }`}
              >
                Separar trazas
              </button>
              <button
                onClick={clearOscilloscope}
                className="px-2.5 py-0.5 rounded border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer"
              >
                Por defecto
              </button>
              <div className="hidden md:flex items-center gap-3 ml-2 font-mono text-xs">
                <span className="text-[#0f766e] font-bold">
                  %QX0.0: {latestSample?.signals['%QX0.0'] ?? 0}
                </span>
                <span className="text-[#ea580c] font-bold">
                  %IW0: {latestSample?.signals['%IW0'] ?? 1850} ({(((latestSample?.signals['%IW0'] ?? 1850) / 4095) * 5).toFixed(2)} V)
                </span>
              </div>
            </>
          )}

          {activeTab === 'net' && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => sendModbusTCPRequest(1, 0, 8)}
                className="px-2 py-0.5 rounded bg-[#0f766e] text-white text-[11px] font-medium cursor-pointer"
              >
                + Poll Modbus TCP
              </button>
              <button
                onClick={() => sendModbusRTURequest(3, 0, 4)}
                className="px-2 py-0.5 rounded bg-amber-600 text-white text-[11px] font-medium cursor-pointer"
              >
                + Poll RS485 RTU
              </button>
              <button
                onClick={captureI2CBusFrames}
                className="px-2 py-0.5 rounded bg-indigo-600 text-white text-[11px] font-medium cursor-pointer"
              >
                + Captura I²C
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tab 1: Simulino-style Oscilloscope & Logic Analyzer */}
      {activeTab === 'osc' && (
        <div className="flex-1 flex flex-col bg-white overflow-hidden">
          {/* Probes row ("SONDAS") */}
          <div className="px-3 py-1.5 border-b border-slate-100 flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1">
              SONDAS
            </span>
            {PROBE_CATALOG.map((probe) => {
              const active = activeProbes.includes(probe.id);
              return (
                <button
                  key={probe.id}
                  onClick={() => toggleProbe(probe.id)}
                  style={{
                    borderColor: active ? probe.color : '#cbd5e1',
                    backgroundColor: active ? `${probe.color}15` : '#ffffff',
                    color: active ? probe.color : '#64748b',
                  }}
                  className="px-2.5 py-0.5 rounded-full border text-xs font-semibold transition-all cursor-pointer"
                >
                  {probe.label}
                </button>
              );
            })}
          </div>

          {/* SVG Multi-Trace Plotter */}
          <div className="flex-1 relative px-2 py-1">
            <svg className="w-full h-full" viewBox="0 0 900 145" preserveAspectRatio="none">
              {/* Horizontal reference gridlines */}
              {[20, 55, 90, 125].map((y, idx) => (
                <g key={y}>
                  <line
                    x1={40}
                    y1={y}
                    x2={890}
                    y2={y}
                    stroke="#e2e8f0"
                    strokeDasharray="3 3"
                    strokeWidth={1}
                  />
                  <text
                    x={34}
                    y={y + 3}
                    textAnchor="end"
                    fontSize="10"
                    fill="#64748b"
                    fontFamily="monospace"
                  >
                    {['100%', '66%', '33%', '0V'][idx]}
                  </text>
                </g>
              ))}

              {/* Active probe waveforms */}
              {PROBE_CATALOG.filter((p) => activeProbes.includes(p.id)).map((probe, pIdx, arr) => {
                if (oscSamples.length < 2) return null;
                const bandCount = splitTraces ? arr.length : 1;
                const bandHeight = 110 / bandCount;
                const bandTop = splitTraces ? 15 + pIdx * bandHeight : 15;
                const bandBottom = bandTop + bandHeight - (splitTraces ? 6 : 0);

                const points = oscSamples
                  .map((s, idx) => {
                    const x = 42 + (idx / Math.max(1, oscSamples.length - 1)) * 845;
                    const rawVal = s.signals[probe.id] ?? 0;
                    const norm = Math.max(0, Math.min(1, rawVal / probe.scaleMax));
                    const y = bandBottom - norm * (bandBottom - bandTop);
                    return `${x.toFixed(1)},${y.toFixed(1)}`;
                  })
                  .join(' ');

                return (
                  <polyline
                    key={probe.id}
                    fill="none"
                    stroke={probe.color}
                    strokeWidth={1.8}
                    points={points}
                  />
                );
              })}
            </svg>
          </div>
        </div>
      )}

      {/* Tab 2: Industrial Network Frame Log */}
      {activeTab === 'net' && (
        <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5 font-mono text-xs bg-white">
          {networkTransactions.length === 0 ? (
            <div className="p-6 text-center text-slate-500 font-sans">
              Usa los botones superiores (<strong>+ Poll Modbus TCP</strong>, <strong>+ Poll RS485 RTU</strong> o <strong>+ Captura I²C</strong>) para inspeccionar tramas de red industrial en vivo.
            </div>
          ) : (
            networkTransactions.map((tx) => (
              <div
                key={tx.id}
                className="px-2.5 py-1.5 rounded border border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">[{tx.timestamp}]</span>
                  <span className="px-1.5 py-0.5 rounded bg-[#0f766e] text-white text-[10px] font-bold">
                    {tx.protocol}
                  </span>
                  <span className="font-bold text-slate-700">{tx.direction}:</span>
                  <span className="text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                    {tx.rawHex}
                  </span>
                </div>
                <span className="text-[11px] font-sans text-slate-600">{tx.summary}</span>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab 3: Watch & Force Table */}
      {activeTab === 'watch' && (
        <div className="flex-1 overflow-y-auto p-2 bg-white">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-300 text-[11px] text-slate-500 uppercase bg-slate-50">
                <th className="py-1 px-2">IEC 61131-3</th>
                <th className="py-1 px-2">Símbolo</th>
                <th className="py-1 px-2">Registro Modbus</th>
                <th className="py-1 px-2">Valor en Vivo</th>
                <th className="py-1 px-2">Forzado</th>
                <th className="py-1 px-2">Comentario</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-mono">
              {symbols.map((sym) => {
                const liveVal = getLiveValue(sym.address);
                const isTrue = liveVal.startsWith('TRUE');
                return (
                  <tr key={sym.address} className="hover:bg-slate-50">
                    <td className="py-1 px-2 font-bold text-[#0f766e]">{sym.address}</td>
                    <td className="py-1 px-2">
                      <input
                        type="text"
                        value={sym.name}
                        onChange={(e) =>
                          updateSymbol(sym.address, {
                            name: e.target.value.toUpperCase().replace(/\s+/g, '_'),
                          })
                        }
                        className="bg-transparent border-b border-transparent focus:border-[#0f766e] text-slate-800 font-semibold focus:outline-none w-36"
                      />
                    </td>
                    <td className="py-1 px-2 text-slate-500 text-[11px]">
                      {sym.modbusAddress || '—'}
                    </td>
                    <td className="py-1 px-2">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${
                          isTrue
                            ? 'bg-[#ccfbf1] text-[#0f766e] border border-[#0f766e]/30'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {liveVal}
                      </span>
                    </td>
                    <td className="py-1 px-2">
                      {sym.type === 'BOOL' && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => toggleForceVariable(sym.address, true)}
                            className={`px-1.5 py-0.5 rounded text-[10px] cursor-pointer ${
                              sym.forced && sym.forcedValue === true
                                ? 'bg-[#0f766e] text-white font-bold'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                            }`}
                          >
                            F:1
                          </button>
                          <button
                            onClick={() => toggleForceVariable(sym.address, false)}
                            className={`px-1.5 py-0.5 rounded text-[10px] cursor-pointer ${
                              sym.forced && sym.forcedValue === false
                                ? 'bg-rose-600 text-white font-bold'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                            }`}
                          >
                            F:0
                          </button>
                          {sym.forced ? (
                            <button
                              onClick={() =>
                                updateSymbol(sym.address, {
                                  forced: false,
                                  forcedValue: undefined,
                                })
                              }
                              className="p-0.5 text-amber-600 cursor-pointer"
                            >
                              <Lock className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <Unlock className="w-3 h-3 text-slate-400 ml-0.5" />
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-1 px-2 font-sans text-slate-600">
                      <input
                        type="text"
                        value={sym.comment}
                        onChange={(e) => updateSymbol(sym.address, { comment: e.target.value })}
                        className="bg-transparent w-full focus:outline-none"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="mt-2 pt-2 border-t border-slate-200 flex flex-wrap items-center gap-2 text-xs">
            <input
              type="text"
              value={newAddr}
              onChange={(e) => setNewAddr(e.target.value.toUpperCase())}
              className="px-2 py-0.5 rounded border border-slate-300 font-mono w-20"
            />
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value.toUpperCase())}
              className="px-2 py-0.5 rounded border border-slate-300 font-mono w-32"
            />
            <input
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              className="px-2 py-0.5 rounded border border-slate-300 w-48"
            />
            <button
              onClick={() =>
                addSymbol({
                  address: newAddr,
                  name: newName,
                  type: newAddr.startsWith('%MW') || newAddr.startsWith('%IW') ? 'INT' : 'BOOL',
                  comment: newComment,
                })
              }
              className="px-2.5 py-0.5 rounded bg-[#0f766e] text-white font-semibold flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Añadir Símbolo
            </button>
          </div>
        </div>
      )}

      {/* Tab 4: Diagnostics & Runtime Logs */}
      {activeTab === 'diag' && (
        <div className="flex-1 overflow-y-auto p-2.5 space-y-1 font-mono text-xs bg-white">
          <div className="flex justify-between items-center mb-1">
            <span className="font-sans font-semibold text-slate-600">
              Historial de Eventos & Compilador IEC 61131-3
            </span>
            <button
              onClick={clearLogs}
              className="px-2 py-0.5 rounded border border-slate-300 text-slate-600 flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3 h-3" /> Limpiar
            </button>
          </div>
          {diagnostics.map((d, i) => (
            <div
              key={`d-${i}`}
              className="px-2 py-1 rounded bg-teal-50 border border-teal-200 text-teal-900"
            >
              [{d.severity.toUpperCase()}] {d.message}
            </div>
          ))}
          {logs.map((log) => (
            <div key={log.id} className="flex items-start gap-2 text-slate-700">
              <span className="text-slate-400">[{log.timestamp}]</span>
              <span className="px-1.5 rounded bg-slate-200 text-slate-800 text-[10px] font-bold">
                {log.level}
              </span>
              <span>{log.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
