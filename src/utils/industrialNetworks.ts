import { NetworkFrameField, NetworkTransaction } from '../types/plc';

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
}

const nowStamp = (): string => {
  const d = new Date();
  return d.toTimeString().split(' ')[0] + '.' + String(d.getMilliseconds()).padStart(3, '0');
};

/**
 * Build and execute a real Modbus TCP/IP Request + Response pair (Port 502)
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

  // Execute against live PLC memory and build response PDU
  let respPdu: number[] = [];
  let respDataDesc = '';

  if (fc === 0x01 || fc === 0x02) {
    const count = Math.max(1, Math.min(16, quantityOrValue));
    const byteCount = Math.ceil(count / 8);
    const dataBytes = Array(byteCount).fill(0);
    for (let i = 0; i < count; i++) {
      const idx = startAddr + i;
      const bit =
        fc === 0x01 ? (ctx.outputs[idx] ?? false) : (ctx.inputs[idx] ?? false);
      if (bit) {
        dataBytes[Math.floor(i / 8)] |= 1 << (i % 8);
      }
    }
    respPdu = [fc, byteCount, ...dataBytes];
    respDataDesc = `${byteCount} byte(s) de estados binarios (${formatHexArray(dataBytes)})`;
  } else if (fc === 0x03 || fc === 0x04) {
    const count = Math.max(1, Math.min(8, quantityOrValue));
    const byteCount = count * 2;
    const dataBytes: number[] = [];
    for (let i = 0; i < count; i++) {
      const idx = startAddr + i;
      const wordVal =
        fc === 0x03 ? (ctx.words[idx] ?? 0) : (ctx.analogs[idx] ?? 0);
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

  const ts = nowStamp();
  return {
    request: {
      id: `tcp-req-${Date.now()}`,
      timestamp: ts,
      protocol: 'MODBUS_TCP',
      direction: 'TX (Master → KC868-A16)',
      summary: `${fcNames[fc]} · Offset=${startAddr} · Val/Cant=${quantityOrValue}`,
      rawHex: formatHexArray(reqBytes),
      fields: reqFields,
      validCrcOrAck: true,
    },
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
  const reqBytes = [...coreReq, reqCrc.lo, reqCrc.hi];

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
      hex: `${toHex(reqCrc.lo)} ${toHex(reqCrc.hi)}`,
      description: `Checksum Polinomio 0xA001 Little-Endian (0x${toHex(reqCrc.crc, 2)})`,
      color: '#0f766e',
    },
  ];

  // Execute via TCP helper logic to get response PDU
  const tcpRes = executeModbusTCPTransaction(1, slaveId, fc, startAddr, quantityOrValue, ctx);
  const pduHexParts = tcpRes.response.rawHex
    .split(' ')
    .slice(7)
    .map((h) => parseInt(h, 16));
  const coreResp = [slaveId & 0xff, ...pduHexParts];
  const respCrc = computeModbusCRC16(coreResp);
  const respBytes = [...coreResp, respCrc.lo, respCrc.hi];

  const respFields: NetworkFrameField[] = [
    {
      name: 'Slave ID',
      hex: toHex(slaveId),
      description: `Respuesta nodo RS485 #${slaveId} (GPIO16 RX / GPIO13 TX)`,
      color: '#7e22ce',
    },
    {
      name: 'Function Code',
      hex: toHex(fc),
      description: `Confirmación función 0x${toHex(fc)}`,
      color: '#b45309',
    },
    {
      name: 'Payload Data',
      hex: formatHexArray(pduHexParts.slice(1)),
      description: tcpRes.response.fields[5]?.description || 'Datos devueltos',
      color: '#15803d',
    },
    {
      name: 'CRC-16 (Lo/Hi)',
      hex: `${toHex(respCrc.lo)} ${toHex(respCrc.hi)}`,
      description: `CRC-16 verificado sin errores de paridad/ruido (0x${toHex(respCrc.crc, 2)})`,
      color: '#0f766e',
    },
  ];

  const ts = nowStamp();
  return {
    request: {
      id: `rtu-req-${Date.now()}`,
      timestamp: ts,
      protocol: 'MODBUS_RTU',
      direction: 'TX (Master → KC868-A16)',
      summary: `RS485 RTU Slave #${slaveId} · FC 0x${toHex(fc)} · CRC=0x${toHex(reqCrc.crc, 2)}`,
      rawHex: formatHexArray(reqBytes),
      fields: reqFields,
      validCrcOrAck: true,
    },
    response: {
      id: `rtu-res-${Date.now() + 1}`,
      timestamp: ts,
      protocol: 'MODBUS_RTU',
      direction: 'RX (KC868-A16 → Master)',
      summary: `RS485 RTU Respuesta Slave #${slaveId} · CRC=0x${toHex(respCrc.crc, 2)} OK`,
      rawHex: formatHexArray(respBytes),
      fields: respFields,
      validCrcOrAck: true,
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
  activeLowByte: number
): NetworkTransaction {
  const addr7 = parseInt(addrHex, 16);
  const addr8 = ((addr7 << 1) | (isRead ? 1 : 0)) & 0xff;
  const binStr = activeLowByte.toString(2).padStart(8, '0');

  return {
    id: `i2c-${Date.now()}-${Math.random()}`,
    timestamp: nowStamp(),
    protocol: 'I2C_PCF8574',
    direction: isRead ? 'RX (KC868-A16 → Master)' : 'TX (Master → KC868-A16)',
    summary: `I2C ${chipName} (${addrHex}) ${isRead ? 'READ' : 'WRITE'} -> 0x${toHex(activeLowByte)} (${binStr}b Activo-Bajo)`,
    rawHex: `START | ${toHex(addr8)} (${addrHex}+${isRead ? 'R' : 'W'}) | ACK | ${toHex(activeLowByte)} | ACK | STOP`,
    validCrcOrAck: true,
    fields: [
      {
        name: 'START Bit',
        hex: 'S',
        description: 'Transición SDA HIGH→LOW mientras SCL permanece HIGH (GPIO4/GPIO5)',
        color: '#4338ca',
      },
      {
        name: '7-Bit Addr + R/W',
        hex: toHex(addr8),
        description: `Dirección PCF8574 ${addrHex} desplazada + bit ${isRead ? '1 (Lectura)' : '0 (Escritura)'}`,
        color: '#7e22ce',
      },
      {
        name: 'Slave ACK',
        hex: '0 (ACK)',
        description: 'El expansor PCF8574 pone SDA en LOW en el 9º pulso de reloj SCL',
        color: '#0f766e',
      },
      {
        name: '8-Bit I/O Port',
        hex: toHex(activeLowByte),
        description: `Bits P7..P0 = ${binStr}b (Lógica Activa-Baja: 0 = Canal Activado, 1 = Canal Apagado)`,
        color: '#b45309',
      },
      {
        name: 'STOP Bit',
        hex: 'P',
        description: 'Transición SDA LOW→HIGH con SCL en HIGH liberando el bus a 400 kHz',
        color: '#be123c',
      },
    ],
  };
}
