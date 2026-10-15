/** Error de negocio: el transporte lo convierte en una respuesta HTTP. */
export class DomainError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * Puerto de persistencia. Un adaptador sustituto debe preservar atomicidad,
 * FIFO, idempotencia, versiones y snapshots consistentes.
 */
export class TurnRepository {
  snapshot() { throw new Error('Implemente snapshot'); }
  create(_cliente, _clave) { throw new Error('Implemente create'); }
  transition(_id, _estado, _funcionario, _version) { throw new Error('Implemente transition'); }
  close() { throw new Error('Implemente close'); }
}
