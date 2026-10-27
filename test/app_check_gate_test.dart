import 'package:flutter_test/flutter_test.dart';
import 'package:velnix/core/app_check_gate.dart';

void main() {
  test('wait starts the registered activation exactly once', () async {
    var starts = 0;
    AppCheckGate.configure(() async {
      starts++;
    });
    await AppCheckGate.wait();
    await AppCheckGate.wait();
    expect(starts, 1, reason: 'activation must not be repeated per request');
  });

  test('wait is a no-op before any activation is configured', () async {
    AppCheckGate.configure(() async {});
    // Reconfiguring resets readiness for the next start.
    var starts = 0;
    AppCheckGate.configure(() async {
      starts++;
    });
    await AppCheckGate.wait();
    expect(starts, 1);
  });

  test('a failing activation surfaces to the caller', () async {
    AppCheckGate.configure(() async => throw StateError('no provider'));
    await expectLater(AppCheckGate.wait(), throwsA(isA<StateError>()));
  });
}
