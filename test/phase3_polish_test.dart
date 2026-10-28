import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:velnix/core/theme.dart';
import 'package:velnix/live/gateway.dart';
import 'package:velnix/live/live_app.dart';
import 'package:velnix/printing/bulk_printing.dart';

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

  group('timeline detail labels', () {
    test('known keys are translated to Arabic', () {
      expect(eventDetailLabel('status'), 'الحالة الجديدة');
      expect(eventDetailLabel('companyId'), 'شركة التوصيل');
      expect(eventDetailLabel('tracking'), 'رقم التتبع');
      expect(eventDetailLabel('trackingNumber'), 'رقم التتبع');
      expect(eventDetailLabel('outcome'), 'النتيجة');
      expect(eventDetailLabel('source'), 'المصدر');
      expect(eventDetailLabel('clickOrderId'), 'رقم شحنة Click');
    });

    test('unknown keys fall back to the raw key', () {
      expect(eventDetailLabel('custom'), 'custom');
      expect(eventDetailLabel(null), '');
    });

    test('status, source and outcome values are humanized', () {
      expect(eventDetailValue('status', 'ready'), 'جاهز للتسليم');
      expect(eventDetailValue('source', 'click'), 'تحديث حالة الشحنة');
      expect(eventDetailValue('outcome', 'shipment_exists'), 'الشحنة موجودة');
      expect(eventDetailValue('outcome', 'not_created'), 'لم تُنشأ');
      expect(eventDetailValue('tracking', 'TRK-1'), 'TRK-1');
    });
  });

  testWidgets('the order timeline renders translated detail labels and hides '
      'empty values', (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(900, 1600);
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    VelnixGateway.instance = VelnixGateway.forTesting((name, _) async {
      if (name != 'getOrder') throw StateError(name);
      return {
        'order': {
          'id': 'order-1',
          'orderNumber': 'VNX-000001',
          'customer': 'عميل',
          'status': 'ready',
          'phone': '0791234567',
          'city': 'عمان',
          'area': 'وسط',
          'address': 'شارع',
          'description': 'طرد',
          'quantity': 1,
          'amount': 10,
          'createdAt': '2026-10-19T10:00:00.000Z',
          'actions': {
            'edit': false,
            'assign': false,
            'dispatch': false,
            'resolve': false,
            'statuses': <String>[],
          },
        },
        'events': [
          {
            'id': 'e1',
            'action': 'status_changed',
            'actorName': 'موظف',
            'createdAt': '2026-10-19T11:00:00.000Z',
            'details': {
              'status': 'ready',
              'source': 'click',
              'tracking': '',
              'companyId': 'click',
            },
          },
        ],
        'eventsMore': false,
        'eventsAfterId': null,
      };
    });
    await tester.pumpWidget(app(LiveOrderDetail(id: 'order-1', policy: gm())));
    await tester.pumpAndSettle();
    await tester.tap(find.text('تفاصيل إضافية'));
    await tester.pumpAndSettle();
    expect(find.text('الحالة الجديدة: جاهز للتسليم'), findsOneWidget);
    expect(find.text('المصدر: تحديث حالة الشحنة'), findsOneWidget);
    expect(find.text('شركة التوصيل: click'), findsOneWidget);
    expect(find.textContaining('tracking'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('bulk printing offers a template selector next to paper size', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(900, 1600);
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    await tester.pumpWidget(
      app(
        BulkPrintScreen(
          orders: [
            {
              'id': 'order-1',
              'orderNumber': 'VNX-000001',
              'customer': 'عميل',
              'phone': '0791234567',
              'city': 'عمان',
              'area': 'وسط',
              'address': 'شارع',
              'description': 'طرد',
              'quantity': 1,
              'createdAt': '2026-10-19T10:00:00.000Z',
            },
          ],
        ),
      ),
    );
    for (var i = 0; i < 6; i++) {
      await tester.pump(const Duration(milliseconds: 200));
    }
    expect(find.text('نوع البوليصة'), findsOneWidget);
    expect(find.text('بوليصة احترافية'), findsOneWidget);
    expect(find.text('حجم الورق'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
