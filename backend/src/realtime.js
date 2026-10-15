import { WebSocket, WebSocketServer } from 'ws';

/** Publicación push; conexiones lentas se desconectan para recuperar por snapshot. */
export class ConnectionHub {
  constructor(server, service, origins) {
    this.wss = new WebSocketServer({ noServer: true, maxPayload: 4096, perMessageDeflate: false });
    server.on('upgrade', (request, socket, head) => {
      const path = new URL(request.url, 'http://localhost').pathname;
      if (path !== '/ws/turnos' || !origins.includes(request.headers.origin)) {
        socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
        return;
      }
      this.wss.handleUpgrade(request, socket, head, ws => this.wss.emit('connection', ws));
    });
    this.wss.on('connection', ws => {
      ws.lastMessage = Date.now();
      ws.on('error', () => ws.terminate());
      // Registro y snapshot sin await: ningún comando puede intercalarse entre ambos.
      try { this.send(ws, { tipo: 'estado', ...service.list() }); }
      catch { ws.close(1011, 'No se pudo sincronizar'); }
      ws.on('message', (data, binary) => {
        ws.lastMessage = Date.now();
        try {
          if (binary) throw new Error('Solo JSON textual');
          const event = JSON.parse(data.toString());
          if (event?.tipo === 'ping') this.send(ws, { tipo: 'pong' });
          else if (event?.tipo === 'sincronizar') this.send(ws, { tipo: 'estado', ...service.list() });
          else this.send(ws, { tipo: 'error', mensaje: 'Evento no reconocido.' });
        } catch { ws.close(1008, 'Mensaje inválido'); }
      });
    });
    this.timer = setInterval(() => {
      for (const ws of this.wss.clients) {
        if (Date.now() - ws.lastMessage > 45000) ws.terminate();
      }
    }, 15000);
    this.timer.unref();
  }

  send(ws, event) {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (ws.bufferedAmount > 1024 * 1024) { ws.terminate(); return; }
    ws.send(JSON.stringify(event), error => { if (error) ws.terminate(); });
  }

  broadcast(snapshot) {
    for (const ws of this.wss.clients) this.send(ws, { tipo: 'estado', ...snapshot });
  }

  close() {
    clearInterval(this.timer);
    for (const ws of this.wss.clients) ws.terminate();
    this.wss.close();
  }
}
