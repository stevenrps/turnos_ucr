# Arquitectura y principios aplicados

## Capas

Flutter presenta formularios y estados; sus servicios transportan HTTP/WS.
El controlador resuelve carga, error, revisiones, reintentos y reconexión.
Node recibe comandos REST, valida mediante TurnService y solicita transacciones
al repositorio. SQLite conserva la autoridad del consecutivo y del historial.
El hub comunica únicamente estados confirmados.

## SOLID

| Principio | Aplicación concreta |
|---|---|
| Responsabilidad única | `service.js` contiene casos de uso; `repository.js` SQL; `realtime.js` sockets; `server.js` transporte y composición; widgets presentan |
| Abierto/cerrado | Un nuevo adaptador puede implementar `TurnRepository`; el controlador Flutter admite nuevos `TurnApi` y `RealtimeClient` |
| Sustitución de Liskov | Adaptadores deben respetar errores, FIFO, atomicidad, versiones y resultados del contrato; los fakes Flutter satisfacen las interfaces |
| Segregación de interfaces | HTTP y tiempo real tienen puertos separados en Flutter; el repositorio expone solo operaciones que necesita el servicio |
| Inversión de dependencias | `TurnService` recibe el repositorio por constructor; `TurnController` recibe interfaces; las raíces eligen implementaciones |

JavaScript utiliza una clase base como contrato documentado y JSDoc para
referenciarlo. No se presenta como una interface TypeScript. El servicio no
importa Express, ws ni SQLite. Cambiar las reglas de negocio puede requerir
modificar el servicio: SOLID no significa que nunca se modifica ninguna clase.

## DRY, KISS, YAGNI y encapsulación

- Validaciones semánticas comunes en `TurnService.text`; serialización en modelos.
- Comandos cliente comparten `_execute`; errores de transporte se manejan juntos.
- Solo tres estados y un proceso; no hay microservicios ni jerarquías innecesarias.
- No se agregan prioridades, cancelaciones ni reseteos diarios no solicitados.
- Listas inmutables en snapshots Flutter; el cliente no presupone éxito local.
- Validación en ambas capas y CHECK/UNIQUE en la base como defensa adicional.

## Concurrencia y ACID

1. BEGIN IMMEDIATE obtiene escritura **antes** de leer el próximo número/estado.
2. La transición verifica el primer pendiente, estado esperado y versión.
3. UPDATE condiciona ID, estado y versión; debe modificar exactamente una fila.
4. Estado, fechas, auditoría y revisión se confirman en una transacción.
5. COMMIT ocurre antes del evento WebSocket. Un fallo provoca ROLLBACK.

A y B observan pendiente, versión 0. A confirma llamado, versión 1. B lee la
versión nueva después del bloqueo y recibe 409; nunca hay dos éxitos para esa
versión. El endpoint recibe un ID explícito: el perdedor no toma otro turno
por sorpresa. El frontend consulta el estado real después del conflicto.

| ACID | Implementación |
|---|---|
| Atomicidad | Transacción conjunta, rollback ante excepción; prueba con trigger que fuerza fallo |
| Consistencia | UNIQUE número/clave, CHECK estados/fechas y validación de transiciones |
| Aislamiento | BEGIN IMMEDIATE y UPDATE condicional; snapshot en transacción de lectura |
| Durabilidad | Archivo SQLite y COMMIT; no se guarda la colección solo en RAM |

WAL permite lectores durante una escritura; sigue existiendo un escritor a la
vez. `busy_timeout=5000` limita la espera por bloqueo. Las operaciones síncronas
son adecuadas para la demo pequeña; pueden afectar latencia bajo alta carga.
Dos workers y conexiones independientes prueban que las reglas no dependen
únicamente de la ejecución serial del event loop del servidor.

## Publicación y estado inicial

La creación del socket y el snapshot inicial no contienen await; los comandos
SQLite y su publicación también son síncronos. Por ello un callback de comando
no se intercala entre el registro y el snapshot. `ws.send` encola mensajes en
orden. El cliente descarta revisiones inferiores aunque un GET tarde en responder.

Si un socket acumula más de 1 MiB pendiente, se termina y recuperará el estado
por reconexión. El hub pertenece a un proceso; escalar a varios procesos exige
un bus compartido. No se afirma que SQLite solucione distribución de eventos.

## Idempotencia y desconexión

POST lleva UUID, protegido por UNIQUE. Reintentar con los mismos datos devuelve
el turno original y no aumenta revisión/consecutivo. Reutilizar clave con datos
diferentes produce 409. Flutter conserva clave y nombre en memoria hasta
confirmar; una recarga antes de resolver el POST pierde esa clave.

PATCH usa versión; un reintento antiguo puede devolver 409 y provocar recuperación
puntual HTTP. No se retransmite ciegamente una transición ya confirmada.

Flutter usa heartbeat JSON cada 15 segundos y reconecta después de 1,2,4,8,16,30
segundos, máximo 30. Generaciones invalidan callbacks antiguos. Al recibir un
snapshot válido habilita los comandos. No hay GET HTTP periódico.

## Seguridad y alcance

Node valida estructura, campos adicionales, nombres, UUID, ID, estado y versión.
Express limita el JSON a 16 KiB; ws limita mensajes entrantes a 4096 bytes.
Entradas SQL parametrizadas; el nombre de columna viene de constantes internas.

Origin/CORS no autentican. Los nombres de funcionarios son identificadores de
demo y pueden suplantarse. El permiso de finalizar por nombre es una regla
funcional, no una barrera de identidad. Una instalación real necesita usuarios,
roles, sesiones validadas, TLS, backups y retención. No se almacenan secretos.
