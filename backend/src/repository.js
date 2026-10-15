import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { DomainError, TurnRepository } from './domain.js';

/** SQLite es la autoridad de consecutivos, versiones y auditoría. */
export class SQLiteTurnRepository extends TurnRepository {
  constructor(path) {
    super();
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;');
    this.db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
  }

  /** Transacciones síncronas: no insertar await dentro de este bloque. */
  transaction(begin, operation) {
    this.db.exec(begin);
    try {
      const result = operation();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  public(row) {
    const { clave: _secret, ...turn } = row;
    return turn;
  }

  snapshot() {
    return this.transaction('BEGIN', () => ({
      revision: this.db.prepare('SELECT revision FROM meta WHERE id=1').get().revision,
      turnos: this.db.prepare('SELECT * FROM turnos ORDER BY numero').all().map(row => this.public(row)),
    }));
  }

  create(cliente, clave) {
    return this.transaction('BEGIN IMMEDIATE', () => {
      const old = this.db.prepare('SELECT * FROM turnos WHERE clave=?').get(clave);
      if (old) {
        if (old.cliente !== cliente) throw new DomainError(409, 'La clave de reintento pertenece a otra solicitud.');
        return this.public(old);
      }
      const numero = this.db.prepare('SELECT COALESCE(MAX(numero),0)+1 AS numero FROM turnos').get().numero;
      const now = new Date().toISOString();
      const result = this.db.prepare('INSERT INTO turnos(numero,cliente,creado_en,clave) VALUES(?,?,?,?)')
        .run(numero, cliente, now, clave);
      const id = Number(result.lastInsertRowid);
      this.db.prepare('INSERT INTO historial(turno_id,nuevo,fecha) VALUES(?,?,?)').run(id, 'pendiente', now);
      this.db.prepare('UPDATE meta SET revision=revision+1 WHERE id=1').run();
      return this.public(this.db.prepare('SELECT * FROM turnos WHERE id=?').get(id));
    });
  }

  transition(id, estado, funcionario, version) {
    // Reserva escritura antes de leer, también entre procesos/conexiones SQLite.
    return this.transaction('BEGIN IMMEDIATE', () => {
      const turn = this.db.prepare('SELECT * FROM turnos WHERE id=?').get(id);
      if (!turn) throw new DomainError(404, 'El turno no existe.');
      const previous = estado === 'llamado' ? 'pendiente' : 'llamado';
      if (turn.estado !== previous || turn.version !== version) {
        throw new DomainError(409, 'Otro funcionario modificó el turno. Estado actualizado.');
      }
      if (estado === 'llamado') {
        const first = this.db.prepare("SELECT id FROM turnos WHERE estado='pendiente' ORDER BY numero LIMIT 1").get();
        if (!first || first.id !== id) throw new DomainError(409, 'Debe llamar al primer turno pendiente.');
      } else if (turn.funcionario !== funcionario) {
        throw new DomainError(403, 'Solo el funcionario que llamó puede finalizar la atención.');
      }
      const now = new Date().toISOString();
      // El nombre de columna es una constante interna; entradas usan parámetros SQL.
      const column = estado === 'llamado' ? 'llamado_en' : 'atendido_en';
      const result = this.db.prepare(`UPDATE turnos SET estado=?,funcionario=?,${column}=?,version=version+1
        WHERE id=? AND estado=? AND version=?`).run(estado, funcionario, now, id, previous, version);
      if (Number(result.changes) !== 1) throw new DomainError(409, 'El turno ya fue modificado.');
      this.db.prepare('INSERT INTO historial(turno_id,anterior,nuevo,funcionario,fecha) VALUES(?,?,?,?,?)')
        .run(id, previous, estado, funcionario, now);
      this.db.prepare('UPDATE meta SET revision=revision+1 WHERE id=1').run();
      return this.public(this.db.prepare('SELECT * FROM turnos WHERE id=?').get(id));
    });
  }

  close() { this.db.close(); }
}
