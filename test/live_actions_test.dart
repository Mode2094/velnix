import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:velnix/core/theme.dart';
import 'package:velnix/live/gateway.dart';
import 'package:velnix/live/live_app.dart';
import 'package:velnix/live/jordan_locations.dart';
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
  // The quantity field was removed from the client form (Click keeps a
  // server-side default of 1), so it is no longer filled here.
  const values = {
    'اسم المستلم': 'عميل اختبار',
    'رقم الهاتف': '0791234567',
    'المنطقة': 'وسط',
    'العنوان التفصيلي': 'شارع الاختبار',
    'وصف محتويات الطلب': 'طرد',
    'المبلغ (دينار أردني)': '١٢٫٣٤٥',
  };
  for (final entry in values.entries) {
    final label =
        ['هاتف إضافي', 'ملاحظات', 'العنوان التفصيلي'].contains(entry.key)
        ? '${entry.key} (اختياري)'
        : '${entry.key} *';
    final input = find.widgetWithText(TextFormField, label);
    await tester.ensureVisible(input);
    await tester.enterText(input, entry.value);
  }
  // Electronic page is mandatory; select the first available page.
  final pageDropdown = find.byType(DropdownButtonFormField<String>).first;
  await tester.ensureVisible(pageDropdown);
  await tester.tap(pageDropdown);
  await tester.pumpAndSettle();
  final option = find.text('صفحة اختبار').last;
  await tester.tap(option);
  await tester.pumpAndSettle();
  final cityField = find.byType(DropdownMenu<String>);
  await tester.ensureVisible(cityField);
  tester.widget<DropdownMenu<String>>(cityField).onSelected?.call('عمان');
  await tester.pumpAndSettle();
}

void main() {
  final original = VelnixGateway.instance;
  tearDown(() => VelnixGateway.instance = original);

  // Wraps a create/update handler with the page + company loads the live order
  // form now performs, so a form save only records the real mutation call.
  VelnixGateway formGateway(
    Future<Map<String, dynamic>> Function(
      String name,
      Map<String, dynamic> data,
    )
    onMutation,
  ) => VelnixGateway.forTesting((name, data) async {
    switch (name) {
      case 'listAllowedPages':
        return {
          'items': [
            {'id': 'page_test', 'name': 'صفحة اختبار', 'active': true},
          ],
        };
      case 'listCompanies':
        return {'items': <dynamic>[]};
      case 'getSettings':
        return {'organizationName': 'Velnix', 'defaultCompanyId': null};
    }
    return onMutation(name, data);
  });

  testWidgets(
    'order pagination keeps the applied query until a new search is submitted',
    (tester) async {
      final calls = <String>[];
      VelnixGateway.instance = VelnixGateway.forTesting((name, data) async {
        if (name == 'listCompanies' ||
            name == 'listAllowedPages' ||
            name == 'listOrderCreators') {
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
      await tester.enterText(
        find.widgetWithText(TextField, 'بحث في كل الطلبات المسموح لك بها'),
        'عميل',
      );
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
      String? savedId;
      VelnixGateway.instance = formGateway((name, data) async {
        if (name == 'getOrder') {
          return {
            'order': {'id': 'saved-order', 'orderNumber': 'VNX-000042'},
          };
        }
        expect(name, 'createOrder');
        payload = data;
        return {'id': 'saved-order'};
      });
      await tester.pumpWidget(
        app(
          LiveOrderForm(
            policy: SessionPolicy({'id': role, 'role': role, 'active': true}),
            onSaved: (id) => savedId = id,
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
      expect(savedId, 'saved-order');
      expect(payload?['quantity'], 1);
      expect(payload?['pageId'], 'page_test');
      expect(payload?['orderType'], 'normal');
      expect(payload?['amount'], 12.345);
      expect(payload?['phone'], '0791234567');
      expect(payload?['extraPhone'], '');
      expect(payload?['city'], 'عمان');
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
    VelnixGateway.instance = formGateway((name, data) async {
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
          onSaved: (_) => saved = true,
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
      VelnixGateway.instance = formGateway((name, data) async {
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
            onSaved: (_) {},
          ),
        ),
      );
      await fill(tester);
      FocusManager.instance.primaryFocus?.unfocus();
      await tester.pumpAndSettle();
      final amount = find.widgetWithText(
        TextFormField,
        'المبلغ (دينار أردني) *',
      );
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
      find.widgetWithText(TextFormField, 'اسم المؤسسة *'),
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
      // Internal completion now lives in the "إجراءات أخرى" menu.
      await tester.ensureVisible(find.text('إجراءات أخرى'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('إجراءات أخرى'));
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
    final nameField = find.widgetWithText(TextFormField, 'اسم الموظف *');
    expect(nameField, findsOneWidget);
    expect(
      tester.widget<TextFormField>(nameField).controller?.text,
      'مدخل اصطناعي',
    );
    expect(
      tester
          .widget<TextFormField>(
            find.widgetWithText(TextFormField, 'البريد الإلكتروني *'),
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
    await tester.ensureVisible(find.text('عرض السجل كاملًا'));
    await tester.tap(find.text('عرض السجل كاملًا'));
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
        SingleChildScrollView(
          child: OrderFilters(
            initialFilters: {'companyId': 'gone', 'createdBy': 'gone'},
            onChanged: (_) {},
          ),
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
            find.widgetWithText(TextFormField, 'اسم شركة التوصيل *'),
          )
          .controller
          ?.text,
      'شركة اختبار',
    );
    expect(
      tester
          .widget<TextFormField>(
            find.widgetWithText(TextFormField, 'رابط API (HTTPS) *'),
          )
          .controller
          ?.text,
      'https://local-contract.example',
    );
  });

  testWidgets('login exposes email access only when Google is disabled', (
    tester,
  ) async {
    await tester.pumpWidget(app(const LiveLogin()));
    expect(find.text('تسجيل الدخول بالبريد'), findsOneWidget);
    expect(find.text('المتابعة باستخدام Google'), findsNothing);
    expect(find.text('أو'), findsNothing);
  });

  testWidgets('create order back returns to orders and confirms discards', (
    tester,
  ) async {
    var backed = false;
    VelnixGateway.instance = VelnixGateway.forTesting((name, data) async {
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
          onBack: () => backed = true,
          onSaved: (_) {},
        ),
      ),
    );
    expect(find.byType(BackButton), findsOneWidget);
    await tester.tap(find.byType(BackButton));
    await tester.pumpAndSettle();
    expect(backed, isTrue);

    backed = false;
    await tester.pumpWidget(
      app(
        LiveOrderForm(
          key: UniqueKey(),
          policy: SessionPolicy({
            'id': 'gm',
            'role': 'generalManager',
            'active': true,
          }),
          onBack: () => backed = true,
          onSaved: (_) {},
        ),
      ),
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'اسم المستلم *'),
      'عميل اختبار',
    );
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.text('تغييرات غير محفوظة'), findsOneWidget);
    expect(backed, isFalse);
    await tester.tap(find.text('مغادرة دون حفظ'));
    await tester.pumpAndSettle();
    expect(backed, isTrue);
  });

  testWidgets('order form asks before discarding unsaved changes', (
    tester,
  ) async {
    VelnixGateway.instance = VelnixGateway.forTesting((name, data) async {
      throw StateError(name);
    });
    final policy = SessionPolicy({
      'id': 'gm',
      'role': 'generalManager',
      'active': true,
    });
    await tester.pumpWidget(
      app(
        Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: TextButton(
                onPressed: () => Navigator.push(
                  context,
                  MaterialPageRoute<void>(
                    builder: (_) =>
                        LiveOrderForm(policy: policy, onSaved: (_) {}),
                  ),
                ),
                child: const Text('فتح النموذج'),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('فتح النموذج'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.widgetWithText(TextFormField, 'اسم المستلم *'),
      'عميل اختبار',
    );
    expect(find.byType(LiveOrderForm), findsOneWidget);
    expect(find.byType(BackButton), findsOneWidget);
    expect(
      tester
          .widget<TextFormField>(
            find.widgetWithText(TextFormField, 'اسم المستلم *'),
          )
          .controller
          ?.text,
      'عميل اختبار',
    );
    tester
        .widget<TextFormField>(
          find.widgetWithText(TextFormField, 'اسم المستلم *'),
        )
        .onChanged
        ?.call('عميل اختبار');
    await tester.pump();
    final scopes = tester
        .widgetList<PopScope>(find.byWidgetPredicate((w) => w is PopScope))
        .toList();
    expect(scopes.first.canPop, isFalse);
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.text('تغييرات غير محفوظة'), findsOneWidget);
  });

  testWidgets(
    'order form offers the governorate picker and persists a valley',
    (tester) async {
      Map<String, dynamic>? payload;
      VelnixGateway.instance = formGateway((name, data) async {
        if (name == 'getOrder') {
          return {
            'order': {'id': 'saved-order', 'orderNumber': 'VNX-000042'},
          };
        }
        expect(name, 'createOrder');
        payload = data;
        return {'id': 'saved-order'};
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
      await fill(tester);
      final cityField = find.byType(DropdownMenu<String>);
      final menu = tester.widget<DropdownMenu<String>>(cityField);
      expect(menu.dropdownMenuEntries.map((e) => e.value), jordanGovernorates);
      menu.onSelected?.call('الأغوار الجنوبية');
      await tester.pumpAndSettle();
      FocusManager.instance.primaryFocus?.unfocus();
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('حفظ الطلب'));
      await tester.tap(find.text('حفظ الطلب'));
      await tester.pumpAndSettle();
      expect(payload?['city'], 'الأغوار الجنوبية');
      expect(payload?['extraPhone'], '');
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('general manager creates an employee from the team form', (
    tester,
  ) async {
    Map<String, dynamic>? payload;
    VelnixGateway.instance = VelnixGateway.forTesting((name, data) async {
      expect(name, 'createEmployee');
      payload = data;
      return {'id': 'new-employee'};
    });
    await tester.pumpWidget(
      app(
        LiveMemberForm(
          policy: SessionPolicy({
            'id': 'gm',
            'role': 'generalManager',
            'active': true,
          }),
          members: const [],
          creating: true,
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.enterText(
      find.widgetWithText(TextFormField, 'اسم الموظف *'),
      'موظف جديد',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'البريد الإلكتروني *'),
      'new.employee@velnix.test',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'كلمة المرور الابتدائية *'),
      'InitialPass123!',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'تأكيد كلمة المرور *'),
      'InitialPass123!',
    );
    FocusManager.instance.primaryFocus?.unfocus();
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('حفظ الموظف'));
    await tester.tap(find.text('حفظ الموظف'));
    await tester.pumpAndSettle();
    expect(payload?['name'], 'موظف جديد');
    expect(payload?['email'], 'new.employee@velnix.test');
    expect(payload?['role'], 'dataEntry');
    expect(payload?['active'], true);
    expect(payload?['password'], 'InitialPass123!');
    expect(tester.takeException(), isNull);
  });

  testWidgets('order filters open in a sheet on phones and close on back', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    VelnixGateway.instance = VelnixGateway.forTesting((name, data) async {
      if (name == 'listCompanies' || name == 'listOrderCreators') {
        return {'items': <Map<String, dynamic>>[]};
      }
      if (name == 'listOrders') {
        return {'items': <Map<String, dynamic>>[], 'nextAfterId': null};
      }
      throw StateError(name);
    });
    await tester.pumpWidget(
      app(
        LiveOrders(
          policy: SessionPolicy({
            'id': 'gm',
            'role': 'generalManager',
            'active': true,
          }),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byTooltip('الفلاتر والترتيب'), findsOneWidget);
    await tester.tap(find.byTooltip('الفلاتر والترتيب'));
    await tester.pumpAndSettle();
    expect(find.text('ترتيب الإنشاء'), findsOneWidget);
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.text('ترتيب الإنشاء'), findsNothing);
  });

  testWidgets(
    'active Click company appears in the order picker and assignment is saved',
    (tester) async {
      String? assigned;
      VelnixGateway.instance = VelnixGateway.forTesting((name, data) async {
        if (name == 'getOrder') {
          return {
            'events': <Map<String, dynamic>>[],
            'eventsMore': false,
            'eventsAfterId': null,
            'order': {
              'id': 'o1',
              'customer': 'عميل اختبار',
              'status': 'ready',
              'companyId': null,
              'companyName': null,
              'companyProvider': null,
              'phone': '0791234567',
              'city': 'عمان',
              'area': 'وسط',
              'address': 'عنوان اختبار',
              'description': 'طرد',
              'quantity': 1,
              'amount': 12.345,
              'dispatchState': 'idle',
              'createdBy': 'gm',
              'actions': {
                'edit': false,
                'assign': true,
                'dispatch': false,
                'resolve': false,
                'statuses': <String>[],
              },
            },
          };
        }
        if (name == 'listCompanies') {
          return {
            'items': [
              {
                'id': 'click_delivery_1603',
                'name': 'Click Delivery',
                'enabled': true,
                'archived': false,
                'provider': 'click_delivery_v1',
              },
              {
                'id': 'disabled_company',
                'name': 'شركة معطلة',
                'enabled': false,
                'archived': false,
                'provider': 'generic_v1',
              },
            ],
          };
        }
        if (name == 'assignCompany') {
          assigned = data['companyId'] as String?;
          return {'ok': true};
        }
        throw StateError(name);
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
      // Company selection now happens inside the guided journey.
      await tester.ensureVisible(find.text('متابعة وتجهيز الطلب'));
      await tester.tap(find.text('متابعة وتجهيز الطلب'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(
        find.widgetWithText(FilledButton, 'اختيار شركة التوصيل'),
      );
      await tester.tap(
        find.widgetWithText(FilledButton, 'اختيار شركة التوصيل'),
      );
      await tester.pumpAndSettle();
      expect(find.text('Click Delivery'), findsOneWidget);
      expect(find.text('شركة معطلة'), findsNothing);
      await tester.tap(find.text('Click Delivery'));
      await tester.pumpAndSettle();
      expect(assigned, 'click_delivery_1603');
      expect(tester.takeException(), isNull);
    },
  );
}
