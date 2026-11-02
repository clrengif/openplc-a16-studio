import React, { useState } from 'react';
import { usePLCStore } from '../store/usePLCStore';
import {
  GitFork,
  Plus,
  Play,
  RotateCcw,
  ArrowDown,
  Code2,
  CheckCircle2,
  Zap,
} from 'lucide-react';
import { iecAddressToIndex } from '../utils/defaultProgram';

export const GrafcetEditor: React.FC = () => {
  const {
    grafcetSteps,
    updateGrafcetStep,
    addGrafcetStep,
    compileGrafcetToLadder,
    inputs,
    outputs,
    markers,
    timers,
    isRunning,
    setRunning,
  } = usePLCStore();

  const [selectedId, setSelectedId] = useState<string>(grafcetSteps[0]?.id || 'g-step-0');
  const selectedStep = grafcetSteps.find((s) => s.id === selectedId) || grafcetSteps[0];
  const activeStepObj = grafcetSteps.find((s) => s.active) || grafcetSteps[0];

  const evaluateReceptivity = (condRaw: string): boolean => {
    const clean = condRaw.trim().toUpperCase();
    const isNeg = clean.startsWith('!');
    const expr = isNeg ? clean.slice(1) : clean;
    let raw = false;
    if (expr.endsWith('.Q')) {
      const tid = expr.replace('.Q', '');
      raw = Boolean(timers[tid]?.Q);
    } else {
      const parsed = iecAddressToIndex(expr);
      if (parsed?.prefix === 'IX') raw = Boolean(inputs[parsed.index]);
      else if (parsed?.prefix === 'QX') raw = Boolean(outputs[parsed.index]);
      else if (parsed?.prefix === 'MX') raw = Boolean(markers[parsed.index]);
    }
    return isNeg ? !raw : raw;
  };

  const handleResetToInitial = () => {
    grafcetSteps.forEach((s, idx) => {
      updateGrafcetStep(s.id, { active: idx === 0 });
    });
  };

  return (
    <div className="flex-1 flex flex-col bg-[#f8fafc] overflow-hidden select-none">
      {/* Header Toolbar */}
      <div className="bg-white border-b border-slate-200 px-5 py-2.5 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700">
            <GitFork className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Editor Gráfico GRAFCET / SFC (IEC 61131-3 Sequential Function Chart)
              </h2>
              <span className="px-2 py-0.5 rounded bg-teal-50 text-teal-700 border border-teal-200 text-[10px] font-mono font-bold">
                Etapa Activa: E{activeStepObj?.stepNumber ?? 0}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Diseña máquinas de estados secuenciales y compílalas automáticamente a contactos Set/Reset en Ladder
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setRunning(!isRunning)}
            className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
              isRunning
                ? 'bg-amber-600 hover:bg-amber-500 text-white'
                : 'bg-[#0f766e] hover:bg-teal-600 text-white'
            }`}
          >
            <Play className="w-3.5 h-3.5" />
            {isRunning ? 'PLC en RUN (Evaluando SFC)' : 'Simular GRAFCET'}
          </button>

          <button
            onClick={handleResetToInitial}
            className="px-2.5 py-1.5 rounded border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 flex items-center gap-1 cursor-pointer"
            title="Volver a Etapa Inicial E0"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
            Etapa 0
          </button>

          <button
            onClick={addGrafcetStep}
            className="px-2.5 py-1.5 rounded border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-teal-600" />
            Añadir Etapa
          </button>

          <button
            onClick={compileGrafcetToLadder}
            className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm cursor-pointer"
            title="Traduce este diagrama GRAFCET a Rungs de Ladder con bobinas Set/Reset"
          >
            <Code2 className="w-3.5 h-3.5" />
            Compilar a Ladder (LD)
          </button>
        </div>
      </div>

      {/* Main Split: Left Diagram, Right Inspector */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
        {/* Left: Visual GRAFCET Chain */}
        <div
          className="lg:col-span-8 p-6 overflow-y-auto flex flex-col items-center"
          style={{
            backgroundColor: '#fbfcfd',
            backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)',
            backgroundSize: '18px 18px',
          }}
        >
          <div className="w-full max-w-2xl flex flex-col items-center py-2">
            {grafcetSteps.map((step, index) => {
              const isActive = step.active;
              const isSelected = selectedStep?.id === step.id;
              const condMet = evaluateReceptivity(step.transitionCondition);

              return (
                <React.Fragment key={step.id}>
                  {/* Step + Action Row */}
                  <div className="flex items-center w-full justify-center gap-4">
                    {/* Step Box */}
                    <div
                      onClick={() => setSelectedId(step.id)}
                      className={`relative w-36 p-3 rounded-lg cursor-pointer transition-all border-2 flex flex-col items-center ${
                        isActive
                          ? 'bg-emerald-50 border-emerald-600 shadow-md ring-4 ring-emerald-500/15'
                          : isSelected
                          ? 'bg-white border-teal-600 shadow-sm'
                          : 'bg-white border-slate-300 hover:border-slate-400'
                      }`}
                    >
                      {step.isInitial && (
                        <div className="absolute inset-1 border border-slate-400 rounded pointer-events-none" />
                      )}
                      <div className="flex items-center gap-1.5">
                        {isActive && (
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                        )}
                        <span className="text-base font-bold font-mono text-slate-800">
                          {step.stepNumber}
                        </span>
                      </div>
                      <span className="text-[10px] font-semibold text-slate-600 text-center mt-0.5">
                        {step.name}
                      </span>
                      {isActive && (
                        <span className="mt-1 px-1.5 py-0.2 rounded bg-emerald-600 text-white text-[9px] font-bold uppercase">
                          TOKEN ACTIVO
                        </span>
                      )}
                    </div>

                    {/* Horizontal Connector to Action */}
                    <div className="w-8 h-0.5 bg-slate-400" />

                    {/* Action Box */}
                    <div
                      onClick={() => setSelectedId(step.id)}
                      className={`flex-1 max-w-xs rounded-lg border p-2.5 cursor-pointer transition-all ${
                        isActive && step.actionCoil
                          ? 'bg-teal-50/90 border-teal-500 shadow-sm'
                          : 'bg-white border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between border-b border-slate-200 pb-1 mb-1">
                        <div className="flex items-center gap-1.5">
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-white text-[10px] font-mono font-bold">
                            N
                          </span>
                          <span className="text-xs font-mono font-bold text-teal-800">
                            {step.actionCoil || 'NONE (Reposo)'}
                          </span>
                        </div>
                        {isActive && step.actionCoil && (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700">
                            <Zap className="w-3 h-3" /> EJECUTANDO
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-600">
                        {step.actionDescription}
                      </div>
                    </div>
                  </div>

                  {/* Vertical Transition Bar */}
                  <div className="flex flex-col items-center my-1">
                    <div className="w-0.5 h-4 bg-slate-400" />
                    <div className="flex items-center gap-3">
                      <div className="w-24 text-right">
                        <span className="text-[10px] text-slate-400 font-mono">
                          T{step.stepNumber}→{step.nextStepNumber}
                        </span>
                      </div>
                      <div
                        className={`w-8 h-1.5 rounded ${
                          condMet ? 'bg-emerald-500' : 'bg-slate-600'
                        }`}
                      />
                      <div className="w-60 flex items-center gap-1.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold border ${
                            condMet
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                              : 'bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                        >
                          {step.transitionCondition}
                        </span>
                        <span className="text-[10px] text-slate-500 truncate">
                          ({step.transitionComment})
                        </span>
                      </div>
                    </div>
                    <div className="w-0.5 h-4 bg-slate-400" />
                    {index === grafcetSteps.length - 1 && (
                      <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-200 text-slate-700 text-[10px] font-mono font-bold">
                        <ArrowDown className="w-3 h-3" /> Retorno cíclico a Etapa E{step.nextStepNumber}
                      </div>
                    )}
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Right: Step Property Inspector */}
        <div className="lg:col-span-4 bg-white border-l border-slate-200 p-4 flex flex-col justify-between overflow-y-auto">
          {selectedStep ? (
            <div className="space-y-4">
              <div className="border-b border-slate-200 pb-2.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700">
                  Propiedades de Etapa GRAFCET
                </span>
                <h3 className="text-sm font-bold text-slate-800 mt-0.5">
                  Etapa {selectedStep.stepNumber}: {selectedStep.name}
                </h3>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Nombre de la Etapa
                </label>
                <input
                  type="text"
                  value={selectedStep.name}
                  onChange={(e) => updateGrafcetStep(selectedStep.id, { name: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-xs text-slate-800"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Salida Asociada (%QX)
                </label>
                <select
                  value={selectedStep.actionCoil || ''}
                  onChange={(e) =>
                    updateGrafcetStep(selectedStep.id, {
                      actionCoil: e.target.value || undefined,
                    })
                  }
                  className="w-full px-2 py-1.5 rounded border border-slate-300 text-xs font-mono text-slate-800 bg-white"
                >
                  <option value="">Sin acción (Reposo)</option>
                  {Array.from({ length: 16 }, (_, i) => `%QX0.${i}`).map((addr) => (
                    <option key={addr} value={addr}>
                      {addr} (Y{Number(addr.split('.')[1]) + 1})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Descripción de la Acción
                </label>
                <input
                  type="text"
                  value={selectedStep.actionDescription}
                  onChange={(e) =>
                    updateGrafcetStep(selectedStep.id, { actionDescription: e.target.value })
                  }
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-xs text-slate-800"
                />
              </div>

              <div className="pt-2 border-t border-slate-200">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Condición de Transición (Receptividad)
                </label>
                <input
                  type="text"
                  value={selectedStep.transitionCondition}
                  onChange={(e) =>
                    updateGrafcetStep(selectedStep.id, {
                      transitionCondition: e.target.value.toUpperCase(),
                    })
                  }
                  placeholder="%IX0.0 o !%IX0.1 o T0.Q"
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-xs font-mono text-slate-800"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Soporta direcciones <code className="font-mono">%IX0.0..%IX0.15</code>, temporizadores <code className="font-mono">T0.Q</code> y negación con <code className="font-mono">!</code>.
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Comentario de Transición
                </label>
                <input
                  type="text"
                  value={selectedStep.transitionComment}
                  onChange={(e) =>
                    updateGrafcetStep(selectedStep.id, { transitionComment: e.target.value })
                  }
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-xs text-slate-800"
                />
              </div>
            </div>
          ) : null}

          <div className="mt-6 bg-slate-50 rounded-lg border border-slate-200 p-3 text-[11px] text-slate-600 space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold text-slate-800">
              <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
              Compilación Directa a Ladder (LD)
            </div>
            <p>
              Pulsa <strong>Compilar a Ladder (LD)</strong> para generar automáticamente los peldaños Set/Reset equivalentes en el editor esquemático.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
