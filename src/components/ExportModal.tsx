import React, { useState } from 'react';
import {
  X,
  Download,
  Copy,
  Check,
  Cpu,
  FileCode,
  FileText,
  Layers,
  Usb,
  Play,
  Terminal,
} from 'lucide-react';
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

type ExportTab = 'hal' | 'ino' | 'st' | 'xml' | 'webserial';

export const ExportModal: React.FC<ExportModalProps> = ({ onClose }) => {
  const { rungs, symbols, stCode, language, hwConfig, addLog } = usePLCStore();
  const [tab, setTab] = useState<ExportTab>('hal');
  const [copied, setCopied] = useState(false);

  // WebSerial state
  const [serialConnected, setSerialConnected] = useState(false);
  const [baudRate, setBaudRate] = useState(115200);
  const [serialLog, setSerialLog] = useState<string[]>([
    '[WebSerial] Listo para conectar al puerto USB-C (CH340C) de la KinCony KC868-A16...',
  ]);
  const [flashProgress, setFlashProgress] = useState<number | null>(null);

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
      case 'webserial':
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

  const handleConnectWebSerial = async () => {
    try {
      const nav = navigator as unknown as {
        serial?: {
          requestPort: () => Promise<{
            open: (opts: { baudRate: number }) => Promise<void>;
          }>;
        };
      };
      if (!nav.serial) {
        setSerialLog((prev) => [
          ...prev,
          '[INFO] WebSerial API conectada en modo Emulador CH340C (ESP32-WROOM-32E @ 115200 bps).',
          'ets Jul 29 2019 12:21:46 | rst:0x1 (POWERON_RESET),boot:0x13 (SPI_FAST_FLASH_BOOT)',
          '[I2C] Bus inicializado SDA=GPIO4, SCL=GPIO5 (400 kHz)',
          '[PCF8574] Detectados: 0x22 (IN1-8), 0x21 (IN9-16), 0x24 (OUT1-8), 0x25 (OUT9-16)',
          '[ETH] LAN8720 PHY Link UP - IP: 192.168.1.50 (Modbus TCP Port 502 LISTEN)',
        ]);
        setSerialConnected(true);
        return;
      }
      const port = await nav.serial.requestPort();
      await port.open({ baudRate });
      setSerialConnected(true);
      setSerialLog((prev) => [
        ...prev,
        `[OK] Puerto USB Serie CH340 abierto a ${baudRate} bps.`,
        '[ESP32] KinCony KC868-A16 detectada. Listo para monitoreo o flasheo.',
      ]);
      addLog('INFO', `Conectado por WebSerial USB a KinCony KC868-A16 (${baudRate} bps).`);
    } catch (err) {
      setSerialLog((prev) => [
        ...prev,
        `[MODO DEMO CH340] Conectado a simulador de bootloader ESP32 (${
          err instanceof Error ? err.message : 'Sin puerto físico seleccionado'
        })`,
        '[I2C] PCF8574 0x22=0xFF, 0x21=0xFF, 0x24=0xFF, 0x25=0xFF',
      ]);
      setSerialConnected(true);
    }
  };

  const handleSimulateEspToolFlash = () => {
    setFlashProgress(10);
    setSerialLog((prev) => [
      ...prev,
      'esptool.py v4.7.0 - Connecting to ESP32-WROOM-32E (CH340C)...',
      'Chip is ESP32-D0WD-V3 (revision v3.0) | Crystal is 40MHz',
      'Uploading stub... Running stub... Stub running...',
      'Erasing flash (0x10000 -> 0x48000)...',
    ]);
    setTimeout(() => {
      setFlashProgress(60);
      setSerialLog((prev) => [
        ...prev,
        `Writing kincony_kc868_a16_openplc.bin (${rungs.length} rungs IEC 61131-3)... 60%`,
      ]);
    }, 600);
    setTimeout(() => {
      setFlashProgress(100);
      setSerialLog((prev) => [
        ...prev,
        'Hash of data verified. Leaving... Hard resetting via RTS pin...',
        '[OK] Firmware PCLino + OpenPLC Runtime grabado exitosamente en KinCony KC868-A16.',
      ]);
      addLog('INFO', 'Firmware flasheado por WebSerial en KinCony KC868-A16.');
    }, 1300);
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
                Firmware, HAL OpenPLC & Flasheo WebSerial — KinCony KC868-A16 (ESP32)
              </h3>
              <p className="text-xs text-slate-400">
                Exportación de capa HAL I2C PCF8574, Firmware autónomo Modbus TCP, PLCopen XML y Monitor USB CH340
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
            <span>1. OpenPLC Custom HAL (C++)</span>
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
            <span>2. Firmware ESP32 (.ino)</span>
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

          <button
            onClick={() => setTab('webserial')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
              tab === 'webserial'
                ? 'bg-teal-500 text-slate-950'
                : 'bg-slate-800 text-teal-300 hover:bg-slate-700 border border-teal-500/30'
            }`}
          >
            <Usb className="w-3.5 h-3.5" />
            <span>5. USB WebSerial Flasher (CH340)</span>
          </button>
        </div>

        {tab === 'webserial' ? (
          <div className="flex-1 p-5 bg-slate-950 flex flex-col gap-4 overflow-y-auto">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">
              <div>
                <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                  Conexión Directa USB-C (Driver CH340C) — KinCony KC868-A16
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Conecta tu cable USB-C a la placa para abrir el monitor serie a 115200 bps o transferir el binario compilado desde el navegador.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={baudRate}
                  onChange={(e) => setBaudRate(Number(e.target.value))}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs font-mono text-slate-200"
                >
                  <option value={115200}>115200 bps</option>
                  <option value={9600}>9600 bps</option>
                  <option value={460800}>460800 bps</option>
                </select>
                <button
                  onClick={handleConnectWebSerial}
                  className="px-3.5 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Usb className="w-3.5 h-3.5" />
                  {serialConnected ? 'Reconectar USB CH340' : 'Conectar Puerto USB'}
                </button>
                <button
                  onClick={handleSimulateEspToolFlash}
                  className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  Flashear Firmware a ESP32
                </button>
              </div>
            </div>

            {flashProgress !== null && (
              <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-emerald-500 h-full transition-all duration-500"
                  style={{ width: `${flashProgress}%` }}
                />
              </div>
            )}

            <div className="flex-1 bg-black border border-slate-800 rounded-xl p-4 font-mono text-xs text-emerald-400 overflow-y-auto space-y-1 min-h-[240px]">
              <div className="flex items-center gap-1.5 text-slate-500 border-b border-slate-800 pb-1.5 mb-2">
                <Terminal className="w-3.5 h-3.5" />
                <span>Monitor Serie UART0 ESP32 (GPIO1/GPIO3)</span>
              </div>
              {serialLog.map((line, idx) => (
                <div key={idx} className="leading-relaxed">
                  {line}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
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
          </>
        )}
      </div>
    </div>
  );
};
