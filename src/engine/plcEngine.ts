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
  words: number[];                         // 16 Memory Words (%MW0 .. %MW15)
  timers: Record<string, TimerBlockState>; // T0..T7
  counters: Record<string, CounterBlockState>; // C0..C7
  symbols: VariableSymbol[];
}

/**
 * Resolve any IEC 61131-3 address, symbolic tag, or FB property (e.g., T0.Q, C0.Q) into a boolean value
 */
export function readBooleanVariable(rawName: string, mem: PLCMemorySnapshot): boolean {
  const token = rawName.trim().toUpperCase();
  if (token === 'TRUE' || token === '1') return true;
  if (token === 'FALSE' || token === '0') return false;

  // Check if symbolic tag matches
  const symbol = mem.symbols.find((s) => s.name.toUpperCase() === token);
  const resolved = symbol ? symbol.address.toUpperCase() : token;

  // Timer Q output: T0 or T0.Q
  const timerMatch = resolved.match(/^(T\d+)(?:\.Q)?$/);
  if (timerMatch) {
    const tId = timerMatch[1];
    return mem.timers[tId]?.Q ?? false;
  }

  // Counter Q output: C0 or C0.Q
  const counterMatch = resolved.match(/^(C\d+)(?:\.Q)?$/);
  if (counterMatch) {
    const cId = counterMatch[1];
    return mem.counters[cId]?.Q ?? false;
  }

  // Direct IEC bit address (%IX, %QX, %MX)
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
 * Read integer word variable (%MW0..%MW15, T0.ET, C0.CV, or literal integer)
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
 * Standard IEC 61131-3 TON (Timer On Delay) evaluation using performance.now()
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

  const next: TimerBlockState = {
    ...prev,
    type: 'TON',
    IN,
    PT,
  };

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
 * Standard IEC 61131-3 TOF (Timer Off Delay) evaluation using performance.now()
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

  const next: TimerBlockState = {
    ...prev,
    type: 'TOF',
    IN,
    PT,
  };

  if (IN) {
    next.Q = true;
    next.ET = 0;
    next.startTime = null;
  } else {
    if (prev.IN && !IN) {
      // Falling edge starts off-delay timer
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
 * Standard IEC 61131-3 CTU (Count Up) evaluation with rising-edge detection
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
    // Rising edge on CU
    cv = Math.min(32767, cv + 1);
  }

  const next: CounterBlockState = {
    id,
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
 * Evaluate all Ladder Diagram Rungs for a single deterministic PLC Scan Cycle
 */
export function executeLadderScan(
  rungs: LadderRung[],
  mem: PLCMemorySnapshot,
  nowMs: number
): LadderRung[] {
  return rungs.map((rung) => {
    let power = true; // Left power rail is always energized (TRUE)

    // Evaluate optional parallel OR branch across the first element
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

      switch (el.type) {
        case 'NO': {
          elementActive = readBooleanVariable(el.variable, mem);
          powerOut = powerIn && elementActive;
          // If this is the first contact and there is a parallel OR branch, merge branch power
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
        case 'CTU': {
          const pv = el.presetCount ?? 5;
          const resetVal = el.resetVariable
            ? readBooleanVariable(el.resetVariable, mem)
            : false;
          const cState = evaluateCTU(
            el.variable.toUpperCase(),
            powerIn,
            resetVal,
            pv,
            mem.counters
          );
          elementActive = cState.Q;
          powerOut = cState.Q;
          break;
        }
        case 'COIL': {
          elementActive = powerIn;
          writeBooleanVariable(el.variable, powerIn, mem);
          powerOut = powerIn;
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
      }

      power = powerOut;
      return {
        ...el,
        powerIn,
        energized: elementActive,
        powerOut,
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
  // Remove outer balanced parens
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

  // Top-level OR / XOR split (outside parens)
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
        const after =
          i + kw.length >= input.length || /[\s(]/.test(input[i + kw.length]);
        if (before && after && upper.slice(i, i + kw.length) === kw) {
          parts.push(input.slice(lastIdx, i));
          lastIdx = i + kw.length;
          i += kw.length - 1;
        }
      }
    }
    if (parts.length > 0) {
      parts.push(input.slice(lastIdx));
    }
    return parts;
  };

  const orParts = splitByKeyword(clean, 'OR');
  if (orParts.length > 1) {
    return orParts.some((p) => evaluateSTBooleanExpr(p, mem));
  }

  const xorParts = splitByKeyword(clean, 'XOR');
  if (xorParts.length > 1) {
    return xorParts.reduce((acc, p) => acc !== evaluateSTBooleanExpr(p, mem), false);
  }

  const andParts = splitByKeyword(clean, 'AND');
  if (andParts.length > 1) {
    return andParts.every((p) => evaluateSTBooleanExpr(p, mem));
  }

  if (/^NOT\b/i.test(clean)) {
    return !evaluateSTBooleanExpr(clean.replace(/^NOT\b/i, '').trim(), mem);
  }

  // Relational comparisons (>=, <=, <>, =, >, <)
  const cmpMatch = clean.match(/^(.+?)\s*(>=|<=|<>|=|>|<)\s*(.+)$/);
  if (cmpMatch) {
    const leftVal = readWordVariable(cmpMatch[1], mem);
    const op = cmpMatch[2];
    const rightVal = readWordVariable(cmpMatch[3], mem);
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
  // Strip multi-line comments (* ... *)
  const lines = stCode.split('\n');

  const hasProgram = /\bPROGRAM\s+\w+/i.test(stCode);
  const hasEndProgram = /\bEND_PROGRAM\b/i.test(stCode);

  if (!hasProgram) {
    diagnostics.push({
      line: 1,
      severity: 'error',
      message: 'Falta declaración PROGRAM <Nombre> al inicio del bloque IEC 61131-3.',
    });
  }
  if (!hasEndProgram) {
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

    // Handle comments
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
    if (inVarBlock || /^PROGRAM\b/i.test(line) || /^END_PROGRAM\b/i.test(line)) {
      return;
    }

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

    if (!line.endsWith(';')) {
      diagnostics.push({
        line: lineNum,
        severity: 'warning',
        message: `Línea ${lineNum}: Se recomienda finalizar la instrucción ST con punto y coma (;).`,
      });
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
  // Strip (* ... *) comments and // comments
  const withoutBlockComments = stCode.replace(/\(\*[\s\S]*?\*\)/g, '');
  const withoutLineComments = withoutBlockComments
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, '').trim())
    .join('\n');

  // Extract body after END_VAR (or after PROGRAM header) and before END_PROGRAM
  let body = withoutLineComments;
  const endVarMatch = body.match(/\bEND_VAR\b/i);
  if (endVarMatch && endVarMatch.index !== undefined) {
    body = body.slice(endVarMatch.index + endVarMatch[0].length);
  } else {
    body = body.replace(/\bPROGRAM\s+\w+/i, '');
  }
  body = body.replace(/\bEND_PROGRAM\b[\s\S]*$/i, '').trim();

  // Execute statements supporting IF / ELSIF / ELSE / END_IF, Function Blocks (TON, TOF, CTU), and := assignments
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

    // IF <cond> THEN
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

    // ELSIF <cond> THEN
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

    // ELSE
    if (/^ELSE$/i.test(stmt) && stack.length > 0) {
      const top = stack[stack.length - 1];
      top.currentlyActive = top.parentActive && !top.branchTaken;
      top.branchTaken = true;
      continue;
    }

    // END_IF
    if (/^END_IF$/i.test(stmt)) {
      stack.pop();
      continue;
    }

    if (!isExecutionActive()) continue;

    // Timer Function Block invocation: T0(IN := expr, PT := T#2500ms)
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
        evaluateTON(fbId, inVal, ptMs, nowMs, mem.timers);
      } else if (fbId.startsWith('C')) {
        const cuVal = args['CU'] ? evaluateSTBooleanExpr(args['CU'], mem) : false;
        const rVal = args['R'] ? evaluateSTBooleanExpr(args['R'], mem) : false;
        const pvVal = args['PV'] ? parseInt(args['PV'], 10) || 5 : 5;
        evaluateCTU(fbId, cuVal, rVal, pvVal, mem.counters);
      }
      continue;
    }

    // Assignment: TARGET := EXPR
    const assignMatch = stmt.match(/^([%\w.]+)\s*:=\s*(.+)$/);
    if (assignMatch) {
      const target = assignMatch[1].trim();
      const expr = assignMatch[2].trim();
      if (target.toUpperCase().startsWith('%MW')) {
        writeWordVariable(target, readWordVariable(expr, mem), mem);
      } else {
        const val = evaluateSTBooleanExpr(expr, mem);
        writeBooleanVariable(target, val, mem);
      }
    }
  }
}
