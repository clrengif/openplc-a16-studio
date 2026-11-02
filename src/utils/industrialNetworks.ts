import {
  FaultInjectionConfig,
  NetworkFrameField,
  NetworkTransaction,
} from '../types/plc';

/**
 * Compute standard CRC-16/MODBUS (Polynomial 0xA001, Init 0xFFFF, Little-Endian output)
 */
export function computeModbusCRC16(bytes: number[]): { crc: number; lo: number; hi: number } {
  let crc = 0xffff;
  for (const b of bytes) {
    crc ^= b & 0xff;
    for (let bit = 0; bit < 8; bit++) {
      if ((crc & 0x0001) !== 0) {
        crc = (crc >> 1) ^ 0xa001;
      } else {
        crc = crc >> 1;
      }
    }
  }
  const lo = crc & 0xff;
  const hi = (crc >> 8) & 0xff;
  return { crc, lo, hi };
}

/**
 * Compute Longitudinal Redundancy Check (LRC XOR) used by HART Protocol
 */
export function computeHartXorChecksum(bytes: number[]): number {
  return bytes.reduce((acc, b) => (acc ^ (b & 0xff)) & 0xff, 0);
}

/**
 * Convert float32 to 4 Big-Endian IEEE-754 bytes (used in HART & Modbus Float)
 */
export function floatToIEEE754Bytes(val: number): number[] {
  const buf = new ArrayBuffer(4);
  const view = new DataView(buf);
  view.setFloat32(0, val, false); // Big-endian
  return [view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)];
}

export function toHex(val: number, bytes = 1): string {
  return val
    .toString(16)
    .toUpperCase()
    .padStart(bytes * 2, '0');
}

export function formatHexArray(bytes: number[]): string {
  return bytes.map((b) => toHex(b, 1)).join(' ');
}

export interface ModbusExecutionContext {
  inputs: boolean[];
  outputs: boolean[];
  analogs: number[];
  words: number[];
  writeCoil: (idx: number, val: boolean) => void;
  writeWord: (idx: number, val: number) => void;
  faults?: FaultInjectionConfig;
}

const nowStamp = (): string => {
  const d = new Date();
  return d.toTimeString().split(' ')[0] + '.' + String(d.getMilliseconds()).padStart(3, '0');
};

/**
 * Build and execute a real Modbus TCP/IP Request + Response pair (Port 502)
 * Supports Fault Injection (Modbus Exceptions 0x01, 0x02, 0x06)
 */
export function executeModbusTCPTransaction(
  txId: number,
  unitId: number,
  fc: number,
  startAddr: number,
  quantityOrValue: number,
  ctx: ModbusExecutionContext
): { request: NetworkTransaction; response: NetworkTransaction } {
  const txh = (txId >> 8) & 0xff;
  const txl = txId & 0xff;
  const ah = (startAddr >> 8) & 0xff;
  const al = startAddr & 0xff;

  let valToSend = quantityOrValue;
  if (fc === 0x05) {
    valToSend = quantityOrValue ? 0xff00 : 0x0000;
  }
  const vh = (valToSend >> 8) & 0xff;
  const vl = valToSend & 0xff;

  const reqBytes = [txh, txl, 0x00, 0x00, 0x00, 0x06, unitId & 0xff, fc & 0xff, ah, al, vh, vl];

  const fcNames: Record<number, string> = {
    1: 'FC01 Read Coils (%QX)',
    2: 'FC02 Read Discrete Inputs (%IX)',
    3: 'FC03 Read Holding Registers (%MW)',
    4: 'FC04 Read Input Registers (%IW)',
    5: 'FC05 Write Single Coil (%QX)',
    6: 'FC06 Write Single Register (%MW)',
  };

  const reqFields: NetworkFrameField[] = [
    {
      name: 'Transaction ID',
      hex: `${toHex(txh)} ${toHex(txl)}`,
      description: `Secuencia MBAP #${txId} para emparejar petición/respuesta TCP`,
      color: '#0f766e',
    },
    {
      name: 'Protocol ID',
      hex: '00 00',
      description: '0x0000 = Protocolo Estándar Modbus sobre TCP/IP',
      color: '#0369a1',
    },
    {
      name: 'Length',
      hex: '00 06',
      description: '6 bytes restantes en el paquete (Unit ID + PDU)',
      color: '#4338ca',
    },
    {
      name: 'Unit ID',
      hex: toHex(unitId),
      description: `ID de Unidad Esclava (${unitId}) en la pasarela KC868-A16`,
      color: '#7e22ce',
    },
    {
      name: 'Function Code',
      hex: toHex(fc),
      description: fcNames[fc] || `Función 0x${toHex(fc)}`,
      color: '#b45309',
    },
    {
      name: 'Start Address',
      hex: `${toHex(ah)} ${toHex(al)}`,
      description: `Dirección inicial offset ${startAddr} (0x${toHex(startAddr, 2)})`,
      color: '#be123c',
    },
    {
      name: fc === 5 || fc === 6 ? 'Write Value' : 'Quantity',
      hex: `${toHex(vh)} ${toHex(vl)}`,
      description:
        fc === 5
          ? quantityOrValue
            ? '0xFF00 = Forzar Bobina a ON (TRUE)'
            : '0x0000 = Forzar Bobina a OFF (FALSE)'
          : fc === 6
          ? `Escribir valor entero ${quantityOrValue} en %MW${startAddr}`
          : `Solicitar ${quantityOrValue} elemento(s) consecutivos`,
      color: '#15803d',
    },
  ];

  const ts = nowStamp();
  const requestTx: NetworkTransaction = {
    id: `tcp-req-${Date.now()}`,
    timestamp: ts,
    protocol: 'MODBUS_TCP',
    direction: 'TX (Master → KC868-A16)',
    summary: `${fcNames[fc]} · Offset=${startAddr} · Val/Cant=${quantityOrValue}`,
    rawHex: formatHexArray(reqBytes),
    fields: reqFields,
    validCrcOrAck: true,
  };

  // Check if a Fault Exception is injected
  const forcedExc = ctx.faults?.forceModbusException ?? 0;
  if (forcedExc > 0) {
    const errFc = (fc | 0x80) & 0xff;
    const excNames: Record<number, string> = {
      1: '0x01 Illegal Function (Función no soportada por el esclavo)',
      2: '0x02 Illegal Data Address (Dirección fuera del rango de memoria OpenPLC)',
      6: '0x06 Slave Device Busy (Ciclo de scan bloqueado o bus I2C ocupado)',
    };
    const respBytes = [txh, txl, 0x00, 0x00, 0x00, 0x03, unitId & 0xff, errFc, forcedExc];
    return {
      request: requestTx,
      response: {
        id: `tcp-err-${Date.now() + 1}`,
        timestamp: ts,
        protocol: 'MODBUS_TCP',
        direction: 'FAULT (Error en Red)',
        summary: `EXCEPCIÓN MODBUS 0x${toHex(errFc)} -> Código ${excNames[forcedExc] || forcedExc}`,
        rawHex: formatHexArray(respBytes),
        validCrcOrAck: false,
        fields: [
          {
            name: 'MBAP Header',
            hex: `${toHex(txh)} ${toHex(txl)} 00 00 00 03 ${toHex(unitId)}`,
            description: 'Cabecera TCP con longitud 3 bytes de error',
            color: '#4338ca',
          },
          {
            name: 'Error Function Code',
            hex: toHex(errFc),
            description: `FC original (0x${toHex(fc)}) + Bit 7 en alto (0x80) indicando Excepción`,
            color: '#be123c',
          },
          {
            name: 'Exception Code',
            hex: toHex(forcedExc),
            description: excNames[forcedExc] || 'Excepción de esclavo',
            color: '#dc2626',
          },
        ],
      },
    };
  }

  // Normal execution
  let respPdu: number[] = [];
  let respDataDesc = '';

  if (fc === 0x01 || fc === 0x02) {
    const count = Math.max(1, Math.min(16, quantityOrValue));
    const byteCount = Math.ceil(count / 8);
    const dataBytes = Array(byteCount).fill(0);
    for (let i = 0; i < count; i++) {
      const idx = startAddr + i;
      const bit = fc === 0x01 ? (ctx.outputs[idx] ?? false) : (ctx.inputs[idx] ?? false);
      if (bit) dataBytes[Math.floor(i / 8)] |= 1 << (i % 8);
    }
    respPdu = [fc, byteCount, ...dataBytes];
    respDataDesc = `${byteCount} byte(s) de estados binarios (${formatHexArray(dataBytes)})`;
  } else if (fc === 0x03 || fc === 0x04) {
    const count = Math.max(1, Math.min(8, quantityOrValue));
    const byteCount = count * 2;
    const dataBytes: number[] = [];
    for (let i = 0; i < count; i++) {
      const idx = startAddr + i;
      const wordVal = fc === 0x03 ? (ctx.words[idx] ?? 0) : (ctx.analogs[idx] ?? 0);
      dataBytes.push((wordVal >> 8) & 0xff, wordVal & 0xff);
    }
    respPdu = [fc, byteCount, ...dataBytes];
    respDataDesc = `${count} registro(s) de 16 bits Big-Endian (${formatHexArray(dataBytes)})`;
  } else if (fc === 0x05) {
    if (startAddr >= 0 && startAddr < 16) {
      ctx.writeCoil(startAddr, Boolean(quantityOrValue));
    }
    respPdu = [fc, ah, al, vh, vl];
    respDataDesc = `Eco confirmación escritura en %QX${Math.floor(startAddr / 8)}.${startAddr % 8}`;
  } else if (fc === 0x06) {
    if (startAddr >= 0 && startAddr < 16) {
      ctx.writeWord(startAddr, quantityOrValue);
    }
    respPdu = [fc, ah, al, vh, vl];
    respDataDesc = `Eco confirmación escritura ${quantityOrValue} en %MW${startAddr}`;
  }

  const respLen = 1 + respPdu.length;
  const respBytes = [
    txh,
    txl,
    0x00,
    0x00,
    (respLen >> 8) & 0xff,
    respLen & 0xff,
    unitId & 0xff,
    ...respPdu,
  ];

  const respFields: NetworkFrameField[] = [
    {
      name: 'Transaction ID',
      hex: `${toHex(txh)} ${toHex(txl)}`,
      description: `Eco de secuencia MBAP #${txId}`,
      color: '#0f766e',
    },
    {
      name: 'Protocol ID',
      hex: '00 00',
      description: 'Modbus TCP/IP Estándar',
      color: '#0369a1',
    },
    {
      name: 'Length',
      hex: `${toHex((respLen >> 8) & 0xff)} ${toHex(respLen & 0xff)}`,
      description: `${respLen} bytes de carga útil devueltos por KC868-A16`,
      color: '#4338ca',
    },
    {
      name: 'Unit ID',
      hex: toHex(unitId),
      description: `Esclavo KC868-A16 (${unitId})`,
      color: '#7e22ce',
    },
    {
      name: 'Function Code',
      hex: toHex(fc),
      description: `${fcNames[fc]} OK (Sin bit de excepción 0x80)`,
      color: '#b45309',
    },
    {
      name: 'Payload Data',
      hex: formatHexArray(respPdu.slice(1)),
      description: respDataDesc,
      color: '#15803d',
    },
  ];

  return {
    request: requestTx,
    response: {
      id: `tcp-res-${Date.now() + 1}`,
      timestamp: ts,
      protocol: 'MODBUS_TCP',
      direction: 'RX (KC868-A16 → Master)',
      summary: `Respuesta ${fcNames[fc]} (${respDataDesc})`,
      rawHex: formatHexArray(respBytes),
      fields: respFields,
      validCrcOrAck: true,
    },
  };
}

/**
 * Build and execute a real Modbus RTU over RS485 frame with CRC-16/MODBUS (0xA001)
 * Supports CRC corruption & RS485 A+/B- polarity swap fault injection
 */
export function executeModbusRTUTransaction(
  slaveId: number,
  fc: number,
  startAddr: number,
  quantityOrValue: number,
  ctx: ModbusExecutionContext
): { request: NetworkTransaction; response: NetworkTransaction } {
  const ah = (startAddr >> 8) & 0xff;
  const al = startAddr & 0xff;
  const val = fc === 0x05 ? (quantityOrValue ? 0xff00 : 0x0000) : quantityOrValue;
  const vh = (val >> 8) & 0xff;
  const vl = val & 0xff;

  const coreReq = [slaveId & 0xff, fc & 0xff, ah, al, vh, vl];
  const reqCrc = computeModbusCRC16(coreReq);

  const isCorrupted = Boolean(ctx.faults?.corruptCrc16);
  const isPolaritySwapped = Boolean(ctx.faults?.rs485PolaritySwap);

  const sentLo = isCorrupted ? (reqCrc.lo ^ 0xff) & 0xff : reqCrc.lo;
  const sentHi = isCorrupted ? (reqCrc.hi ^ 0x55) & 0xff : reqCrc.hi;
  const reqBytes = [...coreReq, sentLo, sentHi];

  const reqFields: NetworkFrameField[] = [
    {
      name: 'Slave ID',
      hex: toHex(slaveId),
      description: `Dirección nodo RS485 (${slaveId}) en bus diferencial A+/B-`,
      color: '#7e22ce',
    },
    {
      name: 'Function Code',
      hex: toHex(fc),
      description: `Código de función Modbus 0x${toHex(fc)}`,
      color: '#b45309',
    },
    {
      name: 'Register Address',
      hex: `${toHex(ah)} ${toHex(al)}`,
      description: `Dirección de inicio ${startAddr} (Big-Endian)`,
      color: '#be123c',
    },
    {
      name: 'Data / Count',
      hex: `${toHex(vh)} ${toHex(vl)}`,
      description: `Cantidad o valor de escritura (${quantityOrValue})`,
      color: '#15803d',
    },
    {
      name: 'CRC-16 (Lo/Hi)',
      hex: `${toHex(sentLo)} ${toHex(sentHi)}`,
      description: isCorrupted
        ? `¡CRC CORROMPIDO POR RUIDO! Esperado: ${toHex(reqCrc.lo)} ${toHex(reqCrc.hi)}`
        : `Checksum Polinomio 0xA001 Little-Endian (0x${toHex(reqCrc.crc, 2)})`,
      color: isCorrupted ? '#dc2626' : '#0f766e',
    },
  ];

  const ts = nowStamp();
  const reqTx: NetworkTransaction = {
    id: `rtu-req-${Date.now()}`,
    timestamp: ts,
    protocol: 'MODBUS_RTU',
    direction: 'TX (Master → KC868-A16)',
    summary: `RS485 RTU Slave #${slaveId} · FC 0x${toHex(fc)} · CRC=${toHex(sentLo)} ${toHex(sentHi)}`,
    rawHex: formatHexArray(reqBytes),
    fields: reqFields,
    validCrcOrAck: !isCorrupted && !isPolaritySwapped,
  };

  if (isPolaritySwapped) {
    const invertedBytes = reqBytes.map((b) => (~b) & 0xff);
    return {
      request: reqTx,
      response: {
        id: `rtu-err-${Date.now() + 1}`,
        timestamp: ts,
        protocol: 'MODBUS_RTU',
        direction: 'FAULT (Error en Red)',
        summary: 'FALLO FÍSICO RS485: Cables A+ y B- invertidos (Framing Error / Break Condition en UART2)',
        rawHex: formatHexArray(invertedBytes),
        validCrcOrAck: false,
        fields: [
          {
            name: 'A+/B- Invertidos',
            hex: formatHexArray(invertedBytes.slice(0, 4)),
            description: 'Todos los bits de inicio/parada llegan invertidos al transceptor GPIO16/13',
            color: '#dc2626',
          },
          {
            name: 'Acción del Esclavo',
            hex: 'TIMEOUT',
            description: 'La UART descarta la trama por error de bit de parada (Stop Bit = 0). Silencio en la línea.',
            color: '#be123c',
          },
        ],
      },
    };
  }

  if (isCorrupted) {
    return {
      request: reqTx,
      response: {
        id: `rtu-crc-err-${Date.now() + 1}`,
        timestamp: ts,
        protocol: 'MODBUS_RTU',
        direction: 'FAULT (Error en Red)',
        summary: `TRAMA DESCARTADA POR ESCLAVO #${slaveId}: CRC-16 inválido (Recibido ${toHex(sentLo)} ${toHex(sentHi)} != Calculado ${toHex(reqCrc.lo)} ${toHex(reqCrc.hi)})`,
        rawHex: 'SILENCIO EN BUS RS485 (3.5T TIMEOUT — SIN RESPUESTA)',
        validCrcOrAck: false,
        fields: [
          {
            name: 'CRC Recibido',
            hex: `${toHex(sentLo)} ${toHex(sentHi)}`,
            description: 'Bytes alterados por interferencia electromagnética (EMI) en el par trenzado',
            color: '#dc2626',
          },
          {
            name: 'CRC Calculado',
            hex: `${toHex(reqCrc.lo)} ${toHex(reqCrc.hi)}`,
            description: 'Valor esperado por el polinomio 0xA001 en la KinCony KC868-A16',
            color: '#0f766e',
          },
          {
            name: 'Regla Estándar Modbus',
            hex: 'NO ACK',
            description: 'Ante un error de CRC, el esclavo NUNCA responde; el maestro debe reintentar tras Timeout.',
            color: '#b45309',
          },
        ],
      },
    };
  }

  const tcpRes = executeModbusTCPTransaction(1, slaveId, fc, startAddr, quantityOrValue, ctx);
  const pduHexParts = tcpRes.response.rawHex
    .split(' ')
    .slice(7)
    .map((h) => parseInt(h, 16));
  const coreResp = [slaveId & 0xff, ...pduHexParts];
  const respCrc = computeModbusCRC16(coreResp);
  const respBytes = [...coreResp, respCrc.lo, respCrc.hi];

  return {
    request: reqTx,
    response: {
      id: `rtu-res-${Date.now() + 1}`,
      timestamp: ts,
      protocol: 'MODBUS_RTU',
      direction: tcpRes.response.direction,
      summary: `RS485 RTU Respuesta Slave #${slaveId} · CRC=0x${toHex(respCrc.crc, 2)} OK`,
      rawHex: formatHexArray(respBytes),
      fields: [
        {
          name: 'Slave ID',
          hex: toHex(slaveId),
          description: `Respuesta nodo RS485 #${slaveId} (GPIO16 RX / GPIO13 TX)`,
          color: '#7e22ce',
        },
        {
          name: 'PDU Response',
          hex: formatHexArray(pduHexParts),
          description: tcpRes.response.summary,
          color: '#15803d',
        },
        {
          name: 'CRC-16 (Lo/Hi)',
          hex: `${toHex(respCrc.lo)} ${toHex(respCrc.hi)}`,
          description: `CRC-16 verificado sin errores (0x${toHex(respCrc.crc, 2)})`,
          color: '#0f766e',
        },
      ],
      validCrcOrAck: tcpRes.response.validCrcOrAck,
    },
  };
}

/**
 * Build an educational I2C PCF8574 bus frame breakdown (SDA=GPIO4, SCL=GPIO5)
 */
export function buildI2CTransaction(
  chipName: string,
  addrHex: string,
  isRead: boolean,
  activeLowByte: number,
  injectNack = false
): NetworkTransaction {
  const addr7 = parseInt(addrHex, 16);
  const addr8 = ((addr7 << 1) | (isRead ? 1 : 0)) & 0xff;
  const binStr = activeLowByte.toString(2).padStart(8, '0');

  return {
    id: `i2c-${Date.now()}-${Math.random()}`,
    timestamp: nowStamp(),
    protocol: 'I2C_PCF8574',
    direction: injectNack
      ? 'FAULT (Error en Red)'
      : isRead
      ? 'RX (KC868-A16 → Master)'
      : 'TX (Master → KC868-A16)',
    summary: injectNack
      ? `FALLO BUS I²C: El expansor ${chipName} (${addrHex}) respondió NACK (1) en el 9º pulso SCL`
      : `I²C ${chipName} (${addrHex}) ${isRead ? 'READ' : 'WRITE'} -> 0x${toHex(activeLowByte)} (${binStr}b Activo-Bajo)`,
    rawHex: injectNack
      ? `START | ${toHex(addr8)} (${addrHex}+${isRead ? 'R' : 'W'}) | NACK (SDA=1) | STOP`
      : `START | ${toHex(addr8)} (${addrHex}+${isRead ? 'R' : 'W'}) | ACK | ${toHex(activeLowByte)} | ACK | STOP`,
    validCrcOrAck: !injectNack,
    fields: [
      {
        name: 'START Bit',
        hex: 'S',
        description: 'Transición SDA HIGH→LOW con SCL HIGH (GPIO4/GPIO5)',
        color: '#4338ca',
      },
      {
        name: '7-Bit Addr + R/W',
        hex: toHex(addr8),
        description: `Dirección PCF8574 ${addrHex} desplazada + bit ${isRead ? '1 (Lectura)' : '0 (Escritura)'}`,
        color: '#7e22ce',
      },
      {
        name: 'Slave ACK/NACK',
        hex: injectNack ? '1 (NACK!)' : '0 (ACK)',
        description: injectNack
          ? 'SDA permanece en HIGH: chip desconectado o dirección I²C incorrecta'
          : 'El expansor PCF8574 pone SDA en LOW confirmando presencia',
        color: injectNack ? '#dc2626' : '#0f766e',
      },
      {
        name: '8-Bit I/O Port',
        hex: injectNack ? '--' : toHex(activeLowByte),
        description: injectNack
          ? 'Transferencia abortada por el maestro ESP32'
          : `Bits P7..P0 = ${binStr}b (0 = Canal ON, 1 = Canal OFF)`,
        color: '#b45309',
      },
      {
        name: 'STOP Bit',
        hex: 'P',
        description: 'Transición SDA LOW→HIGH liberando el bus I²C',
        color: '#be123c',
      },
    ],
  };
}

/**
 * Build a HART (Highway Addressable Remote Transducer) FSK Bell 202 Frame
 * Superimposed on KinCony KC868-A16 Analog Channel A1 (%IW0, 4-20 mA)
 */
export function buildHartTransaction(
  pollingAddr: number,
  command: 0 | 1 | 2 | 3,
  adcRawIw0: number,
  tempRawIw4: number
): { request: NetworkTransaction; response: NetworkTransaction } {
  const ts = nowStamp();
  const loopCurrentMa = Number((4 + (adcRawIw0 / 4095) * 16).toFixed(2));
  const percentRange = Number(((adcRawIw0 / 4095) * 100).toFixed(1));
  const pressureBar = Number(((adcRawIw0 / 4095) * 10).toFixed(2)); // 0..10 Bar
  const tempCelsius = Number((tempRawIw4 / 10).toFixed(1));

  // Request frame: Preamble (5x 0xFF) + Delimiter (0x02 Short Frame Master->Slave) + Addr + Cmd + ByteCount(0) + Checksum
  const reqCore = [0x02, pollingAddr & 0x3f, command, 0x00];
  const reqLrc = computeHartXorChecksum(reqCore);
  const reqFull = [0xff, 0xff, 0xff, 0xff, 0xff, ...reqCore, reqLrc];

  const cmdTitles: Record<number, string> = {
    0: 'Cmd 0: Read Unique Identifier (Identificación del Transmisor)',
    1: 'Cmd 1: Read Primary Variable (Leer Variable Primaria PV en Bar)',
    2: 'Cmd 2: Read Loop Current & Percent of Range (mA y %)',
    3: 'Cmd 3: Read Dynamic Variables & Loop Current (mA, PV, SV)',
  };

  let respData: number[] = [];
  let respSummary = '';

  if (command === 0) {
    // 2 status bytes + expansion(254) + MfgID(0x26=Rosemount/KinCony) + DevType(0x10) + 3-byte Serial
    respData = [0x00, 0x00, 254, 0x26, 0x10, 0x05, 0x01, 0x01, 0x00, 0x1a, 0x88, 0x42];
    respSummary = `Transmisor HART ID=0x1A8842 · Rev 5 · 0 Errores`;
  } else if (command === 1) {
    // Status(2B) + UnitCode(7 = Bar) + Float32(PV)
    respData = [0x00, 0x00, 0x07, ...floatToIEEE754Bytes(pressureBar)];
    respSummary = `PV = ${pressureBar} Bar (Unidad 0x07 = Bar) sobre lazo ${loopCurrentMa} mA`;
  } else if (command === 2) {
    // Status(2B) + Float32(mA) + Float32(% Range)
    respData = [
      0x00,
      0x00,
      ...floatToIEEE754Bytes(loopCurrentMa),
      ...floatToIEEE754Bytes(percentRange),
    ];
    respSummary = `Corriente de Lazo = ${loopCurrentMa} mA · Rango = ${percentRange} %`;
  } else {
    // Cmd 3: Status(2B) + Float32(mA) + Unit1(7=Bar) + Float32(PV) + Unit2(32=°C) + Float32(SV)
    respData = [
      0x00,
      0x00,
      ...floatToIEEE754Bytes(loopCurrentMa),
      0x07,
      ...floatToIEEE754Bytes(pressureBar),
      0x20,
      ...floatToIEEE754Bytes(tempCelsius),
    ];
    respSummary = `I=${loopCurrentMa} mA · PV=${pressureBar} Bar · SV=${tempCelsius} °C`;
  }

  const respCore = [0x06, pollingAddr & 0x3f, command, respData.length, ...respData];
  const respLrc = computeHartXorChecksum(respCore);
  const respFull = [0xff, 0xff, 0xff, 0xff, 0xff, ...respCore, respLrc];

  return {
    request: {
      id: `hart-req-${Date.now()}`,
      timestamp: ts,
      protocol: 'HART_FSK',
      direction: 'TX (Master → KC868-A16)',
      summary: `HART FSK (1200/2200 Hz) · Poll #${pollingAddr} · ${cmdTitles[command]}`,
      rawHex: formatHexArray(reqFull),
      validCrcOrAck: true,
      fields: [
        {
          name: 'Preamble (5B)',
          hex: 'FF FF FF FF FF',
          description: 'Sincronización de portadora FSK Bell 202 a 1200 baudios',
          color: '#64748b',
        },
        {
          name: 'Delimiter',
          hex: '02',
          description: '0x02 = Trama Corta Maestro → Esclavo (STX)',
          color: '#0369a1',
        },
        {
          name: 'Polling Addr',
          hex: toHex(pollingAddr),
          description: `Dirección de transmisor HART (${pollingAddr}) en canal A1 (%IW0)`,
          color: '#7e22ce',
        },
        {
          name: 'Command',
          hex: toHex(command),
          description: cmdTitles[command],
          color: '#b45309',
        },
        {
          name: 'Byte Count',
          hex: '00',
          description: '0 bytes de datos en petición de lectura universal',
          color: '#4338ca',
        },
        {
          name: 'LRC Checksum',
          hex: toHex(reqLrc),
          description: 'Paridad Longitudinal XOR de todos los bytes desde el Delimiter',
          color: '#0f766e',
        },
      ],
    },
    response: {
      id: `hart-res-${Date.now() + 1}`,
      timestamp: ts,
      protocol: 'HART_FSK',
      direction: 'RX (KC868-A16 → Master)',
      summary: `HART Respuesta · ${respSummary}`,
      rawHex: formatHexArray(respFull),
      validCrcOrAck: true,
      fields: [
        {
          name: 'Preamble',
          hex: 'FF FF FF FF FF',
          description: '5 bytes de enganche de demodulador FSK',
          color: '#64748b',
        },
        {
          name: 'Delimiter (ACK)',
          hex: '06',
          description: '0x06 = Respuesta Esclavo → Maestro (ACK)',
          color: '#0369a1',
        },
        {
          name: 'Command & Len',
          hex: `${toHex(command)} ${toHex(respData.length)}`,
          description: `Comando ${command} con ${respData.length} bytes de datos IEEE-754`,
          color: '#b45309',
        },
        {
          name: 'Status + IEEE754',
          hex: formatHexArray(respData.slice(0, 7)),
          description: respSummary,
          color: '#15803d',
        },
        {
          name: 'LRC Checksum',
          hex: toHex(respLrc),
          description: 'Checksum XOR verificado correctamente',
          color: '#0f766e',
        },
      ],
    },
  };
}

/**
 * Build a DeviceNet (CIP over CAN Bus 2.0A 11-bit) Transaction
 * Uses ESP32 TWAI controller on GPIO32 (CTX) / GPIO33 (CRX)
 */
export function buildDeviceNetTransaction(
  macId: number,
  mode: 'POLLED_IO' | 'EXPLICIT_CIP',
  inputs: boolean[],
  outputs: boolean[]
): { request: NetworkTransaction; response: NetworkTransaction } {
  const ts = nowStamp();
  // Group 2 Message: 11-bit CAN ID = (10 << 7) | (MAC_ID << 3) | MsgID
  // MsgID 5 = Master I/O Poll Command / Explicit Request (0x04), MsgID 3 = Slave Poll Response
  const msgIdReq = mode === 'POLLED_IO' ? 5 : 4;
  const canIdReq = (0x02 << 9) | ((macId & 0x3f) << 3) | msgIdReq;
  const canIdRes = (0x02 << 9) | ((macId & 0x3f) << 3) | (mode === 'POLLED_IO' ? 3 : 3);

  // Pack 16 outputs into 2 bytes, 16 inputs into 2 bytes
  let doLo = 0;
  let doHi = 0;
  let diLo = 0;
  let diHi = 0;
  for (let i = 0; i < 8; i++) {
    if (outputs[i]) doLo |= 1 << i;
    if (outputs[i + 8]) doHi |= 1 << i;
    if (inputs[i]) diLo |= 1 << i;
    if (inputs[i + 8]) diHi |= 1 << i;
  }

  const reqData =
    mode === 'POLLED_IO'
      ? [doLo, doHi] // Master writes 2 bytes of outputs to slave
      : [0x00, 0x0e, 0x04, 0x64, 0x03]; // Explicit CIP: Get_Attribute_Single(0x0E), Class 0x04 (Assembly), Inst 100 (0x64), Attr 3 (Data)

  const resData =
    mode === 'POLLED_IO'
      ? [diLo, diHi] // Slave returns 2 bytes of digital inputs
      : [0x00, 0x8e, diLo, diHi, doLo, doHi]; // Get_Attribute_Single Response (0x8E) + 4 bytes I/O assembly

  return {
    request: {
      id: `dnet-req-${Date.now()}`,
      timestamp: ts,
      protocol: 'DEVICENET_CAN',
      direction: 'TX (Master → KC868-A16)',
      summary: `DeviceNet CAN 11-Bit ID=0x${toHex(canIdReq, 2)} · MAC #${macId} · ${
        mode === 'POLLED_IO' ? 'Polled I/O Command' : 'CIP Explicit Get_Attribute_Single'
      }`,
      rawHex: `CAN_ID: 0x${toHex(canIdReq, 2)} | DLC: ${reqData.length} | DATA: ${formatHexArray(reqData)}`,
      validCrcOrAck: true,
      fields: [
        {
          name: '11-Bit CAN ID',
          hex: `0x${toHex(canIdReq, 2)}`,
          description: `Grupo 2 + MAC ID ${macId} (${(macId & 0x3f).toString(2).padStart(6, '0')}b) + MsgID ${msgIdReq}`,
          color: '#7e22ce',
        },
        {
          name: 'DLC (Length)',
          hex: `${reqData.length} bytes`,
          description: 'Data Length Code de la trama CAN 2.0A (0..8 bytes)',
          color: '#4338ca',
        },
        {
          name: mode === 'POLLED_IO' ? 'Output Assembly' : 'CIP Header + Path',
          hex: formatHexArray(reqData),
          description:
            mode === 'POLLED_IO'
              ? `Salidas DO1..16 enviadas al nodo (${toHex(doLo)} ${toHex(doHi)})`
              : 'Service 0x0E (Get_Attr) · Class 0x04 (Assembly) · Inst 0x64 · Attr 0x03',
          color: '#b45309',
        },
        {
          name: 'CAN CRC-15 + ACK',
          hex: 'CRC15 OK',
          description: 'Verificación hardware en transceptor CAN TWAI (GPIO32/33)',
          color: '#0f766e',
        },
      ],
    },
    response: {
      id: `dnet-res-${Date.now() + 1}`,
      timestamp: ts,
      protocol: 'DEVICENET_CAN',
      direction: 'RX (KC868-A16 → Master)',
      summary: `DeviceNet Respuesta MAC #${macId} (CAN ID=0x${toHex(canIdRes, 2)}) · DI1..16=0x${toHex(diHi)}${toHex(diLo)}`,
      rawHex: `CAN_ID: 0x${toHex(canIdRes, 2)} | DLC: ${resData.length} | DATA: ${formatHexArray(resData)}`,
      validCrcOrAck: true,
      fields: [
        {
          name: '11-Bit CAN ID',
          hex: `0x${toHex(canIdRes, 2)}`,
          description: `Grupo 2 Respuesta Esclavo MAC #${macId}`,
          color: '#7e22ce',
        },
        {
          name: 'DLC',
          hex: `${resData.length} bytes`,
          description: 'Longitud de datos devueltos por KC868-A16',
          color: '#4338ca',
        },
        {
          name: 'Input Assembly Data',
          hex: formatHexArray(resData),
          description: `Estado en vivo DI1..8=0x${toHex(diLo)}, DI9..16=0x${toHex(diHi)}`,
          color: '#15803d',
        },
      ],
    },
  };
}
