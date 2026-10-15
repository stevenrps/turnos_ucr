import 'package:flutter/material.dart';
import '../controllers/turn_controller.dart';
import '../models/turno.dart';

/// La UI valida para orientar al usuario; la API valida de nuevo por seguridad.
class TurnPage extends StatefulWidget {
  final TurnController controller;
  const TurnPage({super.key, required this.controller});
  @override
  State<TurnPage> createState() => _TurnPageState();
}

class _TurnPageState extends State<TurnPage> {
  final _clientForm = GlobalKey<FormState>();
  final _staffForm = GlobalKey<FormState>();
  final _client = TextEditingController();
  final _staff = TextEditingController(text: 'Funcionario A');
  String _filter = 'pendiente';
  TurnController get c => widget.controller;
  @override
  void initState() {
    super.initState();
    c.start();
  }

  String? _validate(String? value) {
    final v = (value ?? '').trim();
    if (v.length < 2 || v.length > 80 || v.runes.any((r) => r < 32)) {
      return 'Ingrese de 2 a 80 caracteres válidos.';
    }
    return null;
  }

  Future<void> _register() async {
    if (!_clientForm.currentState!.validate()) return;
    if (await c.create(_client.text) && mounted) {
      _client.clear();
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Turno registrado.')));
    }
  }

  Future<void> _call() async {
    if (_staffForm.currentState!.validate()) await c.callNext(_staff.text);
  }

  String _date(DateTime? value) {
    if (value == null) return '-';
    final d = value.toLocal();
    String two(int n) => n.toString().padLeft(2, '0');
    return '${two(d.day)}/${two(d.month)}/${d.year} ${two(d.hour)}:${two(d.minute)}:${two(d.second)}';
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
      animation: c,
      builder: (context, _) {
        final rows = c.turnos.where((t) => t.estado == _filter).toList();
        final online = c.connection == ConnectionStateTurn.online;
        return Scaffold(
          appBar: AppBar(title: const Text('Turnos UCR'), actions: [
            Padding(
                padding: const EdgeInsets.only(right: 16),
                child: Chip(
                    avatar:
                        Icon(online ? Icons.wifi : Icons.wifi_off, size: 18),
                    label: Text(online
                        ? 'En línea'
                        : c.connection == ConnectionStateTurn.connecting
                            ? 'Conectando'
                            : 'Sin conexión')))
          ]),
          body: Center(
              child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 1150),
                  child: ListView(padding: const EdgeInsets.all(24), children: [
                    Text('Atención al público',
                        style: Theme.of(context).textTheme.headlineMedium),
                    const Text(
                        'Registre, llame y finalice turnos. Los cambios se sincronizan automáticamente.'),
                    const SizedBox(height: 20),
                    if (c.error != null)
                      Card(
                          color: Theme.of(context).colorScheme.errorContainer,
                          child: Padding(
                              padding: const EdgeInsets.all(16),
                              child: Text(c.error!))),
                    LayoutBuilder(builder: (context, constraints) {
                      final register = _panel(
                          'Nuevo turno',
                          Form(
                              key: _clientForm,
                              child: Column(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.stretch,
                                  children: [
                                    TextFormField(
                                        controller: _client,
                                        validator: _validate,
                                        maxLength: 80,
                                        enabled:
                                            !c.busy && c.pendingName == null,
                                        decoration: const InputDecoration(
                                            labelText: 'Nombre de la persona')),
                                    FilledButton.icon(
                                        onPressed:
                                            c.canOperate ? _register : null,
                                        icon: const Icon(Icons.add),
                                        label: Text(c.pendingName == null
                                            ? 'Registrar turno'
                                            : 'Reintentar registro'))
                                  ])));
                      final operator = _panel(
                          'Puesto de atención',
                          Form(
                              key: _staffForm,
                              child: Column(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.stretch,
                                  children: [
                                    TextFormField(
                                        controller: _staff,
                                        validator: _validate,
                                        maxLength: 80,
                                        enabled: !c.busy,
                                        onChanged: (_) => setState(() {}),
                                        decoration: const InputDecoration(
                                            labelText:
                                                'Funcionario (identificador de demostración)')),
                                    FilledButton.icon(
                                        onPressed:
                                            c.canOperate && c.siguiente != null
                                                ? _call
                                                : null,
                                        icon: const Icon(Icons.campaign),
                                        label: Text(c.siguiente == null
                                            ? 'Sin turnos pendientes'
                                            : 'Llamar siguiente: #${c.siguiente!.numero}'))
                                  ])));
                      if (constraints.maxWidth < 700)
                        return Column(children: [register, operator]);
                      return Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(child: register),
                            const SizedBox(width: 16),
                            Expanded(child: operator)
                          ]);
                    }),
                    const SizedBox(height: 20),
                    Wrap(
                        spacing: 10,
                        runSpacing: 10,
                        children: ['pendiente', 'llamado', 'atendido']
                            .map((state) => ChoiceChip(
                                label: Text(
                                    '${_label(state)} (${c.turnos.where((t) => t.estado == state).length})'),
                                selected: _filter == state,
                                onSelected: (_) =>
                                    setState(() => _filter = state)))
                            .toList()),
                    const SizedBox(height: 16),
                    if (c.loading)
                      const Center(child: CircularProgressIndicator())
                    else if (rows.isEmpty)
                      const Card(
                          child: Padding(
                              padding: EdgeInsets.all(30),
                              child: Text('No hay turnos en esta categoría.')))
                    else
                      ...rows.map(_turnCard),
                    if (c.busy) const LinearProgressIndicator(),
                  ]))),
        );
      });
  String _label(String state) => switch (state) {
        'pendiente' => 'Pendientes',
        'llamado' => 'Llamados',
        _ => 'Historial de atendidos'
      };
  Widget _panel(String title, Widget child) => Card(
      child: Padding(
          padding: const EdgeInsets.all(20),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 16),
            child
          ])));
  Widget _turnCard(Turno turn) => Card(
      child: Padding(
          padding: const EdgeInsets.all(16),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('#${turn.numero.toString().padLeft(3, '0')} · ${turn.cliente}',
                style: Theme.of(context).textTheme.titleLarge),
            Text('Creado: ${_date(turn.creadoEn)}'),
            if (turn.llamadoEn != null)
              Text('Llamado: ${_date(turn.llamadoEn)} · ${turn.funcionario}'),
            if (turn.atendidoEn != null)
              Text('Atendido: ${_date(turn.atendidoEn)}'),
            if (turn.estado == 'llamado' &&
                turn.funcionario == _staff.text.trim())
              Padding(
                  padding: const EdgeInsets.only(top: 10),
                  child: OutlinedButton.icon(
                      onPressed: c.canOperate
                          ? () async {
                              if (_staffForm.currentState!.validate())
                                await c.finish(turn, _staff.text);
                            }
                          : null,
                      icon: const Icon(Icons.check_circle_outline),
                      label: const Text('Finalizar atención'))),
          ])));
  @override
  void dispose() {
    _client.dispose();
    _staff.dispose();
    c.dispose();
    super.dispose();
  }
}
