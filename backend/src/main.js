import { createTurnServer } from './server.js';

const port = Number(process.env.PORT ?? 8000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT inválido.');
const instance = createTurnServer({ dbPath: process.env.DB_PATH ?? 'data/turnos.sqlite3',
  ...(process.env.ALLOWED_ORIGINS ? { origins: process.env.ALLOWED_ORIGINS.split(',').map(x => x.trim()) } : {}) });
await instance.listen(port);
console.log(`Turnos UCR: http://localhost:${port}`);
console.log('REST: /api/turnos | WebSocket: /ws/turnos | Ctrl+C para detener');
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  await instance.close();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
