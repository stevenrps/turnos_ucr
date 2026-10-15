# Contrato de la API

Base: `http://localhost:8000`. JSON UTF-8. Backend Node.js/Express. No se envían contraseñas ni secretos.

## GET /api/turnos

200:

```json
{"revision":0,"turnos":[]}
```

Cada fila contiene `id`, `numero`, `cliente`, `estado`, `funcionario`,
`creado_en`, `llamado_en`, `atendido_en` y `version`. Fechas ISO 8601 en UTC.
La clave de reintento no se expone en respuestas. El GET no modifica la base.

## POST /api/turnos

```json
{"cliente":"Ana Pérez","clave":"5c7c930a-17ea-44aa-8c10-c12b510ff726"}
```

201: turno nuevo (o el original si se reintenta con igual clave y nombre).
Consecutivo global positivo, calculado bajo transacción; comienza en 1.
Nombre: de 2 a 80 caracteres después de recortar espacios exteriores, sin
caracteres de control. Clave: UUID válido. Campos adicionales se rechazan.

## PATCH /api/turnos/1

Llamar:

```json
{"estado":"llamado","funcionario":"Funcionario A","version":0}
```

Finalizar la atención después de la llamada:

```json
{"estado":"atendido","funcionario":"Funcionario A","version":1}
```

200: turno confirmado con versión incrementada. No se puede atender un
pendiente, llamar un atendido, retroceder estados o saltarse el primer pendiente.
La finalización exige el mismo identificador de funcionario que la llamada.
La versión es entero seguro no negativo; no acepta booleanos ni coerción de cadenas.

## Respuestas de error

| HTTP | Caso |
|---|---|
| 403 | Otro identificador de funcionario intenta finalizar la atención |
| 404 | ID no existe |
| 409 | Estado/versión antigua, no es el primer pendiente o clave reutilizada con datos distintos |
| 422 | Nombre inválido, UUID inválido, estado no admitido o estructura inválida |
| 503 | Error operativo SQLite (p. ej. agotó espera por bloqueo) |

Errores del dominio: `{"detail":"Mensaje"}`. Todos los errores de validación utilizan `detail` textual. JSON mal formado
produce 400 y un cuerpo superior a 16 KiB produce 413. Flutter muestra un
mensaje legible y recupera estado al recibir conflicto.

## WS /ws/turnos

El navegador manda su Origin; debe estar en ALLOWED_ORIGINS. En scripts de
prueba se especifica `origin='http://localhost:8080'`. Origin no es autenticación.

Servidor → cliente (inicial y cada cambio):

```json
{"tipo":"estado","revision":3,"turnos":[]}
```

El array contiene todas las filas reales; el array vacío anterior ilustra solo
el formato. La revisión real corresponde a la transacción, nunca es inventada.

Cliente → servidor: `{"tipo":"ping"}` → `{"tipo":"pong"}`.
Cliente → servidor: `{"tipo":"sincronizar"}` → snapshot `estado` completo.
Evento desconocido → `{"tipo":"error","mensaje":"Evento no reconocido."}`.
El servidor revisa cada 15 segundos y termina sockets con más de 45 segundos
sin mensajes. El canal WS limita mensajes entrantes a 4096 bytes; los snapshots de salida
pueden ser mayores porque ese límite es para mensajes entrantes.

## Prueba manual REST desde PowerShell

Con el backend iniciado, utilice el ID y la versión que devuelve la API:

```powershell
$base = 'http://localhost:8000'
$payload = @{ cliente = 'Ana Demo'; clave = [guid]::NewGuid().ToString() } | ConvertTo-Json
$t = Invoke-RestMethod -Method Post -Uri "$base/api/turnos" -ContentType 'application/json' -Body $payload
$t
Invoke-RestMethod -Uri "$base/api/turnos"
$llamar = @{ estado='llamado'; funcionario='Funcionario A'; version=$t.version } | ConvertTo-Json
$l = Invoke-RestMethod -Method Patch -Uri "$base/api/turnos/$($t.id)" -ContentType 'application/json' -Body $llamar
$l
$atender = @{ estado='atendido'; funcionario='Funcionario A'; version=$l.version } | ConvertTo-Json
Invoke-RestMethod -Method Patch -Uri "$base/api/turnos/$($t.id)" -ContentType 'application/json' -Body $atender
```

Si existen turnos pendientes anteriores, primero llámelos: el sistema mantiene
FIFO. Para probar un conflicto, repita PATCH con la versión anterior; espere 409.
Para probar idempotencia repita exactamente el mismo POST `$payload`.
