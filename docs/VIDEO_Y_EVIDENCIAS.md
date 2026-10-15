# Video y evidencias de entrega

Duración sugerida: 4 minutos 40 segundos. Grabe la pantalla con Chrome y Edge
lado a lado. No sustituya la app Flutter por Postman para toda la demostración.
El video debe reflejar su ejecución real y su explicación.

## Guion

| Tiempo | Acción visible | Explicación breve |
|---|---|---|
| 0:00-0:25 | Mostrar las dos ventanas en localhost:8000, A y B | "Flutter presenta; el backend valida y persiste; WebSocket sincroniza." |
| 0:25-1:00 | Nombre de un carácter: validación. Registrar Ana y Luis | "El consecutivo lo asigna el servidor. Ambos clientes reciben los cambios sin recargar." |
| 1:00-1:35 | A llama al siguiente; ambos abren Llamados | "Después del COMMIT se publica el snapshot. B observa la llamada automáticamente." |
| 1:35-2:25 | Carrera sobre el siguiente turno, mostrar un 200 y un 409 | "Estado y versión se comprueban dentro de BEGIN IMMEDIATE; solo una solicitud confirma." |
| 2:25-2:55 | Ganador finaliza; ambos ven Historial con fecha/hora | "La atención y auditoría se guardan en la misma transacción." |
| 2:55-3:40 | Desconectar B con DevTools Offline, crear desde A; volver Online | "Se reconecta con espera creciente y recupera un snapshot completo; no usa polling HTTP." |
| 3:40-4:10 | Ctrl+C backend, volver a iniciarlo, esperar reconexión | "El historial y consecutivo siguen en SQLite después del reinicio." |
| 4:10-4:40 | Mostrar archivos clave y resultado de pruebas | "Modelo, transporte, controlador, servicio y repositorio tienen responsabilidades separadas." |

Espere la detección de desconexión: puede tardar hasta el siguiente heartbeat.
Cuando DevTools Offline no afecte un WebSocket abierto de su navegador, detenga
el backend para demostrar el cierre y luego vuelva a iniciarlo. Para probar
cambios durante una desconexión individual, cierre la ventana B y vuelva a
abrirla después de crear un turno en A; indique que se está recreando la sesión.

## Cómo demostrar una carrera de forma reproducible

Un clic de B después de ver el evento de A puede quedar deshabilitado; eso no
es una carrera. Prepare ambas solicitudes con el mismo ID y versión antes de
programarlas al mismo instante. Puede utilizar dos consolas DevTools de los dos
navegadores en localhost:8000. Los POST/PATCH siguen pasando por las reglas REST.

1. Debe existir al menos un pendiente. En cada consola guarde su snapshot:

```javascript
window.turnoDemo = (await (await fetch('http://localhost:8000/api/turnos')).json()).turnos.find(t => t.estado === 'pendiente');
console.log(turnoDemo);
```

2. Elija un instante común de al menos 30 segundos en el futuro. Genérelo una
   sola vez en la consola A y copie el número que imprime:

```javascript
console.log(Date.now() + 45000);
```

3. En ambas consolas pegue el siguiente bloque, sustituyendo `INSTANTE_COMUN`
   por exactamente ese número. Cambie A por B en la segunda consola. No vuelva
   a obtener la versión dentro del temporizador: debe ser la misma versión.

```javascript
setTimeout(async () => {
  const r = await fetch(`http://localhost:8000/api/turnos/${turnoDemo.id}`, {
    method: 'PATCH', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({estado: 'llamado', funcionario: 'Funcionario A', version: turnoDemo.version})
  });
  console.log('Resultado de carrera:', r.status, await r.json());
}, INSTANTE_COMUN - Date.now());
```

Espere 200 en una consola y 409 en la otra. Ambos navegadores deben mostrar un
único turno llamado y el mismo funcionario ganador. Si los dos reciben 409,
el turno ya fue modificado: prepare otro pendiente y repita con su versión.
No desactive la seguridad del navegador para ejecutar la demostración.

## Evidencias a conservar

- Interfaz inicial en dos navegadores/sesiones independientes.
- Validación de nombre incorrecto.
- POST con consecutivo y GET con listado.
- Un cambio reflejado en B sin recarga.
- Carrera 200/409 y estado único confirmado.
- Historial con llamado_en y atendido_en.
- Aviso de desconexión y estado recuperado al reconectar.
- Historial y siguiente consecutivo después de reiniciar el backend.
- `flutter analyze`, `flutter test`, `flutter build web`.
- Resultado `npm test` y `npm run evidence`.
- Video de máximo cinco minutos. Nombre sugerido: `demostracion_turnos.mp4`.

No hay capturas de Flutter ni video ya grabado en este paquete. Esas evidencias
se obtienen al ejecutarlo localmente; no se presentan imágenes o datos simulados
como prueba de compilación.

## Matriz de cumplimiento de la rúbrica

| Criterio | Puntos | Implementación | Evidencia/estado |
|---|---:|---|---|
| Flutter e interfaz | 10 | Form, TextFormField, validación, AnimatedBuilder, filtros, loading/error, layout responsivo | Análisis sin incidencias, 2 pruebas y build aprobados; revisión visual pendiente |
| Backend REST | 10 | GET, POST, PATCH, DTOs y códigos | Pruebas de contrato aprobadas |
| Persistencia | 8 | Archivo SQLite, timestamps, auditoría, transacciones | Prueba de recreación del servidor con mismo archivo aprobada |
| WebSockets | 15 | Dos conexiones, broadcast, ping/pong, snapshot inicial, reconexión | HTTP/WS reales sobre Node aprobados; navegadores pendientes |
| Concurrencia | 10 | BEGIN IMMEDIATE, UPDATE con versión/estado, UNIQUE | Carrera REST y carrera SQLite aprobadas |
| Investigación/documentación/demo | 7 | README, HTTP vs WS, SOLID/ACID, fuentes, guion | Documentación incluida; grabación pendiente |

Los puntos son los valores del enunciado, no una calificación garantizada.
