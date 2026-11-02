import React from 'react';
import {
  Plus,
  Trash2,
  GitBranch,
  Zap,
  Clock,
  Hash,
  CircleDot,
  ArrowRight,
  Code2,
} from 'lucide-react';
import { usePLCStore } from '../store/usePLCStore';
import { LadderElement, LadderElementType } from '../types/plc';

const ELEMENT_PALETTE: { type: LadderElementType; label: string; symbol: string; desc: string }[] = [
  { type: 'NO', label: 'Contacto NA', symbol: '--| |--', desc: 'Normalmente Abierto' },
  { type: 'NC', label: 'Contacto NC', symbol: '--|/|--', desc: 'Normalmente Cerrado' },
  { type: 'TON', label: 'Timer TON', symbol: '[TON]', desc: 'Retardo a la Conexión' },
  { type: 'TOF', label: 'Timer TOF', symbol: '[TOF]', desc: 'Retardo a la Desconexión' },
  { type: 'CTU', label: 'Contador CTU', symbol: '[CTU]', desc: 'Contador Ascendente' },
  { type: 'COIL', label: 'Bobina', symbol: '--( )--', desc: 'Salida Estándar' },
  { type: 'SET', label: 'Bobina SET', symbol: '--(S)--', desc: 'Enclavar Bit (Latch)' },
  { type: 'RESET', label: 'Bobina RST', symbol: '--(R)--', desc: 'Desenclavar Bit (Unlatch)' },
];

const QUICK_ADDRESSES = [
  '%IX0.0', '%IX0.1', '%IX0.2', '%IX0.3', '%IX0.4', '%IX0.5', '%IX0.6', '%IX0.7',
  '%IX1.0', '%IX1.1', '%IX1.2', '%IX1.3', '%IX1.4', '%IX1.5', '%IX1.6', '%IX1.7',
  '%QX0.0', '%QX0.1', '%QX0.2', '%QX0.3', '%QX0.4', '%QX0.5', '%QX0.6', '%QX0.7',
  '%QX1.0', '%QX1.1', '%QX1.2', '%QX1.3', '%QX1.4', '%QX1.5', '%QX1.6', '%QX1.7',
  '%MX0.0', '%MX0.1', '%MX0.2', '%MX0.3',
  'T0', 'T1', 'T2', 'C0', 'C1',
];

export const LadderEditor: React.FC = () => {
  const {
    rungs,
    timers,
    counters,
    symbols,
    isRunning,
    selectedRungId,
    selectedElementId,
    selectRung,
    selectElement,
    addRung,
    deleteRung,
    updateRungComment,
    addElementToRung,
    updateElement,
    deleteElement,
    toggleParallelBranch,
    syncLadderToST,
  } = usePLCStore();

  const activeRung = rungs.find((r) => r.id === selectedRungId) ?? rungs[0];
  const activeElement: LadderElement | undefined = activeRung
    ? [...activeRung.elements, ...(activeRung.branchElements ?? [])].find(
        (e) => e.id === selectedElementId
      )
    : undefined;

  const resolveSymbolicName = (address: string) => {
    const sym = symbols.find((s) => s.address.toUpperCase() === address.toUpperCase());
    return sym?.name;
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 select-none overflow-hidden">
      {/* Top Palette & Inspector Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-900/90 border-b border-slate-800">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mr-1">
            Insertar en Rung #{activeRung?.number ?? 1}:
          </span>
          {ELEMENT_PALETTE.map((item) => (
            <button
              key={item.type}
              onClick={() => activeRung && addElementToRung(activeRung.id, item.type)}
              title={`${item.label} — ${item.desc}`}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-emerald-500/50 text-xs font-mono text-slate-200 flex items-center gap-1 transition-colors cursor-pointer"
            >
              <span className="text-emerald-400 font-bold">{item.symbol}</span>
              <span className="hidden xl:inline text-[11px] font-sans text-slate-300">
                {item.label}
              </span>
            </button>
          ))}

          {activeRung && (
            <button
              onClick={() => toggleParallelBranch(activeRung.id, '%QX0.0')}
              title="Añadir o quitar rama paralela OR (Enclavamiento)"
              className={`px-2.5 py-1 rounded border text-xs flex items-center gap-1 transition-colors cursor-pointer ${
                activeRung.branchElements?.length
                  ? 'bg-emerald-950/60 border-emerald-500/60 text-emerald-300'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <GitBranch className="w-3.5 h-3.5" />
              <span>Rama OR</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={syncLadderToST}
            className="px-2.5 py-1 rounded bg-indigo-950/70 hover:bg-indigo-900/80 border border-indigo-500/40 text-indigo-200 text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Convertir este diagrama Ladder a código IEC 61131-3 Structured Text"
          >
            <Code2 className="w-3.5 h-3.5 text-indigo-400" />
            <span>Ladder → ST</span>
          </button>
          <button
            onClick={addRung}
            className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-semibold text-xs flex items-center gap-1 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nuevo Rung</span>
          </button>
        </div>
      </div>

      {/* Selected Element Property Inspector */}
      {activeRung && activeElement && (
        <div className="flex flex-wrap items-center gap-3 px-3 py-1.5 bg-slate-900/60 border-b border-slate-800/80 text-xs">
          <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-mono font-semibold">
            {activeElement.type}
          </span>

          <label className="flex items-center gap-1.5 text-slate-300">
            <span>Dirección / Variable:</span>
            <input
              type="text"
              list="iec-addresses"
              value={activeElement.variable}
              onChange={(e) =>
                updateElement(activeRung.id, activeElement.id, {
                  variable: e.target.value.toUpperCase(),
                })
              }
              className="px-2 py-0.5 rounded bg-slate-950 border border-slate-700 text-emerald-300 font-mono w-28 focus:outline-none focus:border-emerald-500"
            />
            <datalist id="iec-addresses">
              {QUICK_ADDRESSES.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </label>

          <label className="flex items-center gap-1.5 text-slate-300">
            <span>Tag:</span>
            <input
              type="text"
              value={activeElement.label ?? ''}
              onChange={(e) =>
                updateElement(activeRung.id, activeElement.id, { label: e.target.value })
              }
              placeholder="Etiqueta..."
              className="px-2 py-0.5 rounded bg-slate-950 border border-slate-700 text-slate-200 font-mono w-32 focus:outline-none focus:border-emerald-500"
            />
          </label>

          {(activeElement.type === 'TON' || activeElement.type === 'TOF') && (
            <label className="flex items-center gap-1.5 text-slate-300">
              <span>Preset PT (ms):</span>
              <input
                type="number"
                step={100}
                min={100}
                value={activeElement.presetMs ?? 2000}
                onChange={(e) =>
                  updateElement(activeRung.id, activeElement.id, {
                    presetMs: Math.max(50, Number(e.target.value)),
                  })
                }
                className="px-2 py-0.5 rounded bg-slate-950 border border-slate-700 text-amber-300 font-mono w-24 focus:outline-none focus:border-emerald-500"
              />
            </label>
          )}

          {activeElement.type === 'CTU' && (
            <>
              <label className="flex items-center gap-1.5 text-slate-300">
                <span>Meta PV:</span>
                <input
                  type="number"
                  min={1}
                  value={activeElement.presetCount ?? 5}
                  onChange={(e) =>
                    updateElement(activeRung.id, activeElement.id, {
                      presetCount: Math.max(1, Number(e.target.value)),
                    })
                  }
                  className="px-2 py-0.5 rounded bg-slate-950 border border-slate-700 text-cyan-300 font-mono w-16 focus:outline-none focus:border-emerald-500"
                />
              </label>
              <label className="flex items-center gap-1.5 text-slate-300">
                <span>Reset (R):</span>
                <input
                  type="text"
                  list="iec-addresses"
                  value={activeElement.resetVariable ?? '%IX0.3'}
                  onChange={(e) =>
                    updateElement(activeRung.id, activeElement.id, {
                      resetVariable: e.target.value.toUpperCase(),
                    })
                  }
                  className="px-2 py-0.5 rounded bg-slate-950 border border-slate-700 text-rose-300 font-mono w-24 focus:outline-none focus:border-emerald-500"
                />
              </label>
            </>
          )}

          <button
            onClick={() => deleteElement(activeRung.id, activeElement.id)}
            className="ml-auto px-2 py-0.5 rounded bg-rose-950/60 hover:bg-rose-900/70 border border-rose-500/40 text-rose-200 flex items-center gap-1 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Eliminar bloque</span>
          </button>
        </div>
      )}

      {/* Ladder Diagram Canvas */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {rungs.map((rung) => {
          const isSelectedRung = rung.id === selectedRungId;
          const contactsAndFbs = rung.elements.filter(
            (e) => e.type !== 'COIL' && e.type !== 'SET' && e.type !== 'RESET'
          );
          const coils = rung.elements.filter(
            (e) => e.type === 'COIL' || e.type === 'SET' || e.type === 'RESET'
          );

          return (
            <div
              key={rung.id}
              onClick={() => selectRung(rung.id)}
              className={`rounded-lg border transition-all ${
                isSelectedRung
                  ? 'border-emerald-500/60 bg-slate-900/70 shadow-lg shadow-emerald-950/20'
                  : 'border-slate-800 bg-slate-900/35 hover:border-slate-700'
              }`}
            >
              {/* Rung Header */}
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-800/80 bg-slate-900/80 rounded-t-lg">
                <div className="flex items-center gap-2 flex-1">
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold ${
                      rung.energized
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    RUNG {String(rung.number).padStart(2, '0')}
                  </span>
                  <input
                    type="text"
                    value={rung.comment}
                    onChange={(e) => updateRungComment(rung.id, e.target.value)}
                    className="flex-1 bg-transparent text-xs text-slate-300 focus:outline-none focus:text-white"
                    placeholder="Comentario técnico del rung..."
                  />
                </div>
                <div className="flex items-center gap-2">
                  {rung.energized && (
                    <span className="flex items-center gap-1 text-[11px] font-mono text-emerald-400">
                      <Zap className="w-3 h-3 fill-emerald-400" />
                      ENERGIZADO
                    </span>
                  )}
                  {rungs.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteRung(rung.id);
                      }}
                      className="p-1 rounded hover:bg-rose-950/70 text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                      title="Eliminar Rung"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Rung Schematic Row */}
              <div className="relative flex items-center min-h-[116px] px-2 py-4 overflow-x-auto">
                {/* Left Power Rail (L+) */}
                <div
                  className={`w-2 self-stretch rounded-full mr-1 transition-colors ${
                    isRunning ? 'bg-emerald-400 shadow-[0_0_10px_#34d399]' : 'bg-slate-600'
                  }`}
                  title="Riel de Alimentación Izquierdo (+24V DC)"
                />

                {/* Incoming wire from left rail */}
                <div
                  className={`w-6 h-0.5 transition-colors ${
                    isRunning ? 'bg-emerald-400' : 'bg-slate-600'
                  }`}
                />

                {/* Contacts & Function Blocks */}
                <div className="flex items-center">
                  {contactsAndFbs.map((el, idx) => {
                    const isSelected = el.id === selectedElementId;
                    const symTag = resolveSymbolicName(el.variable) || el.label || el.type;
                    const hasBranchHere = idx === 0 && rung.branchElements && rung.branchElements.length > 0;

                    const tState =
                      el.type === 'TON' || el.type === 'TOF'
                        ? timers[el.variable.toUpperCase()]
                        : undefined;
                    const cState =
                      el.type === 'CTU' ? counters[el.variable.toUpperCase()] : undefined;

                    return (
                      <div key={el.id} className="relative flex items-center">
                        <div className="flex flex-col items-center">
                          {/* Main element node */}
                          <div className="flex items-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                selectElement(rung.id, el.id);
                              }}
                              className={`group relative flex flex-col items-center px-3 py-2 rounded-md border transition-all cursor-pointer ${
                                isSelected
                                  ? 'ring-2 ring-amber-400 bg-slate-800 border-amber-400'
                                  : el.energized
                                  ? 'bg-emerald-950/60 border-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.25)]'
                                  : 'bg-slate-900 border-slate-700 hover:border-slate-500'
                              }`}
                            >
                              {/* Symbolic Tag */}
                              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-tight mb-0.5">
                                {symTag}
                              </span>

                              {/* IEC Address */}
                              <span
                                className={`text-xs font-mono font-bold ${
                                  el.energized ? 'text-emerald-300' : 'text-sky-300'
                                }`}
                              >
                                {el.variable}
                              </span>

                              {/* Graphic Symbol */}
                              {el.type === 'NO' && (
                                <div className="mt-1 font-mono text-sm font-bold tracking-widest text-slate-200">
                                  ─┤ ├─
                                </div>
                              )}
                              {el.type === 'NC' && (
                                <div className="mt-1 font-mono text-sm font-bold tracking-widest text-amber-300">
                                  ─┤/├─
                                </div>
                              )}
                              {(el.type === 'TON' || el.type === 'TOF') && (
                                <div className="mt-1.5 w-32 bg-slate-950/90 rounded p-1.5 border border-slate-800 text-left">
                                  <div className="flex items-center justify-between text-[10px] font-mono text-amber-300">
                                    <span className="flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      {el.type}
                                    </span>
                                    <span>Q={tState?.Q ? '1' : '0'}</span>
                                  </div>
                                  <div className="text-[10px] font-mono text-slate-300 mt-1 flex justify-between">
                                    <span>ET: {Math.round(tState?.ET ?? 0)}ms</span>
                                    <span>PT: {el.presetMs ?? 2000}ms</span>
                                  </div>
                                  <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden mt-1">
                                    <div
                                      className="h-full bg-amber-400 transition-all duration-75"
                                      style={{
                                        width: `${Math.min(
                                          100,
                                          ((tState?.ET ?? 0) / (el.presetMs ?? 2000)) * 100
                                        )}%`,
                                      }}
                                    />
                                  </div>
                                </div>
                              )}
                              {el.type === 'CTU' && (
                                <div className="mt-1.5 w-32 bg-slate-950/90 rounded p-1.5 border border-slate-800 text-left">
                                  <div className="flex items-center justify-between text-[10px] font-mono text-cyan-300">
                                    <span className="flex items-center gap-1">
                                      <Hash className="w-3 h-3" />
                                      CTU
                                    </span>
                                    <span>Q={cState?.Q ? '1' : '0'}</span>
                                  </div>
                                  <div className="text-[10px] font-mono text-slate-300 mt-1 flex justify-between">
                                    <span>CV: {cState?.CV ?? 0}</span>
                                    <span>PV: {el.presetCount ?? 5}</span>
                                  </div>
                                  <div className="text-[9px] font-mono text-rose-300/90 mt-0.5">
                                    R: {el.resetVariable || 'FALSE'}
                                  </div>
                                </div>
                              )}
                            </button>

                            {/* Outgoing wire from this contact */}
                            <div
                              className={`w-8 h-0.5 transition-colors ${
                                el.powerOut
                                  ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]'
                                  : 'bg-slate-700'
                              }`}
                            />
                          </div>

                          {/* Parallel OR Branch under first contact */}
                          {hasBranchHere && rung.branchElements && (
                            <div className="mt-2 flex items-center relative">
                              {/* Left vertical drop wire */}
                              <div
                                className={`w-0.5 h-10 -mt-6 mr-2 ${
                                  isRunning ? 'bg-emerald-400' : 'bg-slate-600'
                                }`}
                              />
                              {rung.branchElements.map((bEl) => {
                                const bSelected = bEl.id === selectedElementId;
                                const bTag =
                                  resolveSymbolicName(bEl.variable) || bEl.label || 'OR_BRANCH';
                                return (
                                  <button
                                    key={bEl.id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      selectElement(rung.id, bEl.id);
                                    }}
                                    className={`px-2.5 py-1 rounded border text-xs font-mono flex flex-col items-center cursor-pointer ${
                                      bSelected
                                        ? 'ring-2 ring-amber-400 bg-slate-800 border-amber-400'
                                        : bEl.energized
                                        ? 'bg-emerald-950/70 border-emerald-400 text-emerald-300'
                                        : 'bg-slate-900 border-slate-700 text-sky-300'
                                    }`}
                                  >
                                    <span className="text-[9px] text-slate-400 font-sans">
                                      {bTag}
                                    </span>
                                    <span className="font-bold">{bEl.variable}</span>
                                    <span className="text-[11px] text-slate-200">
                                      {bEl.type === 'NC' ? '─┤/├─' : '─┤ ├─'}
                                    </span>
                                  </button>
                                );
                              })}
                              {/* Right vertical rise wire */}
                              <div
                                className={`w-0.5 h-10 -mt-6 ml-2 ${
                                  rung.branchElements[0]?.powerOut
                                    ? 'bg-emerald-400'
                                    : 'bg-slate-700'
                                }`}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Horizontal bus connecting contacts to coils on the right */}
                <div
                  className={`flex-1 min-w-[36px] h-0.5 transition-colors ${
                    rung.energized
                      ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                      : 'bg-slate-700'
                  }`}
                />

                {/* Output Coils on Right Side */}
                <div className="flex items-center gap-2">
                  {coils.map((coil) => {
                    const isSelected = coil.id === selectedElementId;
                    const symTag = resolveSymbolicName(coil.variable) || coil.label || coil.type;
                    const coilGlyph =
                      coil.type === 'SET'
                        ? '─( S )─'
                        : coil.type === 'RESET'
                        ? '─( R )─'
                        : '─(   )─';

                    return (
                      <div key={coil.id} className="flex items-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            selectElement(rung.id, coil.id);
                          }}
                          className={`flex flex-col items-center px-3.5 py-2 rounded-md border transition-all cursor-pointer ${
                            isSelected
                              ? 'ring-2 ring-amber-400 bg-slate-800 border-amber-400'
                              : coil.energized
                              ? 'bg-emerald-950/75 border-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.35)]'
                              : 'bg-slate-900 border-slate-700 hover:border-slate-500'
                          }`}
                        >
                          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-tight mb-0.5">
                            {symTag}
                          </span>
                          <span
                            className={`text-xs font-mono font-bold ${
                              coil.energized ? 'text-emerald-300' : 'text-amber-300'
                            }`}
                          >
                            {coil.variable}
                          </span>
                          <div
                            className={`mt-1 font-mono text-sm font-bold ${
                              coil.energized ? 'text-emerald-300' : 'text-slate-300'
                            }`}
                          >
                            {coilGlyph}
                          </div>
                        </button>
                        <div
                          className={`w-5 h-0.5 ${
                            coil.energized ? 'bg-emerald-400' : 'bg-slate-700'
                          }`}
                        />
                      </div>
                    );
                  })}
                </div>

                {/* Right Power Rail (N / 0V) */}
                <div
                  className="w-2 self-stretch rounded-full bg-slate-600 ml-1"
                  title="Riel Derecho Común (0V GND)"
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Quick Legend */}
      <div className="px-4 py-1.5 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <CircleDot className="w-3 h-3 text-emerald-400" />
            Haz clic en cualquier contacto o bobina para editar su dirección IEC (ej.{' '}
            <code className="text-emerald-300">%IX0.0</code>,{' '}
            <code className="text-amber-300">%QX0.0</code>)
          </span>
          <span className="hidden md:flex items-center gap-1">
            <ArrowRight className="w-3 h-3 text-sky-400" />
            Entradas KC868-A16: <code className="text-sky-300">%IX0.0..%IX1.7</code> | Relés:{' '}
            <code className="text-amber-300">%QX0.0..%QX1.7</code>
          </span>
        </div>
        <span className="font-mono text-slate-500">{rungs.length} Rungs activos</span>
      </div>
    </div>
  );
};
