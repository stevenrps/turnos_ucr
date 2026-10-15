import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/turno.dart';

class ApiException implements Exception {
  final int status;
  final String message;
  const ApiException(this.status, this.message);
  @override
  String toString() => message;
}

/// Puerto pequeño: permite probar el controlador sin servidor ni navegador.
abstract interface class TurnApi {
  Future<TurnSnapshot> list();
  Future<void> create(String cliente, String clave);
  Future<void> change(Turno turno, String estado, String funcionario);
  void close();
}

class HttpTurnApi implements TurnApi {
  final Uri base;
  final http.Client client;
  HttpTurnApi(this.base, this.client);
  Uri _uri(String path) => base.resolve(path);

  Map<String, dynamic> _decode(http.Response response) {
    final data =
        jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>;
    if (response.statusCode >= 400) {
      final detail = data['detail'];
      throw ApiException(response.statusCode,
          detail is String ? detail : 'Datos rechazados por el servidor.');
    }
    return data;
  }

  @override
  Future<TurnSnapshot> list() async =>
      TurnSnapshot.fromJson(_decode(await client
          .get(_uri('/api/turnos'))
          .timeout(const Duration(seconds: 10))));
  @override
  Future<void> create(String cliente, String clave) async {
    _decode(await client
        .post(_uri('/api/turnos'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({'cliente': cliente, 'clave': clave}))
        .timeout(const Duration(seconds: 10)));
  }

  @override
  Future<void> change(Turno turno, String estado, String funcionario) async {
    _decode(await client
        .patch(_uri('/api/turnos/${turno.id}'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              'estado': estado,
              'funcionario': funcionario,
              'version': turno.version,
            }))
        .timeout(const Duration(seconds: 10)));
  }

  @override
  void close() => client.close();
}
