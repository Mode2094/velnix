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

final order = <String, dynamic>{
  'id': 'aVeryLongFirebaseDocumentId0001',
  'orderNumber': 'VNX-000006',
  'customer': 'عميل الاختبار',
  'status': 'ready',
  'phone': '0791234567',
  'extraPhone': '',
  'city': 'عمان',
  'area': 'وسط',
  'address': 'شارع الاختبار',
  'description': 'طرد اختبار',
  'quantity': 2,
  'amount': 12.345,
  'companyId': 'click',
  'companyName': 'Click Delivery',
  'companyProvider': 'click_delivery_v1',
  'dispatchState': 'idle',
  'createdAt': '2026-10-19T10:00:00.000Z',
  'actions': {
    'edit': true,
    'assign': true,
    'dispatch': false,
    'resolve': false,
    'statuses': ['cancelled'],
  },
};

final events = [
  for (var i = 0; i < 6; i++)
    {
      'id': 'e$i',
      'action': i == 0 ? 'created' : 'status_changed',
      'actorName': 'موظف',
      'createdAt': '2026-10-1${i}T10:00:00.000Z',
    },
];

void main() {
  final original = VelnixGateway.instance;
  tearDown(() => VelnixGateway.instance = original);

  void mockOrder() {
    VelnixGateway.instance = VelnixGateway.forTesting((name, _) async {
      if (name != 'getOrder') throw StateError(name);
      return {
        'order': order,
        'events': events,
        'eventsMore': true,
        'eventsAfterId': 'e5',
      };
    });
  }

  SessionPolicy gm() =>
      SessionPolicy({'id': 'gm', 'role': 'generalManager', 'active': true});

  Future<void> pumpDetail(WidgetTester tester) async {
    mockOrder();
    await tester.pumpWidget(
      app(LiveOrderDetail(id: order['id'] as String, policy: gm())),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('the summary shows the commercial order number, customer, '
      'value and status without Firebase ids', (tester) async {
    await pumpDetail(tester);
    expect(find.text('VNX-000006'), findsOneWidget);
    expect(find.text('عميل الاختبار'), findsOneWidget);
    expect(find.text('12.345 د.أ'), findsOneWidget);
    expect(find.text('جاهز للتسليم'), findsOneWidget);
    expect(
      find.textContaining('aVeryLongFirebaseDocumentId0001'),
      findsNothing,
    );
    expect(find.textContaining('رقم الطلب الداخلي'), findsNothing);
    expect(find.text('تفاصيل تقنية'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('customer information stays readable and complete', (
    tester,
  ) async {
    await pumpDetail(tester);
    expect(find.text('الاسم: عميل الاختبار'), findsOneWidget);
    expect(find.text('الهاتف: 0791234567'), findsOneWidget);
    expect(find.text('العنوان: عمان، وسط، شارع الاختبار'), findsOneWidget);
    expect(find.text('المحتويات: طرد اختبار'), findsOneWidget);
    expect(find.text('الكمية: 2'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('actions sit directly under the summary with one clear primary', (
    tester,
  ) async {
    await pumpDetail(tester);
    final summary = tester.getTopLeft(find.text('قيمة الطلب'));
    final actions = tester.getTopLeft(find.text('الإجراءات'));
    final customer = tester.getTopLeft(find.text('معلومات العميل'));
    final timeline = tester.getTopLeft(find.text('سجل الحركة'));
    expect(summary.dy, lessThan(actions.dy));
    expect(actions.dy, lessThan(customer.dy));
    expect(customer.dy, lessThan(timeline.dy));

    // The most useful next step is the single filled action.
    expect(
      find.widgetWithText(FilledButton, 'اختيار شركة توصيل'),
      findsOneWidget,
    );
    expect(
      find.widgetWithText(OutlinedButton, 'طباعة / PDF / باركود'),
      findsOneWidget,
    );
    expect(find.widgetWithText(OutlinedButton, 'تعديل'), findsOneWidget);
    expect(find.text('إرسال إلى Click'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a ready Click order keeps tracking and sync under the summary', (
    tester,
  ) async {
    final clickReady = Map<String, dynamic>.from(order)
      ..['status'] = 'ready'
      ..['dispatchState'] = 'idle'
      ..['providerOrderId'] = '1318368'
      ..['clickOrderRef'] = 'VNX-CLICK-TEST'
      ..['shippingStatus'] = 'awaitingPickup'
      ..['shippingStatusSource'] = 'click_api'
      ..['actions'] = {
        'edit': true,
        'assign': true,
        'dispatch': true,
        'resolve': false,
        'statuses': <String>[],
      };
    VelnixGateway.instance = VelnixGateway.forTesting((name, _) async {
      if (name != 'getOrder') throw StateError(name);
      return {'order': clickReady, 'events': <dynamic>[]};
    });
    await tester.pumpWidget(
      app(LiveOrderDetail(id: order['id'] as String, policy: gm())),
    );
    await tester.pumpAndSettle();
    expect(find.text('تتبع الشحنة'), findsOneWidget);
    expect(find.text('رقم البوليصة'), findsOneWidget);
    expect(find.text('1318368'), findsOneWidget);
    expect(find.text('حالة الشحنة'), findsOneWidget);
    expect(find.text('قيد انتظار الموافقة'), findsWidgets);
    expect(find.text('مزامنة الحالة'), findsOneWidget);
    expect(
      find.widgetWithText(FilledButton, 'إرسال إلى Click'),
      findsOneWidget,
    );
    expect(find.text('تفاصيل تقنية'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('an internal order without a carrier hides the tracking card', (
    tester,
  ) async {
    final internal = Map<String, dynamic>.from(order)
      ..['companyId'] = null
      ..['companyName'] = null
      ..['companyProvider'] = null
      ..['providerOrderId'] = null
      ..['dispatchState'] = 'idle'
      ..['status'] = 'delivered'
      ..['completionSource'] = 'internal'
      ..['actions'] = {
        'edit': false,
        'assign': false,
        'dispatch': false,
        'resolve': false,
        'statuses': <String>[],
      };
    VelnixGateway.instance = VelnixGateway.forTesting((name, _) async {
      if (name != 'getOrder') throw StateError(name);
      return {'order': internal, 'events': <dynamic>[]};
    });
    await tester.pumpWidget(
      app(LiveOrderDetail(id: order['id'] as String, policy: gm())),
    );
    await tester.pumpAndSettle();
    expect(find.text('تتبع الشحنة'), findsNothing);
    expect(find.text('رقم البوليصة'), findsNothing);
    expect(
      find.textContaining('إكمال داخلي بواسطة موظف مخوّل'),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('the activity log stays collapsed behind a single action', (
    tester,
  ) async {
    await pumpDetail(tester);
    // Only the four newest primary events are shown by default.
    expect(find.text('عرض السجل كاملًا'), findsOneWidget);
    expect(find.text('عرض السجل المختصر'), findsNothing);
    await tester.ensureVisible(find.text('عرض السجل كاملًا'));
    await tester.tap(find.text('عرض السجل كاملًا'));
    await tester.pumpAndSettle();
    expect(find.text('عرض السجل المختصر'), findsOneWidget);
    expect(find.text('عرض أحداث أقدم'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  for (final width in [320.0, 375.0, 390.0, 430.0, 768.0, 1280.0]) {
    testWidgets('the details page has no overflow at ${width.toInt()}px', (
      tester,
    ) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = Size(width, width < 768 ? 844 : 900);
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });
      await pumpDetail(tester);
      expect(find.text('VNX-000006'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    });
  }
}
