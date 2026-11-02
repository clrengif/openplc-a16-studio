import {
  CompileDiagnostic,
  CounterBlockState,
  LadderRung,
  TimerBlockState,
  VariableSymbol,
} from '../types/plc';
import { iecAddressToIndex } from '../utils/defaultProgram';

export interface PLCMemorySnapshot {
  inputs: boolean[];                       // 16 Digital Inputs (%IX0.0 .. %IX1.7)
  outputs: boolean[];                      // 16 Relay Outputs (%QX0.0 .. %QX1.7)
  markers: boolean[];                      // 16 Bit Markers (%MX0.0 .. %MX1.7)
  words: number[];                         // 16 Holding Words (%MW0 .. %MW15)
  analogs?: number[];                      // 8 Input Words (%IW0 .. %IW7: ADC1..4 + HT1..3 + RF)
  timers: Record<string, TimerBlockState>; // T0..T7
  counters: Record<string, CounterBlockState>; // C0..C7
  edgeMemory?: Record<string, boolean>;    // Edge detection memory for R_TRIG / F_TRIG
  symbols: VariableSymbol[];
}

/**
 * Resolve any IEC 61131-3 address, symbolic tag, or FB property (e.g., T0.Q, C0.Q) into a boolean value
 */
export function readBooleanVariable(rawName: string, mem: PLCMemorySnapshot): boolean {
  const token = rawName.trim().toUpperCase();
  if (token === 'TRUE' || token === '1') return true;
  if (token === 'FALSE' || token === '0') return false;

  const symbol = mem.symbols.find((s) => s.name.toUpperCase() === token);
  const resolved = symbol ? symbol.address.toUpperCase() : token;

  // Timer Q output: T0 or T0.Q
  const timerMatch = resolved.match(/^(T\d+)(?:\.Q)?$/);
  if (timerMatch) {
    return mem.timers[timerMatch[1]]?.Q ?? false;
  }

  // Counter Q or QD output: C0, C0.Q, C0.QU, C0.QD
  const counterQdMatch = resolved.match(/^(C\d+)\.QD$/);
  if (counterQdMatch) {
    return mem.counters[counterQdMatch[1]]?.QD ?? false;
  }
  const counterMatch = resolved.match(/^(C\d+)(?:\.Q|\.QU)?$/);
  if (counterMatch) {
    return mem.counters[counterMatch[1]]?.Q ?? false;
  }

  const parsed = iecAddressToIndex(resolved);
  if (parsed) {
    const { prefix, index } = parsed;
    if (index >= 0 && index < 16) {
      if (prefix === '%IX') return mem.inputs[index] ?? false;
      if (prefix === '%QX') return mem.outputs[index] ?? false;
      if (prefix === '%MX') return mem.markers[index] ?? false;
    }
  }

  return false;
}

/**
 * Write a boolean value to an IEC output or internal bit (%QX0.0..%QX1.7 or %MX0.0..%MX1.7)
 */
export function writeBooleanVariable(rawName: string, value: boolean, mem: PLCMemorySnapshot): void {
  const token = rawName.trim().toUpperCase();
  const symbol = mem.symbols.find((s) => s.name.toUpperCase() === token);
  const resolved = symbol ? symbol.address.toUpperCase() : token;

  const parsed = iecAddressToIndex(resolved);
  if (parsed) {
    const { prefix, index } = parsed;
    if (index >= 0 && index < 16) {
      if (prefix === '%QX') {
        mem.outputs[index] = value;
      } else if (prefix === '%MX') {
        mem.markers[index] = value;
      }
    }
  }
}

/**
 * Read integer word variable (%MW0..%MW15, %IW0..%IW7, T0.ET, C0.CV, or literal integer)
 */
export function readWordVariable(rawName: string, mem: PLCMemorySnapshot): number {
  const token = rawName.trim().toUpperCase();
  if (/^-?\d+$/.test(token)) {
    return parseInt(token, 10);
  }
  const symbol = mem.symbols.find((s) => s.name.toUpperCase() === token);
  const resolved = symbol ? symbol.address.toUpperCase() : token;

  const mwMatch = resolved.match(/^%MW(\d+)$/);
  if (mwMatch) {
    const idx = parseInt(mwMatch[1], 10);
    if (idx >= 0 && idx < 16) return mem.words[idx] ?? 0;
  }

  const iwMatch = resolved.match(/^%IW(\d+)$/);
  if (iwMatch) {
    const idx = parseInt(iwMatch[1], 10);
    if (mem.analogs && idx >= 0 && idx < mem.analogs.length) {
      return mem.analogs[idx] ?? 0;
    }
  }

  const timerEtMatch = resolved.match(/^(T\d+)\.ET$/);
  if (timerEtMatch) {
    return Math.round(mem.timers[timerEtMatch[1]]?.ET ?? 0);
  }

  const counterCvMatch = resolved.match(/^(C\d+)\.CV$/);
  if (counterCvMatch) {
    return mem.counters[counterCvMatch[1]]?.CV ?? 0;
  }

  return 0;
}

export function writeWordVariable(rawName: string, value: number, mem: PLCMemorySnapshot): void {
  const token = rawName.trim().toUpperCase();
  const symbol = mem.symbols.find((s) => s.name.toUpperCase() === token);
  const resolved = symbol ? symbol.address.toUpperCase() : token;

  const mwMatch = resolved.match(/^%MW(\d+)$/);
  if (mwMatch) {
    const idx = parseInt(mwMatch[1], 10);
    if (idx >= 0 && idx < 16) {
      mem.words[idx] = Math.trunc(value);
    }
  }
}

/**
 * Evaluate arithmetic expression in ST or Math blocks (+, -, *, /, MOD, ABS, MIN, MAX, LIMIT)
 */
export function evaluateNumericExpr(expr: string, mem: PLCMemorySnapshot): number {
  const clean = expr.trim();

  // Built-in IEC functions: ABS(x), MIN(a,b), MAX(a,b), LIMIT(mn, val, mx)
  const fnMatch = clean.match(/^(ABS|MIN|MAX|LIMIT)\s*\((.+)\)$/i);
  if (fnMatch) {
    const fn = fnMatch[1].toUpperCase();
    const args = fnMatch[2].split(',').map((a) => evaluateNumericExpr(a, mem));
    if (fn === 'ABS') return Math.abs(args[0] ?? 0);
    if (fn === 'MIN') return Math.min(args[0] ?? 0, args[1] ?? 0);
    if (fn === 'MAX') return Math.max(args[0] ?? 0, args[1] ?? 0);
    if (fn === 'LIMIT') {
      const mn = args[0] ?? 0;
      const val = args[1] ?? 0;
      const mx = args[2] ?? 100;
      return Math.max(mn, Math.min(mx, val));
    }
  }

  // Binary arithmetic (+, -, *, /, MOD)
  const addSubMatch = clean.match(/^(.+?)\s*([+-])\s*([^+-]+)$/);
  if (addSubMatch && !/^-?\d+$/.test(clean)) {
    const left = evaluateNumericExpr(addSubMatch[1], mem);
    const right = evaluateNumericExpr(addSubMatch[3], mem);
    return addSubMatch[2] === '+' ? left + right : left - right;
  }

  const mulDivMatch = clean.match(/^(.+?)\s*(\*|\/|\bMOD\b)\s*(.+)$/i);
  if (mulDivMatch) {
    const left = evaluateNumericExpr(mulDivMatch[1], mem);
    const right = evaluateNumericExpr(mulDivMatch[3], mem);
    const op = mulDivMatch[2].toUpperCase();
    if (op === '*') return left * right;
    if (op === '/') return right !== 0 ? Math.trunc(left / right) : 0;
    if (op === 'MOD') return right !== 0 ? left % right : 0;
  }

  return readWordVariable(clean, mem);
}

/**
 * Standard IEC 61131-3 TON (Timer On Delay)
 */
export function evaluateTON(
  id: string,
  IN: boolean,
  PT: number,
  nowMs: number,
  timers: Record<string, TimerBlockState>
): TimerBlockState {
  const prev = timers[id] ?? {
    id,
    type: 'TON',
    IN: false,
    Q: false,
    PT,
    ET: 0,
    startTime: null,
  };

  const next: TimerBlockState = { ...prev, type: 'TON', IN, PT };

  if (!IN) {
    next.Q = false;
    next.ET = 0;
    next.startTime = null;
  } else {
    if (next.startTime === null) {
      next.startTime = nowMs;
      next.ET = 0;
      next.Q = PT <= 0;
    } else {
      next.ET = Math.min(PT, Math.max(0, nowMs - next.startTime));
      if (next.ET >= PT) {
        next.Q = true;
      }
    }
  }

  timers[id] = next;
  return next;
}

/**
 * Standard IEC 61131-3 TOF (Timer Off Delay)
 */
export function evaluateTOF(
  id: string,
  IN: boolean,
  PT: number,
  nowMs: number,
  timers: Record<string, TimerBlockState>
): TimerBlockState {
  const prev = timers[id] ?? {
    id,
    type: 'TOF',
    IN: false,
    Q: false,
    PT,
    ET: 0,
    startTime: null,
  };

  const next: TimerBlockState = { ...prev, type: 'TOF', IN, PT };

  if (IN) {
    next.Q = true;
    next.ET = 0;
    next.startTime = null;
  } else {
    if (prev.IN && !IN) {
      next.startTime = nowMs;
      next.ET = 0;
      next.Q = PT > 0;
    } else if (next.startTime !== null) {
      next.ET = Math.min(PT, Math.max(0, nowMs - next.startTime));
      if (next.ET >= PT) {
        next.Q = false;
        next.startTime = null;
      }
    } else {
      next.Q = false;
    }
  }

  timers[id] = next;
  return next;
}

/**
 * Standard IEC 61131-3 TP (Pulse Timer — fixed duration pulse on rising edge of IN)
 */
export function evaluateTP(
  id: string,
  IN: boolean,
  PT: number,
  nowMs: number,
  timers: Record<string, TimerBlockState>
): TimerBlockState {
  const prev = timers[id] ?? {
    id,
    type: 'TP',
    IN: false,
    Q: false,
    PT,
    ET: 0,
    startTime: null,
    prevIN: false,
  };

  const next: TimerBlockState = { ...prev, type: 'TP', IN, PT };

  // Rising edge when not currently pulsing starts pulse
  if (IN && !prev.prevIN && next.startTime === null) {
    next.startTime = nowMs;
    next.ET = 0;
    next.Q = PT > 0;
  } else if (next.startTime !== null) {
    next.ET = Math.min(PT, Math.max(0, nowMs - next.startTime));
    if (next.ET >= PT) {
      next.Q = false;
      if (!IN) {
        next.ET = 0;
        next.startTime = null;
      }
    } else {
      next.Q = true;
    }
  } else if (!IN) {
    next.ET = 0;
    next.Q = false;
  }

  next.prevIN = IN;
  timers[id] = next;
  return next;
}

/**
 * Standard IEC 61131-3 CTU (Count Up)
 */
export function evaluateCTU(
  id: string,
  CU: boolean,
  R: boolean,
  PV: number,
  counters: Record<string, CounterBlockState>
): CounterBlockState {
  const prev = counters[id] ?? {
    id,
    type: 'CTU',
    CU: false,
    R: false,
    Q: false,
    PV,
    CV: 0,
    prevCU: false,
  };

  let cv = prev.CV;
  if (R) {
    cv = 0;
  } else if (CU && !prev.prevCU) {
    cv = Math.min(32767, cv + 1);
  }

  const next: CounterBlockState = {
    id,
    type: 'CTU',
    CU,
    R,
    PV,
    CV: cv,
    Q: cv >= PV,
    prevCU: CU,
  };

  counters[id] = next;
  return next;
}

/**
 * Standard IEC 61131-3 CTD (Count Down — loads PV when LD is true, decrements on CD rising edge, Q true when CV <= 0)
 */
export function evaluateCTD(
  id: string,
  CD: boolean,
  LD: boolean,
  PV: number,
  counters: Record<string, CounterBlockState>
): CounterBlockState {
  const prev = counters[id] ?? {
    id,
    type: 'CTD',
    CU: false,
    CD: false,
    R: false,
    LD: false,
    Q: false,
    PV,
    CV: PV,
    prevCU: false,
    prevCD: false,
  };

  let cv = prev.CV;
  if (LD) {
    cv = PV;
  } else if (CD && !prev.prevCD) {
    cv = Math.max(-32768, cv - 1);
  }

  const next: CounterBlockState = {
    id,
    type: 'CTD',
    CU: false,
    CD,
    R: LD,
    LD,
    PV,
    CV: cv,
    Q: cv <= 0,
    prevCU: false,
    prevCD: CD,
  };

  counters[id] = next;
  return next;
}

/**
 * Standard IEC 61131-3 CTUD (Up/Down Counter)
 */
export function evaluateCTUD(
  id: string,
  CU: boolean,
  CD: boolean,
  R: boolean,
  PV: number,
  counters: Record<string, CounterBlockState>
): CounterBlockState {
  const prev = counters[id] ?? {
    id,
    type: 'CTUD',
    CU: false,
    CD: false,
    R: false,
    Q: false,
    QD: false,
    PV,
    CV: 0,
    prevCU: false,
    prevCD: false,
  };

  let cv = prev.CV;
  if (R) {
    cv = 0;
  } else {
    if (CU && !prev.prevCU) cv = Math.min(32767, cv + 1);
    if (CD && !prev.prevCD) cv = Math.max(-32768, cv - 1);
  }

  const next: CounterBlockState = {
    id,
    type: 'CTUD',
    CU,
    CD,
    R,
    PV,
    CV: cv,
    Q: cv >= PV,
    QD: cv <= 0,
    prevCU: CU,
    prevCD: CD,
  };

  counters[id] = next;
  return next;
}

/**
 * Evaluate all Ladder Diagram Rungs for a single deterministic PLC Scan Cycle
 */
export function executeLadderScan(
  rungs: LadderRung[],
  mem: PLCMemorySnapshot,
  nowMs: number
): LadderRung[] {
  if (!mem.edgeMemory) mem.edgeMemory = {};

  return rungs.map((rung) => {
    let power = true;

    let parallelBranchOut = false;
    let updatedBranch = rung.branchElements;
    if (rung.branchElements && rung.branchElements.length > 0) {
      let branchPower = true;
      updatedBranch = rung.branchElements.map((bEl) => {
        const pIn = branchPower;
        let elActive = false;
        if (bEl.type === 'NO') {
          elActive = readBooleanVariable(bEl.variable, mem);
          branchPower = pIn && elActive;
        } else if (bEl.type === 'NC') {
          elActive = !readBooleanVariable(bEl.variable, mem);
          branchPower = pIn && elActive;
        }
        return {
          ...bEl,
          powerIn: pIn,
          energized: elActive,
          powerOut: branchPower,
        };
      });
      parallelBranchOut = branchPower;
    }

    const updatedElements = rung.elements.map((el, index) => {
      const powerIn = power;
      let elementActive = false;
      let powerOut = powerIn;
      let lastNumericResult = el.lastNumericResult;

      switch (el.type) {
        case 'NO': {
          elementActive = readBooleanVariable(el.variable, mem);
          powerOut = powerIn && elementActive;
          if (index === 0 && rung.branchElements && rung.branchElements.length > 0) {
            powerOut = powerOut || parallelBranchOut;
          }
          break;
        }
        case 'NC': {
          elementActive = !readBooleanVariable(el.variable, mem);
          powerOut = powerIn && elementActive;
          if (index === 0 && rung.branchElements && rung.branchElements.length > 0) {
            powerOut = powerOut || parallelBranchOut;
          }
          break;
        }
        case 'R_TRIG': {
          const sig = readBooleanVariable(el.variable, mem);
          const prev = mem.edgeMemory![el.id] ?? false;
          elementActive = sig && !prev;
          mem.edgeMemory![el.id] = sig;
          powerOut = powerIn && elementActive;
          break;
        }
        case 'F_TRIG': {
          const sig = readBooleanVariable(el.variable, mem);
          const prev = mem.edgeMemory![el.id] ?? false;
          elementActive = !sig && prev;
          mem.edgeMemory![el.id] = sig;
          powerOut = powerIn && elementActive;
          break;
        }
        case 'TON': {
          const pt = el.presetMs ?? 2000;
          const tState = evaluateTON(el.variable.toUpperCase(), powerIn, pt, nowMs, mem.timers);
          elementActive = tState.Q;
          powerOut = tState.Q;
          break;
        }
        case 'TOF': {
          const pt = el.presetMs ?? 2000;
          const tState = evaluateTOF(el.variable.toUpperCase(), powerIn, pt, nowMs, mem.timers);
          elementActive = tState.Q;
          powerOut = tState.Q;
          break;
        }
        case 'TP': {
          const pt = el.presetMs ?? 1500;
          const tState = evaluateTP(el.variable.toUpperCase(), powerIn, pt, nowMs, mem.timers);
          elementActive = tState.Q;
          powerOut = tState.Q;
          break;
        }
        case 'CTU': {
          const pv = el.presetCount ?? 5;
          const resetVal = el.resetVariable ? readBooleanVariable(el.resetVariable, mem) : false;
          const cState = evaluateCTU(el.variable.toUpperCase(), powerIn, resetVal, pv, mem.counters);
          elementActive = cState.Q;
          powerOut = cState.Q;
          break;
        }
        case 'CTD': {
          const pv = el.presetCount ?? 5;
          const loadVal = el.resetVariable ? readBooleanVariable(el.resetVariable, mem) : false;
          const cState = evaluateCTD(el.variable.toUpperCase(), powerIn, loadVal, pv, mem.counters);
          elementActive = cState.Q;
          powerOut = cState.Q;
          break;
        }
        case 'CTUD': {
          const pv = el.presetCount ?? 5;
          const cdVal = el.auxVariable ? readBooleanVariable(el.auxVariable, mem) : false;
          const resetVal = el.resetVariable ? readBooleanVariable(el.resetVariable, mem) : false;
          const cState = evaluateCTUD(
            el.variable.toUpperCase(),
            powerIn,
            cdVal,
            resetVal,
            pv,
            mem.counters
          );
          elementActive = cState.Q;
          powerOut = cState.Q;
          break;
        }
        case 'EQ':
        case 'NE':
        case 'GT':
        case 'GE':
        case 'LT':
        case 'LE': {
          const v1 = readWordVariable(el.variable, mem);
          const v2 = readWordVariable(el.auxVariable || '0', mem);
          lastNumericResult = v1;
          let cmp = false;
          if (el.type === 'EQ') cmp = v1 === v2;
          if (el.type === 'NE') cmp = v1 !== v2;
          if (el.type === 'GT') cmp = v1 > v2;
          if (el.type === 'GE') cmp = v1 >= v2;
          if (el.type === 'LT') cmp = v1 < v2;
          if (el.type === 'LE') cmp = v1 <= v2;
          elementActive = powerIn && cmp;
          powerOut = elementActive;
          break;
        }
        case 'ADD':
        case 'SUB':
        case 'MUL':
        case 'DIV':
        case 'MOVE': {
          if (powerIn) {
            const v1 = readWordVariable(el.variable, mem);
            const v2 = readWordVariable(el.auxVariable || '0', mem);
            let res = v1;
            if (el.type === 'ADD') res = v1 + v2;
            if (el.type === 'SUB') res = v1 - v2;
            if (el.type === 'MUL') res = v1 * v2;
            if (el.type === 'DIV') res = v2 !== 0 ? Math.trunc(v1 / v2) : 0;
            lastNumericResult = res;
            if (el.destVariable) {
              writeWordVariable(el.destVariable, res, mem);
            }
          }
          elementActive = powerIn;
          powerOut = powerIn;
          break;
        }
        case 'COIL': {
          elementActive = powerIn;
          writeBooleanVariable(el.variable, powerIn, mem);
          powerOut = powerIn;
          break;
        }
        case 'NEG_COIL': {
          elementActive = !powerIn;
          writeBooleanVariable(el.variable, !powerIn, mem);
          powerOut = !powerIn;
          break;
        }
        case 'SET': {
          if (powerIn) {
            writeBooleanVariable(el.variable, true, mem);
          }
          elementActive = readBooleanVariable(el.variable, mem);
          powerOut = powerIn;
          break;
        }
        case 'RESET': {
          if (powerIn) {
            writeBooleanVariable(el.variable, false, mem);
          }
          elementActive = readBooleanVariable(el.variable, mem);
          powerOut = powerIn;
          break;
        }
        case 'SR': {
          // Set-dominant bistable: Q1 := S1 OR (NOT R AND Q1)
          const rVal = el.resetVariable ? readBooleanVariable(el.resetVariable, mem) : false;
          const prevQ = readBooleanVariable(el.variable, mem);
          const nextQ = powerIn || (!rVal && prevQ);
          writeBooleanVariable(el.variable, nextQ, mem);
          elementActive = nextQ;
          powerOut = nextQ;
          break;
        }
        case 'RS': {
          // Reset-dominant bistable: Q1 := NOT R1 AND (S OR Q1)
          const r1Val = el.resetVariable ? readBooleanVariable(el.resetVariable, mem) : false;
          const prevQ = readBooleanVariable(el.variable, mem);
          const nextQ = !r1Val && (powerIn || prevQ);
          writeBooleanVariable(el.variable, nextQ, mem);
          elementActive = nextQ;
          powerOut = nextQ;
          break;
        }
      }

      power = powerOut;
      return {
        ...el,
        powerIn,
        energized: elementActive,
        powerOut,
        lastNumericResult,
      };
    });

    return {
      ...rung,
      elements: updatedElements,
      branchElements: updatedBranch,
      energized: power,
    };
  });
}

/**
 * Evaluate a boolean / comparison expression in Structured Text (ST)
 */
function evaluateSTBooleanExpr(expr: string, mem: PLCMemorySnapshot): boolean {
  let clean = expr.trim();
  while (clean.startsWith('(') && clean.endsWith(')')) {
    let depth = 0;
    let balanced = true;
    for (let i = 0; i < clean.length - 1; i++) {
      if (clean[i] === '(') depth++;
      else if (clean[i] === ')') depth--;
      if (depth === 0) {
        balanced = false;
        break;
      }
    }
    if (balanced) {
      clean = clean.slice(1, -1).trim();
    } else {
      break;
    }
  }

  const splitByKeyword = (input: string, kw: string): string[] => {
    const parts: string[] = [];
    let depth = 0;
    let lastIdx = 0;
    const upper = input.toUpperCase();
    for (let i = 0; i < input.length; i++) {
      if (input[i] === '(') depth++;
      else if (input[i] === ')') depth--;
      else if (depth === 0) {
        const before = i === 0 || /[\s)]/.test(input[i - 1]);
        const after = i + kw.length >= input.length || /[\s(]/.test(input[i + kw.length]);
        if (before && after && upper.slice(i, i + kw.length) === kw) {
          parts.push(input.slice(lastIdx, i));
          lastIdx = i + kw.length;
          i += kw.length - 1;
        }
      }
    }
    if (parts.length > 0) parts.push(input.slice(lastIdx));
    return parts;
  };

  const orParts = splitByKeyword(clean, 'OR');
  if (orParts.length > 1) return orParts.some((p) => evaluateSTBooleanExpr(p, mem));

  const xorParts = splitByKeyword(clean, 'XOR');
  if (xorParts.length > 1) {
    return xorParts.reduce((acc, p) => acc !== evaluateSTBooleanExpr(p, mem), false);
  }

  const andParts = splitByKeyword(clean, 'AND');
  if (andParts.length > 1) return andParts.every((p) => evaluateSTBooleanExpr(p, mem));

  if (/^NOT\b/i.test(clean)) {
    return !evaluateSTBooleanExpr(clean.replace(/^NOT\b/i, '').trim(), mem);
  }

  const cmpMatch = clean.match(/^(.+?)\s*(>=|<=|<>|=|>|<)\s*(.+)$/);
  if (cmpMatch) {
    const leftVal = evaluateNumericExpr(cmpMatch[1], mem);
    const op = cmpMatch[2];
    const rightVal = evaluateNumericExpr(cmpMatch[3], mem);
    switch (op) {
      case '>=': return leftVal >= rightVal;
      case '<=': return leftVal <= rightVal;
      case '<>': return leftVal !== rightVal;
      case '=': return leftVal === rightVal;
      case '>': return leftVal > rightVal;
      case '<': return leftVal < rightVal;
    }
  }

  return readBooleanVariable(clean, mem);
}

/**
 * Validate and compile Structured Text (ST) code, returning diagnostics
 */
export function validateSTCode(stCode: string): CompileDiagnostic[] {
  const diagnostics: CompileDiagnostic[] = [];
  const lines = stCode.split('\n');

  if (!/\bPROGRAM\s+\w+/i.test(stCode)) {
    diagnostics.push({
      line: 1,
      severity: 'error',
      message: 'Falta declaración PROGRAM <Nombre> al inicio del bloque IEC 61131-3.',
    });
  }
  if (!/\bEND_PROGRAM\b/i.test(stCode)) {
    diagnostics.push({
      line: lines.length,
      severity: 'error',
      message: 'Falta cierre END_PROGRAM al final del código Structured Text.',
    });
  }

  let ifDepth = 0;
  let inVarBlock = false;
  let inComment = false;

  lines.forEach((rawLine, idx) => {
    const lineNum = idx + 1;
    let line = rawLine;

    if (inComment) {
      const closeIdx = line.indexOf('*)');
      if (closeIdx !== -1) {
        inComment = false;
        line = line.slice(closeIdx + 2);
      } else {
        return;
      }
    }
    line = line.replace(/\(\*.*?\*\)/g, '');
    if (line.includes('(*')) {
      inComment = true;
      line = line.slice(0, line.indexOf('(*'));
    }
    line = line.replace(/\/\/.*$/, '').trim();
    if (!line) return;

    if (/^VAR\b/i.test(line)) {
      inVarBlock = true;
      return;
    }
    if (/^END_VAR\b/i.test(line)) {
      inVarBlock = false;
      return;
    }
    if (inVarBlock || /^PROGRAM\b/i.test(line) || /^END_PROGRAM\b/i.test(line)) return;

    if (/^IF\b/i.test(line)) {
      ifDepth++;
      if (!/\bTHEN\b/i.test(line)) {
        diagnostics.push({
          line: lineNum,
          severity: 'error',
          message: `Línea ${lineNum}: Sentencia IF sin palabra clave THEN.`,
        });
      }
      return;
    }
    if (/^(ELSIF|ELSE)\b/i.test(line)) {
      if (ifDepth <= 0) {
        diagnostics.push({
          line: lineNum,
          severity: 'error',
          message: `Línea ${lineNum}: ${line.split(/\s+/)[0]} fuera de un bloque IF.`,
        });
      }
      return;
    }
    if (/^END_IF\s*;?$/i.test(line)) {
      ifDepth--;
      if (ifDepth < 0) {
        diagnostics.push({
          line: lineNum,
          severity: 'error',
          message: `Línea ${lineNum}: END_IF sin bloque IF correspondiente.`,
        });
        ifDepth = 0;
      }
      return;
    }
  });

  if (ifDepth > 0) {
    diagnostics.push({
      line: lines.length,
      severity: 'error',
      message: `Faltan ${ifDepth} cierre(s) END_IF; en el programa.`,
    });
  }

  return diagnostics;
}

/**
 * Execute Structured Text (ST) program for a single deterministic PLC Scan Cycle
 */
export function executeSTScan(stCode: string, mem: PLCMemorySnapshot, nowMs: number): void {
  const withoutBlockComments = stCode.replace(/\(\*[\s\S]*?\*\)/g, '');
  const withoutLineComments = withoutBlockComments
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, '').trim())
    .join('\n');

  let body = withoutLineComments;
  const endVarMatch = body.match(/\bEND_VAR\b/i);
  if (endVarMatch && endVarMatch.index !== undefined) {
    body = body.slice(endVarMatch.index + endVarMatch[0].length);
  } else {
    body = body.replace(/\bPROGRAM\s+\w+/i, '');
  }
  body = body.replace(/\bEND_PROGRAM\b[\s\S]*$/i, '').trim();

  const lines = body
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  interface IfFrame {
    parentActive: boolean;
    branchTaken: boolean;
    currentlyActive: boolean;
  }

  const stack: IfFrame[] = [];
  const isExecutionActive = (): boolean =>
    stack.length === 0 || stack[stack.length - 1].currentlyActive;

  for (const rawStmt of lines) {
    const stmt = rawStmt.replace(/;$/, '').trim();
    if (!stmt) continue;

    const ifMatch = stmt.match(/^IF\s+(.+?)\s+THEN$/i);
    if (ifMatch) {
      const parentActive = isExecutionActive();
      const cond = parentActive ? evaluateSTBooleanExpr(ifMatch[1], mem) : false;
      stack.push({
        parentActive,
        branchTaken: cond,
        currentlyActive: parentActive && cond,
      });
      continue;
    }

    const elsifMatch = stmt.match(/^ELSIF\s+(.+?)\s+THEN$/i);
    if (elsifMatch && stack.length > 0) {
      const top = stack[stack.length - 1];
      if (!top.parentActive || top.branchTaken) {
        top.currentlyActive = false;
      } else {
        const cond = evaluateSTBooleanExpr(elsifMatch[1], mem);
        top.currentlyActive = cond;
        if (cond) top.branchTaken = true;
      }
      continue;
    }

    if (/^ELSE$/i.test(stmt) && stack.length > 0) {
      const top = stack[stack.length - 1];
      top.currentlyActive = top.parentActive && !top.branchTaken;
      top.branchTaken = true;
      continue;
    }

    if (/^END_IF$/i.test(stmt)) {
      stack.pop();
      continue;
    }

    if (!isExecutionActive()) continue;

    // Function Block call: T0(IN := expr, PT := T#2500ms) or C0(CU := ..., R := ..., PV := 5)
    const fbMatch = stmt.match(/^(T\d+|C\d+)\s*\((.+)\)$/i);
    if (fbMatch) {
      const fbId = fbMatch[1].toUpperCase();
      const argsStr = fbMatch[2];
      const args: Record<string, string> = {};
      argsStr.split(',').forEach((pair) => {
        const [k, v] = pair.split(':=').map((s) => s.trim());
        if (k && v) args[k.toUpperCase()] = v;
      });

      if (fbId.startsWith('T')) {
        const inVal = args['IN'] ? evaluateSTBooleanExpr(args['IN'], mem) : false;
        let ptMs = 2000;
        if (args['PT']) {
          const msMatch = args['PT'].match(/T#(\d+(?:\.\d+)?)(ms|s)/i);
          if (msMatch) {
            const num = parseFloat(msMatch[1]);
            ptMs = msMatch[2].toLowerCase() === 's' ? Math.round(num * 1000) : Math.round(num);
          } else if (/^\d+$/.test(args['PT'])) {
            ptMs = parseInt(args['PT'], 10);
          }
        }
        const tType = mem.timers[fbId]?.type ?? 'TON';
        if (tType === 'TOF') evaluateTOF(fbId, inVal, ptMs, nowMs, mem.timers);
        else if (tType === 'TP') evaluateTP(fbId, inVal, ptMs, nowMs, mem.timers);
        else evaluateTON(fbId, inVal, ptMs, nowMs, mem.timers);
      } else if (fbId.startsWith('C')) {
        const cuVal = args['CU'] ? evaluateSTBooleanExpr(args['CU'], mem) : false;
        const rVal = args['R'] ? evaluateSTBooleanExpr(args['R'], mem) : false;
        const pvVal = args['PV'] ? parseInt(args['PV'], 10) || 5 : 5;
        evaluateCTU(fbId, cuVal, rVal, pvVal, mem.counters);
      }
      continue;
    }

    const assignMatch = stmt.match(/^([%\w.]+)\s*:=\s*(.+)$/);
    if (assignMatch) {
      const target = assignMatch[1].trim();
      const expr = assignMatch[2].trim();
      const sym = mem.symbols.find((s) => s.name.toUpperCase() === target.toUpperCase());
      const resolvedTarget = sym ? sym.address.toUpperCase() : target.toUpperCase();

      if (resolvedTarget.startsWith('%MW')) {
        writeWordVariable(resolvedTarget, evaluateNumericExpr(expr, mem), mem);
      } else {
        writeBooleanVariable(resolvedTarget, evaluateSTBooleanExpr(expr, mem), mem);
      }
    }
  }
}
