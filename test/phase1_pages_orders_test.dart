import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:velnix/core/order_paste.dart';
import 'package:velnix/core/theme.dart';
import 'package:velnix/live/gateway.dart';
import 'package:velnix/live/live_app.dart';
import 'package:velnix/models/entities.dart';

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

  test('order type wire values and labels stay in sync', () {
    expect(OrderType.normal.wire, 'normal');
    expect(OrderType.returnOrder.wire, 'return');
    expect(OrderType.exchange.wire, 'exchange');
    expect(OrderType.partialReceipt.wire, 'partial_receipt');
    expect(OrderTypeUI.fromWire('return'), OrderType.returnOrder);
    expect(OrderTypeUI.fromWire('weird'), OrderType.normal);
    expect(OrderTypeUI.fromWire(null), OrderType.normal);
  });

  test('paste suggestions extract fields without inventing values', () {
    final s = suggestOrderFields(
      'أحمد محمد، 0791234567، عمان، خلدا، طقم شرعي أسود، 30',
    );
    expect(s['customer'], 'أحمد محمد');
    expect(s['phone'], '0791234567');
    expect(s['city'], 'عمان');
    expect(s['amount'], '30');
    expect(s.containsKey('address'), isFalse);
  });

  test('paste suggestions tolerate Arabic digits and currency', () {
    final s = suggestOrderFields('سارة ٠٧٩٩٨٨٧٧٦٦ اربد 25 دينار');
    expect(s['phone'], '0799887766');
    expect(s['city'], 'إربد');
    expect(s['amount'], '25');
  });
  testWidgets('create-order form shows type, page, company and hides quantity', (
    tester,
  ) async {
    VelnixGateway.instance = VelnixGateway.forTesting((name, data) async {
      switch (name) {
        case 'listAllowedPages':
          return {
            'items': [
              {'id': 'page_a', 'name': 'تاج Market'},
              {'id': 'page_b', 'name': 'أناقة'},
            ],
          };
        case 'listCompanies':
          return {
            'items': [
              {
                'id': 'comp_1',
                'name': 'أرامكس',
                'enabled': true,
                'archived': false,
              },
            ],
          };
      }
      throw StateError('Unexpected call $name');
    });

    await tester.pumpWidget(app(LiveOrderForm(policy: gm(), onSaved: (_) {})));
    await tester.pumpAndSettle();

    expect(find.text('نوع الطلب *'), findsOneWidget);
    expect(find.text('الصفحة الإلكترونية *'), findsOneWidget);
    expect(find.text('شركة التوصيل (اختياري)'), findsOneWidget);
    expect(find.text('الكمية'), findsNothing);
    expect(find.textContaining('لصق رسالة طلب'), findsOneWidget);
    // Both order type and page selectors are present (page + company are String
    // dropdowns; order type is the typed one).
    expect(find.byType(DropdownButtonFormField<String>), findsNWidgets(2));
  });

  testWidgets(
    'an employee without a page sees a clear block, not an empty menu',
    (tester) async {
      VelnixGateway.instance = VelnixGateway.forTesting((name, data) async {
        switch (name) {
          case 'listAllowedPages':
            return {'items': <dynamic>[]};
          case 'listCompanies':
            return {'items': <dynamic>[]};
        }
        throw StateError('Unexpected call $name');
      });
      await tester.pumpWidget(
        app(
          LiveOrderForm(
            policy: SessionPolicy({
              'id': 'entry',
              'role': 'dataEntry',
              'active': true,
              'permissions': [],
            }),
            onSaved: (_) {},
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.textContaining('لا توجد صفحات مسموحة'), findsWidgets);
    },
  );

  testWidgets('pages admin lists pages with status and order counts', (
    tester,
  ) async {
    VelnixGateway.instance = VelnixGateway.forTesting((name, data) async {
      switch (name) {
        case 'listPages':
          return {
            'items': [
              {
                'id': 'p1',
                'name': 'تاج Market',
                'active': true,
                'archived': false,
                'phone': '0790000000',
              },
              {'id': 'p2', 'name': 'أناقة', 'active': false, 'archived': true},
            ],
            'canManage': true,
          };
        case 'pageStats':
          return {
            'counts': {'p1': 5, 'p2': 0},
          };
      }
      throw StateError('Unexpected call $name');
    });

    await tester.pumpWidget(app(LivePages(policy: gm())));
    await tester.pumpAndSettle();
    expect(find.text('تاج Market'), findsOneWidget);
    expect(find.text('مفعلة'), findsOneWidget);
    expect(find.text('مؤرشفة'), findsOneWidget);
    expect(find.text('5 طلب'), findsOneWidget);
    expect(find.text('إضافة صفحة'), findsOneWidget);
  });

  testWidgets('member form exposes the allowed-pages selector', (tester) async {
    VelnixGateway.instance = VelnixGateway.forTesting((name, data) async {
      switch (name) {
        case 'listPages':
          return {
            'items': [
              {
                'id': 'p1',
                'name': 'تاج Market',
                'active': true,
                'archived': false,
              },
            ],
          };
      }
      throw StateError('Unexpected call $name');
    });
    await tester.pumpWidget(
      app(
        LiveMemberForm(
          policy: gm(),
          members: const [],
          initial: {
            'id': 'u1',
            'name': 'أحمد',
            'email': 'a@b.com',
            'role': 'dataEntry',
            'active': true,
            'permissions': <String>[],
            'allowedPageIds': ['p1'],
          },
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('الصفحات الإلكترونية المسموح بها'), findsOneWidget);
    expect(find.text('تعديل قائمة الصفحات'), findsOneWidget);
    expect(find.text('الصفحات المحددة: 1'), findsOneWidget);
  });
}
