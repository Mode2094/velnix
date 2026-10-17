import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:velnix/core/theme.dart';
import 'package:velnix/live/gateway.dart';
import 'package:velnix/live/live_app.dart';
import 'package:velnix/live/live_settings.dart';

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
Future<void> fill(WidgetTester tester) async {
  const values = {
    'اسم المستلم': 'عميل اختبار',
    'رقم الهاتف': '٠٧٩١٢٣٤٥٦٧',
    'المحافظة': 'عمان',
    'المنطقة': 'وسط',
    'العنوان التفصيلي': 'شارع الاختبار',
    'وصف محتويات الطلب': 'طرد',
    'الكمية': '٢',
    'المبلغ (دينار أردني)': '١٢٫٣٤٥',
  };
  for (final entry in values.entries) {
    final input = find.widgetWithText(TextFormField, entry.key);
    await tester.ensureVisible(input);
    await tester.enterText(input, entry.value);
  }
}

void main() {
  final original = VelnixGateway.instance;
  tearDown(() => VelnixGateway.instance = original);
  testWidgets(
    'order pagination keeps the applied query until a new search is submitted',
    (tester) async {
      final calls = <String>[];
      VelnixGateway.instance = VelnixGateway.forTesting((name, data) async {
        if (name == 'listCompanies' || name == 'listOrderCreators') {
          return {'items': []};
        }
        calls.add(name);
        if (name == 'listOrders') {
          return {
            'items': [],
            'nextAfterId': data['afterId'] == null ? 'first' : null,
          };
        }
        if (name == 'searchOrders') return {'items': []};
        throw StateError(name);
      });
      await tester.pumpWidget(
        app(
          LiveOrders(
            policy: SessionPolicy({
              'id': 'entry',
              'role': 'dataEntry',
              'active': true,
            }),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), 'عميل');
      await tester.ensureVisible(find.text('تحميل المزيد'));
      await tester.tap(find.text('تحميل المزيد'));
      await tester.pumpAndSettle();
      expect(calls, ['listOrders', 'listOrders']);
      await tester.ensureVisible(find.byTooltip('تنفيذ البحث'));
      await tester.tap(find.byTooltip('تنفيذ البحث'));
      await tester.pumpAndSettle();
      expect(calls.last, 'searchOrders');
      expect(tester.takeException(), isNull);
    },
  );
  for (final role in [
    'generalManager',
    'manager',
    'warehouse',
    'sales',
    'dataEntry',
  ]) {
    testWidgets('$role saves a valid order through the live gateway', (
      tester,
    ) async {
      Map<String, dynamic>? payload;
      bool saved = false;
      VelnixGateway.instance = VelnixGateway.forTesting((name, data) async {
        expect(name, 'createOrder');
        payload = data;
        return {'id': 'saved-order'};
      });
      await tester.pumpWidget(
        app(
          LiveOrderForm(
            policy: SessionPolicy({'id': role, 'role': role, 'active': true}),
            onSaved: () => saved = true,
          ),
        ),
      );
      await fill(tester);
      FocusManager.instance.primaryFocus?.unfocus();
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('حفظ الطلب'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('حفظ الطلب'));
      await tester.pumpAndSettle();
      expect(saved, true);
      expect(payload?['quantity'], 2);
      expect(payload?['amount'], 12.345);
      expect(payload?['phone'], '0791234567');
      expect(
        (payload?['requestKey'] as String).length,
        greaterThanOrEqualTo(16),
      );
      expect(tester.takeException(), isNull);
    });
  }
  testWidgets('uncertain create retry keeps the same request identity', (
    tester,
  ) async {
    final keys = <String>[];
    bool saved = false;
    VelnixGateway.instance = VelnixGateway.forTesting((name, data) async {
      keys.add(data['requestKey'] as String);
      if (keys.length == 1) throw VelnixException('تعذر الاتصال؛ أعد المحاولة');
      return {'id': 'saved-order'};
    });
    await tester.pumpWidget(
      app(
        LiveOrderForm(
          policy: SessionPolicy({
            'id': 'entry',
            'role': 'dataEntry',
            'active': true,
          }),
          onSaved: () => saved = true,
        ),
      ),
    );
    await fill(tester);
    FocusManager.instance.primaryFocus?.unfocus();
    await tester.pumpAndSettle();
    for (var i = 0; i < 2; i++) {
      await tester.ensureVisible(find.text('حفظ الطلب'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('حفظ الطلب'));
      await tester.pumpAndSettle();
    }
    expect(keys.length, 2);
    expect(keys[0], keys[1]);
    expect(saved, true);
  });
  testWidgets(
    'financial validation rejects invalid precision before calling backend',
    (tester) async {
      var calls = 0;
      VelnixGateway.instance = VelnixGateway.forTesting((name, data) async {
        calls++;
        return {};
      });
      await tester.pumpWidget(
        app(
          LiveOrderForm(
            policy: SessionPolicy({
              'id': 'entry',
              'role': 'dataEntry',
              'active': true,
            }),
            onSaved: () {},
          ),
        ),
      );
      await fill(tester);
      FocusManager.instance.primaryFocus?.unfocus();
      await tester.pumpAndSettle();
      final amount = find.widgetWithText(TextFormField, 'المبلغ (دينار أردني)');
      await tester.enterText(amount, '12.3456');
      await tester.ensureVisible(find.text('حفظ الطلب'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('حفظ الطلب'));
      await tester.pumpAndSettle();
      expect(calls, 0);
      expect(
        find.text('أدخل مبلغاً صالحاً حتى ثلاث منازل عشرية'),
        findsOneWidget,
      );
    },
  );
  testWidgets('settings persist the actual form values', (tester) async {
    Map<String, dynamic>? saved;
    VelnixGateway.instance = VelnixGateway.forTesting((name, data) async {
      if (name == 'getSettings') {
        return {
          'organizationName': 'المؤسسة',
          'supportPhone': '',
          'receiptFooter': '',
        };
      }
      expect(name, 'saveSettings');
      saved = data;
      return {'ok': true};
    });
    await tester.pumpWidget(app(const LiveSettings()));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.widgetWithText(TextFormField, 'اسم المؤسسة'),
      'مؤسسة اختبار',
    );
    await tester.ensureVisible(find.text('حفظ الإعدادات'));
    await tester.tap(find.text('حفظ الإعدادات'));
    await tester.pumpAndSettle();
    expect(saved?['organizationName'], 'مؤسسة اختبار');
    expect(find.text('تم حفظ إعدادات المؤسسة'), findsOneWidget);
  });
  testWidgets(
    'failed refresh replaces stale protected data with a retry state',
    (tester) async {
      Widget panel(Future<String> request) => app(
        AsyncPanel<String>(
          future: request,
          builder: (value) => Text(value),
          onRetry: () {},
        ),
      );
      await tester.pumpWidget(panel(Future.value('previous protected data')));
      await tester.pumpAndSettle();
      expect(find.text('previous protected data'), findsOneWidget);
      final request = Completer<String>();
      await tester.pumpWidget(panel(request.future));
      request.completeError(VelnixException('الصلاحية غير متاحة'));
      await tester.pumpAndSettle();
      expect(find.text('previous protected data'), findsNothing);
      expect(find.text('إعادة المحاولة'), findsOneWidget);
    },
  );
  testWidgets(
    'internal completion requires confirmation, refreshes provenance and removes final actions',
    (tester) async {
      String state = 'ready';
      int writes = 0;
      VelnixGateway.instance = VelnixGateway.forTesting((name, data) async {
        if (name == 'changeOrderStatus') {
          writes++;
          expect(data['status'], 'delivered');
          state = 'delivered';
          return {'ok': true};
        }
        expect(name, 'getOrder');
        return {
          'order': {
            'id': 'internal',
            'customer': 'عميل اختبار',
            'status': state,
            'phone': '0791234567',
            'city': 'عمان',
            'area': 'وسط',
            'address': 'شارع',
            'description': 'طرد',
            'quantity': 1,
            'paymentMethod': 'عند الاستلام',
            'companyId': null,
            if (state == 'delivered') 'completionSource': 'internal',
            'actions': {
              'statuses': state == 'ready' ? ['delivered'] : [],
              'edit': false,
              'assign': false,
              'dispatch': false,
              'resolve': false,
            },
          },
          'events': [],
        };
      });
      await tester.pumpWidget(
        app(
          LiveOrderDetail(
            id: 'internal',
            policy: SessionPolicy({
              'id': 'warehouse',
              'role': 'warehouse',
              'active': true,
            }),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('إكمال الطلب الداخلي'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('إكمال الطلب الداخلي'));
      await tester.pumpAndSettle();
      expect(writes, 0);
      expect(find.text('تأكيد إكمال الطلب الداخلي'), findsOneWidget);
      await tester.tap(find.text('تأكيد الإكمال'));
      await tester.pumpAndSettle();
      expect(writes, 1);
      expect(
        find.textContaining('إكمال داخلي بواسطة موظف مخوّل'),
        findsOneWidget,
      );
      expect(find.text('إكمال الطلب الداخلي'), findsNothing);
    },
  );
}
