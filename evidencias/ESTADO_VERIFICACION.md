# Verificación de la versión Node.js

14 de octubre de 2026. Node.js 24.19.0; Flutter 3.35.5 / Dart 3.9.2.

## Backend ejecutado

`npm test`: **10 pruebas aprobadas, 0 fallos**.

1. REST: FIFO, estados, identificador de funcionario e historial.
2. Validación del servidor, UUID, versión, estado e ID.
3. POST idempotente sin incrementar revisión/consecutivo.
4. Dos conexiones WebSocket reales, broadcast, ping/pong y reconexión.
5. Rechazo de Origin no permitido.
6. Carrera HTTP: exactamente una respuesta 200 y una 409.
7. Carrera SQLite entre dos worker_threads y conexiones independientes.
8. Creaciones concurrentes: consecutivos únicos y reintentos con una sola fila.
9. Reinicio del servidor sobre el mismo archivo: historial, auditoría y contador.
10. Fallo provocado en auditoría: rollback completo sin consumir consecutivo.

`npm run evidence`: **11 evidencias verificadas**. El archivo
`node_demostracion_real.json` contiene respuestas HTTP y eventos WS obtenidos
por red local, incluyendo dos conexiones, carrera, timestamps, reintento y
snapshot después de reiniciar. También se verificó que Node sirve index.html
de la aplicación Flutter compilada. No se utiliza TestClient ni un mock HTTP.
El ensayo recrea el servidor dentro del mismo proceso Node.

## Flutter

La migración conserva el contrato REST/WS; no se modificó el código Flutter.
Su compilación y pruebas anteriores permanecen incluidas:

- `flutter pub get --offline`: lockfile generado.
- `flutter analyze --no-pub`: sin incidencias, salida 0.
- `flutter test --no-pub`: 2 pruebas aprobadas.
- `flutter build web --no-pub --dart-define=API_BASE_URL=http://localhost:8000`:
  build completado, salida 0; `frontend/build/web` incluido.
- Dart formateado con `dart format lib test`.

El compilador mostró un aviso opcional sobre CupertinoIcons; la app usa
MaterialIcons incluidos. El aviso no impidió generar el build.

## Pendiente

Revisión visual/responsiva de Flutter en Chrome/Edge, reconexión de la UI,
capturas y video de máximo cinco minutos. El entorno no tenía un ejecutable
Chromium para la prueba visual. No se atribuyen evidencias de navegador a las
pruebas REST/WS automatizadas.

## Límites documentados

Identificadores de funcionario de demo sin autenticación real; un proceso Node
para el hub; SQLite síncrono para carga pequeña; snapshot completo; clave de
reintento del cliente conservada en memoria hasta confirmar.
