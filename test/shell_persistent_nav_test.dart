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
  home: child,
);

SessionPolicy gm() => SessionPolicy({
  'id': 'gm',
  'name': 'مدير',
  'role': 'generalManager',
  'active': true,
});

Map<String, dynamic> order() => {
  'id': 'order_persist',
  'orderNumber': 'VNX-000123',
  'customer': 'عميل ثابت',
  'createdBy': 'gm',
  'createdByName': 'مدير',
  'status': 'created',
  'phone': '0791234567',
  'city': 'عمان',
  'area': 'وسط',
  'address': 'شارع',
  'description': 'طرد',
  'quantity': 1,
  'amount': 12.345,
  'paymentMethod': 'عند الاستلام',
  'dispatchState': 'idle',
  'revision': 0,
  'actions': {
    'edit': false,
    'statuses': <String>[],
    'assign': false,
    'dispatch': false,
    'resolve': false,
  },
};

void installGateway() {
  final counts = {
    for (final s in statusLabels.keys) s: {'count': 1, 'amountMinor': 12345},
  };
  VelnixGateway.instance = VelnixGateway.forTesting((name, data) async {
    switch (name) {
      case 'getOrder':
        return {'order': order(), 'events': <dynamic>[]};
      case 'listOrders':
      case 'searchOrders':
        return {
          'items': [order()],
          'nextAfterId': null,
          'limited': false,
        };
      case 'listCompanies':
      case 'listOrderCreators':
        return {'items': <dynamic>[], 'more': false, 'afterId': null};
      case 'dashboardStats':
        return {
          'counters': {'all': counts, 'delivery': counts, 'internal': counts},
          'partial': false,
        };
      case 'listMembers':
      case 'listNotices':
      case 'listAudit':
        return {'items': <dynamic>[]};
    }
    throw StateError('Unexpected call $name');
  });
}

void main() {
  final original = VelnixGateway.instance;
  tearDown(() => VelnixGateway.instance = original);

  testWidgets(
    'phone shell keeps the bottom bar mounted on orders, details, create and settings',
    (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(390, 844);
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });
      installGateway();

      await tester.pumpWidget(app(LiveShell(policy: gm())));
      await tester.pumpAndSettle();

      expect(find.byType(VelnixBottomBar), findsOneWidget);

      // Orders tab -> open order details; the bar must remain.
      await tester.tap(find.text('بحث'));
      await tester.pumpAndSettle();
      expect(
        find.byType(VelnixBottomBar),
        findsOneWidget,
        reason: 'bar stays on the search page',
      );

      await tester.tap(find.text('فتح التفاصيل').first);
      await tester.pumpAndSettle();
      expect(find.text('VNX-000123'), findsWidgets);
      expect(
        find.byType(VelnixBottomBar),
        findsOneWidget,
        reason: 'bar stays mounted on the order details page',
      );

      // Back returns to the search page with the bar still mounted.
      final back = find.byType(BackButton);
      expect(back, findsWidgets, reason: 'detail page exposes a back button');
      await tester.tap(back.first);
      await tester.pumpAndSettle();
      expect(find.byType(VelnixBottomBar), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('the create-order tab also keeps the bottom bar', (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(390, 844);
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    installGateway();

    await tester.pumpWidget(app(LiveShell(policy: gm())));
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.add));
    await tester.pumpAndSettle();
    expect(
      find.byType(VelnixBottomBar),
      findsOneWidget,
      reason: 'bar stays while creating an order',
    );
    expect(tester.takeException(), isNull);
  });
}
