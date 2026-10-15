import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { DomainError } from './domain.js';
import { SQLiteTurnRepository } from './repository.js';
import { TurnService } from './service.js';
import { ConnectionHub } from './realtime.js';

/** Composition root: conecta adaptadores y permite inyectar repositorios de prueba. */
export function createTurnServer({ dbPath = 'data/turnos.sqlite3', repository,
  origins = ['http://localhost:8080', 'http://127.0.0.1:8080', 'http://localhost:8000', 'http://127.0.0.1:8000'] } = {}) {
  const repo = repository ?? new SQLiteTurnRepository(dbPath);
  const service = new TurnService(repo);
  const app = express();
  app.disable('x-powered-by');
  app.use((request, response, next) => {
    response.vary('Origin');
    if (origins.includes(request.headers.origin)) response.setHeader('Access-Control-Allow-Origin', request.headers.origin);
    response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (request.method === 'OPTIONS') { response.sendStatus(204); return; }
    next();
  });
  app.use(express.json({ limit: '16kb' }));
  const server = createServer(app);
  const hub = new ConnectionHub(server, service, origins);

  app.get('/api/turnos', (_request, response) => response.json(service.list()));
  app.post('/api/turnos', (request, response) => {
    const result = service.create(request.body);
    // Métodos SQLite síncronos: COMMIT terminó antes de publicar.
    hub.broadcast(service.list());
    response.status(201).json(result);
  });
  app.patch('/api/turnos/:id', (request, response) => {
    if (!/^\d+$/.test(request.params.id)) throw new DomainError(422, 'ID inválido.');
    const result = service.transition(Number(request.params.id), request.body);
    hub.broadcast(service.list());
    response.json(result);
  });
  app.use('/api', (_request, response) => response.status(404).json({ detail: 'Ruta no encontrada.' }));
  // Versión Flutter compilada: permite abrir la demo con solo Node.js instalado.
  app.use(express.static(fileURLToPath(new URL('../../frontend/build/web/', import.meta.url))));
  app.use((error, _request, response, _next) => {
    if (error instanceof DomainError) response.status(error.status).json({ detail: error.message });
    else if (error.type === 'entity.parse.failed') response.status(400).json({ detail: 'JSON inválido.' });
    else if (error.type === 'entity.too.large') response.status(413).json({ detail: 'Solicitud demasiado grande.' });
    else if (error.code === 'ERR_SQLITE_ERROR') response.status(503).json({ detail: 'Error de almacenamiento. Reintente.' });
    else {
      console.error('Error interno del servidor:', error.message);
      response.status(500).json({ detail: 'No se pudo completar la operación.' });
    }
  });

  return { server, repository: repo,
    listen(port = 8000, host = '127.0.0.1') {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => { server.off('error', reject); resolve(server.address()); });
      });
    },
    async close() {
      hub.close();
      if (server.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      repo.close();
    },
  };
}
