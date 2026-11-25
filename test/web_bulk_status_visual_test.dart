import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:velnix/core/theme.dart';
import 'package:velnix/live/live_app.dart';
import 'package:velnix/models/entities.dart';

/// Locks the content of the web-only bulk-status confirmation dialog (the second
/// step of «تغيير الحالة») and, opt-in, captures a screenshot of it.
///
/// The golden comparison only runs when `VELNIX_CAPTURE_SHOTS=1`, so CI never
/// depends on a golden image. To (re)generate the evidence PNG:
///
/// ```
/// VELNIX_CAPTURE_SHOTS=1 flutter test --update-goldens \
///   test/web_bulk_status_visual_test.dart
/// ```
///
/// The file lands at `test/goldens/bulk_status_confirm_web.png`.
void main() {
  setUpAll(() async {
    // Real Arabic + icon glyphs, so the evidence screenshot is readable.
    await (FontLoader('Cairo')
          ..addFont(rootBundle.load('assets/fonts/Cairo-Regular.ttf'))
          ..addFont(rootBundle.load('assets/fonts/Cairo-Bold.ttf')))
        .load();
    await (FontLoader(
      'MaterialIcons',
    )..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
  });

  testWidgets('bulk status confirmation shows the status, count and print', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(720, 900);
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    await tester.pumpWidget(
      MaterialApp(
        theme: velnixTheme(),
        locale: const Locale('ar'),
        supportedLocales: const [Locale('ar')],
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        home: Scaffold(
          backgroundColor: const Color(0xFFF1F5F9),
          body: Center(
            child: RepaintBoundary(
              key: const ValueKey('bulk-confirm-shot'),
              child: BulkStatusConfirmDialog(
                target: OrderStatus.preparing,
                count: 5,
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    // The confirmation must echo the chosen status and the order count and
    // offer the optional print step, with confirm and cancel.
    expect(find.text('تأكيد تغيير الحالة'), findsOneWidget);
    expect(find.textContaining('الحالة الجديدة: قيد التجهيز'), findsOneWidget);
    expect(find.textContaining('عدد الطلبات: 5'), findsOneWidget);
    expect(find.text('طباعة الطلبات بعد تغيير الحالة'), findsOneWidget);
    expect(find.text('تأكيد'), findsOneWidget);
    expect(find.text('إلغاء'), findsOneWidget);

    if (Platform.environment['VELNIX_CAPTURE_SHOTS'] == '1') {
      await expectLater(
        find.byKey(const ValueKey('bulk-confirm-shot')),
        matchesGoldenFile('goldens/bulk_status_confirm_web.png'),
      );
    }
  });
}
