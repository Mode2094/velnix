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
}
