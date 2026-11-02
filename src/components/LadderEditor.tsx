import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  GitBranch,
  Clock,
  Hash,
  Code2,
  Maximize2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { usePLCStore } from '../store/usePLCStore';
import { LadderElement } from '../types/plc';

const QUICK_ADDRESSES = [
  '%IX0.0', '%IX0.1', '%IX0.2', '%IX0.3', '%IX0.4', '%IX0.5', '%IX0.6', '%IX0.7',
  '%IX1.0', '%IX1.1', '%IX1.2', '%IX1.3', '%IX1.4', '%IX1.5', '%IX1.6', '%IX1.7',
  '%QX0.0', '%QX0.1', '%QX0.2', '%QX0.3', '%QX0.4', '%QX0.5', '%QX0.6', '%QX0.7',
  '%QX1.0', '%QX1.1', '%QX1.2', '%QX1.3', '%QX1.4', '%QX1.5', '%QX1.6', '%QX1.7',
  '%IW0', '%IW1', '%IW2', '%IW3', '%IW4',
  '%MW0', '%MW1', '%MW2', '%MW3',
  '%MX0.0', '%MX0.1',
  'T0', 'T1', 'T2', 'C0', 'C1', 'C2', 'C0.CV', 'T0.ET',
];

export const LadderEditor: React.FC = () => {
  const {
    rungs,
    timers,
    counters,
    analogs,
    words,
    symbols,
    isRunning,
    activeSheet,
    selectedRungId,
    selectedElementId,
    setActiveSheet,
    selectRung,
    selectElement,
    addRung,
    deleteRung,
    updateRungComment,
    updateElement,
    deleteElement,
    toggleParallelBranch,
    syncLadderToST,
  } = usePLCStore();

  const [zoom, setZoom] = useState(100);

  const visibleRungs =
    activeSheet === 0 ? rungs : rungs.filter((r) => (r.sheet ?? 1) === activeSheet);

  const activeRung = rungs.find((r) => r.id === selectedRungId) ?? visibleRungs[0] ?? rungs[0];
  const activeElement: LadderElement | undefined = activeRung
    ? [...activeRung.elements, ...(activeRung.branchElements ?? [])].find(
        (e) => e.id === selectedElementId
      )
    : undefined;

  const resolveSymbolicName = (address: string) => {
    const sym = symbols.find((s) => s.address.toUpperCase() === address.toUpperCase());
    return sym?.name;
  };

  const readLiveWordPreview = (addr: string): string => {
    const u = addr.toUpperCase();
    if (u.startsWith('%IW')) {
      const i = parseInt(u.slice(3), 10);
      return String(analogs[i] ?? 0);
    }
    if (u.startsWith('%MW')) {
      const i = parseInt(u.slice(3), 10);
      return String(words[i] ?? 0);
    }
    if (u === 'C0.CV') return String(counters.C0?.CV ?? 0);
    if (u === 'T0.ET') return String(Math.round(timers.T0?.ET ?? 0));
    return addr;
  };

  const isOutputCoilType = (t: string) =>
    ['COIL', 'NEG_COIL', 'SET', 'RESET', 'SR', 'RS'].includes(t);

  return (
    <div className="flex flex-col h-full bg-[#fbfcfd] select-none overflow-hidden relative">
      {/* Selected Element Property Bar (when a block is clicked) */}
      {activeRung && activeElement && (
        <div className="flex flex-wrap items-center gap-3 px-3 py-1.5 bg-[#f1f5f9] border-b border-slate-300 text-xs z-10">
          <span className="px-2 py-0.5 rounded bg-[#0f766e] text-white font-mono font-semibold text-[11px]">
            {activeElement.type}
          </span>

          <label className="flex items-center gap-1.5 text-slate-700 font-medium">
            <span>Variable / IN1:</span>
            <input
              type="text"
              list="iec-addresses-light"
              value={activeElement.variable}
              onChange={(e) =>
                updateElement(activeRung.id, activeElement.id, {
                  variable: e.target.value.toUpperCase(),
                })
              }
              className="px-2 py-0.5 rounded bg-white border border-slate-300 text-[#0f766e] font-mono font-bold w-28 focus:outline-none focus:border-[#0f766e]"
            />
            <datalist id="iec-addresses-light">
              {QUICK_ADDRESSES.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </label>

          <label className="flex items-center gap-1.5 text-slate-700 font-medium">
            <span>Etiqueta:</span>
            <input
              type="text"
              value={activeElement.label ?? ''}
              onChange={(e) =>
                updateElement(activeRung.id, activeElement.id, { label: e.target.value })
              }
              className="px-2 py-0.5 rounded bg-white border border-slate-300 text-slate-800 font-mono w-32 focus:outline-none focus:border-[#0f766e]"
            />
          </label>

          {(activeElement.type === 'TON' ||
            activeElement.type === 'TOF' ||
            activeElement.type === 'TP') && (
            <label className="flex items-center gap-1.5 text-slate-700 font-medium">
              <span>Preset PT (ms):</span>
              <input
                type="number"
                step={100}
                min={50}
                value={activeElement.presetMs ?? 2000}
                onChange={(e) =>
                  updateElement(activeRung.id, activeElement.id, {
                    presetMs: Math.max(50, Number(e.target.value)),
                  })
                }
                className="px-2 py-0.5 rounded bg-white border border-slate-300 text-amber-700 font-mono font-bold w-24 focus:outline-none focus:border-[#0f766e]"
              />
            </label>
          )}

          {(activeElement.type === 'CTU' ||
            activeElement.type === 'CTD' ||
            activeElement.type === 'CTUD') && (
            <>
              <label className="flex items-center gap-1.5 text-slate-700 font-medium">
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
                  className="px-2 py-0.5 rounded bg-white border border-slate-300 text-teal-800 font-mono font-bold w-16"
                />
              </label>
              <label className="flex items-center gap-1.5 text-slate-700 font-medium">
                <span>Reset/Load (R/LD):</span>
                <input
                  type="text"
                  list="iec-addresses-light"
                  value={activeElement.resetVariable ?? '%IX0.3'}
                  onChange={(e) =>
                    updateElement(activeRung.id, activeElement.id, {
                      resetVariable: e.target.value.toUpperCase(),
                    })
                  }
                  className="px-2 py-0.5 rounded bg-white border border-slate-300 text-rose-700 font-mono w-24"
                />
              </label>
            </>
          )}

          {(activeElement.type === 'SR' || activeElement.type === 'RS') && (
            <label className="flex items-center gap-1.5 text-slate-700 font-medium">
              <span>Entrada Reset (R/R1):</span>
              <input
                type="text"
                list="iec-addresses-light"
                value={activeElement.resetVariable ?? '%IX0.5'}
                onChange={(e) =>
                  updateElement(activeRung.id, activeElement.id, {
                    resetVariable: e.target.value.toUpperCase(),
                  })
                }
                className="px-2 py-0.5 rounded bg-white border border-slate-300 text-rose-700 font-mono w-24"
              />
            </label>
          )}

          {['EQ', 'NE', 'GT', 'GE', 'LT', 'LE', 'ADD', 'SUB', 'MUL', 'DIV'].includes(
            activeElement.type
          ) && (
            <label className="flex items-center gap-1.5 text-slate-700 font-medium">
              <span>Operando IN2:</span>
              <input
                type="text"
                list="iec-addresses-light"
                value={activeElement.auxVariable ?? '2500'}
                onChange={(e) =>
                  updateElement(activeRung.id, activeElement.id, {
                    auxVariable: e.target.value.toUpperCase(),
                  })
                }
                className="px-2 py-0.5 rounded bg-white border border-slate-300 text-indigo-700 font-mono font-bold w-24"
              />
            </label>
          )}

          {['ADD', 'SUB', 'MUL', 'DIV', 'MOVE'].includes(activeElement.type) && (
            <label className="flex items-center gap-1.5 text-slate-700 font-medium">
              <span>Destino (OUT):</span>
              <input
                type="text"
                list="iec-addresses-light"
                value={activeElement.destVariable ?? '%MW0'}
                onChange={(e) =>
                  updateElement(activeRung.id, activeElement.id, {
                    destVariable: e.target.value.toUpperCase(),
                  })
                }
                className="px-2 py-0.5 rounded bg-white border border-slate-300 text-amber-800 font-mono font-bold w-24"
              />
            </label>
          )}

          <button
            onClick={() => deleteElement(activeRung.id, activeElement.id)}
            className="ml-auto px-2.5 py-0.5 rounded bg-white hover:bg-rose-50 border border-rose-300 text-rose-700 font-medium flex items-center gap-1 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Eliminar</span>
          </button>
        </div>
      )}

      {/* Floating Zoom Controls (Simulino top-right style) */}
      <div className="absolute top-3 right-4 z-10 flex items-center gap-1 bg-white/95 border border-slate-300 rounded shadow-sm p-0.5">
        <button
          onClick={() => setZoom((z) => Math.min(125, z + 10))}
          className="p-1.5 hover:bg-slate-100 text-slate-700 rounded cursor-pointer"
          title="Acercar (+)"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setZoom((z) => Math.max(75, z - 10))}
          className="p-1.5 hover:bg-slate-100 text-slate-700 rounded cursor-pointer"
          title="Alejar (-)"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setZoom(100)}
          className="p-1.5 hover:bg-slate-100 text-slate-700 rounded cursor-pointer"
          title="Restablecer vista (100%)"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Main Dot-Grid Schematic Canvas */}
      <div className="flex-1 overflow-y-auto simulino-grid p-5 space-y-4">
        <div
          style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top left' }}
          className="space-y-4 transition-transform"
        >
          {visibleRungs.map((rung) => {
            const isSelectedRung = rung.id === selectedRungId;
            const contactsAndFbs = rung.elements.filter((e) => !isOutputCoilType(e.type));
            const coils = rung.elements.filter((e) => isOutputCoilType(e.type));

            return (
              <div
                key={rung.id}
                onClick={() => selectRung(rung.id)}
                className={`rounded-lg border transition-all bg-white/95 ${
                  isSelectedRung
                    ? 'border-[#0f766e] shadow-md ring-1 ring-[#0f766e]/20'
                    : 'border-slate-300 hover:border-slate-400 shadow-xs'
                }`}
              >
                {/* Rung Comment Header */}
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-200 bg-[#f8fafc] rounded-t-lg">
                  <div className="flex items-center gap-2 flex-1">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold ${
                        rung.energized
                          ? 'bg-[#0f766e] text-white'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      RED {String(rung.number).padStart(2, '0')}
                    </span>
                    <input
                      type="text"
                      value={rung.comment}
                      onChange={(e) => updateRungComment(rung.id, e.target.value)}
                      className="flex-1 bg-transparent text-xs font-medium text-slate-700 focus:outline-none focus:text-slate-950"
                      placeholder="Comentario de la red..."
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleParallelBranch(rung.id, '%QX0.0');
                      }}
                      className="px-2 py-0.5 rounded border border-slate-300 bg-white hover:bg-slate-100 text-[11px] text-slate-600 flex items-center gap-1 cursor-pointer"
                      title="Conmutar rama paralela OR"
                    >
                      <GitBranch className="w-3 h-3" /> Rama OR
                    </button>
                    {rungs.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteRung(rung.id);
                        }}
                        className="p-1 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600 cursor-pointer"
                        title="Eliminar Red"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Schematic Rung Wire Diagram */}
                <div className="relative flex items-center min-h-[108px] px-3 py-4 overflow-x-auto">
                  {/* Left Power Rail (+24V) */}
                  <div
                    className={`w-1.5 self-stretch rounded-full mr-0.5 ${
                      isRunning ? 'bg-[#0f766e]' : 'bg-slate-700'
                    }`}
                  />

                  {/* Incoming wire */}
                  <div
                    className={`w-6 h-0.5 ${
                      isRunning ? 'bg-[#0f766e]' : 'bg-slate-700'
                    }`}
                  />

                  {/* Contacts, Edge Detectors, Timers, Counters, Comparators & Math */}
                  <div className="flex items-center">
                    {contactsAndFbs.map((el, idx) => {
                      const isSelected = el.id === selectedElementId;
                      const symTag = resolveSymbolicName(el.variable) || el.label || el.type;
                      const hasBranchHere =
                        idx === 0 && rung.branchElements && rung.branchElements.length > 0;

                      const tState =
                        el.type === 'TON' || el.type === 'TOF' || el.type === 'TP'
                          ? timers[el.variable.toUpperCase()]
                          : undefined;
                      const cState =
                        el.type === 'CTU' || el.type === 'CTD' || el.type === 'CTUD'
                          ? counters[el.variable.toUpperCase()]
                          : undefined;

                      const isCmp = ['EQ', 'NE', 'GT', 'GE', 'LT', 'LE'].includes(el.type);
                      const isMath = ['ADD', 'SUB', 'MUL', 'DIV', 'MOVE'].includes(el.type);

                      const cmpSymbolMap: Record<string, string> = {
                        EQ: '==',
                        NE: '<>',
                        GT: '>',
                        GE: '>=',
                        LT: '<',
                        LE: '<=',
                      };

                      return (
                        <div key={el.id} className="relative flex items-center">
                          <div className="flex flex-col items-center">
                            <div className="flex items-center">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  selectElement(rung.id, el.id);
                                }}
                                className={`relative flex flex-col items-center px-3 py-1.5 rounded border transition-all cursor-pointer ${
                                  isSelected
                                    ? 'ring-2 ring-[#ea580c] bg-orange-50/50 border-[#ea580c]'
                                    : el.energized
                                    ? 'bg-[#ccfbf1]/55 border-[#0f766e] shadow-xs'
                                    : 'bg-white border-slate-300 hover:border-slate-500'
                                }`}
                              >
                                {/* Tag pill */}
                                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-tight">
                                  {symTag}
                                </span>

                                {/* IEC Address */}
                                <span
                                  className={`text-xs font-mono font-bold ${
                                    el.energized ? 'text-[#0f766e]' : 'text-slate-900'
                                  }`}
                                >
                                  {el.variable}
                                </span>

                                {/* Schematic Symbol */}
                                {el.type === 'NO' && (
                                  <div className="mt-0.5 font-mono text-sm font-bold text-slate-900">
                                    ─┤ ├─
                                  </div>
                                )}
                                {el.type === 'NC' && (
                                  <div className="mt-0.5 font-mono text-sm font-bold text-amber-700">
                                    ─┤/├─
                                  </div>
                                )}
                                {el.type === 'R_TRIG' && (
                                  <div className="mt-0.5 font-mono text-sm font-bold text-teal-800">
                                    ─┤P├─
                                  </div>
                                )}
                                {el.type === 'F_TRIG' && (
                                  <div className="mt-0.5 font-mono text-sm font-bold text-indigo-800">
                                    ─┤N├─
                                  </div>
                                )}

                                {(el.type === 'TON' || el.type === 'TOF' || el.type === 'TP') && (
                                  <div className="mt-1 w-32 bg-slate-50 rounded p-1.5 border border-slate-200 text-left">
                                    <div className="flex items-center justify-between text-[10px] font-mono font-bold text-[#0f766e]">
                                      <span className="flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        {el.type}
                                      </span>
                                      <span>Q={tState?.Q ? '1' : '0'}</span>
                                    </div>
                                    <div className="text-[10px] font-mono text-slate-600 mt-0.5 flex justify-between">
                                      <span>ET:{Math.round(tState?.ET ?? 0)}ms</span>
                                      <span>PT:{el.presetMs ?? 2000}ms</span>
                                    </div>
                                    <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden mt-1">
                                      <div
                                        className="h-full bg-[#0f766e] transition-all duration-75"
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

                                {(el.type === 'CTU' ||
                                  el.type === 'CTD' ||
                                  el.type === 'CTUD') && (
                                  <div className="mt-1 w-32 bg-slate-50 rounded p-1.5 border border-slate-200 text-left">
                                    <div className="flex items-center justify-between text-[10px] font-mono font-bold text-indigo-800">
                                      <span className="flex items-center gap-1">
                                        <Hash className="w-3 h-3" />
                                        {el.type}
                                      </span>
                                      <span>Q={cState?.Q ? '1' : '0'}</span>
                                    </div>
                                    <div className="text-[10px] font-mono text-slate-700 mt-0.5 flex justify-between">
                                      <span>CV: {cState?.CV ?? 0}</span>
                                      <span>PV: {el.presetCount ?? 5}</span>
                                    </div>
                                    <div className="text-[9px] font-mono text-rose-700 mt-0.5">
                                      R/LD: {el.resetVariable || 'FALSE'}
                                    </div>
                                  </div>
                                )}

                                {isCmp && (
                                  <div className="mt-1 w-32 bg-slate-50 rounded p-1.5 border border-slate-200 text-center font-mono text-[10px]">
                                    <div className="font-bold text-indigo-800">
                                      {el.variable} {cmpSymbolMap[el.type]} {el.auxVariable ?? '0'}
                                    </div>
                                    <div className="text-slate-600 mt-0.5">
                                      Val: {readLiveWordPreview(el.variable)}
                                    </div>
                                  </div>
                                )}

                                {isMath && (
                                  <div className="mt-1 w-36 bg-slate-50 rounded p-1.5 border border-slate-200 text-left font-mono text-[10px]">
                                    <div className="font-bold text-amber-800">
                                      {el.type} → {el.destVariable || '%MW0'}
                                    </div>
                                    <div className="text-slate-600 mt-0.5">
                                      {el.type === 'MOVE'
                                        ? `IN: ${el.variable} (${readLiveWordPreview(el.variable)})`
                                        : `${el.variable} , ${el.auxVariable ?? '1'}`}
                                    </div>
                                  </div>
                                )}
                              </button>

                              {/* Outgoing wire */}
                              <div
                                className={`w-7 h-0.5 ${
                                  el.powerOut ? 'bg-[#0f766e]' : 'bg-slate-400'
                                }`}
                              />
                            </div>

                            {/* Parallel OR branch */}
                            {hasBranchHere && rung.branchElements && (
                              <div className="mt-2 flex items-center">
                                <div
                                  className={`w-0.5 h-9 -mt-5 mr-2 ${
                                    isRunning ? 'bg-[#0f766e]' : 'bg-slate-500'
                                  }`}
                                />
                                {rung.branchElements.map((bEl) => {
                                  const bSelected = bEl.id === selectedElementId;
                                  const bTag =
                                    resolveSymbolicName(bEl.variable) || bEl.label || 'RETENCION';
                                  return (
                                    <button
                                      key={bEl.id}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        selectElement(rung.id, bEl.id);
                                      }}
                                      className={`px-2.5 py-1 rounded border text-xs font-mono flex flex-col items-center cursor-pointer ${
                                        bSelected
                                          ? 'ring-2 ring-[#ea580c] bg-orange-50 border-[#ea580c]'
                                          : bEl.energized
                                          ? 'bg-[#ccfbf1]/60 border-[#0f766e] text-[#0f766e]'
                                          : 'bg-white border-slate-300 text-slate-800'
                                      }`}
                                    >
                                      <span className="text-[9px] text-slate-500 font-sans">
                                        {bTag}
                                      </span>
                                      <span className="font-bold">{bEl.variable}</span>
                                      <span className="text-[11px]">
                                        {bEl.type === 'NC' ? '─┤/├─' : '─┤ ├─'}
                                      </span>
                                    </button>
                                  );
                                })}
                                <div
                                  className={`w-0.5 h-9 -mt-5 ml-2 ${
                                    rung.branchElements[0]?.powerOut
                                      ? 'bg-[#0f766e]'
                                      : 'bg-slate-400'
                                  }`}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Connecting bus to right-hand coils */}
                  <div
                    className={`flex-1 min-w-[32px] h-0.5 ${
                      rung.energized ? 'bg-[#0f766e]' : 'bg-slate-400'
                    }`}
                  />

                  {/* Output Coils & Bistables */}
                  <div className="flex items-center gap-2">
                    {coils.map((coil) => {
                      const isSelected = coil.id === selectedElementId;
                      const symTag = resolveSymbolicName(coil.variable) || coil.label || coil.type;
                      const glyphMap: Record<string, string> = {
                        COIL: '─(   )─',
                        NEG_COIL: '─( / )─',
                        SET: '─( S )─',
                        RESET: '─( R )─',
                        SR: '[ SR ]',
                        RS: '[ RS ]',
                      };

                      return (
                        <div key={coil.id} className="flex items-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              selectElement(rung.id, coil.id);
                            }}
                            className={`flex flex-col items-center px-3 py-1.5 rounded border transition-all cursor-pointer ${
                              isSelected
                                ? 'ring-2 ring-[#ea580c] bg-orange-50 border-[#ea580c]'
                                : coil.energized
                                ? 'bg-[#ccfbf1]/70 border-[#0f766e] shadow-xs'
                                : 'bg-white border-slate-300 hover:border-slate-500'
                            }`}
                          >
                            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-tight">
                              {symTag}
                            </span>
                            <span
                              className={`text-xs font-mono font-bold ${
                                coil.energized ? 'text-[#0f766e]' : 'text-[#b45309]'
                              }`}
                            >
                              {coil.variable}
                            </span>
                            <div className="mt-0.5 font-mono text-sm font-bold text-slate-900">
                              {glyphMap[coil.type] || '─( )─'}
                            </div>
                            {(coil.type === 'SR' || coil.type === 'RS') && (
                              <span className="text-[9px] font-mono text-rose-700">
                                R: {coil.resetVariable || '%IX0.5'}
                              </span>
                            )}
                          </button>
                          <div
                            className={`w-5 h-0.5 ${
                              coil.energized ? 'bg-[#0f766e]' : 'bg-slate-400'
                            }`}
                          />
                        </div>
                      );
                    })}
                  </div>

                  {/* Right Power Rail (0V) */}
                  <div className="w-1.5 self-stretch rounded-full bg-slate-700 ml-0.5" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Simulino-style Bottom Sheet Bar & Helper Prompt */}
      <div className="px-3 py-1.5 bg-[#f8fafc] border-t border-slate-300 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1">
          {[
            { id: 0, label: `Todas (${rungs.length})` },
            { id: 1, label: 'Hoja 1: Potencia' },
            { id: 2, label: 'Hoja 2: Analógicas' },
            { id: 3, label: 'Hoja 3: Redes' },
          ].map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveSheet(s.id)}
              className={`px-2.5 py-1 rounded border text-xs font-medium cursor-pointer transition-colors ${
                activeSheet === s.id
                  ? 'bg-white border-[#0f766e] text-[#0f766e] font-semibold shadow-2xs'
                  : 'bg-slate-100 border-slate-300 text-slate-600 hover:bg-white'
              }`}
            >
              {s.label}
            </button>
          ))}
          <button
            onClick={addRung}
            className="px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-bold cursor-pointer flex items-center gap-1"
            title="Añadir nueva red Ladder en esta hoja"
          >
            <Plus className="w-3.5 h-3.5" /> Red
          </button>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-slate-500">
          <span>
            Haz clic en un bloque de la librería izquierda para insertarlo o selecciona uno para editarlo.
          </span>
          <button
            onClick={syncLadderToST}
            className="px-2 py-0.5 rounded border border-slate-300 bg-white hover:bg-teal-50 text-[#0f766e] font-semibold flex items-center gap-1 cursor-pointer"
          >
            <Code2 className="w-3 h-3" /> Convertir a ST
          </button>
        </div>
      </div>
    </div>
  );
};
