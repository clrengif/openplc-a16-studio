import React from 'react';
import Editor from '@monaco-editor/react';
import { CheckCircle2, Sparkles, RotateCcw, FileCode2 } from 'lucide-react';
import { usePLCStore } from '../store/usePLCStore';
import { DEFAULT_ST_CODE } from '../utils/defaultProgram';

const ST_SNIPPETS = [
  {
    label: '+ Enclavamiento Marcha/Paro',
    code: '\n(* Enclavamiento Marcha / Paro *)\n%QX0.0 := (%IX0.0 OR %QX0.0) AND NOT %IX0.1;\n',
  },
  {
    label: '+ Temporizador TON',
    code: '\n(* Temporizador TON 2000ms *)\nT1(IN := %IX0.0, PT := T#2000ms);\n%QX0.4 := T1.Q;\n',
  },
  {
    label: '+ Contador CTU',
    code: '\n(* Contador Ascendente CTU *)\nC1(CU := %IX0.2, R := %IX0.3, PV := 10);\n%QX0.5 := C1.Q;\n',
  },
  {
    label: '+ Bloque IF / ELSE',
    code: '\nIF %IX0.4 THEN\n  %QX0.3 := TRUE;\nELSIF %IX0.5 THEN\n  %QX0.3 := FALSE;\nEND_IF;\n',
  },
];

export const STEditor: React.FC = () => {
  const { stCode, setSTCode, compileProgram, inputs, outputs, timers, counters } = usePLCStore();

  const insertSnippet = (snippet: string) => {
    const idx = stCode.lastIndexOf('END_PROGRAM');
    if (idx !== -1) {
      const updated = stCode.slice(0, idx) + snippet + '\n' + stCode.slice(idx);
      setSTCode(updated);
    } else {
      setSTCode(stCode + '\n' + snippet);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-900/90 border-b border-slate-800">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="flex items-center gap-1 text-xs font-semibold text-indigo-300 mr-2">
            <FileCode2 className="w-4 h-4 text-indigo-400" />
            IEC 61131-3 Structured Text (ST)
          </span>
          {ST_SNIPPETS.map((s) => (
            <button
              key={s.label}
              onClick={() => insertSnippet(s.code)}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] font-mono text-slate-200 transition-colors cursor-pointer"
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setSTCode(DEFAULT_ST_CODE)}
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs flex items-center gap-1 cursor-pointer"
            title="Restaurar programa ST industrial por defecto"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Restaurar Ejemplo</span>
          </button>
          <button
            onClick={compileProgram}
            className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-semibold text-xs flex items-center gap-1 cursor-pointer"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Validar Sintaxis ST</span>
          </button>
        </div>
      </div>

      {/* Live Inline Telemetry Strip */}
      <div className="flex items-center gap-3 px-3 py-1.5 bg-slate-900/50 border-b border-slate-800/80 overflow-x-auto text-[11px] font-mono">
        <span className="flex items-center gap-1 text-slate-400">
          <Sparkles className="w-3 h-3 text-amber-400" />
          Estado en Vivo:
        </span>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span
            key={`ix-${i}`}
            className={`px-1.5 py-0.5 rounded border ${
              inputs[i]
                ? 'bg-emerald-950/70 border-emerald-500/60 text-emerald-300'
                : 'bg-slate-900 border-slate-800 text-slate-500'
            }`}
          >
            %IX0.{i}={inputs[i] ? '1' : '0'}
          </span>
        ))}
        <span className="text-slate-700">|</span>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={`qx-${i}`}
            className={`px-1.5 py-0.5 rounded border ${
              outputs[i]
                ? 'bg-amber-950/70 border-amber-500/60 text-amber-300'
                : 'bg-slate-900 border-slate-800 text-slate-500'
            }`}
          >
            %QX0.{i}={outputs[i] ? '1' : '0'}
          </span>
        ))}
        <span className="text-slate-700">|</span>
        <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-cyan-300">
          T0.ET={Math.round(timers.T0?.ET ?? 0)}ms (Q={timers.T0?.Q ? '1' : '0'})
        </span>
        <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-purple-300">
          C0.CV={counters.C0?.CV ?? 0}/{counters.C0?.PV ?? 5}
        </span>
      </div>

      {/* Monaco Editor */}
      <div className="flex-1">
        <Editor
          height="100%"
          defaultLanguage="pascal"
          theme="vs-dark"
          value={stCode}
          onChange={(val) => setSTCode(val ?? '')}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            padding: { top: 12 },
          }}
        />
      </div>
    </div>
  );
};
