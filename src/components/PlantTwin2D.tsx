import React from 'react';
import {
  Factory,
  Play,
  Square,
  RotateCcw,
  Gauge,
  Package,
  Droplets,
  AlertTriangle,
} from 'lucide-react';
import { usePLCStore } from '../store/usePLCStore';

export const PlantTwin2D: React.FC = () => {
  const {
    isRunning,
    inputs,
    outputs,
    analogs,
    words,
    timers,
    counters,
    autoPlantTwin,
    tankLevelPct,
    conveyorBoxes,
    setRunning,
    setAutoPlantTwin,
    setTankLevelPct,
    setInputState,
  } = usePLCStore();

  const motorOn = outputs[0];
  const deltaOn = outputs[1];
  const batchComplete = outputs[2];
  const drainOpen = outputs[3];
  const pressureAlarm = outputs[4];

  const pressureBar = (((analogs[0] ?? 1850) / 4095) * 10).toFixed(2);
  const currentMa = (4 + ((analogs[0] ?? 1850) / 4095) * 16).toFixed(2);

  return (
    <div className="flex flex-col h-full bg-[#f8fafc] overflow-y-auto p-4 space-y-4 select-none">
      {/* Top Bar */}
      <div className="bg-white rounded-lg border border-slate-300 p-3.5 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-[#0f766e]/10 border border-[#0f766e]/30 text-[#0f766e]">
            <Factory className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Gemelo Digital 2D de Planta Industrial (Bucle Cerrado con KinCony KC868-A16)
            </h2>
            <p className="text-xs text-slate-600">
              Las salidas del PLC (%QX) mueven las bombas, válvulas y cinta; la física de la planta acciona automáticamente los sensores (%IX y %IW).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={autoPlantTwin}
              onChange={(e) => setAutoPlantTwin(e.target.checked)}
              className="accent-[#0f766e]"
            />
            <span>Física Automática en Bucle Cerrado</span>
          </label>

          <button
            onClick={() => setRunning(!isRunning)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
              isRunning
                ? 'bg-rose-600 text-white'
                : 'bg-[#0f766e] text-white'
            }`}
          >
            {isRunning ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{isRunning ? 'Detener Planta' : 'Simular Planta'}</span>
          </button>
        </div>
      </div>

      {/* Operator Control Desk (Pushbuttons connected to DI1..DI4) */}
      <div className="bg-white rounded-lg border border-slate-300 p-3 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Pupitre de Operador en Campo:
          </span>
          <button
            onMouseDown={() => setInputState(0, true)}
            onMouseUp={() => setInputState(0, false)}
            onMouseLeave={() => setInputState(0, false)}
            className={`px-3 py-1.5 rounded-lg font-bold text-xs border cursor-pointer transition-all ${
              inputs[0]
                ? 'bg-emerald-600 text-white border-emerald-700 scale-95'
                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border-emerald-300'
            }`}
          >
            PULSAR MARCHA (%IX0.0 · DI1)
          </button>

          <button
            onMouseDown={() => setInputState(1, true)}
            onMouseUp={() => setInputState(1, false)}
            onMouseLeave={() => setInputState(1, false)}
            className={`px-3 py-1.5 rounded-lg font-bold text-xs border cursor-pointer transition-all ${
              inputs[1]
                ? 'bg-rose-600 text-white border-rose-700 scale-95'
                : 'bg-rose-50 hover:bg-rose-100 text-rose-900 border-rose-300'
            }`}
          >
            PARO EMERGENCIA (%IX0.1 · DI2)
          </button>

          <button
            onMouseDown={() => setInputState(3, true)}
            onMouseUp={() => setInputState(3, false)}
            onMouseLeave={() => setInputState(3, false)}
            className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 font-semibold text-xs flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>RESET CONTADOR (%IX0.3 · DI4)</span>
          </button>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono">
          <span className="px-2.5 py-1 rounded bg-slate-100 border border-slate-300">
            TON T0: <strong>{Math.round(timers.T0?.ET ?? 0)} / {timers.T0?.PT ?? 2500} ms</strong>
          </span>
          <span className="px-2.5 py-1 rounded bg-teal-50 border border-teal-200 text-[#0f766e]">
            CTU C0 (Modbus %MW0): <strong>{counters.C0?.CV ?? 0} / {counters.C0?.PV ?? 5} cajas</strong>
          </span>
        </div>
      </div>

      {/* Main 2D Synoptic Grid: Left = Tank Process, Right = Conveyor Packaging Line */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Subsystem 1: Pressurized Tank + Level Floats + 4-20mA Transmitter */}
        <div className="bg-white rounded-lg border border-slate-300 p-4 shadow-2xs flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
              <Droplets className="w-4 h-4 text-[#0f766e]" />
              Estación 1: Tanque de Proceso + Lazo 4–20 mA (%IW0)
            </span>
            {pressureAlarm && (
              <span className="px-2 py-0.5 rounded bg-rose-600 text-white text-[11px] font-bold flex items-center gap-1 animate-pulse">
                <AlertTriangle className="w-3.5 h-3.5" /> ALARMA SOBREPRESIÓN (%QX0.4)
              </span>
            )}
          </div>

          <div className="flex items-center justify-around py-3 gap-4">
            {/* Visual Tank Graphic */}
            <div className="relative w-44 h-56 rounded-xl border-4 border-slate-700 bg-slate-100 overflow-hidden shadow-inner flex flex-col justify-end">
              {/* High Level Float Marker (85%) */}
              <div className="absolute top-[15%] left-0 right-0 border-t border-dashed border-amber-600 flex justify-between px-2 text-[10px] font-mono z-10">
                <span className="bg-white/90 px-1 rounded text-amber-800 font-bold">
                  85% (%IX0.4={inputs[4] ? '1' : '0'})
                </span>
              </div>

              {/* Low Level Float Marker (18%) */}
              <div className="absolute bottom-[18%] left-0 right-0 border-t border-dashed border-sky-700 flex justify-between px-2 text-[10px] font-mono z-10">
                <span className="bg-white/90 px-1 rounded text-sky-900 font-bold">
                  18% (%IX0.5={inputs[5] ? '1' : '0'})
                </span>
              </div>

              {/* Water Fill */}
              <div
                style={{ height: `${tankLevelPct}%` }}
                className="w-full bg-gradient-to-t from-[#0f766e] to-teal-400/80 transition-all duration-100 flex items-center justify-center"
              >
                <span className="text-white font-mono font-extrabold text-sm drop-shadow">
                  {tankLevelPct.toFixed(0)}%
                </span>
              </div>
            </div>

            {/* Actuators & Transmitters Readout */}
            <div className="flex-1 space-y-2.5 text-xs">
              <div
                className={`p-2.5 rounded-lg border flex items-center justify-between ${
                  motorOn
                    ? 'bg-emerald-50 border-emerald-400 text-emerald-900'
                    : 'bg-slate-50 border-slate-200 text-slate-500'
                }`}
              >
                <div>
                  <div className="font-bold">Bomba Llenado (%QX0.0 · DO1)</div>
                  <div className="text-[11px]">Caudal entrada: +0.35% / scan</div>
                </div>
                <span className="font-mono font-bold">{motorOn ? 'ACTIVA' : 'OFF'}</span>
              </div>

              <div
                className={`p-2.5 rounded-lg border flex items-center justify-between ${
                  drainOpen
                    ? 'bg-amber-50 border-amber-400 text-amber-900'
                    : 'bg-slate-50 border-slate-200 text-slate-500'
                }`}
              >
                <div>
                  <div className="font-bold">Válvula Drenaje (%QX0.3 · DO4)</div>
                  <div className="text-[11px]">Se abre en ≥85% y cierra en ≤18%</div>
                </div>
                <span className="font-mono font-bold">{drainOpen ? 'ABIERTA' : 'CERRADA'}</span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1 font-mono">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-sans font-semibold text-slate-700 flex items-center gap-1">
                    <Gauge className="w-3.5 h-3.5 text-[#0f766e]" />
                    Transmisor HART A1 (%IW0):
                  </span>
                  <strong className="text-[#0f766e]">{analogs[0]} ADC</strong>
                </div>
                <div className="flex justify-between text-[11px] text-slate-600">
                  <span>Lazo: {currentMa} mA</span>
                  <span>Presión: {pressureBar} Bar</span>
                </div>
              </div>

              <label className="flex flex-col gap-1 text-[11px] text-slate-600">
                <span>Ajuste Manual de Nivel del Tanque ({tankLevelPct}%):</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={tankLevelPct}
                  onChange={(e) => setTankLevelPct(Number(e.target.value))}
                  className="accent-[#0f766e] cursor-pointer"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Subsystem 2: Conveyor Belt + Optical Sensor + Star-Delta Motor */}
        <div className="bg-white rounded-lg border border-slate-300 p-4 shadow-2xs flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
              <Package className="w-4 h-4 text-[#ea580c]" />
              Estación 2: Cinta Transportadora Estrella-Triángulo & Conteo CTU
            </span>
            <span
              className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold ${
                batchComplete
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 text-slate-700 border border-slate-300'
              }`}
            >
              {batchComplete ? 'LOTE COMPLETO (%QX0.2=1)' : `CONTEO: ${words[0]} / 5`}
            </span>
          </div>

          {/* Animated Conveyor Schematic */}
          <div className="my-auto py-4 space-y-4">
            <div className="relative h-28 bg-slate-100 rounded-xl border border-slate-300 px-4 flex flex-col justify-end pb-4 overflow-hidden">
              {/* Optical Sensor Gate at 70% */}
              <div
                style={{ left: '70%' }}
                className="absolute top-2 bottom-4 w-6 -ml-3 flex flex-col items-center justify-between z-20"
              >
                <div
                  className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${
                    inputs[2]
                      ? 'bg-[#ea580c] text-white shadow'
                      : 'bg-slate-800 text-white'
                  }`}
                >
                  %IX0.2
                </div>
                <div
                  className={`w-0.5 flex-1 border-l-2 border-dashed ${
                    inputs[2] ? 'border-[#ea580c]' : 'border-rose-400/70'
                  }`}
                />
              </div>

              {/* Moving Boxes on Conveyor */}
              {conveyorBoxes.map((pos, idx) => (
                <div
                  key={idx}
                  style={{ left: `${pos}%` }}
                  className="absolute bottom-6 w-9 h-9 -ml-4 rounded bg-amber-500 border-2 border-amber-700 shadow flex items-center justify-center text-[10px] font-mono font-bold text-slate-950 transition-all duration-75"
                >
                  #{idx + 1}
                </div>
              ))}

              {/* Conveyor Belt Track & Rollers */}
              <div className="w-full h-4 rounded-full bg-slate-700 border-2 border-slate-800 flex items-center justify-between px-2">
                {[0, 1, 2, 3, 4, 5].map((r) => (
                  <div
                    key={r}
                    className={`w-2.5 h-2.5 rounded-full bg-slate-300 ${
                      motorOn ? 'animate-spin' : ''
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Motor & Sensor Status Cards */}
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div
                className={`p-2.5 rounded-lg border ${
                  motorOn
                    ? 'bg-teal-50 border-[#0f766e] text-teal-950'
                    : 'bg-slate-50 border-slate-200 text-slate-500'
                }`}
              >
                <div className="font-bold">Motor K1 (%QX0.0)</div>
                <div className="font-mono text-[11px] mt-0.5">
                  {motorOn ? (deltaOn ? 'Régimen Triángulo' : 'Arranque Estrella') : 'Detenido'}
                </div>
              </div>

              <div
                className={`p-2.5 rounded-lg border ${
                  deltaOn
                    ? 'bg-amber-50 border-amber-400 text-amber-950'
                    : 'bg-slate-50 border-slate-200 text-slate-500'
                }`}
              >
                <div className="font-bold">Triángulo K2 (%QX0.1)</div>
                <div className="font-mono text-[11px] mt-0.5">
                  {deltaOn ? 'TON T0 Activo (100%)' : `Espera ${Math.round(timers.T0?.ET ?? 0)}ms`}
                </div>
              </div>

              <div
                className={`p-2.5 rounded-lg border ${
                  inputs[2]
                    ? 'bg-orange-50 border-[#ea580c] text-orange-950'
                    : 'bg-slate-50 border-slate-200 text-slate-600'
                }`}
              >
                <div className="font-bold">Fotocélula (%IX0.2)</div>
                <div className="font-mono text-[11px] mt-0.5">
                  {inputs[2] ? 'PULSO DETECTADO (1)' : 'Haz Libre (0)'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
