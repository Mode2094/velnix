import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:velnix/core/theme.dart';
import 'package:velnix/live/gateway.dart';
import 'package:velnix/live/live_app.dart';
import 'package:velnix/models/entities.dart';

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
  'orderNumber': 'VNX-0000$id',
  'customer': 'عميل $id',
  'status': 'created',
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

  testWidgets('long-press enters selection mode and bulk toolbar appears', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(800, 1400);
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
        case 'listCompanies':
        case 'listAllowedPages':
        case 'listOrderCreators':
          return {'items': <dynamic>[]};
      }
      throw StateError('Unexpected $name');
    });
    await tester.pumpWidget(app(LiveOrders(policy: gm())));
    await tester.pumpAndSettle();
    expect(find.text('عميل 1'), findsOneWidget);

    await tester.longPress(find.text('عميل 1'));
    await tester.pumpAndSettle();
    expect(find.textContaining('المحدد: 1'), findsOneWidget);
    expect(find.text('إلغاء التحديد'), findsOneWidget);
    expect(find.text('تحديد الظاهر'), findsOneWidget);
    expect(find.text('طباعة'), findsOneWidget);

    // Tapping another card toggles selection instead of opening details.
    await tester.tap(find.text('عميل 2'));
    await tester.pumpAndSettle();
    expect(find.textContaining('المحدد: 2'), findsOneWidget);

    await tester.tap(find.text('إلغاء التحديد'));
    await tester.pumpAndSettle();
    expect(find.textContaining('المحدد:'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('bulk print opens for the selected orders', (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(800, 1400);
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
        case 'listCompanies':
        case 'listAllowedPages':
        case 'listOrderCreators':
          return {'items': <dynamic>[]};
        case 'getOrdersByIds':
          return {
            'items': [order('1'), order('2')],
          };
        case 'getSettings':
          return {'organizationName': 'Velnix', 'receiptFooter': ''};
      }
      throw StateError('Unexpected $name');
    });
    await tester.pumpWidget(app(LiveOrders(policy: gm())));
    await tester.pumpAndSettle();
    await tester.longPress(find.text('عميل 1'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('تحديد الظاهر'));
    await tester.pumpAndSettle();
    expect(find.textContaining('المحدد: 2'), findsOneWidget);
    await tester.tap(find.text('طباعة'));
    // PdfPreview keeps a loading animation, so settle is not usable; pump a
    // few frames and assert the bulk-print screen mounted.
    for (var i = 0; i < 6; i++) {
      await tester.pump(const Duration(milliseconds: 200));
    }
    expect(find.text('طباعة الطلبات المحددة'), findsOneWidget);
    expect(find.textContaining('عدد الطلبات: 2'), findsOneWidget);
  });

  testWidgets('barcode button opens the scanner screen', (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(800, 1200);
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    VelnixGateway.instance = VelnixGateway.forTesting((name, data) async {
      switch (name) {
        case 'listOrders':
          return {'items': <dynamic>[], 'nextAfterId': null};
        case 'listCompanies':
        case 'listAllowedPages':
        case 'listOrderCreators':
          return {'items': <dynamic>[]};
      }
      throw StateError('Unexpected $name');
    });
    await tester.pumpWidget(app(LiveOrders(policy: gm())));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('مسح باركود'));
    await tester.pumpAndSettle();
    expect(find.text('مسح باركود'), findsWidgets);
    expect(find.textContaining('الممسوحة:'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('advanced filters render on the orders page', (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(1000, 1400);
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    VelnixGateway.instance = VelnixGateway.forTesting((name, data) async {
      switch (name) {
        case 'listOrders':
          return {'items': <dynamic>[], 'nextAfterId': null};
        case 'listCompanies':
          return {
            'items': [
              {'id': 'c1', 'name': 'شركة', 'enabled': true, 'archived': false},
            ],
          };
        case 'listAllowedPages':
          return {
            'items': [
              {'id': 'p1', 'name': 'صفحة'},
            ],
          };
        case 'listOrderCreators':
          return {'items': <dynamic>[]};
      }
      throw StateError('Unexpected $name');
    });
    await tester.pumpWidget(app(LiveOrders(policy: gm())));
    await tester.pumpAndSettle();
    await tester.tap(find.text('المزيد من الفلاتر'));
    await tester.pumpAndSettle();
    expect(find.text('نوع الطلب'), findsOneWidget);
    expect(find.text('الصفحة الإلكترونية'), findsOneWidget);
    expect(find.text('المحافظة'), findsOneWidget);
    expect(find.text('حالة الإرسال'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('bulk dispatch passes a stable operationId to the server', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(900, 1600);
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    final opIds = <String>[];
    VelnixGateway.instance = VelnixGateway.forTesting((name, data) async {
      switch (name) {
        case 'listOrders':
          return {
            'items': [order('1'), order('2')],
            'nextAfterId': null,
          };
        case 'listCompanies':
          return {
            'items': [
              {'id': 'c1', 'name': 'شركة', 'enabled': true, 'archived': false},
            ],
          };
        case 'listAllowedPages':
        case 'listOrderCreators':
          return {'items': <dynamic>[]};
        case 'bulkDispatch':
          opIds.add(data['operationId']?.toString() ?? '');
          return {
            'operationId': data['operationId'],
            'results': [
              {'id': 'x', 'ok': false, 'code': 'failed-precondition'},
            ],
            'succeeded': 0,
            'failed': 1,
            'uncertain': 0,
          };
      }
      throw StateError('Unexpected $name');
    });
    await tester.pumpWidget(app(LiveOrders(policy: gm())));
    await tester.pumpAndSettle();
    await tester.longPress(find.text('عميل 1'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('تحديد الظاهر'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('إرسال'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('إرسال').last);
    await tester.pumpAndSettle();
    expect(opIds, hasLength(1));
    expect(opIds.first.length, greaterThanOrEqualTo(16));
    expect(opIds.first, isNot(contains('null')));
  });

  testWidgets('the bulk operations screen recovers operation status', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(800, 1400);
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    VelnixGateway.instance = VelnixGateway.forTesting((name, data) async {
      switch (name) {
        case 'listBulkOperations':
          return {
            'items': [
              {
                'operationId': 'op_restart_0001',
                'kind': 'dispatch',
                'status': 'partial',
                'ids': ['o1'],
                'succeeded': 1,
                'failed': 0,
                'uncertain': 0,
                'remaining': 2,
              },
            ],
          };
        case 'getBulkOperation':
          return {
            'operationId': 'op_restart_0001',
            'status': 'partial',
            'results': [
              {'id': 'o1', 'ok': true, 'trackingNumber': 'TRK-1'},
              {'id': 'o2', 'ok': false, 'uncertain': true},
            ],
          };
      }
      throw StateError('Unexpected $name');
    });
    await tester.pumpWidget(app(BulkOperationsScreen(policy: gm())));
    await tester.pumpAndSettle();
    expect(find.text('سجل عمليات الإرسال'), findsOneWidget);
    expect(find.text('op_restart_0001'), findsOneWidget);
    expect(find.textContaining('جزئية'), findsOneWidget);
    expect(find.textContaining('متبقٍ 2'), findsOneWidget);

    await tester.tap(find.text('عرض نتائج الطلبات'));
    await tester.pumpAndSettle();
    expect(find.textContaining('نتيجة غير مؤكدة'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'bulk status dialog lists every internal status with its Arabic label',
    (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(800, 1400);
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
          case 'listCompanies':
          case 'listAllowedPages':
          case 'listOrderCreators':
            return {'items': <dynamic>[]};
        }
        throw StateError('Unexpected $name');
      });
      await tester.pumpWidget(app(LiveOrders(policy: gm())));
      await tester.pumpAndSettle();
      await tester.longPress(find.text('عميل 1'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('تحديد الظاهر'));
      await tester.pumpAndSettle();

      await tester.tap(find.text('تغيير الحالة'));
      await tester.pumpAndSettle();
      expect(find.text('تغيير حالة الطلبات'), findsOneWidget);
      expect(find.textContaining('تم تحديد 2 طلب'), findsOneWidget);
      expect(find.text('الحالة الجديدة'), findsOneWidget);

      // Open the dropdown: every internal status must be present with its label.
      await tester.tap(find.text('الحالة الجديدة'));
      await tester.pumpAndSettle();
      for (final status in internalChangeableStatuses) {
        expect(
          find.text(status.label).hitTestable(),
          findsWidgets,
          reason: '${status.name} (${status.label}) must be offered',
        );
      }
      // The canonical list has six entries, proving the old three-status
      // hardcode is gone.
      expect(internalChangeableStatuses.length, 6);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('bulk status applies the chosen target after confirmation', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(800, 1400);
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    List<String>? sentIds;
    String? sentStatus;
    VelnixGateway.instance = VelnixGateway.forTesting((name, data) async {
      switch (name) {
        case 'listOrders':
          return {
            'items': [order('1'), order('2')],
            'nextAfterId': null,
          };
        case 'bulkChangeStatus':
          sentIds = (data['ids'] as List).cast<String>();
          sentStatus = data['status'] as String?;
          return {
            'succeeded': 2,
            'unchanged': 0,
            'failed': 0,
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
    await tester.pumpWidget(app(LiveOrders(policy: gm())));
    await tester.pumpAndSettle();
    await tester.longPress(find.text('عميل 1'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('تحديد الظاهر'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('تغيير الحالة'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('الحالة الجديدة'));
    await tester.pumpAndSettle();
    // Choose a BACKWARD target (cancelled) — the old hardcode never offered it.
    await tester.tap(find.text('ملغي').last);
    await tester.pumpAndSettle();
    await tester.tap(find.textContaining('تطبيق الحالة على 2 طلب'));
    await tester.pumpAndSettle();

    expect(sentStatus, 'cancelled');
    expect(sentIds, unorderedEquals(['1', '2']));
    // The completion summary is shown.
    expect(find.textContaining('تم التغيير'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('the confirm button is disabled until a status is chosen', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(800, 1400);
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    VelnixGateway.instance = VelnixGateway.forTesting((name, data) async {
      switch (name) {
        case 'listOrders':
          return {
            'items': [order('1')],
            'nextAfterId': null,
          };
        case 'listCompanies':
        case 'listAllowedPages':
        case 'listOrderCreators':
          return {'items': <dynamic>[]};
      }
      throw StateError('Unexpected $name');
    });
    await tester.pumpWidget(app(LiveOrders(policy: gm())));
    await tester.pumpAndSettle();
    await tester.longPress(find.text('عميل 1'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('تحديد الظاهر'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('تغيير الحالة'));
    await tester.pumpAndSettle();
    final confirm = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'تطبيق الحالة'),
    );
    expect(
      confirm.onPressed,
      isNull,
      reason: 'confirm is disabled with no target',
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'a dropped chunk keeps earlier successes and marks the in-flight chunk unknown',
    (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(900, 1600);
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });
      // 60 orders -> two bulk chunks of 50 and 10. The first succeeds, the
      // second is SENT but its result is lost (connection drop). The 10 orders
      // of the second chunk were dispatched, so they are UNKNOWN, not "not
      // started": the server may have processed them.
      var svcCalls = 0;
      VelnixGateway.instance = VelnixGateway.forTesting((name, data) async {
        switch (name) {
          case 'listOrders':
            return {
              'items': [for (var i = 0; i < 60; i++) order('$i')],
              'nextAfterId': null,
            };
          case 'bulkChangeStatus':
            svcCalls++;
            if (svcCalls == 1) {
              final ids = (data['ids'] as List).cast<String>();
              return {
                'succeeded': ids.length,
                'unchanged': 0,
                'failed': 0,
                'results': [
                  for (final id in ids) {'id': id, 'ok': true},
                ],
              };
            }
            // The network drops while the second chunk is in flight.
            throw StateError('connection lost');
          case 'listCompanies':
          case 'listAllowedPages':
          case 'listOrderCreators':
            return {'items': <dynamic>[]};
        }
        throw StateError('Unexpected $name');
      });
      await tester.pumpWidget(app(LiveOrders(policy: gm())));
      await tester.pumpAndSettle();
      await tester.longPress(find.text('عميل 0'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('تحديد كل النتائج'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('تحديد الكل'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('تغيير الحالة'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('الحالة الجديدة'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('ملغي').last);
      await tester.pumpAndSettle();
      await tester.tap(find.textContaining('تطبيق الحالة على 60 طلب'));
      await tester.pumpAndSettle();

      // Two chunk calls were made; the first succeeded fully, the second threw.
      expect(svcCalls, 2);
      // The exact summary line: 50 changed, 10 transport-unknown, nothing
      // unstarted (there is no third chunk).
      expect(
        find.text('تم التغيير: 50 • فشل: 0 • غير مؤكد (لم تصل النتيجة): 10'),
        findsOneWidget,
      );
      expect(find.textContaining('لم يبدأ'), findsNothing);
      expect(find.textContaining('لم تُعد المحاولة'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'chunks after the lost one are reported as not started (never sent)',
    (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(900, 1600);
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });
      // 110 orders -> three chunks of 50, 50 and 10. Chunk 1 succeeds, chunk 2
      // is sent but lost, chunk 3 is never dispatched -> 50 / 50 / 10.
      var svcCalls = 0;
      VelnixGateway.instance = VelnixGateway.forTesting((name, data) async {
        switch (name) {
          case 'listOrders':
            return {
              'items': [for (var i = 0; i < 110; i++) order('$i')],
              'nextAfterId': null,
            };
          case 'bulkChangeStatus':
            svcCalls++;
            if (svcCalls == 1) {
              final ids = (data['ids'] as List).cast<String>();
              return {
                'succeeded': ids.length,
                'unchanged': 0,
                'failed': 0,
                'results': [
                  for (final id in ids) {'id': id, 'ok': true},
                ],
              };
            }
            // The second chunk is in flight when the connection drops; the
            // third chunk is therefore never sent.
            throw StateError('connection lost');
          case 'listCompanies':
          case 'listAllowedPages':
          case 'listOrderCreators':
            return {'items': <dynamic>[]};
        }
        throw StateError('Unexpected $name');
      });
      await tester.pumpWidget(app(LiveOrders(policy: gm())));
      await tester.pumpAndSettle();
      await tester.longPress(find.text('عميل 0'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('تحديد كل النتائج'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('تحديد الكل'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('تغيير الحالة'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('الحالة الجديدة'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('ملغي').last);
      await tester.pumpAndSettle();
      await tester.tap(find.textContaining('تطبيق الحالة على 110 طلب'));
      await tester.pumpAndSettle();

      // Only two calls were made (the third chunk was never dispatched).
      expect(svcCalls, 2);
      // The exact summary line: 50 changed, 50 transport-unknown, 10 unstarted.
      expect(
        find.text(
          'تم التغيير: 50 • فشل: 0 • غير مؤكد (لم تصل النتيجة): 50 • لم يبدأ: 10',
        ),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
    },
  );
}
