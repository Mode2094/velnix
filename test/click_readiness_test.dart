import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:velnix/core/theme.dart';
import 'package:velnix/live/gateway.dart';
import 'package:velnix/live/live_app.dart';
import 'package:velnix/models/shipping_status.dart';

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
  final previous = VelnixGateway.instance;
  tearDown(() => VelnixGateway.instance = previous);
  test(
    'seven client labels are business vocabulary and numeric API codes stay unknown',
    () {
      expect(ShippingStatus.values.map((v) => v.label), [
        'قيد انتظار الموافقة',
        'مخزن الشحن',
        'في الشحن',
        'تم التسليم',
        'تسليم جزئي',
        'مؤجل',
        'ملغي',
      ]);
      expect(ShippingStatus.parse('1'), isNull);
      expect(ShippingStatus.parse(1), isNull);
    },
  );
  for (final state in ShippingStatus.values) {
    testWidgets(
      'all roles see separate ${state.name} without unconfirmed settlement amounts',
      (tester) async {
        for (final role in [
          'generalManager',
          'manager',
          'warehouse',
          'sales',
          'dataEntry',
        ]) {
          VelnixGateway.instance = VelnixGateway.forTesting((name, _) async {
            expect(name, 'getOrder');
            return {
              'events': [],
              'order': {
                'id': 'fixture-order',
                'customer': 'عميل اختبار',
                'status': 'dispatched',
                'companyId': 'click',
                'companyName': 'Click Delivery',
                'companyProvider': 'click_delivery_v1',
                'shippingStatus': state.name,
                'shippingStatusSource': 'manual',
                'providerOrderId': '1318368',
                'clickOrderRef': 'VNX-CLICK-TEST-20261019-d',
                'clickClientSerial': 'VNX-CLICK-TEST-20261019-d4a0f8fb',
                'clickStatusDate': '2026-10-19T00:00:00',
                'clickStatusNote': 'شحنة قيد انتظار الموافقة',
                'phone': '0791234567',
                'city': 'عمان',
                'area': 'وسط',
                'address': 'عنوان اختبار',
                'description': 'طرد',
                'quantity': 1,
                'dispatchState': 'sent',
                'createdBy': 'owner',
                'actions': {
                  'edit': false,
                  'assign': false,
                  'dispatch': false,
                  'resolve': false,
                  'statuses': [],
                },
                if (role == 'generalManager') 'amount': 12.345,
                if (role == 'generalManager')
                  'clickAmounts': {
                    'orderAmountDuo': 0,
                    'shippingDiscount': 0,
                    'willPay': 1,
                  },
                // Untrusted fixture fields must not become displayed settlement data.
                'collectedAmount': 987.654,
                'deliveryFee': 543.210,
                'refundAmount': 876.543,
              },
            };
          });
          await tester.pumpWidget(
            app(
              LiveOrderDetail(
                id: 'fixture-order',
                policy: SessionPolicy({
                  'id': role,
                  'role': role,
                  'active': true,
                }),
              ),
            ),
          );
          await tester.pumpAndSettle();
          expect(find.text('حالة الشحنة: ${state.label}'), findsOneWidget);
          expect(
            find.text('مصدر حالة الشحنة: إدخال يدوي بعد التحقق من بوابة Click'),
            findsOneWidget,
          );
          expect(find.text('رقم شحنة Click: 1318368'), findsOneWidget);
          expect(
            find.text('مرجع Click (Order_ID): VNX-CLICK-TEST-20261019-d'),
            findsOneWidget,
          );
          expect(
            find.text('كود التاجر الأصلي: VNX-CLICK-TEST-20261019-d4a0f8fb'),
            findsOneWidget,
          );
          expect(
            find.text('تاريخ حالة Click: 2026-10-19T00:00:00'),
            findsOneWidget,
          );
          expect(
            find.text('ملاحظة حالة Click: شحنة قيد انتظار الموافقة'),
            findsOneWidget,
          );
          expect(find.text('الحالة: تم الإرسال'), findsOneWidget);
          expect(find.textContaining('987.654'), findsNothing);
          expect(find.textContaining('543.210'), findsNothing);
          expect(find.textContaining('876.543'), findsNothing);
          if (role == 'generalManager') {
            expect(find.textContaining('ليست مبلغ التحصيل'), findsOneWidget);
            expect(find.textContaining('12.345'), findsOneWidget);
          } else {
            expect(find.textContaining('12.345'), findsNothing);
          }
          expect(tester.takeException(), isNull);
          await tester.pumpWidget(const SizedBox());
        }
      },
    );
  }
  for (final width in [320.0, 768.0]) {
    testWidgets(
      'Click draft has no activation, generic credentials or fake status mapping at $width',
      (tester) async {
        tester.view.devicePixelRatio = 1;
        tester.view.physicalSize = Size(width, 900);
        addTearDown(() {
          tester.view.resetDevicePixelRatio();
          tester.view.resetPhysicalSize();
        });
        await tester.pumpWidget(
          app(
            MediaQuery(
              data: MediaQueryData(
                size: Size(width, 900),
                textScaler: TextScaler.linear(2),
              ),
              child: const LiveCompanyForm(
                initial: {
                  'id': 'click',
                  'name': 'Click Delivery',
                  'apiUrl': 'https://admin.clickdelivery.org/Client',
                  'provider': 'click_delivery_v1',
                  'enabled': true,
                },
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(find.text('تكامل Click Delivery غير مفعّل'), findsOneWidget);
        expect(find.text('User_ID لحساب Click'), findsOneWidget);
        expect(find.text('بيانات الاتصال السرية'), findsNothing);
        expect(find.text('ربط حالات التوصيل'), findsNothing);
        final toggle = tester.widget<SwitchListTile>(
          find.byType(SwitchListTile),
        );
        expect(toggle.value, false);
        expect(toggle.onChanged, isNull);
        expect(tester.takeException(), isNull);
      },
    );
  }
  testWidgets(
    'an authorized Click order without a linked shipment offers the reconcile action',
    (tester) async {
      VelnixGateway.instance = VelnixGateway.forTesting((name, _) async {
        expect(name, 'getOrder');
        return {
          'events': [],
          'order': {
            'id': 'fixture-order',
            'customer': 'عميل اختبار',
            'status': 'ready',
            'companyId': 'click',
            'companyName': 'Click Delivery',
            'companyProvider': 'click_delivery_v1',
            'shippingStatus': null,
            'phone': '0791234567',
            'city': 'عمان',
            'area': 'وسط',
            'address': 'عنوان اختبار',
            'description': 'طرد',
            'quantity': 1,
            'dispatchState': 'needs_review',
            'createdBy': 'owner',
            'actions': {
              'edit': false,
              'assign': false,
              'dispatch': false,
              'resolve': false,
              'statuses': [],
            },
          },
        };
      });
      await tester.pumpWidget(
        app(
          LiveOrderDetail(
            id: 'fixture-order',
            policy: SessionPolicy({
              'id': 'gm',
              'role': 'generalManager',
              'active': true,
            }),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('ربط شحنة Click موجودة'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    },
  );
  testWidgets(
    'a linked Click order offers a read-only status sync and shows API provenance',
    (tester) async {
      VelnixGateway.instance = VelnixGateway.forTesting((name, _) async {
        expect(name, 'getOrder');
        return {
          'events': [],
          'order': {
            'id': 'fixture-order',
            'customer': 'عميل اختبار',
            'status': 'dispatched',
            'companyId': 'click',
            'companyName': 'Click Delivery',
            'companyProvider': 'click_delivery_v1',
            'shippingStatus': 'awaitingPickup',
            'shippingStatusSource': 'click_api',
            'providerOrderId': '1318368',
            'clickOrderRef': 'VNX-CLICK-TEST-20261019-d',
            'clickStatusDate': '2026-10-19T00:00:00',
            'clickStatusNote': 'شحنة قيد انتظار الموافقة',
            'phone': '0791234567',
            'city': 'عمان',
            'area': 'وسط',
            'address': 'عنوان اختبار',
            'description': 'طرد',
            'quantity': 1,
            'dispatchState': 'sent',
            'createdBy': 'owner',
            'actions': {
              'edit': false,
              'assign': false,
              'dispatch': false,
              'resolve': false,
              'statuses': [],
            },
          },
        };
      });
      await tester.pumpWidget(
        app(
          LiveOrderDetail(
            id: 'fixture-order',
            policy: SessionPolicy({
              'id': 'gm',
              'role': 'generalManager',
              'active': true,
            }),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('مزامنة حالة Click'), findsOneWidget);
      expect(
        find.text('مصدر حالة الشحنة: تحديث تلقائي مؤكد من Click API'),
        findsOneWidget,
      );
      expect(find.text('ربط شحنة Click موجودة'), findsNothing);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    },
  );
  testWidgets('a ready Click order labels the dispatch action for Click', (
    tester,
  ) async {
    VelnixGateway.instance = VelnixGateway.forTesting((name, _) async {
      expect(name, 'getOrder');
      return {
        'events': [],
        'order': {
          'id': 'fixture-order',
          'customer': 'عميل اختبار',
          'status': 'ready',
          'companyId': 'click',
          'companyName': 'Click Delivery',
          'companyProvider': 'click_delivery_v1',
          'phone': '0791234567',
          'city': 'عمان',
          'area': 'وسط',
          'address': 'عنوان اختبار',
          'description': 'طرد',
          'quantity': 1,
          'dispatchState': 'idle',
          'createdBy': 'owner',
          'actions': {
            'edit': false,
            'assign': false,
            'dispatch': true,
            'resolve': false,
            'statuses': [],
          },
        },
      };
    });
    await tester.pumpWidget(
      app(
        LiveOrderDetail(
          id: 'fixture-order',
          policy: SessionPolicy({
            'id': 'gm',
            'role': 'generalManager',
            'active': true,
          }),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('إرسال إلى Click'), findsOneWidget);
    expect(find.text('إرسال لشركة التوصيل'), findsNothing);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });
}
