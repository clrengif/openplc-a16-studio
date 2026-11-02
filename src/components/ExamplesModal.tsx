import React from 'react';
import { X, BookOpen, Play, FolderOpen } from 'lucide-react';
import { PLC_EXAMPLES, PlnoProjectFile } from '../utils/plcExamples';

interface ExamplesModalProps {
  onSelectExample: (example: PlnoProjectFile) => void;
  onClose: () => void;
}

export const ExamplesModal: React.FC<ExamplesModalProps> = ({ onSelectExample, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-4xl bg-white border border-slate-300 rounded-xl shadow-2xl flex flex-col max-h-[86vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#f8fafc] border-b border-slate-300">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-[#0f766e]/10 border border-[#0f766e]/30 text-[#0f766e]">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Biblioteca de Ejemplos Clásicos de PLC (.plno) — PCLino
              </h3>
              <p className="text-xs text-slate-500">
                Selecciona cualquier circuito industrial para cargarlo en el área de trabajo y simularlo en tiempo real
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-500 hover:text-rose-700 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Examples Grid */}
        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-2 gap-3 bg-[#f4f6f8]">
          {PLC_EXAMPLES.map((ex) => (
            <div
              key={ex.fileName}
              className="bg-white rounded-lg border border-slate-300 hover:border-[#0f766e] p-3.5 shadow-2xs flex flex-col justify-between transition-all"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="px-2 py-0.5 rounded bg-teal-50 border border-teal-200 text-[10px] font-semibold text-[#0f766e]">
                    {ex.category}
                  </span>
                  <span className="font-mono text-[11px] text-slate-400 flex items-center gap-1">
                    <FolderOpen className="w-3 h-3" />
                    {ex.fileName}
                  </span>
                </div>
                <h4 className="text-xs font-bold text-slate-900 mt-1">{ex.title}</h4>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">{ex.description}</p>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] font-mono text-slate-500">
                  {ex.rungs.length} Red(es) Ladder + Código ST
                </span>
                <button
                  onClick={() => {
                    onSelectExample(ex);
                    onClose();
                  }}
                  className="px-3 py-1 rounded bg-[#0f766e] hover:bg-[#115e59] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Play className="w-3 h-3 fill-white" />
                  <span>Abrir en PCLino</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
