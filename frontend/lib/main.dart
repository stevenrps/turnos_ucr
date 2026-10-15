import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'controllers/turn_controller.dart';
import 'services/turn_api.dart';
import 'services/realtime_client.dart';
import 'pages/turn_page.dart';

/// Composition root: construye dependencias y las entrega por constructor.
void main() {
  const url = String.fromEnvironment('API_BASE_URL',
      defaultValue: 'http://localhost:8000');
  final base = Uri.parse(url);
  final socket = base.replace(
      scheme: base.scheme == 'https' ? 'wss' : 'ws', path: '/ws/turnos');
  runApp(TurnApp(
      controller: TurnController(
          HttpTurnApi(base, http.Client()), SocketRealtimeClient(socket))));
}

class TurnApp extends StatelessWidget {
  final TurnController controller;
  const TurnApp({super.key, required this.controller});
  @override
  Widget build(BuildContext context) => MaterialApp(
      title: 'Turnos UCR',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
          useMaterial3: true,
          colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF135D66)),
          scaffoldBackgroundColor: const Color(0xFFF4F7F9),
          inputDecorationTheme:
              const InputDecorationTheme(border: OutlineInputBorder())),
      home: TurnPage(controller: controller));
}
