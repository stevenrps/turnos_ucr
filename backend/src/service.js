import { DomainError } from './domain.js';

/** Casos de uso: no importa Express, ws ni node:sqlite. */
export class TurnService {
  /** @param {import('./domain.js').TurnRepository} repository */
  constructor(repository) { this.repository = repository; }

  text(value, label) {
    if (typeof value !== 'string') throw new DomainError(422, `${label}: debe ser texto.`);
    const normalized = value.trim();
    const length = Array.from(normalized).length;
    if (length < 2 || length > 80 || /[\u0000-\u001f\u007f]/u.test(normalized)) {
      throw new DomainError(422, `${label}: utilice de 2 a 80 caracteres sin controles.`);
    }
    return normalized;
  }

  object(body, fields) {
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).length !== fields.length
      || fields.some(field => !Object.hasOwn(body, field))) {
      throw new DomainError(422, 'Campos de la solicitud inválidos.');
    }
  }

  list() { return this.repository.snapshot(); }

  create(body) {
    this.object(body, ['cliente', 'clave']);
    if (typeof body.clave !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.clave)) {
      throw new DomainError(422, 'La clave debe ser un UUID válido.');
    }
    return this.repository.create(this.text(body.cliente, 'Nombre'), body.clave.toLowerCase());
  }

  transition(id, body) {
    this.object(body, ['estado', 'funcionario', 'version']);
    if (!Number.isSafeInteger(id) || id < 1) throw new DomainError(422, 'ID inválido.');
    if (!['llamado', 'atendido'].includes(body.estado)) throw new DomainError(422, 'Estado no permitido.');
    if (!Number.isSafeInteger(body.version) || body.version < 0) throw new DomainError(422, 'Versión inválida.');
    return this.repository.transition(id, body.estado, this.text(body.funcionario, 'Funcionario'), body.version);
  }
}
