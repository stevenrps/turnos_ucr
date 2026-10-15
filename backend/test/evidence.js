/** Evidencia reproducible: HTTP/WS reales, dos clientes y servidor reiniciado. */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { start, connect } from './helpers.js';

const dir=mkdtempSync(join(tmpdir(),'turnos-evidence-'));
const path=join(dir,'turnos.sqlite3');
const records=[];
let c=await start(path);
try {
  const html=await fetch(c.base);
  assert.equal(html.status,200);assert.match(await html.text(),/flutter_bootstrap.js/);
  records.push({prueba:'Node sirve el punto de entrada Flutter compilado',status:html.status});
  const a=connect(c.base,'http://localhost:8000'),b=connect(c.base,'http://localhost:8000');
  try {
    await Promise.all([a.ready,b.ready]);
    records.push({prueba:'Dos conexiones WS independientes',A:await a.next(),B:await b.next()});
    const key=randomUUID();const created=await c.create('Ana Demo',key);
    assert.equal(created.status,201);records.push({prueba:'POST',...created});
    const sa=await a.next(),sb=await b.next();assert.deepEqual(sa,sb);
    records.push({prueba:'Broadcast de creación sin GET ni recarga',A:sa,B:sb});
    const race=await Promise.all([c.change(created.body,'llamado','Funcionario A'),c.change(created.body,'llamado','Funcionario B')]);
    assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);
    records.push({prueba:'Carrera HTTP: solo uno tiene éxito',resultados:race});
    const called=race.find(r=>r.status===200).body;
    records.push({prueba:'Ambos sockets reciben llamado',A:await a.next(),B:await b.next()});
    const done=await c.change(called,'atendido',called.funcionario);
    assert.equal(done.status,200);assert.ok(done.body.atendido_en);
    records.push({prueba:'PATCH atendido con fecha y hora',...done});await a.next();await b.next();
    const repeated=await c.create('Ana Demo',key);
    assert.equal(repeated.body.id,created.body.id);records.push({prueba:'Reintento POST sin duplicación',...repeated});
    await a.next();await b.next();
    a.socket.send(JSON.stringify({tipo:'ping'}));assert.deepEqual(await a.next(),{tipo:'pong'});
  } finally {a.socket.terminate();b.socket.terminate();}
  await c.instance.close();c=await start(path);
  const snapshot=await c.request('GET','/api/turnos');assert.equal(snapshot.body.turnos[0].estado,'atendido');
  records.push({prueba:'GET después de reiniciar servidor conserva historial',...snapshot});
  const reconnected=connect(c.base);
  try {
    await reconnected.ready;const event=await reconnected.next();assert.equal(event.turnos[0].estado,'atendido');
    records.push({prueba:'Reconexión recibe estado completo',body:event});
  } finally {reconnected.socket.terminate();}
  const second=await c.create('Luis Demo');assert.equal(second.body.numero,2);
  records.push({prueba:'Consecutivo persiste tras reinicio',...second});
  writeFileSync(new URL('../../evidencias/node_demostracion_real.json',import.meta.url),JSON.stringify(records,null,2));
  console.log(`${records.length} evidencias reales verificadas sobre Node.js.`);
} finally {await c.instance.close();rmSync(dir,{recursive:true,force:true});}
