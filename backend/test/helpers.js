import { WebSocket } from 'ws';
import { createTurnServer } from '../src/server.js';
import { randomUUID } from 'node:crypto';

export const origin = 'http://localhost:8080';
export async function start(dbPath) {
  const instance = createTurnServer({ dbPath });
  const address = await instance.listen(Number(process.env.TEST_PORT ?? 0));
  const base = `http://127.0.0.1:${address.port}`;
  async function request(method, path, body) {
    const response = await fetch(base + path, { method,
      headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  }
  return { instance, base, request,
    create: (cliente = 'Cliente Demo', clave = randomUUID()) => request('POST', '/api/turnos', { cliente, clave }),
    change: (turn, estado = 'llamado', funcionario = 'Funcionario A') => request('PATCH', `/api/turnos/${turn.id}`, {
      estado, funcionario, version: turn.version }),
  };
}

/** Instala listeners antes del handshake para no perder el snapshot inicial. */
export function connect(base, requestOrigin = origin) {
  const socket = new WebSocket(base.replace('http:', 'ws:') + '/ws/turnos', { origin: requestOrigin });
  const queue = [], waiters = [];
  socket.on('message', data => {
    const value = JSON.parse(data.toString());
    if (waiters.length) waiters.shift()(value); else queue.push(value);
  });
  const ready = new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  return { socket, ready,
    async next() {
      if (queue.length) return queue.shift();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('No llegó evento WebSocket')), 5000);
        waiters.push(value => { clearTimeout(timer); resolve(value); });
      });
    },
  };
}
