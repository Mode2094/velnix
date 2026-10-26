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

void main() {
  final original = VelnixGateway.instance;
  tearDown(() => VelnixGateway.instance = original);

  Future<void> pumpForm(WidgetTester tester) async {
    VelnixGateway.instance = VelnixGateway.forTesting((name, _) async {
      if (name == 'listCompanies' || name == 'listOrderCreators') {
        return {'items': <dynamic>[]};
      }
      throw StateError(name);
    });
    await tester.pumpWidget(
      app(
        LiveOrderForm(
          policy: SessionPolicy({
            'id': 'gm',
            'role': 'generalManager',
            'active': true,
          }),
          onSaved: (_) {},
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('the primary phone is limited to 10 English digits', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(390, 900);
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    await pumpForm(tester);
    final phone = find.widgetWithText(TextFormField, 'رقم الهاتف *');
    await tester.ensureVisible(phone);
    // The counter reflects the 10-digit limit instead of the old 0/30 (both
    // phone fields show 0/10).
    expect(find.text('0/10'), findsNWidgets(2));
    // Arabic digits are refused by the input formatter.
    await tester.enterText(phone, '٠٧٩١٢٣٤٥٦٧');
    await tester.pumpAndSettle();
    final controller = tester.widget<TextFormField>(phone).controller!;
    expect(controller.text, isEmpty);
    // The formatter caps input at 10 digits.
    await tester.enterText(phone, '079123456789');
    await tester.pumpAndSettle();
    expect(controller.text.length, 10);
    expect(find.text('10/10'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('the extra phone accepts only 10 English digits', (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(390, 900);
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    await pumpForm(tester);
    final extra = find.widgetWithText(TextFormField, 'هاتف إضافي (اختياري)');
    await tester.ensureVisible(extra);
    final controller = tester.widget<TextFormField>(extra).controller!;
    // Arabic digits are stripped by the English-only formatter.
    await tester.enterText(extra, '٠٧٩١٢٣٤٥٦٧');
    await tester.pumpAndSettle();
    expect(controller.text, isEmpty);
    // Only the first 10 English digits are kept.
    await tester.enterText(extra, '079123456789');
    await tester.pumpAndSettle();
    expect(controller.text, '0791234567');
    expect(tester.takeException(), isNull);
  });
}
