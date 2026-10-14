import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:velnix/core/runtime_config.dart';
import 'package:velnix/live/device_revocation.dart';
import 'package:velnix/main.dart';

void main() {
  test(
    'token auto-init is stopped before deletion even when backend fails',
    () async {
      final events = <String>[];
      await expectLater(
        revokeDeviceToken(
          unregister: () async {
            events.add('backend');
            throw StateError('backend unavailable');
          },
          stopAutoInit: () async {
            events.add('stop');
          },
          invalidate: () async {
            events.add('delete');
          },
        ),
        throwsStateError,
      );
      expect(events, ['backend', 'stop', 'delete']);
    },
  );
  test(
    'a platform auto-init error never prevents attempting token deletion',
    () async {
      bool deleted = false;
      await expectLater(
        revokeDeviceToken(
          unregister: () async {},
          stopAutoInit: () async {
            throw StateError('platform unavailable');
          },
          invalidate: () async {
            deleted = true;
          },
        ),
        throwsStateError,
      );
      expect(deleted, true);
    },
  );
  test(
    'production intent rejects Demo and debug providers before services start',
    () {
      for (final config in [
        const RuntimeConfig(mode: 'demo', environment: 'production'),
        const RuntimeConfig(environment: 'production', debugAppCheck: true),
        const RuntimeConfig(mode: 'unknown'),
        const RuntimeConfig(environment: 'unknown'),
      ]) {
        expect(() => config.validate(release: false), throwsStateError);
      }
      expect(
        () => const RuntimeConfig(
          environment: 'staging',
          debugAppCheck: true,
        ).validate(release: true),
        throwsStateError,
      );
      const RuntimeConfig(
        mode: 'demo',
      ).validate(release: true); // Existing QA build.
      const RuntimeConfig(environment: 'production').validate(release: true);
    },
  );

  test('an emulator project cannot be accepted as the production target', () {
    const config = RuntimeConfig(environment: 'production');
    expect(() => config.validateProject('demo-velnix'), throwsStateError);
    expect(() => config.validateProject(''), throwsStateError);
    config.validateProject('owner-selected-project');
  });

  test(
    'backend unregister outage still invalidates the old device token',
    () async {
      final events = <String>[];
      await expectLater(
        revokeDeviceToken(
          unregister: () async {
            events.add('backend');
            throw StateError('backend unavailable');
          },
          invalidate: () async {
            events.add('invalidate');
          },
        ),
        throwsStateError,
      );
      expect(events, ['backend', 'invalidate']);
    },
  );

  test(
    'token lookup failure and invalidation failure remain failures, never reported as success',
    () async {
      bool invalidated = false;
      await expectLater(
        revokeDeviceToken(
          unregister: () async {
            throw StateError('lookup failed');
          },
          invalidate: () async {
            invalidated = true;
          },
        ),
        throwsStateError,
      );
      expect(invalidated, true);
      await expectLater(
        revokeDeviceToken(
          unregister: () async {},
          invalidate: () async {
            throw StateError('platform offline');
          },
        ),
        throwsStateError,
      );
    },
  );

  test(
    'normal revocation finishes server cleanup before invalidating the token',
    () async {
      final events = <String>[];
      await revokeDeviceToken(
        unregister: () async {
          events.add('backend');
        },
        invalidate: () async {
          events.add('invalidate');
        },
      );
      expect(events, ['backend', 'invalidate']);
    },
  );

  testWidgets('setup failure is Arabic and contains no raw SDK diagnostic', (
    tester,
  ) async {
    await tester.pumpWidget(const SetupFailureApp());
    await tester.pumpAndSettle();
    expect(find.textContaining('تعذر بدء التطبيق'), findsOneWidget);
    expect(find.textContaining('StateError'), findsNothing);
    expect(
      Directionality.of(tester.element(find.byType(Text).first)),
      TextDirection.rtl,
    );
    expect(tester.takeException(), isNull);
  });
}
