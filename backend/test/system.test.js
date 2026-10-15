import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { SQLiteTurnRepository } from '../src/repository.js';
import { start, connect } from './helpers.js';

async function fixture(run) {
  const temp = mkdtempSync(join(tmpdir(), 'turnos-node-'));
  const server = await start(join(temp, 'turnos.sqlite3'));
  try { await run(server); }
  finally { await server.instance.close(); rmSync(temp, { recursive: true, force: true }); }
}

function workers(path, mode, extra = {}) {
  const barrier = new SharedArrayBuffer(4);
  let ready = 0;
  const tasks = ['Funcionario A', 'Funcionario B'].map(name => new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./race-worker.js', import.meta.url), { workerData: { path, mode, name, barrier, ...extra } });
    worker.on('error', reject);
    worker.on('message', message => {
      if (message.ready && ++ready === 2) { Atomics.store(new Int32Array(barrier), 0, 1); Atomics.notify(new Int32Array(barrier), 0, 2); }
      else if (Object.hasOwn(message, 'result')) resolve(message.result);
    });
    worker.on('exit', code => { if (code !== 0) reject(new Error(`Worker ${code}`)); });
  }));
  return Promise.all(tasks);
}

test('REST: FIFO, estados, propietario funcional e historial', () => fixture(async c => {
  const first = (await c.create()).body, second = (await c.create()).body;
  assert.deepEqual([first.numero, second.numero], [1,2]);
  assert.equal((await c.change(second)).status, 409);
  assert.equal((await c.change(first, 'atendido')).status, 409);
  const called = await c.change(first);
  assert.equal(called.status, 200); assert.ok(called.body.llamado_en);
  assert.equal((await c.change(called.body, 'atendido', 'Funcionario B')).status, 403);
  const done = await c.change(called.body, 'atendido');
  assert.equal(done.status, 200); assert.ok(done.body.atendido_en);
  assert.equal((await c.change(done.body)).status, 409);
  assert.equal((await c.request('GET','/api/turnos')).body.revision, 4);
}));

test('Validación de servidor, UUID, versión, estado e ID', () => fixture(async c => {
  for (const name of ['   ', 'x'.repeat(81), 'Ana\nPerez']) assert.equal((await c.create(name)).status, 422);
  assert.equal((await c.create('Ana','no-uuid')).status, 422);
  assert.equal((await c.request('POST','/api/turnos',{cliente:'Ana',clave:randomUUID(),extra:1})).status,422);
  assert.equal((await c.request('PATCH','/api/turnos/999',{estado:'llamado',funcionario:'Ana',version:0})).status,404);
  assert.equal((await c.request('PATCH','/api/turnos/1',{estado:'pendiente',funcionario:'Ana',version:0})).status,422);
  assert.equal((await c.request('PATCH','/api/turnos/1',{estado:'llamado',funcionario:'Ana',version:true})).status,422);
}));

test('POST idempotente no incrementa consecutivo ni revisión', () => fixture(async c => {
  const key = randomUUID();
  assert.deepEqual((await c.create('Ana',key)).body, (await c.create('Ana',key)).body);
  assert.equal((await c.request('GET','/api/turnos')).body.revision,1);
  assert.equal((await c.create('Luis',key)).status,409);
}));

test('Dos WebSockets reales, broadcast, ping/pong y snapshot de reconexión', () => fixture(async c => {
  const a=connect(c.base), b=connect(c.base);
  try {
    await Promise.all([a.ready,b.ready]);
    assert.equal((await a.next()).revision,0); await b.next();
    const turn=(await c.create()).body;
    assert.deepEqual(await a.next(),await b.next());
    const called=(await c.change(turn)).body;
    const event=await a.next(); assert.equal(event.turnos[0].estado,'llamado');
    assert.deepEqual(event,await b.next());
    a.socket.send(JSON.stringify({tipo:'ping'})); assert.deepEqual(await a.next(),{tipo:'pong'});
    b.socket.send(JSON.stringify({tipo:'sincronizar'})); assert.equal((await b.next()).revision,2);
    await c.change(called,'atendido'); await a.next(); await b.next();
    a.socket.terminate(); b.socket.terminate();
    const reconnected=connect(c.base);
    try { await reconnected.ready; assert.equal((await reconnected.next()).turnos[0].estado,'atendido'); }
    finally { reconnected.socket.terminate(); }
  } finally { a.socket.terminate(); b.socket.terminate(); }
}));

test('WebSocket rechaza Origin no permitido', () => fixture(async c => {
  const blocked=connect(c.base,'https://intruso.example');
  await assert.rejects(blocked.ready,/403/);
  blocked.socket.terminate();
}));

test('Carrera HTTP: una llamada 200 y otra 409', () => fixture(async c => {
  const turn=(await c.create()).body;
  const results=await Promise.all([c.change(turn,'llamado','Funcionario A'),c.change(turn,'llamado','Funcionario B')]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
}));

test('Carrera SQLite entre dos workers independientes', async () => {
  const dir=mkdtempSync(join(tmpdir(),'turnos-race-')); const path=join(dir,'turnos.sqlite3');
  const repo=new SQLiteTurnRepository(path);
  try {
    const turn=repo.create('Cliente',randomUUID());
    assert.deepEqual((await workers(path,'call',{id:turn.id})).sort(),[200,409]);
    assert.equal(repo.snapshot().turnos[0].version,1);
  } finally { repo.close(); rmSync(dir,{recursive:true,force:true}); }
});

test('Consecutivos y claves únicos entre conexiones concurrentes', async () => {
  const dir=mkdtempSync(join(tmpdir(),'turnos-create-')); const path=join(dir,'turnos.sqlite3');
  const repo=new SQLiteTurnRepository(path);
  try {
    const rows=(await workers(path,'create')).flat();
    assert.deepEqual(rows.map(r=>r.numero).sort((a,b)=>a-b),Array.from({length:30},(_,i)=>i+1));
    const repeated=(await workers(path,'create',{key:randomUUID()})).flat();
    assert.equal(new Set(repeated.map(r=>r.id)).size,1);
    assert.equal(repo.snapshot().turnos.length,31);
  } finally { repo.close(); rmSync(dir,{recursive:true,force:true}); }
});

test('Reinicio del servidor conserva historial, auditoría y consecutivo', async () => {
  const dir=mkdtempSync(join(tmpdir(),'turnos-restart-'));const path=join(dir,'turnos.sqlite3');
  let c=await start(path);
  try {
    const turn=(await c.create()).body;const called=(await c.change(turn)).body;
    await c.change(called,'atendido');await c.instance.close();c=await start(path);
    const rows=(await c.request('GET','/api/turnos')).body.turnos;
    assert.equal(rows[0].estado,'atendido');assert.ok(rows[0].atendido_en);
    assert.equal((await c.create()).body.numero,2);
    assert.equal(c.instance.repository.db.prepare('SELECT COUNT(*) AS count FROM historial').get().count,4);
  } finally { await c.instance.close();rmSync(dir,{recursive:true,force:true}); }
});

test('SQLite revierte datos y auditoría si falla una transacción', async () => {
  const dir=mkdtempSync(join(tmpdir(),'turnos-atomic-'));const repo=new SQLiteTurnRepository(join(dir,'turnos.sqlite3'));
  try {
    repo.db.exec("CREATE TRIGGER fallo BEFORE INSERT ON historial BEGIN SELECT RAISE(ABORT,'fallo intencional'); END;");
    assert.throws(()=>repo.create('Ana',randomUUID()));
    assert.equal(repo.snapshot().turnos.length,0);assert.equal(repo.snapshot().revision,0);
    repo.db.exec('DROP TRIGGER fallo');assert.equal(repo.create('Ana',randomUUID()).numero,1);
  } finally { repo.close();rmSync(dir,{recursive:true,force:true}); }
});
