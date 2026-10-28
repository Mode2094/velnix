import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:velnix/core/theme.dart';
import 'package:velnix/live/gateway.dart';
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
  home: Scaffold(body: SingleChildScrollView(child: child)),
);

void main() {
  final original = VelnixGateway.instance;
  tearDown(() => VelnixGateway.instance = original);

  for (final width in [390, 760, 1440]) {
    testWidgets(
      'chip labels are readable and clear independently at ${width}px',
      (tester) async {
        VelnixGateway.instance = VelnixGateway.forTesting((name, _) async {
          switch (name) {
            case 'listCompanies':
            case 'listOrderCreators':
            case 'listAllowedPages':
              return {'items': <dynamic>[]};
          }
          throw StateError(name);
        });
        tester.view.devicePixelRatio = 1;
        tester.view.physicalSize = Size(width.toDouble(), 2400);
        addTearDown(() {
          tester.view.resetPhysicalSize();
          tester.view.resetDevicePixelRatio();
        });
        await tester.pumpWidget(
          app(
            OrderFilters(
              onChanged: (_) {},
              initialFilters: const {'phone': '0791234567', 'product': 'قميص'},
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(find.text('الهاتف: 0791234567'), findsOneWidget);
        expect(find.text('المنتج: قميص'), findsOneWidget);
        final chip = find.widgetWithText(InputChip, 'الهاتف: 0791234567');
        await tester.ensureVisible(chip);
        await tester.pumpAndSettle();
        await tester.tap(
          find.descendant(of: chip, matching: find.byType(Icon)).first,
        );
        await tester.pumpAndSettle();
        expect(find.text('الهاتف: 0791234567'), findsNothing);
        expect(find.text('المنتج: قميص'), findsOneWidget);
        expect(tester.takeException(), isNull);
      },
    );
  }

  testWidgets('new independent filters emit and each chip clears only its own '
      'condition', (tester) async {
    VelnixGateway.instance = VelnixGateway.forTesting((name, _) async {
      switch (name) {
        case 'listCompanies':
        case 'listOrderCreators':
        case 'listAllowedPages':
          return {'items': <dynamic>[]};
      }
      throw StateError(name);
    });
    final changes = <Map<String, dynamic>>[];
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(900, 2200);
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    await tester.pumpWidget(
      app(OrderFilters(onChanged: changes.add, showAmounts: true)),
    );
    await tester.pumpAndSettle();
    expect(find.text('تاريخ الإرسال'), findsOneWidget);
    await tester.tap(find.text('المزيد من الفلاتر'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.widgetWithText(TextField, 'الهاتف (أرقام)'),
      '0791234567',
    );
    await tester.enterText(
      find.widgetWithText(TextField, 'المنتج / المحتويات'),
      'قميص',
    );
    await tester.pump();
    expect(changes.last['phone'], '0791234567');
    expect(changes.last['product'], 'قميص');
    expect(find.text('الهاتف: 0791234567'), findsOneWidget);
    expect(find.text('المنتج: قميص'), findsOneWidget);

    final phoneChip = find.widgetWithText(InputChip, 'الهاتف: 0791234567');
    await tester.tap(
      find.descendant(of: phoneChip, matching: find.byType(Icon)).first,
    );
    await tester.pumpAndSettle();
    expect(find.text('الهاتف: 0791234567'), findsNothing);
    expect(find.text('المنتج: قميص'), findsOneWidget);
    expect(changes.last.containsKey('phone'), isFalse);
    expect(changes.last['product'], 'قميص');
    expect(tester.takeException(), isNull);
  });
}
