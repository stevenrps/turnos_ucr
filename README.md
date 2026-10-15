# Gestión de turnos en tiempo real - Node.js y Flutter

UCR, Sede del Sur · IF0009 Desarrollo de Software IV · Parte II (60 puntos).

Frontend Flutter Web, backend Node.js/Express, SQLite y WebSockets (`ws`).
El servidor asigna los consecutivos, confirma los cambios y difunde el estado
entre usuarios sin recargar. El proyecto no necesita Python.

## Abrir en Windows

1. Instale **Node.js 24 o posterior** si aún no lo tiene. Compruebe con
   `node --version`. El backend usa `node:sqlite`, integrado en Node.
2. Extraiga todo el ZIP y abra la carpeta `turnos_ucr`.
3. Abra `iniciar_backend.bat`. Instala las versiones fijadas con `npm ci`
   y mantiene el servidor ejecutándose. Espere el mensaje de inicio.
4. Abra **http://localhost:8000** en Chrome y en Edge. Node sirve también
   la versión compilada de Flutter incluida en `frontend/build/web`.
5. Use **Funcionario A** en una ventana y **Funcionario B** en la otra.
   Registre personas, llame al siguiente, consulte Llamados y finalice desde
   el funcionario ganador. Revise el historial con fechas y horas.

Mantenga abierta la ventana del backend. Ctrl+C lo detiene. No abra index.html
con file://. Para esta demostración basta Node instalado: Flutter ya está
compilado. Para editar o recompilar el frontend también necesita el SDK Flutter.

### Iniciar manualmente

Terminal de VS Code desde la carpeta del proyecto:

```powershell
cd backend
npm ci
npm start
```

En Linux/macOS los comandos son iguales. Node crea la base SQLite en el primer
inicio; no necesita instalar MySQL ni un servicio de bases de datos.

### Ejecutar Flutter durante desarrollo

Backend ejecutándose en puerto 8000. En otra terminal:

```powershell
cd frontend
flutter pub get
flutter run -d web-server --web-hostname localhost --web-port 8080 --dart-define=API_BASE_URL=http://localhost:8000
```

También puede abrir `iniciar_frontend.bat`. Para ese modo abra
http://localhost:8080 en ambos navegadores. Ambos orígenes (8000 y 8080) están
permitidos por el backend.

## Organización

| Archivo | Responsabilidad |
|---|---|
| `backend/src/domain.js` | Contrato de repositorio y errores de negocio |
| `backend/src/service.js` | Casos de uso y validaciones |
| `backend/src/repository.js` | SQLite, transacciones, consecutivos y auditoría |
| `backend/src/schema.sql` | Tablas, restricciones e índice |
| `backend/src/realtime.js` | WebSockets, difusión y heartbeat |
| `backend/src/server.js` | Composición, endpoints REST, CORS y servidor web |
| `backend/src/main.js` | Inicio, configuración y cierre ordenado |
| `backend/test/` | Pruebas de integración y carreras entre workers |
| `frontend/lib/models/` | Modelos inmutables y deserialización JSON |
| `frontend/lib/services/` | Contratos, HTTP y canal WebSocket |
| `frontend/lib/controllers/` | Estado, revisiones, reconexión e idempotencia |
| `frontend/lib/pages/` | Widgets, filtros y formularios |
| `frontend/lib/main.dart` | Composición por inyección de dependencias |
| `docs/` | Investigación, SOLID/ACID, API y guion del video |
| `evidencias/` | Resultados verificados del backend y Flutter |

Flujo de escritura: Flutter → REST → servicio → repositorio → SQLite → COMMIT
→ evento WebSocket → estado del controlador → widgets. El frontend no accede
al archivo SQLite ni asigna números. No hay polling HTTP periódico.

## API y estados

- `GET /api/turnos`: snapshot `{revision, turnos}` con los tres estados.
- `POST /api/turnos`: `{cliente, clave}`; 201 y consecutivo del servidor.
- `PATCH /api/turnos/:id`: `{estado, funcionario, version}`; 200 si confirma.
- `WS /ws/turnos`: snapshot inicial y eventos `estado`, `ping`, `pong`, `sincronizar`.
- Estados permitidos: **pendiente → llamado → atendido**.
- Solo se llama al primer pendiente. Conflictos de versión/estado devuelven 409.

Contrato completo y ejemplos PowerShell en `docs/API.md`. No hay Swagger ni
OpenAPI generado automáticamente; la API está documentada en ese archivo.

## Persistencia y concurrencia

Archivo: `backend/data/turnos.sqlite3`. Se conserva después de cerrar Node y
reiniciarlo. No elimine ese archivo entre demostraciones. Consecutivo global,
sin reinicio diario. Fechas UTC, mostradas por Flutter en la zona horaria local.

BEGIN IMMEDIATE reserva escritura antes de consultar. El UPDATE comprueba ID,
estado y versión. Estado, marcas de tiempo, auditoría y revisión se confirman
juntos. UNIQUE protege número y clave UUID. Solo después de COMMIT se publica.
Dos solicitudes para la misma versión producen un éxito y un conflicto.

SQLite utiliza una API síncrona en Node. Es simple para esta demostración,
pero bloquea el event loop mientras ejecuta consultas. Para alta carga se
recomienda mover persistencia a workers o utilizar PostgreSQL con un adaptador
asíncrono. La integridad no depende exclusivamente del event loop: las pruebas
usan también dos workers/conexiones SQLite independientes.

Ejecute **un solo proceso Node**. El hub WebSocket está en memoria; para múltiples
procesos se necesita un bus compartido de eventos. El snapshot completo es
adecuado para la demo; un historial grande requiere paginación/deltas.

## Configuración opcional

PowerShell, antes de `npm start`:

```powershell
$env:PORT = '8000'
$env:DB_PATH = 'data/turnos.sqlite3'
$env:ALLOWED_ORIGINS = 'http://localhost:8000,http://127.0.0.1:8000,http://localhost:8080,http://127.0.0.1:8080'
```

La compilación incluida apunta a http://localhost:8000. Si cambia la URL del
backend, recompile Flutter con `--dart-define=API_BASE_URL=URL_NUEVA`.
`package-lock.json` y `pubspec.lock` fijan las dependencias resueltas.
`node_modules` no se distribuye; `npm ci` lo reconstruye.

## Pruebas y compilación

Desde backend:

```powershell
npm test
npm run evidence
```

Las pruebas utilizan bases temporales y no modifican los turnos reales.
`npm run evidence` registra tráfico HTTP/WS real, una carrera 200/409,
sincronización y conservación del historial después de reiniciar el servidor.
El ensayo recrea el servidor dentro del mismo proceso; el archivo es persistente.

Desde frontend:

```powershell
flutter analyze
flutter test
flutter build web --dart-define=API_BASE_URL=http://localhost:8000
```

**Verificado:** 10 pruebas del backend Node aprobadas, 2 pruebas Flutter
aprobadas, análisis Flutter sin incidencias y compilación web completada.
Once evidencias HTTP/WS reales guardadas en `evidencias/node_demostracion_real.json`.
La compilación Flutter permanece válida porque el contrato REST/WS se conserva.
Ver `evidencias/ESTADO_VERIFICACION.md` para límites de lo comprobado.

## Principios y seguridad

SOLID, separación de capas, DRY/KISS/YAGNI, ACID, revisiones y reconexión están
explicados con archivos concretos en `docs/ARQUITECTURA_Y_PRINCIPIOS.md`.
Frontend y backend validan; las entradas SQL usan parámetros. CORS y Origin WS
limitan orígenes del navegador, pero no son autenticación.

Los nombres de funcionarios son identificadores de demostración, no sesiones
seguras. Para una institución real se requieren login, roles, identidad obtenida
de la sesión del servidor, HTTPS/WSS, backups y políticas de retención.
La aplicación no guarda contraseñas ni secretos en el navegador.

## Entrega y video

Código completo, dependencias fijadas, build web, README, investigación y
resultados están incluidos. Quedan la comprobación visual en dos navegadores,
las capturas y el video de máximo cinco minutos. Consulte
`docs/VIDEO_Y_EVIDENCIAS.md`. No se incluye una grabación fabricada.

Para versionarlo desde la raíz:

```bash
git init
git add .
git commit -m "Implementa turnos Flutter y Node con WebSockets y concurrencia"
```

No suba archivos SQLite, node_modules ni secretos. El build compilado está en
este ZIP para facilitar la ejecución, aunque `.gitignore` excluye builds en Git.

## Fuentes oficiales

- Node.js, SQLite: https://nodejs.org/api/sqlite.html
- Express, guía: https://expressjs.com/en/guide/routing.html
- ws, documentación: https://github.com/websockets/ws
- Flutter, WebSockets: https://docs.flutter.dev/cookbook/networking/web-sockets
- SQLite, transacciones: https://www.sqlite.org/lang_transaction.html
- SQLite, aislamiento: https://www.sqlite.org/isolation.html
- RFC 6455: https://www.rfc-editor.org/rfc/rfc6455
- RFC 9110: https://www.rfc-editor.org/rfc/rfc9110
