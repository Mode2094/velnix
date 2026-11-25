import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:velnix/core/theme.dart';
import 'package:velnix/live/gateway.dart';
import 'package:velnix/live/live_app.dart';

Widget app(Widget child) => MaterialApp(
  theme: velnixTheme(),
  locale: const Locale('ar'),
  supportedLocales: const [Locale('ar')],
  localizationsDelegates: const [
    GlobalMaterialLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
  ],
  home: Scaffold(body: child),
);

SessionPolicy gm() => SessionPolicy({
  'id': 'gm',
  'role': 'generalManager',
  'active': true,
  'permissions': ['sendToDelivery', 'updateOrderStatus'],
});

Map<String, dynamic> order(String id) => {
  'id': id,
  'orderNumber': 'VNX-000$id',
  'companyId': 'c1',
  'companyName': 'أرامكس',
  'customer': 'عميل $id',
  'status': 'created',
  'dispatchState': 'idle',
  'phone': '0791234567',
  'city': 'عمان',
  'area': 'خلدا',
  'description': 'طقم',
  'amount': 12.345,
  'orderType': 'normal',
};

void main() {
  final original = VelnixGateway.instance;
  tearDown(() => VelnixGateway.instance = original);

  group('bulkDispatchOutcome', () {
    test('ok:true is the only confirmed success', () {
      expect(
        bulkDispatchOutcome({'id': 'a', 'ok': true}),
        BulkDispatchOutcome.success,
      );
      expect(
        bulkDispatchOutcome({'id': 'b', 'ok': false}),
        BulkDispatchOutcome.failed,
      );
    });

    test('uncertain and the transport/timeout codes need review', () {
      expect(
        bulkDispatchOutcome({'id': 'a', 'ok': false, 'uncertain': true}),
        BulkDispatchOutcome.needsReview,
      );
      expect(
        bulkDispatchOutcome({'id': 'b', 'ok': false, 'code': 'unavailable'}),
        BulkDispatchOutcome.needsReview,
      );
      expect(
        bulkDispatchOutcome({
          'id': 'c',
          'ok': false,
          'code': 'deadline-exceeded',
        }),
        BulkDispatchOutcome.needsReview,
      );
    });
  });

  group('bulkDispatchReason', () {
    test('uses the real server/carrier message when present', () {
      expect(
        bulkDispatchReason({
          'id': 'a',
          'ok': false,
          'code': 'failed-precondition',
          'message': 'عيّن شركة توصيل قبل الإرسال',
        }),
        'عيّن شركة توصيل قبل الإرسال',
      );
    });

    test('maps known codes to Arabic', () {
      expect(
        bulkDispatchReason({
          'id': 'a',
          'ok': false,
          'code': 'permission-denied',
        }),
        'لا تملك صلاحية إرسال هذا الطلب',
      );
      expect(
        bulkDispatchReason({'id': 'a', 'ok': false, 'code': 'unavailable'}),
        contains('غير مؤكدة'),
      );
    });

    test('never guesses: an unknown code falls back with a reference', () {
      final reason = bulkDispatchReason({
        'id': 'abc123',
        'ok': false,
        'code': 'weird_code',
      });
      expect(reason, contains('تعذر تحديد السبب بدقة'));
      expect(reason, contains('abc123'));
      expect(reason, contains('weird_code'));
    });
  });

  test('bulkDispatchRows drops successes and enriches serial + company', () {
    final rows = bulkDispatchRows(
      [
        {'id': '1', 'ok': true},
        {
          'id': '2',
          'ok': false,
          'code': 'failed-precondition',
          'message': 'الشركة غير مفعلة',
        },
        {'id': '3', 'ok': false, 'uncertain': true, 'code': 'unavailable'},
      ],
      {'1': order('1'), '2': order('2'), '3': order('3')},
      const {},
    );
    expect(rows.length, 2, reason: 'a confirmed success is never listed');
    expect(rows.first.orderNumber, 'VNX-0002');
    expect(rows.first.company, 'أرامكس');
    expect(rows.first.outcome, BulkDispatchOutcome.failed);
    expect(rows.first.reason, 'الشركة غير مفعلة');
    expect(rows.last.outcome, BulkDispatchOutcome.needsReview);
  });

  test('bulkReportCsv has a BOM, a header and one row per non-success', () {
    final csv = bulkReportCsv(
      BulkDispatchReport(
        total: 2,
        success: 1,
        failed: 1,
        needsReview: 0,
        rows: [
          const BulkDispatchReportRow(
            orderId: '2',
            orderNumber: 'VNX-0002',
            company: 'أرامكس',
            outcome: BulkDispatchOutcome.failed,
            reason: 'رقم الهاتف غير صالح',
          ),
        ],
      ),
    );
    expect(csv.startsWith('\uFEFF'), isTrue);
    expect(csv, contains('رقم الطلب'));
    expect(csv, contains('سبب المشكلة'));
    expect(csv, contains('VNX-0002'));
    expect(csv, contains('فشل مؤكد'));
  });

  test('BulkDispatchReport.allSucceeded is strict', () {
    const ok = BulkDispatchReport(
      total: 3,
      success: 3,
      failed: 0,
      needsReview: 0,
      rows: [],
    );
    expect(ok.allSucceeded, isTrue);
    expect(
      const BulkDispatchReport(
        total: 3,
        success: 2,
        failed: 0,
        needsReview: 1,
        rows: [],
      ).allSucceeded,
      isFalse,
    );
    expect(
      const BulkDispatchReport(
        total: 3,
        success: 3,
        failed: 0,
        needsReview: 0,
        rows: [],
        interrupted: true,
      ).allSucceeded,
      isFalse,
    );
  });

  testWidgets(
    'the report lists the non-success rows with their reason and actions',
    (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(1000, 1400);
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });
      String? opened;
      var verifyCalls = 0;
      await tester.pumpWidget(
        app(
          BulkDispatchReportDialog(
            report: const BulkDispatchReport(
              total: 3,
              success: 1,
              failed: 1,
              needsReview: 1,
              operationIds: ['op_demo_0001'],
              rows: [
                BulkDispatchReportRow(
                  orderId: 'a',
                  orderNumber: 'VNX-0001',
                  company: 'أرامكس',
                  outcome: BulkDispatchOutcome.failed,
                  reason: 'رقم الهاتف غير صالح',
                ),
                BulkDispatchReportRow(
                  orderId: 'b',
                  orderNumber: 'VNX-0002',
                  company: 'DHL',
                  outcome: BulkDispatchOutcome.needsReview,
                  reason: 'تعذّر الوصول إلى شركة التوصيل — تحتاج مراجعة',
                ),
              ],
            ),
            onOpenOrder: (id) => opened = id,
            onVerifyUncertain: (ids) async {
              verifyCalls++;
              return {
                'confirmed': ['b'],
                'review': 0,
              };
            },
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('نتيجة إرسال الطلبات إلى شركة التوصيل'), findsOneWidget);
      // The four required columns.
      expect(find.text('رقم الطلب'), findsOneWidget);
      expect(find.text('شركة التوصيل'), findsOneWidget);
      expect(find.text('النتيجة'), findsOneWidget);
      expect(find.text('سبب المشكلة'), findsOneWidget);
      // Real per-order rows, never a guessed reason.
      expect(find.text('VNX-0001'), findsOneWidget);
      expect(find.text('رقم الهاتف غير صالح'), findsOneWidget);
      expect(find.text('فشل مؤكد'), findsWidgets);
      expect(find.text('تحتاج مراجعة'), findsWidgets);
      // Report buttons.
      expect(find.text('نسخ التقرير'), findsOneWidget);
      expect(find.text('تنزيل التقرير (CSV)'), findsOneWidget);
      expect(find.text('التحقق من غير المؤكد'), findsOneWidget);
      expect(find.text('إغلاق'), findsOneWidget);

      // A failed row opens its order.
      await tester.tap(find.text('VNX-0001'));
      await tester.pumpAndSettle();
      expect(opened, 'a');

      // «التحقق من غير المؤكد» runs the safe reconciliation and reports it.
      await tester.tap(find.text('التحقق من غير المؤكد'));
      await tester.pumpAndSettle();
      expect(verifyCalls, 1);
      expect(find.textContaining('تم تأكيد 1 شحنة'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'web bulk dispatch shows a per-order report after the progress window',
    (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(900, 1600);
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });
      VelnixGateway.instance = VelnixGateway.forTesting((name, data) async {
        switch (name) {
          case 'listOrders':
            return {
              'items': [order('1'), order('2'), order('3')],
              'nextAfterId': null,
            };
          case 'getOrdersByIds':
            return {
              'items': [order('1'), order('2'), order('3')],
            };
          case 'bulkDispatch':
            return {
              'succeeded': 2,
              'failed': 1,
              'uncertain': 0,
              'results': [
                {'id': '1', 'ok': true, 'trackingNumber': 'T1'},
                {'id': '2', 'ok': true, 'trackingNumber': 'T2'},
                {
                  'id': '3',
                  'ok': false,
                  'code': 'failed-precondition',
                  'message': 'عيّن شركة توصيل قبل الإرسال',
                },
              ],
            };
          case 'listCompanies':
          case 'listAllowedPages':
          case 'listOrderCreators':
            return {'items': <dynamic>[]};
        }
        throw StateError('Unexpected $name');
      });
      await tester.pumpWidget(app(LiveOrders(policy: gm(), webBulkUx: true)));
      await tester.pumpAndSettle();
      await tester.longPress(find.text('عميل 1'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('تحديد الظاهر'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('إرسال'));
      await tester.pumpAndSettle();
      // Confirm the dispatch dialog (the second «إرسال»).
      await tester.tap(find.text('إرسال').last);
      await tester.pumpAndSettle();

      expect(find.text('نتيجة إرسال الطلبات إلى شركة التوصيل'), findsOneWidget);
      expect(find.text('فشل مؤكد'), findsWidgets);
      expect(find.text('عيّن شركة توصيل قبل الإرسال'), findsOneWidget);
      expect(find.text('إغلاق'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'a live progress window shows the totals, the counters and the serial',
    (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(900, 1600);
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });
      final gate = Completer<void>();
      VelnixGateway.instance = VelnixGateway.forTesting((name, data) async {
        switch (name) {
          case 'listOrders':
            return {
              'items': [order('1'), order('2'), order('3')],
              'nextAfterId': null,
            };
          case 'getOrdersByIds':
            return {
              'items': [order('1'), order('2'), order('3')],
            };
          case 'bulkDispatch':
            await gate.future;
            return {
              'succeeded': 3,
              'failed': 0,
              'uncertain': 0,
              'results': [
                {'id': '1', 'ok': true},
                {'id': '2', 'ok': true},
                {'id': '3', 'ok': true},
              ],
            };
          case 'listCompanies':
          case 'listAllowedPages':
          case 'listOrderCreators':
            return {'items': <dynamic>[]};
        }
        throw StateError('Unexpected $name');
      });
      await tester.pumpWidget(app(LiveOrders(policy: gm(), webBulkUx: true)));
      await tester.pumpAndSettle();
      await tester.longPress(find.text('عميل 1'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('تحديد الظاهر'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('إرسال'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('إرسال').last);
      // Let the progress window mount while the send is still in flight.
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      expect(find.text('جارٍ الإرسال إلى شركة التوصيل'), findsOneWidget);
      expect(find.textContaining('تمت معالجة 0 من 3 طلبًا'), findsOneWidget);
      expect(find.textContaining('قيد المعالجة: VNX-0001'), findsOneWidget);
      expect(
        find.textContaining('لا يُحتسب أي طلب مقبولًا إلا بعد تأكيد'),
        findsOneWidget,
      );

      gate.complete();
      await tester.pumpAndSettle();
      expect(
        find.text('تم إرسال جميع الطلبات بنجاح إلى شركة التوصيل'),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('all-success dispatch shows the clear success window', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(900, 1600);
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    VelnixGateway.instance = VelnixGateway.forTesting((name, data) async {
      switch (name) {
        case 'listOrders':
          return {
            'items': [order('1'), order('2')],
            'nextAfterId': null,
          };
        case 'getOrdersByIds':
          return {
            'items': [order('1'), order('2')],
          };
        case 'bulkDispatch':
          return {
            'succeeded': 2,
            'failed': 0,
            'uncertain': 0,
            'results': [
              {'id': '1', 'ok': true},
              {'id': '2', 'ok': true},
            ],
          };
        case 'listCompanies':
        case 'listAllowedPages':
        case 'listOrderCreators':
          return {'items': <dynamic>[]};
      }
      throw StateError('Unexpected $name');
    });
    await tester.pumpWidget(app(LiveOrders(policy: gm(), webBulkUx: true)));
    await tester.pumpAndSettle();
    await tester.longPress(find.text('عميل 1'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('تحديد الظاهر'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('إرسال'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('إرسال').last);
    await tester.pumpAndSettle();

    expect(
      find.text('تم إرسال جميع الطلبات بنجاح إلى شركة التوصيل'),
      findsOneWidget,
    );
    expect(find.text('تم إرسال 2 من أصل 2 طلبًا.'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
