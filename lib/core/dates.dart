/// Velnix's Jordanian business dates use UTC+03:00.
DateTime businessTime(DateTime value) =>
    value.toUtc().add(const Duration(hours: 3));
String businessDate(dynamic value) {
  final parsed = value is DateTime
      ? value
      : DateTime.tryParse(value?.toString() ?? '');
  if (parsed == null) return '—';
  final date = businessTime(parsed);
  String two(int number) => number.toString().padLeft(2, '0');
  return '${two(date.day)}/${two(date.month)}/${date.year} • ${two(date.hour)}:${two(date.minute)}';
}
