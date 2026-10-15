import 'dart:async';
import 'dart:math';
import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';
import '../models/turno.dart';
import '../services/turn_api.dart';
import '../services/realtime_client.dart';

enum ConnectionStateTurn { connecting, online, offline }

/// Estado de presentación. Inyección por constructor, sin SQL ni widgets.
class TurnController extends ChangeNotifier {
  final TurnApi api;
  final RealtimeClient realtime;
  TurnController(this.api, this.realtime);
  List<Turno> turnos = const [];
  int revision = -1;
  bool loading = true, busy = false;
  String? error;
  ConnectionStateTurn connection = ConnectionStateTurn.connecting;
  StreamSubscription<Map<String, dynamic>>? _subscription;
  Timer? _retry, _heartbeat;
  int _attempt = 0, _generation = 0;
  bool _disposed = false;
  DateTime _lastMessage = DateTime.now();
  String? _pendingName, _pendingKey;
  String? get pendingName => _pendingName;
  bool get canOperate => connection == ConnectionStateTurn.online && !busy;
  Turno? get siguiente {
    for (final t in turnos) {
      if (t.estado == 'pendiente') return t;
    }
    return null;
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  /// Una respuesta HTTP retrasada nunca puede reemplazar una revisión más nueva.
  void applySnapshot(TurnSnapshot snapshot) {
    if (_disposed || snapshot.revision < revision) return;
    revision = snapshot.revision;
    turnos = snapshot.turnos;
    loading = false;
    _notify();
  }

  Future<void> start() => _connect();
  Future<void> _connect() async {
    if (_disposed) return;
    final generation = ++_generation;
    connection = ConnectionStateTurn.connecting;
    _notify();
    try {
      await realtime.connect();
      if (_disposed || generation != _generation) return;
      _lastMessage = DateTime.now();
      _subscription = realtime.events.listen(
          (event) {
            if (_disposed || generation != _generation) return;
            _lastMessage = DateTime.now();
            if (event['tipo'] == 'estado') {
              try {
                applySnapshot(TurnSnapshot.fromJson(event));
                connection = ConnectionStateTurn.online;
                _attempt = 0;
                error = null;
                _notify();
              } catch (e) {
                debugPrint('Snapshot inválido: $e');
                _lost(generation);
              }
            }
          },
          onDone: () => _lost(generation),
          onError: (Object e) {
            debugPrint('WebSocket: $e');
            _lost(generation);
          });
      _heartbeat = Timer.periodic(const Duration(seconds: 15), (_) {
        if (DateTime.now().difference(_lastMessage).inSeconds > 35) {
          _lost(generation);
        } else {
          try {
            realtime.send('ping');
          } catch (_) {
            _lost(generation);
          }
        }
      });
    } catch (e) {
      debugPrint('Conexión: $e');
      _lost(generation);
    }
  }

  void _lost(int generation) {
    if (_disposed || generation != _generation) return;
    ++_generation; // Invalida callbacks del socket anterior.
    _heartbeat?.cancel();
    unawaited(_subscription?.cancel());
    unawaited(realtime.close());
    connection = ConnectionStateTurn.offline;
    loading = false;
    error = 'Sin conexión. Los datos visibles pueden estar desactualizados.';
    _notify();
    final delay = min(1 << min(_attempt++, 5), 30);
    _retry?.cancel();
    _retry = Timer(Duration(seconds: delay), _connect);
  }

  Future<bool> create(String name) async {
    if (!canOperate) return false;
    // Si se perdió la respuesta, conservar clave y datos permite un reintento seguro.
    if (_pendingName != null && name.trim() != _pendingName) {
      error = 'Reintente primero el registro pendiente de $_pendingName.';
      _notify();
      return false;
    }
    _pendingName ??= name.trim();
    _pendingKey ??= const Uuid().v4();
    return _execute(() async {
      await api.create(_pendingName!, _pendingKey!);
      _pendingName = null;
      _pendingKey = null;
    });
  }

  Future<bool> callNext(String funcionario) async {
    final turn = siguiente;
    if (turn == null) return false;
    return _execute(() => api.change(turn, 'llamado', funcionario.trim()));
  }

  Future<bool> finish(Turno turn, String funcionario) =>
      _execute(() => api.change(turn, 'atendido', funcionario.trim()));

  Future<bool> _execute(Future<void> Function() operation) async {
    if (!canOperate) return false;
    busy = true;
    error = null;
    _notify();
    try {
      await operation();
      // Recuperación puntual tras comando; no hay polling periódico HTTP.
      try {
        applySnapshot(await api.list());
      } catch (e) {
        debugPrint('HTTP de recuperación: $e');
      }
      return true;
    } on ApiException catch (e) {
      error = e.message;
      if (e.status == 422) {
        _pendingName = null;
        _pendingKey = null;
      }
      if (e.status == 409) {
        try {
          applySnapshot(await api.list());
        } catch (_) {/* Se recupera por WebSocket. */}
      }
      return false;
    } catch (e) {
      debugPrint('Operación: $e');
      error =
          'No se confirmó la operación. Reintente; el servidor evita duplicaciones.';
      return false;
    } finally {
      busy = false;
      _notify();
    }
  }

  @override
  void dispose() {
    _disposed = true;
    ++_generation;
    _retry?.cancel();
    _heartbeat?.cancel();
    unawaited(_subscription?.cancel());
    unawaited(realtime.close());
    api.close();
    super.dispose();
  }
}
