import React, { useState } from 'react';
import {
  Table,
  Terminal,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Unlock,
  Plus,
  Trash2,
} from 'lucide-react';
import { usePLCStore } from '../store/usePLCStore';
import { iecAddressToIndex } from '../utils/defaultProgram';

export const BottomConsole: React.FC = () => {
  const {
    symbols,
    inputs,
    outputs,
    markers,
    words,
    timers,
    counters,
    diagnostics,
    logs,
    updateSymbol,
    addSymbol,
    toggleForceVariable,
    clearLogs,
  } = usePLCStore();

  const [activeTab, setActiveTab] = useState<'watch' | 'diagnostics' | 'logs'>('watch');
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
    if (address.toUpperCase().startsWith('%MW')) {
      const idx = parseInt(address.slice(3), 10);
      return String(words[idx] ?? 0);
    }
    return 'FALSE (0)';
  };

  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;

  return (
    <div className="flex flex-col h-56 bg-slate-950 border-t border-slate-800 select-none">
      {/* Tab Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('watch')}
            className={`px-3 py-1 rounded text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors ${
              activeTab === 'watch'
                ? 'bg-slate-800 text-emerald-300 border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Table className="w-3.5 h-3.5" />
            <span>Tabla de Símbolos & Forzado ({symbols.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('diagnostics')}
            className={`px-3 py-1 rounded text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors ${
              activeTab === 'diagnostics'
                ? 'bg-slate-800 text-amber-300 border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Diagnósticos IEC</span>
            {errorCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-rose-600 text-white text-[10px]">
                {errorCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`px-3 py-1 rounded text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors ${
              activeTab === 'logs'
                ? 'bg-slate-800 text-sky-300 border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Consola Runtime ({logs.length})</span>
          </button>
        </div>

        {/* Right summary of FB states */}
        <div className="hidden lg:flex items-center gap-3 text-[11px] font-mono text-slate-400">
          <span>
            T0: <strong className="text-amber-300">{Math.round(timers.T0?.ET ?? 0)}ms</strong> /{' '}
            {timers.T0?.PT ?? 2500}ms
          </span>
          <span>
            C0: <strong className="text-cyan-300">{counters.C0?.CV ?? 0}</strong> /{' '}
            {counters.C0?.PV ?? 5}
          </span>
          {activeTab === 'logs' && (
            <button
              onClick={clearLogs}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3 h-3" /> Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'watch' && (
          <div className="p-2">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] text-slate-400 uppercase">
                  <th className="py-1.5 px-2">Dirección IEC</th>
                  <th className="py-1.5 px-2">Símbolo / Tag</th>
                  <th className="py-1.5 px-2">Tipo</th>
                  <th className="py-1.5 px-2">Valor en Vivo</th>
                  <th className="py-1.5 px-2">Forzado Hardware</th>
                  <th className="py-1.5 px-2">Comentario</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900 font-mono">
                {symbols.map((sym) => {
                  const liveVal = getLiveValue(sym.address);
                  const isTrue = liveVal.startsWith('TRUE');
                  return (
                    <tr key={sym.address} className="hover:bg-slate-900/50">
                      <td className="py-1 px-2 font-bold text-sky-300">{sym.address}</td>
                      <td className="py-1 px-2">
                        <input
                          type="text"
                          value={sym.name}
                          onChange={(e) =>
                            updateSymbol(sym.address, {
                              name: e.target.value.toUpperCase().replace(/\s+/g, '_'),
                            })
                          }
                          className="bg-transparent border-b border-transparent focus:border-emerald-500 text-slate-200 focus:outline-none w-36"
                        />
                      </td>
                      <td className="py-1 px-2 text-slate-400">{sym.type}</td>
                      <td className="py-1 px-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[11px] ${
                            isTrue
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : 'bg-slate-900 text-slate-400'
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
                                  ? 'bg-amber-500 text-slate-950 font-bold'
                                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                              }`}
                            >
                              F:1
                            </button>
                            <button
                              onClick={() => toggleForceVariable(sym.address, false)}
                              className={`px-1.5 py-0.5 rounded text-[10px] cursor-pointer ${
                                sym.forced && sym.forcedValue === false
                                  ? 'bg-rose-500 text-white font-bold'
                                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                              }`}
                            >
                              F:0
                            </button>
                            {sym.forced && (
                              <button
                                onClick={() =>
                                  updateSymbol(sym.address, {
                                    forced: false,
                                    forcedValue: undefined,
                                  })
                                }
                                className="p-0.5 text-amber-400 hover:text-slate-200 cursor-pointer"
                                title="Liberar forzado"
                              >
                                <Lock className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {!sym.forced && (
                              <Unlock className="w-3 h-3 text-slate-600 ml-0.5" />
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-1 px-2 font-sans text-slate-400">
                        <input
                          type="text"
                          value={sym.comment}
                          onChange={(e) => updateSymbol(sym.address, { comment: e.target.value })}
                          className="bg-transparent border-b border-transparent focus:border-emerald-500 text-slate-400 focus:text-slate-200 focus:outline-none w-full"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Add new symbol inline */}
            <div className="mt-2 pt-2 border-t border-slate-900 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-400 text-[11px]">Agregar Símbolo:</span>
              <input
                type="text"
                value={newAddr}
                onChange={(e) => setNewAddr(e.target.value.toUpperCase())}
                placeholder="%MX0.1"
                className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 font-mono text-sky-300 w-20"
              />
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value.toUpperCase())}
                placeholder="TAG_NAME"
                className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 font-mono text-slate-200 w-32"
              />
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Descripción..."
                className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300 w-48"
              />
              <button
                onClick={() =>
                  addSymbol({
                    address: newAddr,
                    name: newName,
                    type: newAddr.startsWith('%MW') ? 'INT' : 'BOOL',
                    comment: newComment,
                  })
                }
                className="px-2.5 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Añadir
              </button>
            </div>
          </div>
        )}

        {activeTab === 'diagnostics' && (
          <div className="p-3 space-y-1.5 font-mono text-xs">
            {diagnostics.length === 0 ? (
              <div className="flex items-center gap-2 text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                <span>Sin errores. Presiona "Compilar" para verificar el programa IEC 61131-3.</span>
              </div>
            ) : (
              diagnostics.map((d, i) => (
                <div
                  key={i}
                  className={`p-2 rounded border flex items-center gap-2 ${
                    d.severity === 'error'
                      ? 'bg-rose-950/40 border-rose-500/40 text-rose-300'
                      : d.severity === 'warning'
                      ? 'bg-amber-950/40 border-amber-500/40 text-amber-300'
                      : 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                  }`}
                >
                  <span className="uppercase font-bold">[{d.severity}]</span>
                  <span>{d.message}</span>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="p-2.5 space-y-1 font-mono text-xs">
            {logs.map((log) => (
              <div key={log.id} className="flex items-start gap-2 leading-relaxed">
                <span className="text-slate-500 shrink-0">[{log.timestamp}]</span>
                <span
                  className={`px-1 rounded text-[10px] font-bold shrink-0 ${
                    log.level === 'ERROR'
                      ? 'bg-rose-500/20 text-rose-300'
                      : log.level === 'WARN'
                      ? 'bg-amber-500/20 text-amber-300'
                      : log.level === 'SCAN'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : log.level === 'WS'
                      ? 'bg-sky-500/20 text-sky-300'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {log.level}
                </span>
                <span className="text-slate-300">{log.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
