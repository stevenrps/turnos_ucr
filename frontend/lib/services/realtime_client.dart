import 'dart:convert';
import 'package:web_socket_channel/web_socket_channel.dart';

/// Cada reconexión crea un canal nuevo. El controlador decide cuándo reconectar.
abstract interface class RealtimeClient {
  Future<void> connect();
  Stream<Map<String, dynamic>> get events;
  void send(String tipo);
  Future<void> close();
}

class SocketRealtimeClient implements RealtimeClient {
  final Uri uri;
  WebSocketChannel? _channel;
  SocketRealtimeClient(this.uri);
  @override
  Future<void> connect() async {
    _channel = WebSocketChannel.connect(uri);
    await _channel!.ready.timeout(const Duration(seconds: 10));
  }

  @override
  Stream<Map<String, dynamic>> get events => _channel!.stream.map(
      (event) => Map<String, dynamic>.from(jsonDecode(event as String) as Map));
  @override
  void send(String tipo) => _channel?.sink.add(jsonEncode({'tipo': tipo}));
  @override
  Future<void> close() async => _channel?.sink.close();
}
