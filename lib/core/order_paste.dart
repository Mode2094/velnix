/// Best-effort field suggestions for a pasted order message.
///
/// Purely local and deterministic: it never calls an external service, never
/// invents values, and the employee always reviews the result before anything
/// is applied. Returns only the fields it can confidently infer.
Map<String, String> suggestOrderFields(String raw) {
  final out = <String, String>{};
  final text = raw.replaceAll('\r', ' ').trim();
  if (text.isEmpty) return out;

  // Phone: 10 English digits, tolerate spaces/dashes and Arabic digits.
  const arabic = '٠١٢٣٤٥٦٧٨٩';
  const persian = '۰۱۲۳۴۵۶۷۸۹';
  final normalized = text.replaceAllMapped(RegExp(r'[٠-٩۰-۹]'), (m) {
    final v = m.group(0)!;
    final a = arabic.indexOf(v);
    final f = persian.indexOf(v);
    return (a >= 0 ? a : f).toString();
  });
  final phoneMatch = RegExp(
    r'0\d{9}',
  ).firstMatch(normalized.replaceAll(RegExp(r'[ ()\-]'), ''));
  if (phoneMatch != null) out['phone'] = phoneMatch.group(0)!;

  // Amount: a bare or "دينار"-suffixed number, 1..3 decimals.
  final amountMatch = RegExp(
    r'(\d+(?:\.\d{1,3})?)\s*(?:دينار|د\.أ|JD)?',
  ).allMatches(normalized.replaceAll(RegExp(r'[٠-٩۰-۹]'), ' ')).toList();
  // Prefer an explicit currency marker, otherwise the last standalone number.
  final withCurrency = RegExp(
    r'(\d+(?:\.\d{1,3})?)\s*(?:دينار|د\.أ|JD)',
  ).firstMatch(text);
  if (withCurrency != null) {
    out['amount'] = withCurrency.group(1)!;
  } else if (amountMatch.isNotEmpty) {
    final candidate = amountMatch.last.group(1)!;
    if (candidate.length <= 7 && candidate != out['phone']) {
      out['amount'] = candidate;
    }
  }

  const cities = [
    'عمّان',
    'عمان',
    'إربد',
    'اربد',
    'الزرقاء',
    'البلقاء',
    'المفرق',
    'جرش',
    'عجلون',
    'مادبا',
    'الكرك',
    'الطفيلة',
    'معان',
    'العقبة',
  ];
  // Match a governorate while ignoring hamza/diacritics differences (e.g. اربد
  // vs إربد) so a hurriedly typed message still resolves the city.
  String bare(String s) => s
      .replaceAll(RegExp(r'[إأآا]'), 'ا')
      .replaceAll(RegExp(r'[ًٌٍَُِّْ]'), '');
  final bareText = bare(text);
  for (final c in cities) {
    if (bareText.contains(bare(c))) {
      out['city'] = c == 'عمان' || c == 'عمّان' ? 'عمان' : c;
      break;
    }
  }

  // Customer: the first comma-separated segment without digits, else the first
  // word(s) before the phone number.
  final segments = text
      .split(RegExp(r'[,\n،]'))
      .map((s) => s.trim())
      .where((s) => s.isNotEmpty)
      .toList();
  for (final s in segments) {
    if (!RegExp(r'\d').hasMatch(s) && s.length <= 120) {
      out['customer'] = s;
      break;
    }
  }
  if (!out.containsKey('customer') && out['phone'] != null) {
    // Take everything before the phone digits on the same line.
    final before = text.split(out['phone']!).first.trim();
    final candidate = before
        .replaceAll(RegExp(r'[\d٠-٩۰-۹]'), '')
        .replaceAll(RegExp(r'[,\n،]+$'), '')
        .trim();
    if (candidate.isNotEmpty && candidate.length <= 120) {
      out['customer'] = candidate;
    }
  }
  return out;
}
