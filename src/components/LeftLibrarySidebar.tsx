import React, { useState } from 'react';
import {
  MousePointer,
  GitBranch,
  Activity,
  Trash2,
  ChevronRight,
  ChevronDown,
  Search,
} from 'lucide-react';
import { usePLCStore } from '../store/usePLCStore';
import { LadderElementType } from '../types/plc';

interface LibraryItem {
  type: LadderElementType;
  glyph: string;
  name: string;
  desc: string;
}

interface LibraryCategory {
  id: string;
  title: string;
  items: LibraryItem[];
}

const CATEGORIES: LibraryCategory[] = [
  {
    id: 'contacts',
    title: 'Contactos y Flancos',
    items: [
      { type: 'NO', glyph: '─┤ ├─', name: 'Contacto NA (NO)', desc: 'Normalmente abierto (%IX, %QX, %MX)' },
      { type: 'NC', glyph: '─┤/├─', name: 'Contacto NC', desc: 'Normalmente cerrado invertido' },
      { type: 'R_TRIG', glyph: '─┤P├─', name: 'Flanco Subida (R_TRIG)', desc: 'Pulso de 1 scan al pasar 0 → 1' },
      { type: 'F_TRIG', glyph: '─┤N├─', name: 'Flanco Bajada (F_TRIG)', desc: 'Pulso de 1 scan al pasar 1 → 0' },
    ],
  },
  {
    id: 'coils',
    title: 'Bobinas y Biestables',
    items: [
      { type: 'COIL', glyph: '─( )─', name: 'Bobina Estándar', desc: 'Escribe salida %QX o marca %MX' },
      { type: 'NEG_COIL', glyph: '─(/)─', name: 'Bobina Negada', desc: 'Escribe el valor inverso del rung' },
      { type: 'SET', glyph: '─(S)─', name: 'Bobina SET (Latch)', desc: 'Enclava salida en TRUE al energizar' },
      { type: 'RESET', glyph: '─(R)─', name: 'Bobina RESET (Unlatch)', desc: 'Desenclava salida a FALSE' },
      { type: 'SR', glyph: '[ SR ]', name: 'Biestable SR', desc: 'Flip-Flop con Set dominante (S1 / R)' },
      { type: 'RS', glyph: '[ RS ]', name: 'Biestable RS', desc: 'Flip-Flop con Reset dominante (S / R1)' },
    ],
  },
  {
    id: 'timers',
    title: 'Temporizadores IEC',
    items: [
      { type: 'TON', glyph: '[TON]', name: 'TON (On-Delay)', desc: 'Retardo a la conexión (IN, PT -> Q, ET)' },
      { type: 'TOF', glyph: '[TOF]', name: 'TOF (Off-Delay)', desc: 'Retardo a la desconexión tras flanco' },
      { type: 'TP', glyph: '[ TP ]', name: 'TP (Temporizador Pulso)', desc: 'Pulso exacto de duración PT' },
    ],
  },
  {
    id: 'counters',
    title: 'Contadores IEC',
    items: [
      { type: 'CTU', glyph: '[CTU]', name: 'CTU (Ascendente)', desc: 'Cuenta flancos CU hasta PV (Reset R)' },
      { type: 'CTD', glyph: '[CTD]', name: 'CTD (Descendente)', desc: 'Carga PV con LD y descuenta hasta 0' },
      { type: 'CTUD', glyph: '[CTUD]', name: 'CTUD (Reversible)', desc: 'Contador bidireccional CU / CD' },
    ],
  },
  {
    id: 'comparators',
    title: 'Comparadores Analógicos',
    items: [
      { type: 'GT', glyph: '[ > ]', name: 'Mayor que (GT)', desc: 'Activa si IN1 (%IW/%MW) > IN2' },
      { type: 'GE', glyph: '[ >= ]', name: 'Mayor o igual (GE)', desc: 'Activa si IN1 >= IN2' },
      { type: 'EQ', glyph: '[ == ]', name: 'Igual a (EQ)', desc: 'Activa si IN1 == IN2' },
      { type: 'NE', glyph: '[ <> ]', name: 'Distinto de (NE)', desc: 'Activa si IN1 <> IN2' },
      { type: 'LT', glyph: '[ < ]', name: 'Menor que (LT)', desc: 'Activa si IN1 < IN2' },
      { type: 'LE', glyph: '[ <= ]', name: 'Menor o igual (LE)', desc: 'Activa si IN1 <= IN2' },
    ],
  },
  {
    id: 'math',
    title: 'Aritmética y Registros',
    items: [
      { type: 'MOVE', glyph: '[MOVE]', name: 'Transferir (MOVE)', desc: 'Copia %IW/C0.CV a Holding Reg %MW' },
      { type: 'ADD', glyph: '[ADD]', name: 'Sumar (ADD)', desc: 'DEST := IN1 + IN2 (16-bit INT)' },
      { type: 'SUB', glyph: '[SUB]', name: 'Restar (SUB)', desc: 'DEST := IN1 - IN2 (16-bit INT)' },
      { type: 'MUL', glyph: '[MUL]', name: 'Multiplicar (MUL)', desc: 'DEST := IN1 * IN2 (Escalado)' },
      { type: 'DIV', glyph: '[DIV]', name: 'Dividir (DIV)', desc: 'DEST := IN1 / IN2 (Entero)' },
    ],
  },
];

export const LeftLibrarySidebar: React.FC = () => {
  const {
    rungs,
    selectedRungId,
    selectedElementId,
    addElementToRung,
    toggleParallelBranch,
    deleteElement,
    toggleProbe,
    setWorkspaceView,
    sendModbusTCPRequest,
    sendModbusRTURequest,
    captureI2CBusFrames,
  } = usePLCStore();

  const [search, setSearch] = useState('');
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({
    contacts: true,
    coils: false,
    timers: true,
    counters: false,
    comparators: false,
    math: false,
    networks: true,
  });

  const activeRung = rungs.find((r) => r.id === selectedRungId) ?? rungs[0];

  const toggleCat = (id: string) =>
    setOpenCats((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <aside className="w-60 shrink-0 h-full bg-[#f4f6f8] border-r border-slate-300 flex flex-col select-none">
      {/* Simulino-style 4 Top Tool Buttons */}
      <div className="p-2 grid grid-cols-4 gap-1.5 border-b border-slate-200 bg-[#f8fafc]">
        <button
          onClick={() => setWorkspaceView('schematic')}
          className="flex flex-col items-center justify-center py-1.5 px-1 rounded border border-[#0f766e] bg-[#ccfbf1]/50 text-[#0f766e] text-[11px] font-medium cursor-pointer"
          title="Seleccionar y editar elementos del diagrama"
        >
          <MousePointer className="w-4 h-4 mb-0.5" />
          <span>Editar</span>
        </button>

        <button
          onClick={() => activeRung && toggleParallelBranch(activeRung.id, '%QX0.0')}
          className="flex flex-col items-center justify-center py-1.5 px-1 rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-medium cursor-pointer"
          title="Añadir o quitar rama paralela OR (Enclavamiento)"
        >
          <GitBranch className="w-4 h-4 mb-0.5 text-slate-600" />
          <span>Rama OR</span>
        </button>

        <button
          onClick={() => toggleProbe('%QX0.0')}
          className="flex flex-col items-center justify-center py-1.5 px-1 rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-medium cursor-pointer"
          title="Conmutar sonda en el Osciloscopio PLC"
        >
          <Activity className="w-4 h-4 mb-0.5 text-slate-600" />
          <span>Sonda</span>
        </button>

        <button
          onClick={() => {
            if (activeRung && selectedElementId) {
              deleteElement(activeRung.id, selectedElementId);
            }
          }}
          className="flex flex-col items-center justify-center py-1.5 px-1 rounded border border-slate-300 bg-white hover:bg-rose-50 hover:border-rose-300 text-slate-700 hover:text-rose-700 text-[11px] font-medium cursor-pointer"
          title="Borrar bloque seleccionado"
        >
          <Trash2 className="w-4 h-4 mb-0.5" />
          <span>Borrar</span>
        </button>
      </div>

      {/* Search Box */}
      <div className="p-2 border-b border-slate-200 bg-[#f8fafc]">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar bloque o red ( / )"
            className="w-full pl-8 pr-2.5 py-1.5 rounded border border-slate-300 bg-white text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#0f766e]"
          />
        </div>
      </div>

      {/* Categorized Accordion List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-200/80">
        {CATEGORIES.map((cat) => {
          const filtered = cat.items.filter(
            (i) =>
              !search.trim() ||
              i.name.toLowerCase().includes(search.toLowerCase()) ||
              i.desc.toLowerCase().includes(search.toLowerCase()) ||
              i.type.toLowerCase().includes(search.toLowerCase())
          );
          if (search.trim() && filtered.length === 0) return null;
          const isOpen = search.trim() ? true : !!openCats[cat.id];

          return (
            <div key={cat.id} className="bg-[#f4f6f8]">
              <button
                onClick={() => toggleCat(cat.id)}
                className="w-full px-3 py-2 flex items-center justify-between text-xs font-semibold text-slate-800 hover:bg-slate-200/60 transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  {isOpen ? (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                  )}
                  {cat.title}
                </span>
                <span className="text-[11px] font-normal text-slate-500">{filtered.length}</span>
              </button>

              {isOpen && (
                <div className="px-2 pb-2 space-y-1 bg-white/70">
                  {filtered.map((item) => (
                    <button
                      key={item.type}
                      onClick={() => {
                        setWorkspaceView('schematic');
                        if (activeRung) addElementToRung(activeRung.id, item.type);
                      }}
                      className="w-full p-1.5 rounded hover:bg-teal-50/80 border border-transparent hover:border-teal-200 flex items-center gap-2.5 text-left transition-all cursor-pointer group"
                    >
                      <div className="w-11 h-7 shrink-0 rounded bg-slate-100 group-hover:bg-teal-100/70 border border-slate-300 flex items-center justify-center font-mono text-[10px] font-bold text-[#0f766e]">
                        {item.glyph}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-800 truncate">
                          {item.name}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate">{item.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Industrial Networks Quick Actions Category */}
        <div className="bg-[#f4f6f8]">
          <button
            onClick={() => toggleCat('networks')}
            className="w-full px-3 py-2 flex items-center justify-between text-xs font-semibold text-slate-800 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              {openCats.networks ? (
                <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
              )}
              Redes Industriales KC868
            </span>
            <span className="text-[11px] font-normal text-slate-500">4</span>
          </button>

          {openCats.networks && (
            <div className="px-2 pb-2.5 space-y-1 bg-white/70">
              <button
                onClick={() => {
                  sendModbusTCPRequest(1, 0, 8);
                  setWorkspaceView('networks');
                }}
                className="w-full p-1.5 rounded hover:bg-teal-50 border border-transparent hover:border-teal-200 flex items-center gap-2.5 text-left cursor-pointer"
              >
                <div className="w-11 h-7 shrink-0 rounded bg-teal-50 border border-teal-300 flex items-center justify-center font-mono text-[10px] font-bold text-teal-800">
                  TCP
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-800">Modbus TCP (502)</div>
                  <div className="text-[10px] text-slate-500 truncate">
                    Trama MBAP + PDU sobre LAN8720
                  </div>
                </div>
              </button>

              <button
                onClick={() => {
                  sendModbusRTURequest(3, 0, 4);
                  setWorkspaceView('networks');
                }}
                className="w-full p-1.5 rounded hover:bg-amber-50 border border-transparent hover:border-amber-200 flex items-center gap-2.5 text-left cursor-pointer"
              >
                <div className="w-11 h-7 shrink-0 rounded bg-amber-50 border border-amber-300 flex items-center justify-center font-mono text-[10px] font-bold text-amber-800">
                  RS485
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-800">Modbus RTU (CRC16)</div>
                  <div className="text-[10px] text-slate-500 truncate">
                    GPIO16 RX / GPIO13 TX · Par trenzado
                  </div>
                </div>
              </button>

              <button
                onClick={() => {
                  captureI2CBusFrames();
                  setWorkspaceView('networks');
                }}
                className="w-full p-1.5 rounded hover:bg-indigo-50 border border-transparent hover:border-indigo-200 flex items-center gap-2.5 text-left cursor-pointer"
              >
                <div className="w-11 h-7 shrink-0 rounded bg-indigo-50 border border-indigo-300 flex items-center justify-center font-mono text-[10px] font-bold text-indigo-800">
                  I²C
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-800">Bus I²C 4×PCF8574</div>
                  <div className="text-[10px] text-slate-500 truncate">
                    0x22, 0x21, 0x24, 0x25 (400 kHz)
                  </div>
                </div>
              </button>

              <button
                onClick={() => setWorkspaceView('networks')}
                className="w-full p-1.5 rounded hover:bg-purple-50 border border-transparent hover:border-purple-200 flex items-center gap-2.5 text-left cursor-pointer"
              >
                <div className="w-11 h-7 shrink-0 rounded bg-purple-50 border border-purple-300 flex items-center justify-center font-mono text-[10px] font-bold text-purple-800">
                  MQTT
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-800">MQTT Sparkplug B</div>
                  <div className="text-[10px] text-slate-500 truncate">
                    IIoT Broker & Mapa SCADA OpenPLC
                  </div>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
