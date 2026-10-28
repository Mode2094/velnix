import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:velnix/core/theme.dart';
import 'package:velnix/live/gateway.dart';
import 'package:velnix/live/live_app.dart';
import 'package:velnix/live/order_filters.dart';

Widget app(Widget child) => MaterialApp(
  theme: velnixTheme(),
  locale: const Locale('ar'),
  supportedLocales: const [Locale('ar')],
  localizationsDelegates: const [
    GlobalMaterialLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
  ],
  home: child,
);

SessionPolicy gm() => SessionPolicy({
  'id': 'gm',
  'name': 'مدير عام',
  'role': 'generalManager',
  'active': true,
  'permissions': ['sendToDelivery', 'updateOrderStatus'],
});

Map<String, dynamic> order(String id) => {
  'id': 'order_$id',
  'orderNumber': 'VNX-00000$id',
  'customer': 'عميل تجريبي $id',
  'status': 'created',
  'phone': '0791234567',
  'city': 'عمان',
  'area': 'خلدا',
  'address': 'شارع تجريبي',
  'description': 'طقم تجريبي',
  'amount': 12.345,
  'orderType': 'normal',
  'createdAt': '2026-10-19T10:00:00.000Z',
  'actions': {
    'edit': true,
    'assign': true,
    'dispatch': false,
    'resolve': false,
    'statuses': ['review', 'cancelled'],
  },
};

void main() {
  setUpAll(() async {
    await (FontLoader('Cairo')
          ..addFont(rootBundle.load('assets/fonts/Cairo-Regular.ttf'))
          ..addFont(rootBundle.load('assets/fonts/Cairo-Bold.ttf')))
        .load();
    await (FontLoader(
      'MaterialIcons',
    )..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
  });
  final original = VelnixGateway.instance;
  tearDown(() => VelnixGateway.instance = original);

  testWidgets('final-audit visual: new order form', (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(900, 1500);
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    VelnixGateway.instance = VelnixGateway.forTesting((name, _) async {
      switch (name) {
        case 'listAllowedPages':
          return {
            'items': [
              {'id': 'p1', 'name': 'صفحة الاختبار'},
            ],
          };
        case 'listCompanies':
          return {
            'items': [
              {'id': 'c1', 'name': 'شركة التوصيل', 'enabled': true},
            ],
          };
      }
      throw StateError(name);
    });
    await tester.pumpWidget(app(LiveOrderForm(policy: gm(), onSaved: (_) {})));
    await tester.pumpAndSettle();
    await expectLater(
      find.byType(MaterialApp),
      matchesGoldenFile('goldens/final_audit/create_order_900.png'),
    );
  });

  testWidgets('final-audit visual: orders multi-select toolbar', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(900, 1400);
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    VelnixGateway.instance = VelnixGateway.forTesting((name, _) async {
      switch (name) {
        case 'listOrders':
          return {
            'items': [order('1'), order('2'), order('3')],
            'nextAfterId': null,
          };
        case 'listCompanies':
        case 'listAllowedPages':
        case 'listOrderCreators':
          return {'items': <dynamic>[]};
      }
      throw StateError(name);
    });
    await tester.pumpWidget(app(LiveOrders(policy: gm())));
    await tester.pumpAndSettle();
    await tester.longPress(find.text('عميل تجريبي 1'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('تحديد الظاهر'));
    await tester.pumpAndSettle();
    await expectLater(
      find.byType(MaterialApp),
      matchesGoldenFile('goldens/final_audit/orders_multi_select_900.png'),
    );
  });

  for (final width in [390, 760, 1440]) {
    testWidgets('final-audit visual: filter chips readable at ${width}px', (
      tester,
    ) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = Size(width.toDouble(), 1400);
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });
      VelnixGateway.instance = VelnixGateway.forTesting((name, _) async {
        switch (name) {
          case 'listCompanies':
            return {
              'items': [
                {'id': 'c1', 'name': 'شركة التوصيل'},
              ],
            };
          case 'listOrderCreators':
            return {
              'items': [
                {'id': 'u1', 'name': 'موظف الإدخال'},
              ],
            };
          case 'listAllowedPages':
            return {
              'items': [
                {'id': 'p1', 'name': 'صفحة الاختبار'},
              ],
            };
        }
        throw StateError(name);
      });
      await tester.pumpWidget(
        app(
          Scaffold(
            body: SingleChildScrollView(
              child: OrderFilters(
                showAmounts: true,
                initialFilters: const {
                  'companyId': 'c1',
                  'createdBy': 'u1',
                  'pageId': 'p1',
                  'city': 'عمان',
                  'area': 'خلدا',
                  'phone': '0791234567',
                  'barcode': 'VNX-000123',
                  'product': 'قميص',
                  'note': 'عاجل',
                  'amountMin': '10',
                  'amountMax': '50',
                },
                onChanged: (_) {},
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await expectLater(
        find.byType(MaterialApp),
        matchesGoldenFile('goldens/final_audit/filter_chips_$width.png'),
      );
    });
  }

  testWidgets('final-audit visual: barcode scanner collection', (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(900, 1400);
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    await tester.pumpWidget(app(BarcodeScannerScreen(policy: gm())));
    for (var i = 0; i < 8; i++) {
      await tester.pump(const Duration(milliseconds: 120));
    }
    await expectLater(
      find.byType(MaterialApp),
      matchesGoldenFile('goldens/final_audit/barcode_scanner_900.png'),
    );
  });

  testWidgets('final-audit visual: barcode scan results and bulk actions', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(900, 1400);
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    await tester.pumpWidget(
      app(
        BarcodeResultsScreen(
          policy: gm(),
          results: [
            for (var i = 1; i <= 3; i++)
              {'code': 'VNX-order_$i', 'status': 'ok', 'order': order('$i')},
            {'code': 'VNX-missing', 'status': 'not_found'},
          ],
        ),
      ),
    );
    await tester.pumpAndSettle();
    await expectLater(
      find.byType(MaterialApp),
      matchesGoldenFile('goldens/final_audit/barcode_results_900.png'),
    );
  });
}
