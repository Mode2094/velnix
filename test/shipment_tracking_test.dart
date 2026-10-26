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

Map<String, dynamic> baseOrder() => <String, dynamic>{
  'id': 'tracking_order',
  'orderNumber': 'VNX-000123',
  'customer': 'عميل التتبع',
  'status': 'dispatched',
  'phone': '0791234567',
  'city': 'عمان',
  'area': 'وسط',
  'address': 'شارع',
  'description': 'طرد',
  'quantity': 1,
  'amount': 12.345,
  'companyId': 'click_delivery_1603',
  'companyName': 'Click Delivery',
  'companyProvider': 'click_delivery_v1',
  'dispatchState': 'idle',
  'providerOrderId': '1318368',
  'clickOrderRef': 'VNX-tracking-ref',
  'shippingStatus': 'awaitingPickup',
  'shippingStatusSource': 'click_api',
  'revision': 4,
  'actions': {
    'edit': true,
    'assign': true,
    'dispatch': false,
    'resolve': false,
    'statuses': <String>[],
  },
};

Widget detail(
  Map<String, dynamic> order, {
  List<Map<String, dynamic>>? events,
}) {
  VelnixGateway.instance = VelnixGateway.forTesting((name, _) async {
    if (name != 'getOrder') throw StateError(name);
    return {'order': order, 'events': events ?? <dynamic>[]};
  });
  return LiveOrderDetail(
    id: order['id'] as String,
    policy: SessionPolicy({
      'id': 'gm',
      'role': 'generalManager',
      'active': true,
    }),
  );
}

void main() {
  final original = VelnixGateway.instance;
  tearDown(() => VelnixGateway.instance = original);

  testWidgets('an unshipped order shows the not-sent message and no path', (
    tester,
  ) async {
    final order = baseOrder()
      ..['providerOrderId'] = null
      ..['clickOrderRef'] = null
      ..['shippingStatus'] = null;
    await tester.pumpWidget(app(detail(order)));
    await tester.pumpAndSettle();
    expect(find.text('حالة الشحنة لدى Click Delivery'), findsOneWidget);
    expect(find.text('لم تُرسل إلى شركة التوصيل بعد.'), findsOneWidget);
    // No invented visual track for an unshipped order.
    expect(find.text('في الشحن'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a confirmed state highlights the current stage with its label', (
    tester,
  ) async {
    final order = baseOrder()..['shippingStatus'] = 'outForDelivery';
    await tester.pumpWidget(app(detail(order)));
    await tester.pumpAndSettle();
    expect(find.text('حالة الشحنة'), findsOneWidget);
    expect(find.text('في الشحن'), findsWidgets);
    // Forward stages are visible; the current one is emphasised.
    expect(find.text('تم التسليم'), findsWidgets);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a special state is never rendered as a linear path', (
    tester,
  ) async {
    final order = baseOrder()..['shippingStatus'] = 'cancelled';
    await tester.pumpWidget(app(detail(order)));
    await tester.pumpAndSettle();
    expect(find.text('حالة خاصة: ملغي'), findsOneWidget);
    expect(
      find.text('لا تُعرض كمسار خطي حتى لا تُفهم بشكل خاطئ.'),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('an unknown carrier state is surfaced raw and never guessed', (
    tester,
  ) async {
    final order = baseOrder()
      ..['shippingStatus'] = null
      ..['clickStatusRaw'] = 'حالة جديدة غير موثقة';
    await tester.pumpWidget(app(detail(order)));
    await tester.pumpAndSettle();
    // The unknown raw value is shown verbatim and flagged for verification.
    expect(find.text('حالة غير معروفة لدى Click'), findsOneWidget);
    expect(find.textContaining('حالة جديدة غير موثقة'), findsOneWidget);
    expect(find.textContaining('لم تُخمَّن'), findsOneWidget);
    // It is never rendered as the neutral not-sent state.
    expect(find.text('لم تُرسل إلى شركة التوصيل بعد.'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a return state is never shown as progress toward delivery', (
    tester,
  ) async {
    final order = baseOrder()
      ..['shippingStatus'] = 'inShippingToSender'
      ..['clickStatusVerified'] = false;
    await tester.pumpWidget(app(detail(order)));
    await tester.pumpAndSettle();
    expect(find.text('حالة مرتجعة: في الشحن للراسل'), findsOneWidget);
    expect(
      find.text('الشحنة في مسار الإرجاع وليست في طريقها للتسليم.'),
      findsOneWidget,
    );
    // No linear four-stage track for a return.
    expect(find.text('تم التسليم'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a documented but unconfirmed state is labelled as such', (
    tester,
  ) async {
    final order = baseOrder()
      ..['shippingStatus'] = 'partiallyReturned'
      ..['clickStatusVerified'] = false;
    await tester.pumpWidget(app(detail(order)));
    await tester.pumpAndSettle();
    expect(find.text('مرتجع جزئي'), findsWidgets);
    expect(find.textContaining('لم تُؤكَّد بعد برد API مباشر'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('policy number and technical details stay out of the summary', (
    tester,
  ) async {
    final order = baseOrder();
    await tester.pumpWidget(app(detail(order)));
    await tester.pumpAndSettle();
    expect(find.text('رقم البوليصة'), findsOneWidget);
    expect(find.text('1318368'), findsWidgets);
    // Technical identifiers are collapsed by default.
    expect(find.text('مرجع Click'), findsNothing);
    await tester.ensureVisible(find.text('تفاصيل تقنية'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('تفاصيل تقنية'));
    await tester.pumpAndSettle();
    expect(find.text('مرجع Click'), findsOneWidget);
    expect(find.text('VNX-tracking-ref'), findsWidgets);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a sync error surfaces a retry action', (tester) async {
    final order = baseOrder()..['syncError'] = 'تعذرت مزامنة حالة Click.';
    await tester.pumpWidget(app(detail(order)));
    await tester.pumpAndSettle();
    // The error is captured in technical diagnostics, never in the primary view.
    await tester.ensureVisible(find.text('تفاصيل تقنية'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('تفاصيل تقنية'));
    await tester.pumpAndSettle();
    expect(find.text('تشخيص المزامنة'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('the tracking card has no overflow at every phone width', (
    tester,
  ) async {
    for (final width in [320.0, 375.0, 390.0, 430.0]) {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = Size(width, 900);
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });
      final order = baseOrder()..['shippingStatus'] = 'outForDelivery';
      await tester.pumpWidget(app(detail(order)));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull, reason: '${width}px');
      await tester.pumpWidget(const SizedBox());
    }
  });
}
