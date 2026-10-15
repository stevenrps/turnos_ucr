# Investigación: HTTP, WebSockets y concurrencia

## HTTP y WebSockets

| Aspecto | HTTP REST | WebSocket |
|---|---|---|
| Comunicación de aplicación | Solicitud cliente y respuesta servidor | Ambos extremos pueden enviar mensajes por el canal abierto |
| Conexión | Puede reutilizar conexiones; no exige una nueva por petición | Canal persistente establecido mediante handshake |
| Uso aquí | GET lista, POST registra, PATCH cambia estado | Snapshot inicial, difusión de estado, ping/pong y sincronizar |
| Ventaja | Métodos/códigos claros, pruebas sencillas de comandos | Cambios llegan sin recargar ni preguntar periódicamente |
| Fallos | Puede perderse la respuesta después de COMMIT | El canal puede cerrarse o quedarse sin mensajes |
| Seguridad real | HTTPS y autorización de operaciones | WSS y autorización del handshake/eventos |

REST conserva las escrituras y sus reglas, incluyendo respuestas 409 y 422.
WebSocket lleva notificaciones push y mensajes bidireccionales. No se crea una
segunda vía de escritura que pueda saltarse los casos de uso REST.

## Eventos Flutter-Node

1. Flutter conecta a `/ws/turnos` mediante web_socket_channel.
2. Node verifica Origin y realiza el upgrade con WebSocketServer de `ws`.
3. El socket queda registrado y recibe `{tipo:'estado', revision, turnos}`.
4. El controlador convierte JSON a modelos y notifica a AnimatedBuilder.
5. Un POST/PATCH ejecuta una transacción SQLite; después del COMMIT, Node
   publica otro snapshot a todos los clientes.
6. Flutter envía ping JSON cada 15 segundos; Node responde pong.
7. Un evento sincronizar solicita el snapshot actual mediante el mismo canal.

El snapshot completo simplifica recuperación; para historiales grandes se
recomiendan paginación y deltas con secuencias, manteniendo un snapshot inicial.

## Reconexión y sincronización

Flutter detecta cierre/error y ausencia de mensajes durante más de 35 segundos.
Cancela el canal anterior, avisa que el estado puede estar antiguo y deshabilita
mutaciones. Reintenta con espera 1,2,4,8,16,30 segundos, máximo 30. Generaciones
impiden que callbacks antiguos modifiquen el estado del canal nuevo.

Una nueva conexión recibe datos persistentes completos. Se recuperan los
cambios producidos durante la desconexión. La revisión global evita sustituir
un estado reciente por un GET que llegó tarde. Los GET posteriores a comandos
son puntuales; ningún Timer hace polling HTTP.

## Elección de Node y SQLite

Node.js se alinea con las tecnologías vistas en el curso. Express separa rutas
y middleware; `ws` implementa WebSockets. Node 24 incorpora `node:sqlite`, evitando
un módulo nativo externo que pueda requerir compiladores durante instalación.

DatabaseSync ejecuta SQL de manera síncrona. Las transacciones son cortas y no
contienen await. Esto simplifica el ejemplo, pero bloquea el event loop mientras
consulta: para alta carga se requiere otro adaptador o un worker de persistencia.
El proyecto exige Node 24 o posterior para uniformar el entorno de ejecución.

BEGIN IMMEDIATE obtiene el bloqueo antes de leer. El UPDATE verifica ID, estado
y versión. Dos solicitudes sobre la misma versión no pueden confirmar ambas.
UNIQUE protege consecutivos y claves. Auditoría, fechas y revisión se confirman
juntas. Las pruebas entre workers independientes verifican el bloqueo SQLite.

El hub WS pertenece a un proceso; SQLite no propaga eventos entre procesos.
Para escalar horizontalmente se necesita un bus compartido y un protocolo de
publicación consistente, además de adaptar la base a la carga esperada.

## Fuentes primarias

Consultadas el 14 de octubre de 2026. Explicaciones parafraseadas y aplicadas
al código; no se reproducen citas textuales extensas.

1. Node.js. SQLite: DatabaseSync y prepared statements.
   https://nodejs.org/api/sqlite.html
2. Express. Routing: métodos y rutas HTTP.
   https://expressjs.com/en/guide/routing.html
3. ws. WebSocketServer, upgrade, mensajes y clientes.
   https://github.com/websockets/ws
4. Flutter. Communicate with WebSockets: canal, stream y sink.
   https://docs.flutter.dev/cookbook/networking/web-sockets
5. SQLite. Transaction: BEGIN IMMEDIATE, COMMIT, ROLLBACK y bloqueo.
   https://www.sqlite.org/lang_transaction.html
6. SQLite. Isolation In SQLite: escritores serializados y WAL.
   https://www.sqlite.org/isolation.html
7. IETF. RFC 6455: handshake y protocolo WebSocket.
   https://www.rfc-editor.org/rfc/rfc6455
8. IETF. RFC 9110: semántica HTTP; POST no evita duplicados automáticamente.
   https://www.rfc-editor.org/rfc/rfc9110

Las guías del curso aportan serialización JSON, separación de modelo/servicios/UI
y la regla de no guardar secretos. El examen permite bases relacionales o no
relacionales; SQLite es relacional y conserva los datos después de reiniciar.
