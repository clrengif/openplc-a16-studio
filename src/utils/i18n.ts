export type LocaleCode = 'es' | 'en';

export const LOCALES: Record<LocaleCode, string> = {
  es: 'Español',
  en: 'English',
};

const EN_DICT: Record<string, string> = {
  // Top Menus (Simulino identical structure)
  Archivo: 'File',
  Editar: 'Edit',
  Ver: 'View',
  'Simulación': 'Simulation',
  Herramientas: 'Tools',
  Ayuda: 'Help',

  // Archivo menu
  'Nuevo proyecto (.plno)': 'New project (.plno)',
  'Abrir archivo (.plno)...': 'Open file (.plno)...',
  'Ejemplos PLC (9)': 'PLC Examples (9)',
  'Circuitos Clásicos de PLC (.plno)': 'Classic PLC Circuits (.plno)',
  Guardar: 'Save',
  'Guardar como (.plno)...': 'Save as (.plno)...',
  'Exportar Firmware & HAL OpenPLC...': 'Export Firmware & OpenPLC HAL...',
  'Cerrar proyecto': 'Close project',

  // Editar menu
  '+ Añadir Red (Rung)': '+ Add Rung (Network)',
  'Conmutar Rama Paralela OR': 'Toggle Parallel OR Branch',
  'Convertir Ladder → Structured Text (ST)': 'Convert Ladder → Structured Text (ST)',
  'Reiniciar Memoria del PLC': 'Reset PLC Memory',
  'Limpiar Historial de Logs': 'Clear Log History',

  // Ver menu
  'Panel de componentes (Izquierda)': 'Components panel (Left)',
  'Panel de placa KC868-A16 (Derecha)': 'KC868-A16 board panel (Right)',
  'Panel de diagnósticos y registro (Inferior)': 'Diagnostics & log panel (Bottom)',
  'Mostrar todos los paneles': 'Show all panels',
  'Ventana central en pantalla completa': 'Fullscreen center window',
  'Volver al esquemático': 'Back to schematic',

  // Simulación menu
  'Simular en vivo': 'Simulate live',
  'Detener simulación': 'Stop simulation',
  'Ejecutar 1 ciclo de Scan (Calcular)': 'Run 1 Scan cycle (Calculate)',
  'Compilar y validar IEC 61131-3': 'Compile & validate IEC 61131-3',
  'Frecuencia de Scan': 'Scan frequency',

  // Herramientas menu (where views & labs live cleanly like Simulino)
  'Esquemático Ladder / ST': 'Ladder / ST Schematic',
  'Editor GRAFCET / SFC': 'GRAFCET / SFC Editor',
  'Gemelo Digital 2D de Planta': '2D Plant Digital Twin',
  'Laboratorio de Redes Industriales': 'Industrial Networks Lab',
  'Vista Placa KinCony KC868-A16': 'KinCony KC868-A16 Board View',
  'Consola SDK API & Servidor MCP': 'SDK API Console & MCP Server',
  'Inyectar trama Modbus TCP (502)': 'Inject Modbus TCP frame (502)',
  'Inyectar trama RS485 Modbus RTU': 'Inject RS485 Modbus RTU frame',
  'Capturar bus I²C 4×PCF8574': 'Capture I²C 4×PCF8574 bus',
  'Firmware ESP32 & Flasheo WebSerial...': 'ESP32 Firmware & WebSerial Flasher...',

  // Ayuda menu
  Idioma: 'Language',
  'Galería de ejemplos PLC...': 'PLC examples gallery...',
  'Acerca de PCLino': 'About PCLino',

  // Top bar controls (Simulino identical)
  Simular: 'Simulate',
  Detener: 'Stop',
  Calcular: 'Calculate',
  VENTANA: 'WINDOW',
  VELOCIDAD: 'SPEED',
  'Tiempo real': 'Real time',
  'Simulación detenida.': 'Simulation stopped.',
  'Simulación en curso': 'Simulation running',
  'Pantalla Completa': 'Fullscreen',
  'Volver a Modo Ventanas': 'Exit Fullscreen',

  // Left sidebar
  Mover: 'Move',
  Cable: 'Wire',
  Sonda: 'Probe',
  Borrar: 'Delete',
  'Buscar componente ( / )': 'Search components ( / )',
  'Contactos y Flancos': 'Contacts & Edges',
  'Bobinas y Biestables': 'Coils & Bistables',
  'Temporizadores IEC': 'IEC Timers',
  'Contadores IEC': 'IEC Counters',
  Comparadores: 'Comparators',
  'Matemáticas y Datos': 'Math & Data',

  // Bottom console
  'Tramas de Red': 'Network Frames',
  'Símbolos y Forzado': 'Symbols & Forcing',
  'Diagnósticos & Logs': 'Diagnostics & Logs',
  Limpiar: 'Clear',
  'Historial de Eventos & Compilador IEC 61131-3': 'Event History & IEC 61131-3 Compiler',
};

export function translateText(locale: LocaleCode, text: string): string {
  if (locale === 'es') return text;
  return EN_DICT[text] ?? text;
}
