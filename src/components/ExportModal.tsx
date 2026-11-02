import React, { useState } from 'react';
import { X, Download, Copy, Check, Cpu, FileCode, FileText, Layers } from 'lucide-react';
import { usePLCStore } from '../store/usePLCStore';
import {
  generateKinConyInoFirmware,
  generateOpenPLCHalCode,
  generatePLCopenXML,
  generateSTFromLadder,
} from '../utils/codeExporter';

interface ExportModalProps {
  onClose: () => void;
}

type ExportTab = 'hal' | 'ino' | 'st' | 'xml';

export const ExportModal: React.FC<ExportModalProps> = ({ onClose }) => {
  const { rungs, symbols, stCode, language, hwConfig, addLog } = usePLCStore();
  const [tab, setTab] = useState<ExportTab>('hal');
  const [copied, setCopied] = useState(false);

  const effectiveST = language === 'LD' ? generateSTFromLadder(rungs, symbols) : stCode;
  const halCode = generateOpenPLCHalCode(hwConfig);
  const inoCode = generateKinConyInoFirmware(rungs, hwConfig);
  const xmlCode = generatePLCopenXML(rungs, symbols, effectiveST);

  const getActiveContent = (): { code: string; filename: string; title: string; subtitle: string } => {
    switch (tab) {
      case 'hal':
        return {
          code: halCode,
          filename: 'openplc_kc868_a16_hal.cpp',
          title: 'Adaptación Hardware (HAL) de KinCony KC868-A16 para OpenPLC Editor',
          subtitle:
            'Pega este driver C++ en la pestaña "Custom Hardware Layer" de OpenPLC Editor al transferir a ESP32.',
        };
      case 'ino':
        return {
          code: inoCode,
          filename: 'kincony_kc868_a16_openplc.ino',
          title: 'Firmware Integral Arduino / PlatformIO para KinCony KC868-A16 (ESP32)',
          subtitle:
            'Incluye driver I2C para los 4×PCF8574 (0x22, 0x21, 0x24, 0x25), Ethernet LAN8720, Modbus TCP (502) y lógica PLC compilada.',
        };
      case 'st':
        return {
          code: effectiveST,
          filename: 'KinCony_A16_Main.st',
          title: 'Programa IEC 61131-3 Structured Text (.st)',
          subtitle: 'Código estándar IEC 61131-3 listo para importar en OpenPLC Runtime.',
        };
      case 'xml':
        return {
          code: xmlCode,
          filename: 'KinCony_A16_PLCopen.xml',
          title: 'Proyecto Estándar PLCopen TC6 XML v2.01 (.xml)',
          subtitle: 'Archivo XML compatible directamente con OpenPLC Editor y Beremiz.',
        };
    }
  };

  const current = getActiveContent();

  const handleCopy = async () => {
    await navigator.clipboard.writeText(current.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    addLog('INFO', `Código ${current.filename} copiado al portapapeles.`);
  };

  const handleDownload = () => {
    const blob = new Blob([current.code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = current.filename;
    a.click();
    URL.revokeObjectURL(url);
    addLog('INFO', `Archivo exportado: ${current.filename}`);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex flex-col max-h-[88vh] overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-950 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100">
                Firmware & Adaptación OpenPLC — KinCony KC868-A16 (ESP32)
              </h3>
              <p className="text-xs text-slate-400">
                Exportación de capa HAL I2C PCF8574, Firmware autónomo Modbus TCP y archivos IEC 61131-3
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Format Selector Tabs */}
        <div className="flex flex-wrap items-center gap-2 px-5 py-2.5 bg-slate-900 border-b border-slate-800">
          <button
            onClick={() => setTab('hal')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
              tab === 'hal'
                ? 'bg-emerald-600 text-slate-950'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>1. OpenPLC Custom HAL (PCF8574 C++)</span>
          </button>

          <button
            onClick={() => setTab('ino')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
              tab === 'ino'
                ? 'bg-emerald-600 text-slate-950'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>2. Firmware Completo ESP32 (.ino)</span>
          </button>

          <button
            onClick={() => setTab('st')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
              tab === 'st'
                ? 'bg-emerald-600 text-slate-950'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>3. Structured Text (.st)</span>
          </button>

          <button
            onClick={() => setTab('xml')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
              tab === 'xml'
                ? 'bg-emerald-600 text-slate-950'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>4. PLCopen XML (.xml)</span>
          </button>
        </div>

        {/* Info Banner & Action Buttons */}
        <div className="flex items-center justify-between px-5 py-2.5 bg-slate-950/60 border-b border-slate-800">
          <div>
            <div className="text-xs font-semibold text-emerald-300">{current.title}</div>
            <div className="text-[11px] text-slate-400">{current.subtitle}</div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 flex items-center gap-1.5 cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Copiado</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copiar Código</span>
                </>
              )}
            </button>
            <button
              onClick={handleDownload}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-slate-950 flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Descargar {current.filename}</span>
            </button>
          </div>
        </div>

        {/* Code Preview */}
        <div className="flex-1 overflow-y-auto p-4 bg-slate-950 font-mono text-xs text-slate-200">
          <pre className="whitespace-pre-wrap leading-relaxed">{current.code}</pre>
        </div>
      </div>
    </div>
  );
};
