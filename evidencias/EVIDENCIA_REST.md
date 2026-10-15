# Evidencia de operaciones REST y persistencia

Ejecución real del 15 de octubre de 2026 con Node.js 24.22.0, contra el backend
del proyecto (`node src/main.js`) y una base SQLite nueva. Para no alterar la
instancia de uso diario, el servidor de esta evidencia escuchó en el puerto
**8001** (`PORT=8001`). En uso normal la URL es `http://localhost:8000`.

Las fechas están en UTC (formato ISO 8601). En Costa Rica (UTC-6),
`14:33:51Z` corresponde a las 08:33:51.

| # | Operación | Resultado esperado | HTTP obtenido |
|---|---|---|---|
| 1 | `GET /api/turnos` con la base vacía | Lista vacía | 200 |
| 2 | `POST /api/turnos` (Ana Rojas) | El servidor asigna el consecutivo 1 | 201 |
| 3 | `POST /api/turnos` (Luis Mora) | Consecutivo 2 | 201 |
| 4 | `POST` repetido con la misma clave | Devuelve el mismo turno 1, sin duplicarlo | 201 |
| 5 | `POST` con nombre de 1 carácter | El servidor valida y rechaza | 422 |
| 6 | `PATCH /api/turnos/1` → llamado (A) | Turno llamado con fecha y hora | 200 |
| 7 | `PATCH /api/turnos/1` → llamado (B, versión vieja) | Rechazado: ya fue llamado | 409 |
| 8 | `PATCH /api/turnos/1` → atendido (B) | Solo quien llamó puede finalizar | 403 |
| 9 | `PATCH /api/turnos/1` → atendido (A) | Atendido con fecha y hora | 200 |
| 10 | `GET /api/turnos` | Estado actualizado | 200 |
| 11 | Dos `PATCH` simultáneos sobre el turno 2 | Exactamente uno gana | 200 y 409 |
| 12 | Reinicio del servidor y `GET` | Los datos se conservan | 200 |
| 13 | `POST` después del reinicio | El consecutivo continúa en 3 | 201 |
| 14 | Consulta de la tabla `historial` | Auditoría de cada cambio de estado | — |

---

## 1. GET: listar turnos (base vacía)

```bash
curl http://localhost:8001/api/turnos
```

**HTTP 200**

```json
{ "revision": 0, "turnos": [] }
```

## 2. POST: crear turno; el servidor asigna el consecutivo

```bash
curl -X POST http://localhost:8001/api/turnos -H "Content-Type: application/json" -d '{"cliente":"Ana Rojas","clave":"0b6f3c1e-5a2d-4c8e-9f10-2a3b4c5d6e01"}'
```

**HTTP 201**

```json
{
  "id": 1,
  "numero": 1,
  "cliente": "Ana Rojas",
  "estado": "pendiente",
  "funcionario": null,
  "creado_en": "2026-10-15T14:33:51.255Z",
  "llamado_en": null,
  "atendido_en": null,
  "version": 0
}
```

El cliente no envía el número: el servidor lo calcula dentro de una
transacción `BEGIN IMMEDIATE`.

## 3. POST: segundo turno

```bash
curl -X POST http://localhost:8001/api/turnos -H "Content-Type: application/json" -d '{"cliente":"Luis Mora","clave":"0b6f3c1e-5a2d-4c8e-9f10-2a3b4c5d6e02"}'
```

**HTTP 201**

```json
{
  "id": 2,
  "numero": 2,
  "cliente": "Luis Mora",
  "estado": "pendiente",
  "funcionario": null,
  "creado_en": "2026-10-15T14:33:51.559Z",
  "llamado_en": null,
  "atendido_en": null,
  "version": 0
}
```

## 4. POST repetido con la misma clave: no se duplica

Simula un reintento del navegador cuando se pierde la respuesta.

```bash
curl -X POST http://localhost:8001/api/turnos -H "Content-Type: application/json" -d '{"cliente":"Ana Rojas","clave":"0b6f3c1e-5a2d-4c8e-9f10-2a3b4c5d6e01"}'
```

**HTTP 201**: devuelve el mismo turno (`id` 1, `numero` 1, misma
`creado_en`). No se crea un turno 3.

```json
{
  "id": 1,
  "numero": 1,
  "cliente": "Ana Rojas",
  "estado": "pendiente",
  "creado_en": "2026-10-15T14:33:51.255Z",
  "version": 0
}
```

## 5. POST inválido: validación en el servidor

```bash
curl -X POST http://localhost:8001/api/turnos -H "Content-Type: application/json" -d '{"cliente":"A","clave":"0b6f3c1e-5a2d-4c8e-9f10-2a3b4c5d6e03"}'
```

**HTTP 422**

```json
{ "detail": "Nombre: utilice de 2 a 80 caracteres sin controles." }
```

## 6. PATCH: el funcionario A llama al turno 1

```bash
curl -X PATCH http://localhost:8001/api/turnos/1 -H "Content-Type: application/json" -d '{"estado":"llamado","funcionario":"Funcionario A","version":0}'
```

**HTTP 200**

```json
{
  "id": 1,
  "numero": 1,
  "cliente": "Ana Rojas",
  "estado": "llamado",
  "funcionario": "Funcionario A",
  "creado_en": "2026-10-15T14:33:51.255Z",
  "llamado_en": "2026-10-15T14:33:52.408Z",
  "atendido_en": null,
  "version": 1
}
```

## 7. PATCH: el funcionario B intenta llamar el mismo turno

B todavía tenía la versión 0 del turno.

```bash
curl -X PATCH http://localhost:8001/api/turnos/1 -H "Content-Type: application/json" -d '{"estado":"llamado","funcionario":"Funcionario B","version":0}'
```

**HTTP 409**

```json
{ "detail": "Otro funcionario modificó el turno. Estado actualizado." }
```

## 8. PATCH: B intenta finalizar un turno que llamó A

```bash
curl -X PATCH http://localhost:8001/api/turnos/1 -H "Content-Type: application/json" -d '{"estado":"atendido","funcionario":"Funcionario B","version":1}'
```

**HTTP 403**

```json
{ "detail": "Solo el funcionario que llamó puede finalizar la atención." }
```

## 9. PATCH: A finaliza la atención

```bash
curl -X PATCH http://localhost:8001/api/turnos/1 -H "Content-Type: application/json" -d '{"estado":"atendido","funcionario":"Funcionario A","version":1}'
```

**HTTP 200**

```json
{
  "id": 1,
  "numero": 1,
  "cliente": "Ana Rojas",
  "estado": "atendido",
  "funcionario": "Funcionario A",
  "creado_en": "2026-10-15T14:33:51.255Z",
  "llamado_en": "2026-10-15T14:33:52.408Z",
  "atendido_en": "2026-10-15T14:33:53.286Z",
  "version": 2
}
```

## 10. GET: estado actualizado

```bash
curl http://localhost:8001/api/turnos
```

**HTTP 200**

```json
{
  "revision": 4,
  "turnos": [
    {
      "id": 1, "numero": 1, "cliente": "Ana Rojas", "estado": "atendido",
      "funcionario": "Funcionario A",
      "creado_en": "2026-10-15T14:33:51.255Z",
      "llamado_en": "2026-10-15T14:33:52.408Z",
      "atendido_en": "2026-10-15T14:33:53.286Z", "version": 2
    },
    {
      "id": 2, "numero": 2, "cliente": "Luis Mora", "estado": "pendiente",
      "funcionario": null,
      "creado_en": "2026-10-15T14:33:51.559Z",
      "llamado_en": null, "atendido_en": null, "version": 0
    }
  ]
}
```

## 11. Concurrencia: dos llamadas simultáneas al turno 2

Las dos peticiones se lanzaron en paralelo, con la misma versión (0):

```bash
curl -X PATCH http://localhost:8001/api/turnos/2 -H "Content-Type: application/json" -d '{"estado":"llamado","funcionario":"Funcionario A","version":0}' &
curl -X PATCH http://localhost:8001/api/turnos/2 -H "Content-Type: application/json" -d '{"estado":"llamado","funcionario":"Funcionario B","version":0}' &
wait
```

Funcionario B, **HTTP 200** (ganó):

```json
{
  "id": 2, "numero": 2, "cliente": "Luis Mora", "estado": "llamado",
  "funcionario": "Funcionario B",
  "llamado_en": "2026-10-15T14:34:03.274Z", "version": 1
}
```

Funcionario A, **HTTP 409** (perdió):

```json
{ "detail": "Otro funcionario modificó el turno. Estado actualizado." }
```

Solo uno puede tener éxito. La transacción `BEGIN IMMEDIATE` serializa las
escrituras, y el `UPDATE ... WHERE estado=? AND version=?` rechaza a la que
llega con la versión desactualizada. El ganador puede variar entre
ejecuciones; lo que se garantiza es que haya exactamente un 200 y un 409.

## 12. Persistencia: reinicio del servidor

Se detuvo el proceso de Node y se inició de nuevo sobre el mismo archivo SQLite.

```bash
curl http://localhost:8001/api/turnos
```

**HTTP 200**: los datos y las fechas siguen iguales.

```json
{
  "revision": 5,
  "turnos": [
    {
      "id": 1, "numero": 1, "cliente": "Ana Rojas", "estado": "atendido",
      "funcionario": "Funcionario A",
      "creado_en": "2026-10-15T14:33:51.255Z",
      "llamado_en": "2026-10-15T14:33:52.408Z",
      "atendido_en": "2026-10-15T14:33:53.286Z", "version": 2
    },
    {
      "id": 2, "numero": 2, "cliente": "Luis Mora", "estado": "llamado",
      "funcionario": "Funcionario B",
      "creado_en": "2026-10-15T14:33:51.559Z",
      "llamado_en": "2026-10-15T14:34:03.274Z",
      "atendido_en": null, "version": 1
    }
  ]
}
```

## 13. POST después del reinicio: el consecutivo continúa

```bash
curl -X POST http://localhost:8001/api/turnos -H "Content-Type: application/json" -d '{"cliente":"Marta Solis","clave":"0b6f3c1e-5a2d-4c8e-9f10-2a3b4c5d6e04"}'
```

**HTTP 201**

```json
{
  "id": 3,
  "numero": 3,
  "cliente": "Marta Solis",
  "estado": "pendiente",
  "creado_en": "2026-10-15T14:34:05.111Z",
  "version": 0
}
```

## 14. Tabla de auditoría `historial` en SQLite

Cada cambio de estado se guarda en la misma transacción que el cambio del turno.

| id | turno | anterior | nuevo | funcionario | fecha (UTC) |
|---|---|---|---|---|---|
| 1 | 1 | — | pendiente | — | 2026-10-15T14:33:51.255Z |
| 2 | 2 | — | pendiente | — | 2026-10-15T14:33:51.559Z |
| 3 | 1 | pendiente | llamado | Funcionario A | 2026-10-15T14:33:52.408Z |
| 4 | 1 | llamado | atendido | Funcionario A | 2026-10-15T14:33:53.286Z |
| 5 | 2 | pendiente | llamado | Funcionario B | 2026-10-15T14:34:03.274Z |
| 6 | 3 | — | pendiente | — | 2026-10-15T14:34:05.111Z |

Los intentos rechazados (409, 403 y 422) no dejaron filas, porque la
transacción se revierte completa.

---

**Nota para reproducir en Windows:** en PowerShell use `curl.exe` (no el alias
`curl`) y escape las comillas del JSON, o ejecute los comandos desde Git Bash.
El archivo `node_demostracion_real.json` contiene evidencia equivalente
generada automáticamente con `npm run evidence`.
