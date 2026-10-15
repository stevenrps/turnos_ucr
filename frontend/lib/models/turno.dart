/// Entidad inmutable: el frontend nunca calcula consecutivos ni cambia estados.
class Turno {
  final int id, numero, version;
  final String cliente, estado;
  final String? funcionario;
  final DateTime creadoEn;
  final DateTime? llamadoEn, atendidoEn;
  const Turno(
      {required this.id,
      required this.numero,
      required this.version,
      required this.cliente,
      required this.estado,
      required this.creadoEn,
      this.funcionario,
      this.llamadoEn,
      this.atendidoEn});

  factory Turno.fromJson(Map<String, dynamic> json) => Turno(
      id: json['id'] as int,
      numero: json['numero'] as int,
      version: json['version'] as int,
      cliente: json['cliente'] as String,
      estado: json['estado'] as String,
      funcionario: json['funcionario'] as String?,
      creadoEn: DateTime.parse(json['creado_en'] as String),
      llamadoEn: json['llamado_en'] == null
          ? null
          : DateTime.parse(json['llamado_en'] as String),
      atendidoEn: json['atendido_en'] == null
          ? null
          : DateTime.parse(json['atendido_en'] as String));
}

/// La revisión identifica un snapshot consistente del conjunto de turnos.
class TurnSnapshot {
  final int revision;
  final List<Turno> turnos;
  TurnSnapshot(this.revision, List<Turno> turnos)
      : turnos = List.unmodifiable(turnos);
  factory TurnSnapshot.fromJson(Map<String, dynamic> json) => TurnSnapshot(
      json['revision'] as int,
      (json['turnos'] as List)
          .map((e) => Turno.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList());
}
