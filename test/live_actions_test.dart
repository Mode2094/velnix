import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:velnix/core/theme.dart';
import 'package:velnix/live/gateway.dart';
import 'package:velnix/live/live_app.dart';
import 'package:velnix/live/live_settings.dart';
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

  testWidgets('member form prefills the selected employee identity', (
    tester,
  ) async {
    final policy = SessionPolicy({
      'id': 'gm',
      'role': 'generalManager',
      'active': true,
    });
    final member = <String, dynamic>{
      'id': 'entry',
      'name': 'مدخل اصطناعي',
      'email': 'entry@velnix.test',
      'role': 'dataEntry',
      'active': true,
      'permissions': <String>[],
      'salesSupervisorId': null,
    };
    await tester.pumpWidget(
      app(LiveMemberForm(policy: policy, members: [member], initial: member)),
    );
    await tester.pumpAndSettle();
    final nameField = find.widgetWithText(TextFormField, 'اسم الموظف');
    expect(nameField, findsOneWidget);
    expect(
      tester.widget<TextFormField>(nameField).controller?.text,
      'مدخل اصطناعي',
    );
    expect(
      tester
          .widget<TextFormField>(
            find.widgetWithText(TextFormField, 'البريد الإلكتروني'),
          )
          .controller
          ?.text,
      'entry@velnix.test',
    );
  });

  testWidgets('audit log pages older events through the gateway', (
    tester,
  ) async {
    VelnixGateway.instance = VelnixGateway.forTesting((name, data) async {
      if (name != 'listAudit') throw StateError(name);
      if (data['afterId'] == null) {
        return {
          'items': [
            {
              'id': 'a1',
              'action': 'order.created',
              'actorName': 'موظف',
              'entityId': 'o1',
              'createdAt': '2026-10-18T10:00:00.000Z',
            },
          ],
          'more': true,
          'afterId': 'a1',
        };
      }
      return {
        'items': [
          {
            'id': 'a2',
            'action': 'order.edited',
            'actorName': 'موظف',
            'entityId': 'o1',
            'createdAt': '2026-10-18T09:00:00.000Z',
          },
        ],
        'more': false,
        'afterId': 'a2',
      };
    });
    await tester.pumpWidget(app(const LiveAudit()));
    await tester.pumpAndSettle();
    expect(find.text('إنشاء الطلب'), findsOneWidget);
    await tester.tap(find.text('عرض أحداث أقدم'));
    await tester.pumpAndSettle();
    expect(find.text('تعديل بيانات الطلب'), findsOneWidget);
  });

  testWidgets('sync center marks a bounded view instead of truncating', (
    tester,
  ) async {
    VelnixGateway.instance = VelnixGateway.forTesting((name, data) async {
      if (name != 'listSyncEvents') throw StateError(name);
      return {'items': <Map<String, dynamic>>[], 'limited': true};
    });
    await tester.pumpWidget(app(const LiveSyncCenter()));
    await tester.pumpAndSettle();
    expect(find.textContaining('تظهر أحدث 30 شركة'), findsOneWidget);
  });

  testWidgets('order detail loads older history events', (tester) async {
    VelnixGateway.instance = VelnixGateway.forTesting((name, data) async {
      if (name != 'getOrder') throw StateError(name);
      final order = <String, dynamic>{
        'id': 'o1',
        'customer': 'عميل اختبار',
        'status': 'created',
        'actions': <String, dynamic>{},
      };
      if (data['eventsAfterId'] == null) {
        return {
          'order': order,
          'events': [
            {
              'id': 'e1',
              'action': 'created',
              'actorName': 'موظف',
              'createdAt': '2026-10-18T10:00:00.000Z',
            },
          ],
          'eventsMore': true,
          'eventsAfterId': 'e1',
        };
      }
      return {
        'order': order,
        'events': [
          {
            'id': 'e2',
            'action': 'remote_status',
            'actorName': 'موظف',
            'createdAt': '2026-10-18T09:00:00.000Z',
          },
        ],
        'eventsMore': false,
        'eventsAfterId': 'e2',
      };
    });
    await tester.pumpWidget(
      app(
        LiveOrderDetail(
          id: 'o1',
          policy: SessionPolicy({
            'id': 'gm',
            'role': 'generalManager',
            'active': true,
          }),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('إنشاء الطلب'), findsOneWidget);
    await tester.ensureVisible(find.text('عرض أحداث أقدم'));
    await tester.tap(find.text('عرض أحداث أقدم'));
    await tester.pumpAndSettle();
    expect(find.text('تحديث شركة التوصيل'), findsOneWidget);
  });

  testWidgets('filter options tolerate a removed company and creator', (
    tester,
  ) async {
    VelnixGateway.instance = VelnixGateway.forTesting((name, data) async {
      if (name == 'listCompanies') {
        return {
          'items': [
            {'id': 'c2', 'name': 'شركة متاحة'},
          ],
        };
      }
      if (name == 'listOrderCreators') {
        return {
          'items': [
            {'id': 'u2', 'name': 'موظف متاح'},
          ],
        };
      }
      throw StateError(name);
    });
    await tester.pumpWidget(
      app(
        OrderFilters(
          initialFilters: {'companyId': 'gone', 'createdBy': 'gone'},
          onChanged: (_) {},
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });

  testWidgets('company form prefills the selected company identity', (
    tester,
  ) async {
    final initial = <String, dynamic>{
      'id': 'c1',
      'name': 'شركة اختبار',
      'apiUrl': 'https://local-contract.example',
      'provider': 'generic_v1',
      'enabled': false,
      'archived': false,
      'statusMap': <String, String>{},
    };
    await tester.pumpWidget(app(LiveCompanyForm(initial: initial)));
    await tester.pumpAndSettle();
    expect(
      tester
          .widget<TextFormField>(
            find.widgetWithText(TextFormField, 'اسم شركة التوصيل'),
          )
          .controller
          ?.text,
      'شركة اختبار',
    );
    expect(
      tester
          .widget<TextFormField>(
            find.widgetWithText(TextFormField, 'رابط API (HTTPS)'),
          )
          .controller
          ?.text,
      'https://local-contract.example',
    );
  });
}
