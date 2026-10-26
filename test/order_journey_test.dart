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

SessionPolicy gm({
  String role = 'generalManager',
  List<String> permissions = const [],
}) => SessionPolicy({
  'id': 'gm',
  'role': role,
  'active': true,
  'permissions': permissions,
});

Map<String, dynamic> order({
  String status = 'created',
  String dispatchState = 'idle',
  String? companyId,
  String? providerOrderId,
  List<String> statuses = const ['review', 'cancelled'],
  bool assign = false,
  bool dispatch = false,
}) => {
  'id': 'journey_order',
  'orderNumber': 'VNX-000042',
  'customer': 'عميل الرحلة',
  'phone': '0791234567',
  'city': 'عمان',
  'area': 'وسط',
  'address': 'شارع',
  'description': 'طرد',
  'quantity': 1,
  'amount': 12.345,
  'status': status,
  'dispatchState': dispatchState,
  'companyId': companyId,
  'companyName': companyId == null ? null : 'Click Delivery',
  'companyProvider': companyId == null ? null : 'click_delivery_v1',
  'providerOrderId': providerOrderId,
  'actions': {
    'edit': true,
    'assign': assign,
    'dispatch': dispatch,
    'resolve': false,
    'statuses': statuses,
  },
};

void main() {
  final original = VelnixGateway.instance;
  tearDown(() => VelnixGateway.instance = original);

  Future<void> pump(
    WidgetTester tester,
    Map<String, dynamic> Function() current, {
    void Function(String name, Map<String, dynamic> data)? onCall,
  }) async {
    VelnixGateway.instance = VelnixGateway.forTesting((name, data) async {
      onCall?.call(name, data);
      if (name == 'getOrder') {
        return {'order': current(), 'events': <dynamic>[]};
      }
      if (name == 'changeOrderStatus') return <String, dynamic>{};
      if (name == 'assignCompany') return <String, dynamic>{};
      if (name == 'listCompanies') {
        return {'items': <dynamic>[], 'more': false, 'afterId': null};
      }
      throw StateError(name);
    });
    await tester.pumpWidget(
      app(LiveOrderJourney(orderId: 'journey_order', policy: gm())),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('a created order starts the review step', (tester) async {
    await pump(tester, () => order(status: 'created'));
    expect(find.text('بدء مراجعة الطلب'), findsOneWidget);
    expect(find.text('VNX-000042'), findsWidgets);
    expect(find.text('مراجعة بيانات الطلب'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('review → preparing → ready advances in place after each tap', (
    tester,
  ) async {
    var status = 'created';
    final calls = <String>[];
    List<String> statusesFor(String s) => switch (s) {
      'created' => ['review', 'cancelled'],
      'review' => ['preparing', 'cancelled'],
      'preparing' => ['ready', 'cancelled'],
      _ => <String>[],
    };
    await pump(
      tester,
      () => order(status: status, statuses: statusesFor(status)),
      onCall: (n, d) {
        if (n == 'changeOrderStatus') {
          calls.add(d['status'] as String);
          status = d['status'] as String;
        }
      },
    );
    // created → review
    await tester.tap(find.text('بدء مراجعة الطلب'));
    await tester.pumpAndSettle();
    expect(find.text('بدء تجهيز الطلب'), findsOneWidget);
    expect(calls, ['review']);
    // review → preparing
    await tester.tap(find.text('بدء تجهيز الطلب'));
    await tester.pumpAndSettle();
    expect(find.text('تأكيد جاهزية الطلب'), findsOneWidget);
    expect(calls, ['review', 'preparing']);
    // preparing → ready
    await tester.tap(find.text('تأكيد جاهزية الطلب'));
    await tester.pumpAndSettle();
    expect(calls, ['review', 'preparing', 'ready']);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a ready order without a company shows the company step', (
    tester,
  ) async {
    await pump(tester, () => order(status: 'ready', assign: true));
    expect(find.text('اختيار شركة التوصيل'), findsWidgets);
    expect(find.textContaining('لن تُنشأ شحنة بمجرد الاختيار'), findsOneWidget);
    // The send button is not offered before a company is chosen.
    expect(find.textContaining('تأكيد وإرسال'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a ready order with a company shows the send confirmation', (
    tester,
  ) async {
    await pump(
      tester,
      () => order(
        status: 'ready',
        companyId: 'click_delivery_1603',
        dispatch: true,
      ),
    );
    expect(find.text('تأكيد وإرسال إلى Click'), findsOneWidget);
    // Tapping opens a confirmation; sending is not immediate.
    var dispatched = false;
    VelnixGateway.instance = VelnixGateway.forTesting((name, _) async {
      if (name == 'getOrder') {
        return {
          'order': order(
            status: 'ready',
            companyId: 'click_delivery_1603',
            dispatch: true,
          ),
          'events': <dynamic>[],
        };
      }
      if (name == 'sendOrderToDelivery') {
        dispatched = true;
        return {'ok': true, 'trackingNumber': '1320'};
      }
      throw StateError(name);
    });
    await tester.tap(find.text('تأكيد وإرسال إلى Click'));
    await tester.pumpAndSettle();
    expect(find.text('تأكيد الإرسال'), findsOneWidget);
    await tester.tap(find.text('رجوع'));
    await tester.pumpAndSettle();
    expect(dispatched, isFalse);
    expect(tester.takeException(), isNull);
  });

  testWidgets('needs_review shows one simple waiting card, no resend', (
    tester,
  ) async {
    await pump(
      tester,
      () => order(
        status: 'ready',
        companyId: 'click_delivery_1603',
        dispatchState: 'needs_review',
      ),
    );
    // The normal user sees one calm waiting card.
    expect(find.text('بانتظار تأكيد شركة التوصيل'), findsWidgets);
    expect(find.textContaining('لا يلزم إعادة الإرسال'), findsWidgets);
    expect(find.text('الطلب محمي من الإرسال المكرر.'), findsOneWidget);
    expect(find.textContaining('تأكيد وإرسال'), findsNothing);
    // A general manager also gets the advanced verification entry.
    expect(find.text('التحقق من نتيجة الإرسال'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a non-admin never sees the advanced verification entry', (
    tester,
  ) async {
    VelnixGateway.instance = VelnixGateway.forTesting((name, _) async {
      if (name == 'getOrder') {
        return {
          'order': order(
            status: 'ready',
            companyId: 'click_delivery_1603',
            dispatchState: 'needs_review',
          ),
          'events': <dynamic>[],
        };
      }
      throw StateError(name);
    });
    await tester.pumpWidget(
      app(
        LiveOrderJourney(
          orderId: 'journey_order',
          policy: gm(
            role: 'warehouse',
            permissions: const ['updateOrderStatus'],
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('بانتظار تأكيد شركة التوصيل'), findsWidgets);
    expect(find.text('التحقق من نتيجة الإرسال'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a sending order blocks resend and explains the state', (
    tester,
  ) async {
    await pump(
      tester,
      () => order(
        status: 'ready',
        companyId: 'click_delivery_1603',
        dispatchState: 'sending',
      ),
    );
    expect(find.textContaining('لا تُعِد الإرسال'), findsOneWidget);
    expect(find.textContaining('تأكيد وإرسال'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a sent order shows tracking and no resend', (tester) async {
    await pump(
      tester,
      () => order(
        status: 'dispatched',
        dispatchState: 'sent',
        companyId: 'click_delivery_1603',
        providerOrderId: '1320',
      ),
    );
    expect(find.text('تم إرسال الشحنة'), findsOneWidget);
    expect(find.textContaining('تأكيد وإرسال'), findsNothing);
    expect(find.text('رقم البوليصة'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a cancelled order offers no transition step', (tester) async {
    await pump(tester, () => order(status: 'cancelled', statuses: const []));
    expect(find.textContaining('تأكيد وإرسال'), findsNothing);
    expect(find.text('بدء مراجعة الطلب'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'a user without status permission sees the reason, not a button',
    (tester) async {
      VelnixGateway.instance = VelnixGateway.forTesting((name, _) async {
        if (name == 'getOrder') {
          return {
            'order': order(status: 'created', statuses: const []),
            'events': <dynamic>[],
          };
        }
        throw StateError(name);
      });
      await tester.pumpWidget(
        app(
          LiveOrderJourney(
            orderId: 'journey_order',
            policy: gm(role: 'dataEntry'),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('بدء مراجعة الطلب'), findsNothing);
      expect(find.textContaining('صلاحية'), findsWidgets);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('opening the journey never changes the order status', (
    tester,
  ) async {
    final calls = <String>[];
    await pump(
      tester,
      () => order(status: 'created'),
      onCall: (n, _) {
        calls.add(n);
      },
    );
    expect(calls.where((c) => c == 'changeOrderStatus'), isEmpty);
    expect(tester.takeException(), isNull);
  });

  testWidgets('the journey has no overflow at every phone width', (
    tester,
  ) async {
    for (final width in [320.0, 375.0, 390.0, 430.0]) {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = Size(width, 850);
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });
      await pump(tester, () => order(status: 'ready', assign: true));
      expect(tester.takeException(), isNull, reason: '${width}px');
      await tester.pumpWidget(const SizedBox());
    }
  });
}
