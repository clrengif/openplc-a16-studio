import React, { useState } from 'react';
import {
  MousePointer,
  GitBranch,
  Activity,
  Trash2,
  X,
} from 'lucide-react';
import { usePLCStore } from '../store/usePLCStore';
import { LadderElementType } from '../types/plc';

interface LibraryItem {
  type: LadderElementType;
  glyph: string;
  nameEs: string;
  nameEn: string;
  descEs: string;
  descEn: string;
}

interface LibraryCategory {
  id: string;
  titleEs: string;
  titleEn: string;
  items: LibraryItem[];
}

const CATEGORIES: LibraryCategory[] = [
  {
    id: 'contacts',
    titleEs: 'Contactos y Flancos',
    titleEn: 'Contacts & Edges',
    items: [
      { type: 'NO', glyph: '─┤ ├─', nameEs: 'Contacto NA (NO)', nameEn: 'NO Contact', descEs: 'Normalmente abierto (%IX, %QX, %MX)', descEn: 'Normally open (%IX, %QX, %MX)' },
      { type: 'NC', glyph: '─┤/├─', nameEs: 'Contacto NC', nameEn: 'NC Contact', descEs: 'Normalmente cerrado invertido', descEn: 'Normally closed inverted' },
      { type: 'R_TRIG', glyph: '─┤P├─', nameEs: 'Flanco Subida (R_TRIG)', nameEn: 'Rising Edge (R_TRIG)', descEs: 'Pulso de 1 scan al pasar 0 → 1', descEn: '1-scan pulse on 0 → 1' },
      { type: 'F_TRIG', glyph: '─┤N├─', nameEs: 'Flanco Bajada (F_TRIG)', nameEn: 'Falling Edge (F_TRIG)', descEs: 'Pulso de 1 scan al pasar 1 → 0', descEn: '1-scan pulse on 1 → 0' },
    ],
  },
  {
    id: 'coils',
    titleEs: 'Bobinas y Biestables',
    titleEn: 'Coils & Bistables',
    items: [
      { type: 'COIL', glyph: '─( )─', nameEs: 'Bobina Estándar', nameEn: 'Standard Coil', descEs: 'Escribe salida %QX o marca %MX', descEn: 'Writes %QX output or %MX marker' },
      { type: 'NEG_COIL', glyph: '─(/)─', nameEs: 'Bobina Negada', nameEn: 'Negated Coil', descEs: 'Escribe el valor inverso del rung', descEn: 'Writes inverted rung state' },
      { type: 'SET', glyph: '─(S)─', nameEs: 'Bobina SET (Latch)', nameEn: 'SET Coil (Latch)', descEs: 'Enclava salida en TRUE al energizar', descEn: 'Latches output TRUE' },
      { type: 'RESET', glyph: '─(R)─', nameEs: 'Bobina RESET (Unlatch)', nameEn: 'RESET Coil (Unlatch)', descEs: 'Desenclava salida a FALSE', descEn: 'Unlatches output FALSE' },
      { type: 'SR', glyph: '[ SR ]', nameEs: 'Biestable SR', nameEn: 'SR Bistable', descEs: 'Flip-Flop con Set dominante (S1 / R)', descEn: 'Set-dominant flip-flop (S1 / R)' },
      { type: 'RS', glyph: '[ RS ]', nameEs: 'Biestable RS', nameEn: 'RS Bistable', descEs: 'Flip-Flop con Reset dominante (S / R1)', descEn: 'Reset-dominant flip-flop (S / R1)' },
    ],
  },
  {
    id: 'timers',
    titleEs: 'Temporizadores IEC',
    titleEn: 'IEC Timers',
    items: [
      { type: 'TON', glyph: '[TON]', nameEs: 'TON (On-Delay)', nameEn: 'TON (On-Delay)', descEs: 'Retardo a la conexión (IN, PT -> Q, ET)', descEn: 'On-delay timer (IN, PT -> Q, ET)' },
      { type: 'TOF', glyph: '[TOF]', nameEs: 'TOF (Off-Delay)', nameEn: 'TOF (Off-Delay)', descEs: 'Retardo a la desconexión tras flanco', descEn: 'Off-delay timer' },
      { type: 'TP', glyph: '[ TP ]', nameEs: 'TP (Temporizador Pulso)', nameEn: 'TP (Pulse Timer)', descEs: 'Pulso exacto de duración PT', descEn: 'Fixed pulse duration PT' },
    ],
  },
  {
    id: 'counters',
    titleEs: 'Contadores IEC',
    titleEn: 'IEC Counters',
    items: [
      { type: 'CTU', glyph: '[CTU]', nameEs: 'CTU (Ascendente)', nameEn: 'CTU (Count Up)', descEs: 'Cuenta flancos CU hasta PV (Reset R)', descEn: 'Counts up on CU to PV (Reset R)' },
      { type: 'CTD', glyph: '[CTD]', nameEs: 'CTD (Descendente)', nameEn: 'CTD (Count Down)', descEs: 'Carga PV con LD y descuenta hasta 0', descEn: 'Loads PV on LD and counts down to 0' },
      { type: 'CTUD', glyph: '[CTUD]', nameEs: 'CTUD (Reversible)', nameEn: 'CTUD (Up/Down)', descEs: 'Contador bidireccional CU / CD', descEn: 'Bidirectional CU / CD counter' },
    ],
  },
  {
    id: 'comparators',
    titleEs: 'Comparadores Analógicos',
    titleEn: 'Analog Comparators',
    items: [
      { type: 'GT', glyph: '[ > ]', nameEs: 'Mayor que (GT)', nameEn: 'Greater Than (GT)', descEs: 'Activa si IN1 (%IW/%MW) > IN2', descEn: 'True if IN1 (%IW/%MW) > IN2' },
      { type: 'GE', glyph: '[ >= ]', nameEs: 'Mayor o igual (GE)', nameEn: 'Greater or Equal (GE)', descEs: 'Activa si IN1 >= IN2', descEn: 'True if IN1 >= IN2' },
      { type: 'EQ', glyph: '[ == ]', nameEs: 'Igual a (EQ)', nameEn: 'Equal (EQ)', descEs: 'Activa si IN1 == IN2', descEn: 'True if IN1 == IN2' },
      { type: 'NE', glyph: '[ <> ]', nameEs: 'Distinto de (NE)', nameEn: 'Not Equal (NE)', descEs: 'Activa si IN1 <> IN2', descEn: 'True if IN1 <> IN2' },
      { type: 'LT', glyph: '[ < ]', nameEs: 'Menor que (LT)', nameEn: 'Less Than (LT)', descEs: 'Activa si IN1 < IN2', descEn: 'True if IN1 < IN2' },
      { type: 'LE', glyph: '[ <= ]', nameEs: 'Menor o igual (LE)', nameEn: 'Less or Equal (LE)', descEs: 'Activa si IN1 <= IN2', descEn: 'True if IN1 <= IN2' },
    ],
  },
  {
    id: 'math',
    titleEs: 'Aritmética y Registros',
    titleEn: 'Math & Registers',
    items: [
      { type: 'MOVE', glyph: '[MOVE]', nameEs: 'Transferir (MOVE)', nameEn: 'Move (MOVE)', descEs: 'Copia %IW/C0.CV a Holding Reg %MW', descEn: 'Copies %IW/C0.CV to %MW' },
      { type: 'ADD', glyph: '[ADD]', nameEs: 'Sumar (ADD)', nameEn: 'Add (ADD)', descEs: 'DEST := IN1 + IN2 (16-bit INT)', descEn: 'DEST := IN1 + IN2 (16-bit INT)' },
      { type: 'SUB', glyph: '[SUB]', nameEs: 'Restar (SUB)', nameEn: 'Subtract (SUB)', descEs: 'DEST := IN1 - IN2 (16-bit INT)', descEn: 'DEST := IN1 - IN2 (16-bit INT)' },
      { type: 'MUL', glyph: '[MUL]', nameEs: 'Multiplicar (MUL)', nameEn: 'Multiply (MUL)', descEs: 'DEST := IN1 * IN2 (Escalado)', descEn: 'DEST := IN1 * IN2 (Scaling)' },
      { type: 'DIV', glyph: '[DIV]', nameEs: 'Dividir (DIV)', nameEn: 'Divide (DIV)', descEs: 'DEST := IN1 / IN2 (Entero)', descEn: 'DEST := IN1 / IN2 (Integer)' },
    ],
  },
];

interface LeftLibrarySidebarProps {
  width: number;
  onClose: () => void;
}

export const LeftLibrarySidebar: React.FC<LeftLibrarySidebarProps> = ({ width, onClose }) => {
  const {
    uiLocale,
    rungs,
    selectedRungId,
    selectedElementId,
    addElementToRung,
    toggleParallelBranch,
    deleteElement,
    setWorkspaceView,
  } = usePLCStore();

  const isEn = uiLocale === 'en';
  const [search, setSearch] = useState('');
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({
    contacts: true,
    coils: true,
    timers: true,
    counters: false,
    comparators: false,
    math: false,
  });

  const activeRung = rungs.find((r) => r.id === selectedRungId) ?? rungs[0];

  const toggleCat = (id: string) =>
    setOpenCats((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <nav
      aria-label={isEn ? 'Components' : 'Componentes'}
      style={{ width }}
      className="shrink-0 h-full bg-[#f3f5f7] flex flex-col gap-2 p-2.5 select-none overflow-hidden"
    >
      {/* Top 4-button Tool Row (#toolbox) identical to Simulino + Close X */}
      <div className="flex items-center gap-1">
        <div className="grid grid-cols-4 gap-1 flex-1">
          <button
            onClick={() => setWorkspaceView('schematic')}
            className="flex flex-col items-center gap-0.5 py-1 px-0.5 rounded-[4px] border border-[#0b6b78] bg-[#d4e9ec] text-[#1a2732] text-[10.5px] leading-tight cursor-pointer"
          >
            <MousePointer className="w-4 h-4 text-[#0b6b78]" />
            <span>{isEn ? 'Move' : 'Mover'}</span>
          </button>

          <button
            onClick={() => activeRung && toggleParallelBranch(activeRung.id, '%QX0.0')}
            className="flex flex-col items-center gap-0.5 py-1 px-0.5 rounded-[4px] border border-[#cbd3db] hover:border-[#0b6b78] bg-[#fbfcfd] text-[#1a2732] text-[10.5px] leading-tight cursor-pointer"
            title={isEn ? 'Toggle parallel OR branch' : 'Conmutar rama paralela OR'}
          >
            <GitBranch className="w-4 h-4" />
            <span>{isEn ? 'Wire' : 'Cable'}</span>
          </button>

          <button
            onClick={() => setWorkspaceView('twin2d')}
            className="flex flex-col items-center gap-0.5 py-1 px-0.5 rounded-[4px] border border-[#cbd3db] hover:border-[#0b6b78] bg-[#fbfcfd] text-[#1a2732] text-[10.5px] leading-tight cursor-pointer"
            title={isEn ? 'Open 2D Plant Twin' : 'Abrir Gemelo 2D de Planta'}
          >
            <Activity className="w-4 h-4" />
            <span>{isEn ? 'Probe' : 'Sonda'}</span>
          </button>

          <button
            onClick={() => {
              if (activeRung && selectedElementId) {
                deleteElement(activeRung.id, selectedElementId);
              }
            }}
            className="flex flex-col items-center gap-0.5 py-1 px-0.5 rounded-[4px] border border-[#cbd3db] hover:border-[#ae2c2c] bg-[#fbfcfd] text-[#1a2732] text-[10.5px] leading-tight cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            <span>{isEn ? 'Delete' : 'Borrar'}</span>
          </button>
        </div>

        <button
          onClick={onClose}
          title={isEn ? 'Hide components panel (View → Components panel)' : 'Ocultar panel (Ver → Panel de componentes)'}
          className="p-1 rounded hover:bg-[#cbd3db] text-[#5a6875] hover:text-[#18232e] cursor-pointer self-start"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Search Box (#search) identical to Simulino */}
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={isEn ? 'Search components  ( / )' : 'Buscar componente  ( / )'}
        spellCheck={false}
        autoComplete="off"
        className="w-full px-2.5 py-1 rounded-[4px] border border-[#cbd3db] focus:border-[#0b6b78] bg-[#fbfcfd] text-[13px] text-[#18232e] placeholder:text-[#5a6875] focus:outline-none"
      />

      {/* Categorized Accordion List (#catalog) identical to Simulino */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-1 -mx-1 px-1">
        {CATEGORIES.map((cat) => {
          const title = isEn ? cat.titleEn : cat.titleEs;
          const filtered = cat.items.filter((i) => {
            if (!search.trim()) return true;
            const q = search.toLowerCase();
            return (
              i.nameEs.toLowerCase().includes(q) ||
              i.nameEn.toLowerCase().includes(q) ||
              i.descEs.toLowerCase().includes(q) ||
              i.descEn.toLowerCase().includes(q) ||
              i.type.toLowerCase().includes(q)
            );
          });
          if (search.trim() && filtered.length === 0) return null;
          const isOpen = search.trim() ? true : !!openCats[cat.id];

          return (
            <div key={cat.id} className="shrink-0">
              <button
                onClick={() => toggleCat(cat.id)}
                style={{ font: '600 14px/1.1 var(--display)', letterSpacing: '0.03em' }}
                className="w-full py-1.5 px-1 flex items-center justify-between border-b border-[#cbd3db] text-[#18232e] cursor-pointer"
              >
                <span className="flex items-center">
                  <span className="inline-block w-3.5 text-[11px] text-[#5a6875] text-left">
                    {isOpen ? '▾' : '▸'}
                  </span>
                  <span>{title}</span>
                </span>
                <em className="not-italic font-mono text-[11px] font-normal text-[#5a6875]">
                  {filtered.length}
                </em>
              </button>

              {isOpen && (
                <div className="py-1 flex flex-col gap-0.5">
                  {filtered.map((item) => (
                    <button
                      key={item.type}
                      onClick={() => {
                        setWorkspaceView('schematic');
                        if (activeRung) addElementToRung(activeRung.id, item.type);
                      }}
                      className="w-full grid grid-cols-[44px_minmax(0,1fr)] gap-2 items-center text-left py-1 px-1 rounded-[4px] border border-transparent hover:border-[#0b6b78] hover:bg-[#fbfcfd] text-[#1a2732] cursor-pointer"
                    >
                      <span className="h-[22px] rounded-[3px] bg-[#fbfcfd] border border-[#cbd3db] flex items-center justify-center font-mono text-[10px] font-medium text-[#0b6b78]">
                        {item.glyph}
                      </span>
                      <span className="min-w-0">
                        <b className="block font-medium text-[12.5px] leading-tight truncate">
                          {isEn ? item.nameEn : item.nameEs}
                        </b>
                        <small className="block text-[10.5px] text-[#5a6875] leading-tight truncate">
                          {isEn ? item.descEn : item.descEs}
                        </small>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
};
