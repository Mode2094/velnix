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

  testWidgets('the search page focuses the query field and reuses searchOrders', (
    tester,
  ) async {
    final calls = <String>[];
    final searchQueries = <String>[];
    VelnixGateway.instance = VelnixGateway.forTesting((name, data) async {
      calls.add(name);
      if (name == 'searchOrders') {
        searchQueries.add(data['query']?.toString() ?? '');
        return {
          'items': [
            {
              'id': 'order_hit',
              'orderNumber': 'VNX-000009',
              'customer': 'عميل البحث',
              'status': 'created',
              'phone': '0790000000',
            },
          ],
          'nextAfterId': null,
          'limited': false,
        };
      }
      if (name == 'listOrders') {
        return {'items': <dynamic>[], 'nextAfterId': null};
      }
      if (name == 'listCompanies' || name == 'listOrderCreators') {
        return {'items': <dynamic>[], 'more': false, 'afterId': null};
      }
      if (name == 'getOrder') {
        return {
          'order': {
            'id': 'order_hit',
            'orderNumber': 'VNX-000009',
            'customer': 'عميل البحث',
            'status': 'created',
            'phone': '0790000000',
            'actions': {
              'edit': false,
              'assign': false,
              'dispatch': false,
              'resolve': false,
              'statuses': <String>[],
            },
          },
          'events': <dynamic>[],
        };
      }
      throw StateError(name);
    });

    await tester.pumpWidget(app(LiveOrderSearchPage(policy: gm())));
    await tester.pump();
    await tester.pumpAndSettle();

    expect(find.text('بحث عن طلب'), findsOneWidget);
    final field = find.byType(TextField);
    expect(field, findsOneWidget);
    // The page wires a focus node for the query field so it opens ready to type.
    expect(tester.widget<TextField>(field).focusNode, isNotNull);

    await tester.enterText(field, 'VNX-000009');
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await tester.pumpAndSettle();

    expect(searchQueries.contains('VNX-000009'), isTrue);
    expect(find.text('VNX-000009'), findsWidgets);

    // Tapping the result opens the order details.
    await tester.tap(find.text('فتح التفاصيل').first);
    await tester.pumpAndSettle();
    expect(calls.contains('getOrder'), isTrue);
    expect(tester.takeException(), isNull);
  });
}
