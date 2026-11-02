import React from 'react';
import Editor from '@monaco-editor/react';
import { CheckCircle2, RotateCcw, FileCode2 } from 'lucide-react';
import { usePLCStore } from '../store/usePLCStore';
import { DEFAULT_ST_CODE } from '../utils/defaultProgram';

const ST_SNIPPETS = [
  {
    label: '+ Enclavamiento',
    code: '\n(* Enclavamiento Marcha / Paro *)\n%QX0.0 := (%IX0.0 OR %QX0.0) AND NOT %IX0.1;\n',
  },
  {
    label: '+ Temporizador TON',
    code: '\n(* Temporizador TON 2000ms *)\nT0(IN := %QX0.0, PT := T#2000ms);\n%QX0.1 := T0.Q;\n',
  },
  {
    label: '+ Contador CTU',
    code: '\n(* Contador Ascendente CTU *)\nC0(CU := %IX0.2, R := %IX0.3, PV := 5);\n%QX0.2 := C0.Q;\n%MW0 := C0.CV;\n',
  },
  {
    label: '+ Comparador Analógico %IW0',
    code: '\n(* Alarma Sobrepresión ADC1 GPIO36 *)\nIF %IW0 > 2800 THEN\n  %QX0.4 := TRUE;\nELSE\n  %QX0.4 := FALSE;\nEND_IF;\n',
  },
];

export const STEditor: React.FC = () => {
  const { stCode, setSTCode, compileProgram, inputs, outputs, analogs, words } = usePLCStore();

  const insertSnippet = (snippet: string) => {
    const idx = stCode.lastIndexOf('END_PROGRAM');
    if (idx !== -1) {
      setSTCode(stCode.slice(0, idx) + snippet + '\n' + stCode.slice(idx));
    } else {
      setSTCode(stCode + '\n' + snippet);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      {/* Light Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 bg-[#f8fafc] border-b border-slate-300">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="flex items-center gap-1 text-xs font-bold text-[#0f766e] mr-2">
            <FileCode2 className="w-4 h-4" />
            IEC 61131-3 Structured Text (ST)
          </span>
          {ST_SNIPPETS.map((s) => (
            <button
              key={s.label}
              onClick={() => insertSnippet(s.code)}
              className="px-2 py-0.5 rounded bg-white hover:bg-teal-50 border border-slate-300 text-[11px] font-mono text-slate-700 cursor-pointer"
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setSTCode(DEFAULT_ST_CODE)}
            className="px-2.5 py-1 rounded bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Restaurar</span>
          </button>
          <button
            onClick={compileProgram}
            className="px-2.5 py-1 rounded bg-[#0f766e] hover:bg-[#115e59] text-white font-semibold text-xs flex items-center gap-1 cursor-pointer"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Validar ST</span>
          </button>
        </div>
      </div>

      {/* Live Inline Telemetry Strip */}
      <div className="flex items-center gap-2 px-3 py-1 bg-[#f1f5f9] border-b border-slate-200 overflow-x-auto text-[11px] font-mono">
        <span className="text-slate-500 font-sans font-medium">Memoria en vivo:</span>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={`ix-${i}`}
            className={`px-1.5 py-0.5 rounded border ${
              inputs[i]
                ? 'bg-[#ccfbf1] border-[#0f766e] text-[#0f766e] font-bold'
                : 'bg-white border-slate-300 text-slate-500'
            }`}
          >
            %IX0.{i}={inputs[i] ? '1' : '0'}
          </span>
        ))}
        {[0, 1, 2, 4].map((i) => (
          <span
            key={`qx-${i}`}
            className={`px-1.5 py-0.5 rounded border ${
              outputs[i]
                ? 'bg-amber-100 border-amber-500 text-amber-900 font-bold'
                : 'bg-white border-slate-300 text-slate-500'
            }`}
          >
            %QX0.{i}={outputs[i] ? '1' : '0'}
          </span>
        ))}
        <span className="px-1.5 py-0.5 rounded bg-white border border-slate-300 text-indigo-800">
          %IW0(A1)={analogs[0]}
        </span>
        <span className="px-1.5 py-0.5 rounded bg-white border border-slate-300 text-teal-800">
          %MW0(40001)={words[0]}
        </span>
      </div>

      <div className="flex-1">
        <Editor
          height="100%"
          defaultLanguage="pascal"
          theme="light"
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
            padding: { top: 10 },
          }}
        />
      </div>
    </div>
  );
};
