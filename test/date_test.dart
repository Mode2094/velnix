import 'package:flutter_test/flutter_test.dart';
import 'package:velnix/core/dates.dart';

void main() {
  test('Jordan business dates cross UTC midnight correctly', () {
    expect(businessDate('2026-10-13T22:15:00Z'), '14/10/2026 • 01:15');
    expect(businessDate('2026-10-14T02:15:00+03:00'), '14/10/2026 • 02:15');
    expect(businessDate(null), '—');
  });
}
