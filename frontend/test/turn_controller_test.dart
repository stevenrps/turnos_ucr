import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:turnos_ucr/controllers/turn_controller.dart';
import 'package:turnos_ucr/models/turno.dart';
import 'package:turnos_ucr/services/turn_api.dart';
import 'package:turnos_ucr/services/realtime_client.dart';

class FakeApi implements TurnApi {
  final List<String> keys = [];
  bool fail = true;
  @override
  Future<void> create(String name, String key) async {
    keys.add(key);
    if (fail) throw TimeoutException('Respuesta perdida');
  }

  @override
  Future<TurnSnapshot> list() async => TurnSnapshot(1, []);
  @override
  Future<void> change(Turno t, String state, String staff) async {}
  @override
  void close() {}
}

class FakeSocket implements RealtimeClient {
  final stream = StreamController<Map<String, dynamic>>();
  @override
  Future<void> connect() async {}
  @override
  Stream<Map<String, dynamic>> get events => stream.stream;
  @override
  void send(String type) {}
  @override
  Future<void> close() async {
    if (!stream.isClosed) await stream.close();
  }
}

void main() {
  test('Una revisión antigua no reemplaza una reciente', () {
    final c = TurnController(FakeApi(), FakeSocket());
    c.applySnapshot(TurnSnapshot(5, []));
    c.applySnapshot(TurnSnapshot(3, []));
    expect(c.revision, 5);
    c.dispose();
  });
  test('Reintentar creación conserva clave y evita cambiar datos', () async {
    final api = FakeApi();
    final c = TurnController(api, FakeSocket());
    c.connection = ConnectionStateTurn.online;
    expect(await c.create('Ana'), false);
    expect(await c.create('Luis'), false);
    api.fail = false;
    expect(await c.create('Ana'), true);
    expect(api.keys.length, 2);
    expect(api.keys.first, api.keys.last);
    expect(c.pendingName, isNull);
    c.dispose();
  });
}
