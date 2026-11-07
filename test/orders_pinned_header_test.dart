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

Map<String, dynamic> orderCard(int i) => {
  'id': 'o$i',
  'orderNumber': 'VNX-${i.toString().padLeft(6, '0')}',
  'customer': 'عميل $i',
  'status': 'created',
  'phone': '0790000000',
  'city': 'عمان',
  'area': 'وسط',
  'address': 'شارع',
  'description': 'طرد',
  'quantity': 1,
  'amount': 12.345,
  'createdAt': '2026-10-19T10:00:00.000Z',
  'actions': {
    'edit': false,
    'assign': false,
    'dispatch': false,
    'resolve': false,
    'statuses': <String>[],
  },
};

void main() {
  final original = VelnixGateway.instance;
  tearDown(() => VelnixGateway.instance = original);

  for (final size in [const Size(390, 844), const Size(1280, 900)]) {
    testWidgets(
      'orders header stays pinned while the results list scrolls (${size.width.toInt()}px)',
      (tester) async {
        VelnixGateway.instance = VelnixGateway.forTesting((name, data) async {
          switch (name) {
            case 'listOrders':
              return {
                'items': [for (var i = 0; i < 40; i++) orderCard(i)],
                'nextAfterId': null,
                'limited': false,
              };
            case 'listCompanies':
            case 'listAllowedPages':
            case 'listOrderCreators':
              return {'items': <dynamic>[], 'more': false, 'afterId': null};
          }
          throw StateError('Unexpected call $name');
        });
        tester.view.physicalSize = size;
        tester.view.devicePixelRatio = 1;
        addTearDown(() {
          tester.view.resetPhysicalSize();
          tester.view.resetDevicePixelRatio();
        });

        await tester.pumpWidget(app(LiveOrders(policy: gm())));
        await tester.pumpAndSettle();

        // The pinned header pieces: title, new-order button and search field.
        final title = find.text('إدارة الطلبات');
        final newOrder = find.text('طلب جديد');
        final search = find.widgetWithText(
          TextField,
          'بحث في كل الطلبات المسموح لك بها',
        );
        expect(title, findsOneWidget);
        expect(newOrder, findsOneWidget);

        final titleBefore = tester.getTopLeft(title);
        final newOrderBefore = tester.getTopLeft(newOrder);
        final searchBefore = tester.getTopLeft(search);

        // Scroll the results list upward (drag up = content moves up).
        await tester.drag(
          find.text('عميل 0'),
          const Offset(0, -600),
          warnIfMissed: false,
        );
        await tester.pumpAndSettle();

        // The header never moved, and it is still on screen.
        expect(tester.getTopLeft(title), titleBefore);
        expect(tester.getTopLeft(newOrder), newOrderBefore);
        expect(tester.getTopLeft(search), searchBefore);
        expect(title, findsOneWidget);
        expect(newOrder, findsOneWidget);

        // The list did scroll: the first card is no longer at its start.
        expect(find.text('عميل 0').hitTestable(), findsNothing);
        expect(tester.takeException(), isNull);
      },
    );
  }

  testWidgets('changing the search resets the results list to the top', (
    tester,
  ) async {
    VelnixGateway.instance = VelnixGateway.forTesting((name, data) async {
      switch (name) {
        case 'listOrders':
        case 'searchOrders':
          return {
            'items': [for (var i = 0; i < 40; i++) orderCard(i)],
            'nextAfterId': null,
            'nextCursor': null,
            'limited': false,
          };
        case 'listCompanies':
        case 'listAllowedPages':
        case 'listOrderCreators':
          return {'items': <dynamic>[], 'more': false, 'afterId': null};
      }
      throw StateError('Unexpected call $name');
    });
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    await tester.pumpWidget(app(LiveOrders(policy: gm())));
    await tester.pumpAndSettle();

    await tester.drag(
      find.text('عميل 0'),
      const Offset(0, -600),
      warnIfMissed: false,
    );
    await tester.pumpAndSettle();
    expect(find.text('عميل 0').hitTestable(), findsNothing);

    // A new search must return to the top of the results.
    await tester.enterText(
      find.widgetWithText(TextField, 'بحث في كل الطلبات المسموح لك بها'),
      'عميل',
    );
    await tester.pump(const Duration(milliseconds: 450));
    await tester.pumpAndSettle();
    expect(find.text('عميل 0').hitTestable(), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
