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
          expect(find.text('حالة الشحنة'), findsOneWidget);
          expect(find.text(state.label), findsWidgets);
          expect(find.text('رقم البوليصة'), findsOneWidget);
          expect(find.text('1318368'), findsAtLeastNWidgets(1));
          // Technical identifiers live behind the collapsed "تفاصيل تقنية"
          // panel rather than the primary tracking view.
          expect(find.text('تفاصيل تقنية'), findsOneWidget);
          expect(
            find.textContaining('المرجع الأصلي لكود التاجر'),
            findsNothing,
          );
          expect(find.textContaining('رقم الطلب الداخلي'), findsNothing);

          expect(find.text('ملاحظة شركة التوصيل'), findsOneWidget);
          expect(find.text('تم الإرسال'), findsAtLeastNWidgets(1));
          expect(find.textContaining('987.654'), findsNothing);
          expect(find.textContaining('543.210'), findsNothing);
          expect(find.textContaining('876.543'), findsNothing);
          if (role == 'generalManager') {
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
      'Click integration shows activation without generic credentials or fake status mapping at $width',
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
        expect(find.text('تكامل Click Delivery'), findsOneWidget);
        expect(find.text('User_ID لحساب Click'), findsOneWidget);
        expect(find.text('بيانات الاتصال السرية'), findsNothing);
        expect(find.text('ربط حالات التوصيل'), findsNothing);
        final toggle = tester.widget<SwitchListTile>(
          find.byType(SwitchListTile),
        );
        expect(toggle.value, true);
        expect(toggle.onChanged, isNotNull);
        expect(tester.takeException(), isNull);
      },
    );
  }
  testWidgets(
    'an authorized admin can activate Click and the saved flag is true',
    (tester) async {
      Map<String, dynamic>? saved;
      VelnixGateway.instance = VelnixGateway.forTesting((name, data) async {
        expect(name, 'saveCompany');
        saved = data;
        return {'id': 'click'};
      });
      await tester.pumpWidget(
        app(
          const LiveCompanyForm(
            initial: {
              'id': 'click',
              'name': 'Click Delivery',
              'apiUrl': 'https://admin.clickdelivery.org/Client',
              'provider': 'click_delivery_v1',
              'enabled': false,
              'clickUserId': '1603',
            },
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        tester.widget<SwitchListTile>(find.byType(SwitchListTile)).value,
        false,
      );
      await tester.tap(find.byType(SwitchListTile));
      await tester.pumpAndSettle();
      expect(
        tester.widget<SwitchListTile>(find.byType(SwitchListTile)).value,
        true,
      );
      await tester.ensureVisible(find.text('حفظ إعدادات الشركة'));
      await tester.tap(find.text('حفظ إعدادات الشركة'));
      await tester.pumpAndSettle();
      expect(saved?['enabled'], true);
      expect(saved?['provider'], 'click_delivery_v1');
      expect(saved?['clickUserId'], '1603');
      expect(saved?['statusMap'], <String, String>{});
      expect(tester.takeException(), isNull);
    },
  );
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
      // Reconcile now lives inside the "إجراءات أخرى" menu.
      expect(find.text('إجراءات أخرى'), findsOneWidget);
      await tester.ensureVisible(find.text('إجراءات أخرى'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('إجراءات أخرى'));
      await tester.pumpAndSettle();
      expect(find.textContaining('ربط شحنة'), findsWidgets);
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
      expect(find.text('مزامنة الحالة'), findsOneWidget);
      expect(find.text('تفاصيل تقنية'), findsOneWidget);
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
    // The card shows one guided action; the Click send label lives in the
    // journey, opened by the primary button.
    expect(
      find.widgetWithText(FilledButton, 'متابعة وتجهيز الطلب'),
      findsOneWidget,
    );
    expect(find.text('إرسال إلى Click'), findsNothing);
    expect(find.text('إرسال لشركة التوصيل'), findsNothing);
    await tester.tap(find.text('متابعة وتجهيز الطلب'));
    await tester.pumpAndSettle();
    expect(find.text('تأكيد وإرسال إلى Click'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });
}
