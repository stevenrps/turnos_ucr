CREATE TABLE IF NOT EXISTS meta (
                id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL);
            INSERT OR IGNORE INTO meta VALUES (1, 0);
            CREATE TABLE IF NOT EXISTS turnos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                numero INTEGER NOT NULL UNIQUE CHECK(numero>0),
                cliente TEXT NOT NULL CHECK(length(trim(cliente)) BETWEEN 2 AND 80),
                estado TEXT NOT NULL DEFAULT 'pendiente'
                  CHECK(estado IN ('pendiente','llamado','atendido')),
                funcionario TEXT,
                creado_en TEXT NOT NULL, llamado_en TEXT, atendido_en TEXT,
                version INTEGER NOT NULL DEFAULT 0 CHECK(version>=0),
                clave TEXT NOT NULL UNIQUE,
                CHECK(estado='pendiente' OR (funcionario IS NOT NULL AND llamado_en IS NOT NULL)),
                CHECK(estado!='atendido' OR atendido_en IS NOT NULL)
            );
            CREATE INDEX IF NOT EXISTS idx_turnos_estado_numero ON turnos(estado,numero);
            CREATE TABLE IF NOT EXISTS historial (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                turno_id INTEGER NOT NULL REFERENCES turnos(id),
                anterior TEXT, nuevo TEXT NOT NULL, funcionario TEXT, fecha TEXT NOT NULL
            );
