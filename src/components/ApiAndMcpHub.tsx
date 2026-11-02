import React, { useState } from 'react';
import { usePLCStore } from '../store/usePLCStore';
import {
  Blocks,
  Terminal,
  Bot,
  Play,
  Plus,
  CheckCircle2,
  Copy,
  Check,
  Cpu,
  Radio,
  Code2,
} from 'lucide-react';
import { ExternalHardwareModule } from '../types/plc';

const SDK_TEMPLATES: { title: string; description: string; code: string }[] = [
  {
    title: '1. Módulo PID / Controlador Externo en cada Scan',
    description: 'Lee el nivel analógico %IW0 y escribe la salida PWM en %MW10 automáticamente.',
    code: `// Usa la API global window.pclino para leer/escribir el PLC
const pv = window.pclino.readWord('%IW0'); // 0..4095 ADC
const setpoint = 2500;
const error = setpoint - pv;
const output = Math.max(0, Math.min(1000, Math.round(error * 0.8)));

window.pclino.writeWord('%MW10', output);
window.pclino.writeBit('%MX0.5', error > 0);
return { pv, setpoint, pidOut_MW10: output };`,
  },
  {
    title: '2. Registrar un Nuevo Módulo de Expansión I2C / RS485',
    description: 'Agrega dinámicamente un módulo externo al bus de la KinCony KC868-A16.',
    code: `window.pclino.registerModule({
  id: 'mod-custom-' + Date.now().toString().slice(-3),
  name: 'Medidor Trifásico Acrel ADL400 (Modbus RTU)',
  bus: 'RS485',
  address: 'Slave ID 5 (9600 8N1)',
  description: 'Inyecta tensión L1-N (230V), corriente (14.2A) y potencia activa (kW).',
  enabled: true,
  registers: { '%MW12': 2301, '%MW13': 142 }
});
window.pclino.writeWord('%MW12', 2301); // 230.1 V
window.pclino.writeWord('%MW13', 142);  // 14.2 A
return "Módulo Acrel ADL400 registrado y valores inyectados en %MW12..%MW13";`,
  },
  {
    title: '3. Ráfaga Automática de Tramas Industriales (Modbus + HART + DeviceNet)',
    description: 'Dispara tramas reales en el Laboratorio de Redes desde código externo.',
    code: `window.pclino.sendModbusTCP(3, 0, 4);        // FC03 Read Holding Registers
window.pclino.sendHartCommand(3, 0);          // HART Cmd 3 Read Dynamic Vars
window.pclino.sendDeviceNet(12, 'POLLED_IO'); // CAN DeviceNet MAC 12 Poll
return window.pclino.getSnapshot();`,
  },
];

export const ApiAndMcpHub: React.FC = () => {
  const {
    externalModules,
    toggleModule,
    registerModule,
    addLog,
  } = usePLCStore();

  const [activeSubTab, setActiveSubTab] = useState<'modules' | 'sdk' | 'mcp'>('modules');
  const [scriptCode, setScriptCode] = useState(SDK_TEMPLATES[0].code);
  const [scriptOutput, setScriptOutput] = useState<string>(
    '// Haz clic en "Ejecutar Script en Vivo" para interactuar con window.pclino'
  );
  const [copiedMcp, setCopiedMcp] = useState(false);

  // New module form state
  const [newModName, setNewModName] = useState('');
  const [newModBus, setNewModBus] = useState<ExternalHardwareModule['bus']>('I2C');
  const [newModAddr, setNewModAddr] = useState('0x48');
  const [newModMap, setNewModMap] = useState('%MW8=1024, %MW9=2048');
  const [newModDesc, setNewModDesc] = useState('Módulo sensor personalizado');

  // MCP interactive tool tester
  const [mcpToolName, setMcpToolName] = useState<
    | 'pclino_get_plc_snapshot'
    | 'pclino_write_io'
    | 'pclino_send_industrial_frame'
    | 'pclino_get_kc868_pinout'
  >('pclino_get_plc_snapshot');
  const [mcpResponse, setMcpResponse] = useState<string>('');

  const handleRunScript = () => {
    try {
      const fn = new Function(scriptCode);
      const res = fn();
      const formatted = JSON.stringify(res, null, 2) || 'OK (Ejecutado sin retorno)';
      setScriptOutput(formatted);
      addLog('INFO', `[SDK API] Script de usuario ejecutado correctamente.`);
    } catch (err) {
      setScriptOutput(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleCreateModule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newModName.trim()) return;
    const registers: Record<string, number | boolean> = {};
    newModMap
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((pair) => {
        const [k, v] = pair.split('=').map((x) => x.trim());
        if (k) {
          registers[k] = v !== undefined ? Number(v) || 0 : 0;
        }
      });

    registerModule({
      id: `mod-${Date.now()}`,
      name: newModName.trim(),
      bus: newModBus,
      address: newModAddr.trim(),
      description: newModDesc.trim(),
      enabled: true,
      registers,
    });
    setNewModName('');
  };

  const executeMcpToolCall = () => {
    const snap = window.pclino?.getSnapshot();
    let payload: unknown = {};

    if (mcpToolName === 'pclino_get_plc_snapshot') {
      payload = {
        jsonrpc: '2.0',
        id: 1,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(snap, null, 2),
            },
          ],
        },
      };
    } else if (mcpToolName === 'pclino_write_io') {
      window.pclino?.writeInput('%IX0.0', true);
      window.pclino?.writeWord('%MW0', 1750);
      payload = {
        jsonrpc: '2.0',
        id: 2,
        result: {
          content: [
            {
              type: 'text',
              text: 'MCP Tool pclino_write_io ejecutado: %IX0.0 = TRUE, %MW0 = 1750',
            },
          ],
        },
      };
    } else if (mcpToolName === 'pclino_send_industrial_frame') {
      window.pclino?.sendHartCommand(1, 0);
      payload = {
        jsonrpc: '2.0',
        id: 3,
        result: {
          content: [
            {
              type: 'text',
              text: 'Trama HART FSK Cmd 01 enviada por el agente MCP sobre el canal %IW0.',
            },
          ],
        },
      };
    } else {
      payload = {
        jsonrpc: '2.0',
        id: 4,
        result: {
          board: 'KinCony KC868-A16 (ESP32-WROOM-32E)',
          i2c: { sda: 'GPIO4', scl: 'GPIO5', inputs: ['0x22', '0x21'], outputs: ['0x24', '0x25'] },
          ethernet: { phy: 'LAN8720', mdc: 'GPIO23', mdio: 'GPIO18', clk: 'GPIO17' },
          rs485: { rx: 'GPIO16', tx: 'GPIO13' },
          analog: { a1: 'GPIO36', a2: 'GPIO39', a3: 'GPIO34', a4: 'GPIO35' },
        },
      };
    }

    setMcpResponse(JSON.stringify(payload, null, 2));
  };

  const mcpConfigJson = `{
  "mcpServers": {
    "pclino-kc868-a16": {
      "command": "node",
      "args": ["/Users/lino/openplc-a16-studio/mcp-server/pclino-mcp-server.mjs"],
      "env": {
        "PCLINO_BOARD": "KC868-A16"
      }
    }
  }
}`;

  const handleCopyMcp = () => {
    navigator.clipboard.writeText(mcpConfigJson);
    setCopiedMcp(true);
    setTimeout(() => setCopiedMcp(false), 2000);
  };

  return (
    <div className="flex-1 flex flex-col bg-[#f8fafc] overflow-hidden select-none">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-5 py-2.5 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700">
            <Blocks className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                API Pública (`window.pclino`) & Servidor MCP (Model Context Protocol)
              </h2>
              <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-mono font-bold">
                SDK v2.0 Activo
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Programa nuevos módulos de hardware, automatiza pruebas con JavaScript o conecta agentes IA vía MCP
            </p>
          </div>
        </div>

        {/* Sub-navigation */}
        <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
          <button
            onClick={() => setActiveSubTab('modules')}
            className={`px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeSubTab === 'modules'
                ? 'bg-[#0f766e] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            1. Módulos Externos ({externalModules.length})
          </button>
          <button
            onClick={() => setActiveSubTab('sdk')}
            className={`px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeSubTab === 'sdk'
                ? 'bg-[#0f766e] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            2. Consola SDK (`window.pclino`)
          </button>
          <button
            onClick={() => setActiveSubTab('mcp')}
            className={`px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeSubTab === 'mcp'
                ? 'bg-[#0f766e] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            3. Servidor MCP (Agentes IA)
          </button>
        </div>
      </div>

      {/* Body Content */}
      <div className="flex-1 overflow-y-auto p-5">
        {activeSubTab === 'modules' && (
          <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* List of registered external modules */}
            <div className="lg:col-span-8 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Módulos de Expansión Conectados a la KinCony KC868-A16
              </h3>
              {externalModules.map((mod) => (
                <div
                  key={mod.id}
                  className={`bg-white rounded-xl border p-4 transition-all flex items-start justify-between gap-4 ${
                    mod.enabled ? 'border-teal-500/60 shadow-xs' : 'border-slate-200 opacity-75'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px] font-bold border border-slate-200">
                        {mod.bus}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-teal-50 text-teal-800 font-mono text-[10px] font-bold border border-teal-200">
                        {mod.address}
                      </span>
                      <h4 className="text-sm font-bold text-slate-800">{mod.name}</h4>
                    </div>
                    <p className="text-xs text-slate-600">{mod.description}</p>
                    <div className="flex items-center gap-1.5 pt-1 flex-wrap">
                      <span className="text-[10px] text-slate-400 font-semibold">
                        Registros Mapeados:
                      </span>
                      {Object.entries(mod.registers).map(([addr, val]) => (
                        <span
                          key={addr}
                          className="px-1.5 py-0.5 rounded bg-slate-800 text-white font-mono text-[10px]"
                        >
                          {addr} = {String(val)}
                        </span>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => toggleModule(mod.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 transition-colors cursor-pointer ${
                      mod.enabled
                        ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-300'
                    }`}
                  >
                    {mod.enabled ? 'Activo en Bus' : 'Conectar Módulo'}
                  </button>
                </div>
              ))}
            </div>

            {/* Form to register a custom hardware module */}
            <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 p-4 shadow-xs h-fit">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5 mb-3">
                <Plus className="w-4 h-4 text-teal-700" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Crear Nuevo Módulo Hardware
                </h3>
              </div>
              <form onSubmit={handleCreateModule} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Nombre del Módulo / Sensor
                  </label>
                  <input
                    type="text"
                    required
                    value={newModName}
                    onChange={(e) => setNewModName(e.target.value)}
                    placeholder="Ej: Variador Yaskawa V1000"
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-xs text-slate-800"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Bus Físico KC868
                    </label>
                    <select
                      value={newModBus}
                      onChange={(e) =>
                        setNewModBus(e.target.value as ExternalHardwareModule['bus'])
                      }
                      className="w-full px-2 py-1.5 rounded border border-slate-300 text-xs text-slate-800 bg-white"
                    >
                      <option value="I2C">I2C (GPIO4/5)</option>
                      <option value="RS485">RS485 (GPIO16/13)</option>
                      <option value="CAN_TWAI">CAN DeviceNet</option>
                      <option value="GPIO">HT1..3 GPIO</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Dirección / Nodo
                    </label>
                    <input
                      type="text"
                      value={newModAddr}
                      onChange={(e) => setNewModAddr(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-xs font-mono text-slate-800"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Registros IEC Mapeados (ej: %MW8=1024)
                  </label>
                  <input
                    type="text"
                    value={newModMap}
                    onChange={(e) => setNewModMap(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-xs font-mono text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Descripción Técnica
                  </label>
                  <input
                    type="text"
                    value={newModDesc}
                    onChange={(e) => setNewModDesc(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-xs text-slate-800"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2 rounded-lg bg-[#0f766e] hover:bg-teal-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Registrar Módulo en PCLino
                </button>
              </form>
            </div>
          </div>
        )}

        {activeSubTab === 'sdk' && (
          <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-4 space-y-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Plantillas de Código SDK (`window.pclino`)
              </h3>
              {SDK_TEMPLATES.map((tpl, i) => (
                <div
                  key={i}
                  onClick={() => setScriptCode(tpl.code)}
                  className="bg-white rounded-xl border border-slate-200 hover:border-teal-500 p-3 cursor-pointer transition-all"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">{tpl.title}</span>
                    <Code2 className="w-3.5 h-3.5 text-teal-600" />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">{tpl.description}</p>
                </div>
              ))}

              <div className="bg-teal-50/70 border border-teal-200 rounded-xl p-3 text-[11px] text-teal-900 space-y-1">
                <div className="font-bold">Métodos expuestos en `window.pclino`:</div>
                <ul className="font-mono text-[10px] space-y-0.5 text-teal-800">
                  <li>• pclino.readBit('%IX0.0' | '%QX0.0')</li>
                  <li>• pclino.writeInput('%IX0.0', true)</li>
                  <li>• pclino.readWord('%IW0' | '%MW0')</li>
                  <li>• pclino.writeWord('%MW0', 1234)</li>
                  <li>• pclino.registerModule(modConfig)</li>
                  <li>• pclino.onScan((mem, scan) =&gt; ...)</li>
                  <li>• pclino.sendHartCommand(3, 0)</li>
                </ul>
              </div>
            </div>

            <div className="lg:col-span-8 flex flex-col gap-3">
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col">
                <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 font-mono">
                    script_modulo_externo.js
                  </span>
                  <button
                    onClick={handleRunScript}
                    className="px-3 py-1 rounded bg-[#0f766e] hover:bg-teal-600 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Ejecutar Script en Vivo
                  </button>
                </div>
                <textarea
                  value={scriptCode}
                  onChange={(e) => setScriptCode(e.target.value)}
                  rows={10}
                  className="w-full p-4 font-mono text-xs text-slate-800 bg-white focus:outline-none"
                />
              </div>

              <div className="bg-slate-900 text-slate-100 rounded-xl p-4 font-mono text-xs">
                <div className="text-[10px] uppercase tracking-wider text-teal-400 font-bold mb-1">
                  Resultado de Ejecución SDK
                </div>
                <pre className="whitespace-pre-wrap text-[11px] text-emerald-300">
                  {scriptOutput}
                </pre>
              </div>
            </div>
          </div>
        )}

        {activeSubTab === 'mcp' && (
          <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left: MCP Server Config */}
            <div className="lg:col-span-6 bg-white rounded-xl border border-slate-200 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-teal-700" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    Servidor MCP Local (`mcp-server/pclino-mcp-server.mjs`)
                  </h3>
                </div>
                <button
                  onClick={handleCopyMcp}
                  className="px-2.5 py-1 rounded border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1 cursor-pointer"
                >
                  {copiedMcp ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" /> Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" /> Copiar JSON MCP
                    </>
                  )}
                </button>
              </div>

              <p className="text-xs text-slate-600">
                PCLino incluye un servidor <strong>Model Context Protocol (MCP)</strong> estándar sobre{' '}
                <code className="font-mono bg-slate-100 px-1 rounded">stdio</code> (JSON-RPC 2.0) para que cualquier agente de IA pueda inspeccionar el pinout de la KinCony KC868-A16, construir tramas Modbus/HART/DeviceNet y generar código IEC 61131-3:
              </p>

              <pre className="bg-slate-900 text-teal-300 p-3.5 rounded-lg font-mono text-[11px] overflow-x-auto">
                {mcpConfigJson}
              </pre>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1.5">
                <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                  Herramientas (Tools) expuestas por el Servidor MCP:
                </div>
                <ul className="text-[11px] text-slate-600 font-mono space-y-1">
                  <li>• <strong>pclino_get_kc868_pinout</strong>: Mapa I2C PCF8574, LAN8720, RS485 y ADC.</li>
                  <li>• <strong>pclino_build_modbus_frame</strong>: Calcula CRC-16/MODBUS y ADU TCP.</li>
                  <li>• <strong>pclino_build_hart_frame</strong>: Empaqueta tramas FSK Bell 202 (1200 bps).</li>
                  <li>• <strong>pclino_build_devicenet_frame</strong>: Calcula CAN 11-bit COB-ID + CIP.</li>
                </ul>
              </div>
            </div>

            {/* Right: Interactive MCP Tool Call Tester */}
            <div className="lg:col-span-6 bg-white rounded-xl border border-slate-200 p-4 flex flex-col justify-between space-y-3">
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-2">
                    <Radio className="w-4 h-4 text-teal-700" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      Simulador de Llamadas MCP (`tools/call`) en Vivo
                    </h3>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Seleccionar Tool MCP a invocar sobre PCLino
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={mcpToolName}
                      onChange={(e) =>
                        setMcpToolName(
                          e.target.value as
                            | 'pclino_get_plc_snapshot'
                            | 'pclino_write_io'
                            | 'pclino_send_industrial_frame'
                            | 'pclino_get_kc868_pinout'
                        )
                      }
                      className="flex-1 px-2.5 py-1.5 rounded border border-slate-300 text-xs font-mono text-slate-800 bg-white"
                    >
                      <option value="pclino_get_plc_snapshot">
                        tools/call: pclino_get_plc_snapshot
                      </option>
                      <option value="pclino_write_io">
                        tools/call: pclino_write_io (%IX0.0=TRUE, %MW0=1750)
                      </option>
                      <option value="pclino_send_industrial_frame">
                        tools/call: pclino_send_industrial_frame (HART Cmd 01)
                      </option>
                      <option value="pclino_get_kc868_pinout">
                        tools/call: pclino_get_kc868_pinout
                      </option>
                    </select>
                    <button
                      onClick={executeMcpToolCall}
                      className="px-3 py-1.5 rounded bg-[#0f766e] hover:bg-teal-600 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5" />
                      Invocar Tool MCP
                    </button>
                  </div>
                </div>

                <div className="bg-slate-900 rounded-lg p-3.5 font-mono text-[11px] text-emerald-300 h-64 overflow-y-auto">
                  {mcpResponse ||
                    '// Selecciona una herramienta MCP y pulsa "Invocar Tool MCP" para ver la respuesta JSON-RPC 2.0 en tiempo real.'}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
