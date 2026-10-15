import { workerData, parentPort } from 'node:worker_threads';
import { randomUUID } from 'node:crypto';
import { SQLiteTurnRepository } from '../src/repository.js';
const repository = new SQLiteTurnRepository(workerData.path);
const barrier = new Int32Array(workerData.barrier);
parentPort.postMessage({ ready: true });
Atomics.wait(barrier, 0, 0);
try {
  if (workerData.mode === 'call') {
    try {
      repository.transition(workerData.id, 'llamado', workerData.name, 0);
      parentPort.postMessage({ result: 200 });
    } catch (error) { parentPort.postMessage({ result: error.status ?? 500 }); }
  } else {
    const rows = Array.from({ length: 15 }, () => repository.create('Cliente concurrente', workerData.key ?? randomUUID()));
    parentPort.postMessage({ result: rows });
  }
} finally { repository.close(); }
