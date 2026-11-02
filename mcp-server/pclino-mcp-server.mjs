#!/usr/bin/env node
/**
 * PCLino MCP Server (Model Context Protocol - JSON-RPC 2.0 over stdio)
 * Permite a agentes de IA (Antigravity, Claude Desktop, Cursor) consultar el hardware
 * de la placa KinCony KC868-A16, calcular tramas Modbus/HART/DeviceNet y generar código IEC 61131-3.
 */

import readline from 'node:readline';

function crc16Modbus(bytes) {
  let crc = 0xffff;
  for (const b of bytes) {
    crc ^= b & 0xff;
    for (let i = 0; i < 8; i++) {
      if ((crc & 0x0001) !== 0) {
        crc = (crc >> 1) ^ 0xa001;
      } else {
        crc >>= 1;
      }
    }
  }
  return crc & 0xffff;
}

const KC868_A16_PINOUT = {
  board: 'KinCony KC868-A16',
  mcu: 'ESP32-WROOM-32E (240MHz Dual Core)',
  i2c: {
    sda: 4,
    scl: 5,
    inputs_pcf8574: [
      { address: '0x22', channels: 'X1..X8 (%IX0.0..%IX0.7)', logic: 'Active-Low (0V = ON)' },
      { address: '0x21', channels: 'X9..X16 (%IX0.8..%IX0.15)', logic: 'Active-Low (0V = ON)' },
    ],
    outputs_pcf8574: [
      { address: '0x24', channels: 'Y1..Y8 (%QX0.0..%QX0.7)', logic: 'Active-Low (0 = Relay ON)' },
      { address: '0x25', channels: 'Y9..Y16 (%QX0.8..%QX0.15)', logic: 'Active-Low (0 = Relay ON)' },
    ],
  },
  ethernet_rmii: {
    phy: 'LAN8720A',
    addr: 0,
    mdc: 23,
    mdio: 18,
    clk_mode: 'ETH_CLOCK_GPIO17_OUT',
  },
  rs485_modbus_rtu: {
    uart: 2,
    rx_pin: 16,
    tx_pin: 13,
    transceiver: 'MAX13487E (Auto-Direction)',
  },
  analog_inputs_12bit: {
    A1_IW0: 36,
    A2_IW1: 39,
    A3_IW2: 34,
    A4_IW3: 35,
  },
  gpio_1wire_or_can_twai: {
    HT1: 32,
    HT2: 33,
    HT3: 14,
  },
};

const TOOLS = [
  {
    name: 'pclino_get_kc868_pinout',
    description:
      'Devuelve el mapa completo de pines, direcciones I2C PCF8574 (0x22, 0x21, 0x24, 0x25), LAN8720 Ethernet, RS485 y ADC de la placa KinCony KC868-A16.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'pclino_build_modbus_frame',
    description:
      'Construye una trama Modbus RTU (con CRC-16/MODBUS) o Modbus TCP (con cabecera MBAP) lista para enviar a la KinCony KC868-A16.',
    inputSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['RTU', 'TCP'], default: 'RTU' },
        slaveId: { type: 'number', default: 1 },
        functionCode: { type: 'number', default: 3 },
        address: { type: 'number', default: 0 },
        valueOrCount: { type: 'number', default: 1 },
      },
      required: ['functionCode', 'address', 'valueOrCount'],
    },
  },
  {
    name: 'pclino_build_hart_frame',
    description:
      'Construye una trama HART FSK (1200 bps Bell 202) con preámbulo 0xFF y checksum LRC XOR para transmisores 4-20mA.',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'number', enum: [0, 1, 2, 3], default: 1 },
        maCurrent: { type: 'number', default: 12.0 },
      },
      required: ['command'],
    },
  },
  {
    name: 'pclino_build_devicenet_frame',
    description:
      'Construye una trama CAN DeviceNet (11-bit COB-ID Grupo 2) con payload CIP para variadores y esclavos industriales.',
    inputSchema: {
      type: 'object',
      properties: {
        macId: { type: 'number', default: 10 },
        service: { type: 'string', enum: ['POLL_IO', 'GET_ATTR_SINGLE', 'SET_ATTR_SINGLE'] },
      },
      required: ['macId', 'service'],
    },
  },
];

function handleToolCall(name, args = {}) {
  if (name === 'pclino_get_kc868_pinout') {
    return {
      content: [{ type: 'text', text: JSON.stringify(KC868_A16_PINOUT, null, 2) }],
    };
  }

  if (name === 'pclino_build_modbus_frame') {
    const slave = (args.slaveId ?? 1) & 0xff;
    const fc = (args.functionCode ?? 3) & 0xff;
    const addr = (args.address ?? 0) & 0xffff;
    const val = (args.valueOrCount ?? 1) & 0xffff;
    const pdu = [slave, fc, (addr >> 8) & 0xff, addr & 0xff, (val >> 8) & 0xff, val & 0xff];

    if (args.mode === 'TCP') {
      const mbap = [0x00, 0x01, 0x00, 0x00, 0x00, 0x06, ...pdu];
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              protocol: 'MODBUS_TCP',
              hex: mbap.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' '),
            }),
          },
        ],
      };
    }

    const crc = crc16Modbus(pdu);
    const rtu = [...pdu, crc & 0xff, (crc >> 8) & 0xff];
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            protocol: 'MODBUS_RTU',
            crc16: `0x${crc.toString(16).padStart(4, '0').toUpperCase()}`,
            hex: rtu.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' '),
          }),
        },
      ],
    };
  }

  if (name === 'pclino_build_hart_frame') {
    const cmd = args.command ?? 1;
    const body = [0x02, 0x80, cmd & 0xff, 0x00];
    const lrc = body.reduce((acc, b) => acc ^ b, 0);
    const frame = [0xff, 0xff, 0xff, 0xff, 0xff, ...body, lrc];
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            protocol: 'HART_FSK_1200',
            command: cmd,
            lrc: `0x${lrc.toString(16).padStart(2, '0').toUpperCase()}`,
            hex: frame.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' '),
          }),
        },
      ],
    };
  }

  if (name === 'pclino_build_devicenet_frame') {
    const macId = (args.macId ?? 10) & 0x3f;
    const cobId = (0b10 << 9) | (macId << 3) | 0b101;
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            protocol: 'DEVICENET_CAN',
            cobIdHex: `0x${cobId.toString(16).toUpperCase()}`,
            macId,
            service: args.service || 'POLL_IO',
          }),
        },
      ],
    };
  }

  throw new Error(`Unknown MCP tool: ${name}`);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

rl.on('line', (line) => {
  if (!line.trim()) return;
  try {
    const msg = JSON.parse(line);
    const { id, method, params } = msg;

    if (method === 'initialize') {
      const res = {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'pclino-kc868-a16-mcp', version: '2.0.0' },
        },
      };
      process.stdout.write(JSON.stringify(res) + '\n');
    } else if (method === 'tools/list') {
      const res = {
        jsonrpc: '2.0',
        id,
        result: { tools: TOOLS },
      };
      process.stdout.write(JSON.stringify(res) + '\n');
    } else if (method === 'tools/call') {
      const toolResult = handleToolCall(params?.name, params?.arguments);
      const res = {
        jsonrpc: '2.0',
        id,
        result: toolResult,
      };
      process.stdout.write(JSON.stringify(res) + '\n');
    } else if (id !== undefined) {
      process.stdout.write(
        JSON.stringify({ jsonrpc: '2.0', id, result: {} }) + '\n'
      );
    }
  } catch (err) {
    process.stderr.write(`MCP Error: ${err.message}\n`);
  }
});
