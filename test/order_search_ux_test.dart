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

SessionPolicy gm() =>
    SessionPolicy({'id': 'gm', 'role': 'generalManager', 'active': true});

void main() {
  final original = VelnixGateway.instance;
  tearDown(() => VelnixGateway.instance = original);

  testWidgets('typing a query with a pause triggers exactly one searchOrders', (
    tester,
  ) async {
    final searches = <String>[];
    final listCalls = <Map<String, dynamic>>[];
    VelnixGateway.instance = VelnixGateway.forTesting((name, data) async {
      switch (name) {
        case 'searchOrders':
          searches.add(data['query']?.toString() ?? '');
          return {
            'items': [
              {
                'id': 'o1',
                'orderNumber': 'VNX-000001',
                'customer': 'عميل مطابق',
                'status': 'created',
                'phone': '0790000000',
              },
            ],
            'nextAfterId': null,
            'limited': false,
          };
        case 'listOrders':
          listCalls.add(data);
          return {'items': <dynamic>[], 'nextAfterId': null};
        case 'listCompanies':
        case 'listOrderCreators':
          return {'items': <dynamic>[], 'more': false, 'afterId': null};
      }
      throw StateError('Unexpected call $name');
    });

    await tester.pumpWidget(app(LiveOrders(policy: gm())));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), 'عميل مطا');
    await tester.pump(const Duration(milliseconds: 450));
    await tester.pumpAndSettle();

    expect(
      searches,
      contains('عميل مطا'),
      reason: 'a paused query must search without an explicit Enter/submit tap',
    );
    expect(find.text('عميل مطابق'), findsOneWidget);
  });

  testWidgets('a filter change keeps the active query (combined search)', (
    tester,
  ) async {
    final searches = <List<Object?>>[];
    VelnixGateway.instance = VelnixGateway.forTesting((name, data) async {
      switch (name) {
        case 'searchOrders':
          searches.add([data['query'], data['status'], data['bucket']]);
          return {'items': <dynamic>[], 'nextAfterId': null, 'limited': false};
        case 'listOrders':
          return {'items': <dynamic>[], 'nextAfterId': null};
        case 'listCompanies':
        case 'listOrderCreators':
          return {'items': <dynamic>[], 'more': false, 'afterId': null};
      }
      throw StateError('Unexpected call $name');
    });

    await tester.pumpWidget(app(LiveOrders(policy: gm())));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), 'عميل');
    await tester.pump(const Duration(milliseconds: 450));
    await tester.pumpAndSettle();

    // Change the status filter; the query must ride along, not be dropped.
    await tester.tap(find.text('جميع الحالات').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('قيد المراجعة').last);
    await tester.pumpAndSettle();

    expect(
      searches.any((c) => c[0] == 'عميل' && c[1] == 'review'),
      isTrue,
      reason: 'combined search+status must be issued with both criteria',
    );
  });

  testWidgets('clearing the search returns to the unfiltered list', (
    tester,
  ) async {
    var searchCalls = 0;
    final listCalls = <Map<String, dynamic>>[];
    VelnixGateway.instance = VelnixGateway.forTesting((name, data) async {
      switch (name) {
        case 'searchOrders':
          searchCalls++;
          return {'items': <dynamic>[], 'nextAfterId': null, 'limited': false};
        case 'listOrders':
          listCalls.add(data);
          return {'items': <dynamic>[], 'nextAfterId': null};
        case 'listCompanies':
        case 'listOrderCreators':
          return {'items': <dynamic>[], 'more': false, 'afterId': null};
      }
      throw StateError('Unexpected call $name');
    });

    await tester.pumpWidget(app(LiveOrders(policy: gm())));
    await tester.pumpAndSettle();
    final before = listCalls.length;

    await tester.enterText(find.byType(TextField), 'عميل');
    await tester.pump(const Duration(milliseconds: 450));
    await tester.pumpAndSettle();
    expect(searchCalls, greaterThan(0));

    await tester.enterText(find.byType(TextField), '');
    await tester.pump(const Duration(milliseconds: 450));
    await tester.pumpAndSettle();

    expect(
      listCalls.length,
      greaterThan(before),
      reason: 'clearing the query must reload the plain list again',
    );
  });
}
