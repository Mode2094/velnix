import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:velnix/core/theme.dart';
import 'package:velnix/live/live_app.dart';

/// Locks the content of the web-only bulk-dispatch final result dialog and,
/// opt-in, captures a screenshot of it.
///
/// The golden comparison only runs when `VELNIX_CAPTURE_SHOTS=1`, so CI never
/// depends on a golden image. To (re)generate the evidence PNG:
///
/// ```
/// VELNIX_CAPTURE_SHOTS=1 flutter test --update-goldens \
///   test/web_bulk_dispatch_report_visual_test.dart
/// ```
///
/// The file lands at `test/goldens/bulk_dispatch_report_web.png`.
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

  testWidgets('bulk dispatch report shows the totals, the rows and the actions', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(1000, 1000);
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
              key: const ValueKey('bulk-dispatch-report-shot'),
              child: BulkDispatchReportDialog(
                report: const BulkDispatchReport(
                  total: 10,
                  success: 7,
                  failed: 2,
                  needsReview: 1,
                  operationIds: ['op_demo_0001'],
                  rows: [
                    BulkDispatchReportRow(
                      orderId: 'o1',
                      orderNumber: 'VNX-000123',
                      company: 'Click Delivery',
                      outcome: BulkDispatchOutcome.failed,
                      reason: 'عيّن شركة توصيل قبل الإرسال',
                    ),
                    BulkDispatchReportRow(
                      orderId: 'o2',
                      orderNumber: 'VNX-000124',
                      company: 'Click Delivery',
                      outcome: BulkDispatchOutcome.failed,
                      reason: 'رقم الهاتف غير صالح',
                    ),
                    BulkDispatchReportRow(
                      orderId: 'o3',
                      orderNumber: 'VNX-000125',
                      company: 'Click Delivery',
                      outcome: BulkDispatchOutcome.needsReview,
                      reason:
                          'تعذّر الوصول إلى شركة التوصيل — النتيجة غير مؤكدة وتحتاج مراجعة',
                    ),
                  ],
                ),
                onOpenOrder: (_) {},
                onVerifyUncertain: (ids) async => {
                  'confirmed': <String>[],
                  'review': ids.length,
                },
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('نتيجة إرسال الطلبات إلى شركة التوصيل'), findsOneWidget);
    expect(find.text('رقم الطلب'), findsOneWidget);
    expect(find.text('شركة التوصيل'), findsOneWidget);
    expect(find.text('النتيجة'), findsOneWidget);
    expect(find.text('سبب المشكلة'), findsOneWidget);
    expect(find.text('VNX-000123'), findsOneWidget);
    expect(find.text('فشل مؤكد'), findsWidgets);
    expect(find.text('تحتاج مراجعة'), findsWidgets);
    expect(find.text('نسخ التقرير'), findsOneWidget);
    expect(find.text('تنزيل التقرير (CSV)'), findsOneWidget);
    expect(find.text('التحقق من غير المؤكد'), findsOneWidget);
    expect(find.text('إغلاق'), findsOneWidget);

    if (Platform.environment['VELNIX_CAPTURE_SHOTS'] == '1') {
      await expectLater(
        find.byKey(const ValueKey('bulk-dispatch-report-shot')),
        matchesGoldenFile('goldens/bulk_dispatch_report_web.png'),
      );
    }
  });
}
