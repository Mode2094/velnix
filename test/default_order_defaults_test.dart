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
  home: child,
);

SessionPolicy gm() =>
    SessionPolicy({'id': 'gm', 'role': 'generalManager', 'active': true});
SessionPolicy entry({List<String> pages = const []}) => SessionPolicy({
  'id': 'entry',
  'role': 'dataEntry',
  'active': true,
  'permissions': const <String>[],
  'allowedPageIds': pages,
});

final _companies = [
  {
    'id': 'comp_click',
    'name': 'Click Delivery',
    'enabled': true,
    'archived': false,
  },
  {'id': 'comp_aramex', 'name': 'أرامكس', 'enabled': true, 'archived': false},
];
final _pages = {
  'items': [
    {
      'id': 'page_market',
      'name': 'تاج Market',
      'active': true,
      'archived': false,
    },
    {'id': 'page_eleg', 'name': 'أناقة', 'active': true, 'archived': false},
  ],
};

/// Opens a closed dropdown (scrolling it into view first) and picks [option].
Future<void> chooseDropdown(
  WidgetTester tester,
  Finder dropdown,
  String option,
) async {
  await tester.ensureVisible(dropdown);
  await tester.pumpAndSettle();
  await tester.tap(dropdown);
  await tester.pumpAndSettle();
  await tester.tap(find.text(option).last);
  await tester.pumpAndSettle();
}

/// Fills the required create-order fields so the form can be submitted.
Future<void> fillRequired(WidgetTester tester) async {
  const values = {
    'اسم المستلم': 'عميل اختبار',
    'رقم الهاتف': '0791234567',
    'المنطقة': 'وسط',
    'العنوان التفصيلي': 'شارع الاختبار',
    'وصف محتويات الطلب': 'طرد',
    'المبلغ (دينار أردني)': '10',
  };
  for (final e in values.entries) {
    final label = ['العنوان التفصيلي'].contains(e.key)
        ? '${e.key} (اختياري)'
        : '${e.key} *';
    final input = find.widgetWithText(TextFormField, label);
    await tester.ensureVisible(input);
    await tester.enterText(input, e.value);
  }
  final city = find.byType(DropdownMenu<String>);
  await tester.ensureVisible(city);
  tester.widget<DropdownMenu<String>>(city).onSelected?.call('عمان');
  await tester.pumpAndSettle();
}

void main() {
  final original = VelnixGateway.instance;
  tearDown(() => VelnixGateway.instance = original);

  testWidgets('admin saves a default company and a default page', (
    tester,
  ) async {
    Map<String, dynamic>? saved;
    VelnixGateway.instance = VelnixGateway.forTesting((name, data) async {
      switch (name) {
        case 'getSettings':
          return {'organizationName': 'Velnix', 'defaultCompanyId': null};
        case 'listCompanies':
          return {'items': _companies};
        case 'listAllowedPages':
          return _pages;
        case 'saveSettings':
          saved = data;
          return {'ok': true};
      }
      throw StateError('Unexpected call $name');
    });
    await tester.pumpWidget(app(const LiveSettings()));
    await tester.pumpAndSettle();

    // Two <String> dropdowns: [0] company, [1] page.
    final dropdowns = find.byType(DropdownButtonFormField<String>);
    expect(dropdowns, findsNWidgets(2));

    await chooseDropdown(tester, dropdowns.at(0), 'Click Delivery');
    await chooseDropdown(
      tester,
      find.byType(DropdownButtonFormField<String>).at(1),
      'تاج Market',
    );

    await tester.ensureVisible(find.text('حفظ الإعدادات'));
    await tester.tap(find.text('حفظ الإعدادات'));
    await tester.pumpAndSettle();

    expect(saved, isNotNull);
    expect(saved!['defaultCompanyId'], 'comp_click');
    expect(saved!['defaultPageId'], 'page_market');
  });

  testWidgets('new order preselects both stored defaults', (tester) async {
    VelnixGateway.instance = VelnixGateway.forTesting((name, data) async {
      switch (name) {
        case 'listAllowedPages':
          return _pages;
        case 'listCompanies':
          return {'items': _companies};
        case 'getSettings':
          return {
            'organizationName': 'Velnix',
            'defaultCompanyId': 'comp_click',
            'defaultPageId': 'page_market',
          };
      }
      throw StateError('Unexpected call $name');
    });
    await tester.pumpWidget(app(LiveOrderForm(policy: gm(), onSaved: (_) {})));
    await tester.pumpAndSettle();

    final page = tester.widget<DropdownButtonFormField<String>>(
      find.byType(DropdownButtonFormField<String>).at(0),
    );
    expect(page.initialValue, 'page_market');
    final company = tester.widget<DropdownButtonFormField<String>>(
      find.byType(DropdownButtonFormField<String>).at(1),
    );
    expect(company.initialValue, 'comp_click');
  });

  testWidgets('a manual choice overrides the defaults when saving', (
    tester,
  ) async {
    Map<String, dynamic>? created;
    VelnixGateway.instance = VelnixGateway.forTesting((name, data) async {
      switch (name) {
        case 'listAllowedPages':
          return _pages;
        case 'listCompanies':
          return {'items': _companies};
        case 'getSettings':
          return {
            'organizationName': 'Velnix',
            'defaultCompanyId': 'comp_click',
            'defaultPageId': 'page_market',
          };
        case 'createOrder':
          created = data;
          return {'id': 'new_1', 'orderNumber': 'VNX-000100'};
        case 'listOrderCreators':
          return {'items': <dynamic>[]};
      }
      throw StateError('Unexpected call $name');
    });
    await tester.pumpWidget(app(LiveOrderForm(policy: gm(), onSaved: (_) {})));
    await tester.pumpAndSettle();

    // Change the page and the company away from the defaults.
    await chooseDropdown(
      tester,
      find.byType(DropdownButtonFormField<String>).at(0),
      'أناقة',
    );
    await chooseDropdown(
      tester,
      find.byType(DropdownButtonFormField<String>).at(1),
      'أرامكس',
    );

    await fillRequired(tester);
    await tester.ensureVisible(find.text('حفظ الطلب'));
    await tester.tap(find.text('حفظ الطلب'));
    await tester.pumpAndSettle();

    expect(created, isNotNull);
    expect(created!['pageId'], 'page_eleg');
    expect(created!['companyId'], 'comp_aramex');
  });

  testWidgets('reopening a new order shows the defaults again', (tester) async {
    VelnixGateway.instance = VelnixGateway.forTesting((name, data) async {
      switch (name) {
        case 'listAllowedPages':
          return _pages;
        case 'listCompanies':
          return {'items': _companies};
        case 'getSettings':
          return {
            'organizationName': 'Velnix',
            'defaultCompanyId': 'comp_click',
            'defaultPageId': 'page_market',
          };
      }
      throw StateError('Unexpected call $name');
    });
    // First open: change manually, then discard.
    await tester.pumpWidget(app(LiveOrderForm(policy: gm(), onSaved: (_) {})));
    await tester.pumpAndSettle();
    await chooseDropdown(
      tester,
      find.byType(DropdownButtonFormField<String>).at(0),
      'أناقة',
    );

    // A brand-new form (fresh widget key, as the shell builds it) re-applies
    // the stored defaults.
    await tester.pumpWidget(
      app(
        LiveOrderForm(
          key: const ValueKey('form-2'),
          policy: gm(),
          onSaved: (_) {},
        ),
      ),
    );
    await tester.pumpAndSettle();
    final page = tester.widget<DropdownButtonFormField<String>>(
      find.byType(DropdownButtonFormField<String>).at(0),
    );
    expect(page.initialValue, 'page_market');
  });

  testWidgets('editing an existing order never applies the defaults', (
    tester,
  ) async {
    Map<String, dynamic>? updated;
    VelnixGateway.instance = VelnixGateway.forTesting((name, data) async {
      switch (name) {
        case 'listAllowedPages':
          return _pages;
        case 'listCompanies':
          return {'items': _companies};
        case 'getSettings':
          return {
            'organizationName': 'Velnix',
            'defaultCompanyId': 'comp_click',
            'defaultPageId': 'page_market',
          };
        case 'updateOrder':
          updated = data;
          return {'id': 'old_1'};
        case 'listOrderCreators':
          return {'items': <dynamic>[]};
      }
      throw StateError('Unexpected call $name');
    });
    await tester.pumpWidget(
      app(
        LiveOrderForm(
          policy: gm(),
          onSaved: (_) {},
          initial: {
            'id': 'old_1',
            'revision': 2,
            'customer': 'قديم',
            'phone': '0790000000',
            'city': 'إربد',
            'pageId': 'page_eleg',
            'pageName': 'أناقة',
            'companyId': 'comp_aramex',
            'orderType': 'normal',
          },
        ),
      ),
    );
    await tester.pumpAndSettle();

    final page = tester.widget<DropdownButtonFormField<String>>(
      find.byType(DropdownButtonFormField<String>).at(0),
    );
    expect(page.initialValue, 'page_eleg');
    final company = tester.widget<DropdownButtonFormField<String>>(
      find.byType(DropdownButtonFormField<String>).at(1),
    );
    expect(company.initialValue, 'comp_aramex');

    await fillRequired(tester);
    await tester.ensureVisible(find.text('حفظ الطلب'));
    await tester.tap(find.text('حفظ الطلب'));
    await tester.pumpAndSettle();
    expect(updated, isNotNull);
    expect(updated!['pageId'], 'page_eleg');
    expect(updated!['companyId'], 'comp_aramex');
  });

  testWidgets('a default page the employee may not use is not preselected', (
    tester,
  ) async {
    VelnixGateway.instance = VelnixGateway.forTesting((name, data) async {
      switch (name) {
        case 'listAllowedPages':
          // Only page_market is allowed; the default points at page_eleg.
          return {
            'items': [
              {'id': 'page_market', 'name': 'تاج Market', 'active': true},
            ],
          };
        case 'listCompanies':
          return {'items': _companies};
        case 'getSettings':
          return {'organizationName': 'Velnix', 'defaultPageId': 'page_eleg'};
      }
      throw StateError('Unexpected call $name');
    });
    await tester.pumpWidget(
      app(LiveOrderForm(policy: entry(), onSaved: (_) {})),
    );
    await tester.pumpAndSettle();

    final page = tester.widget<DropdownButtonFormField<String>>(
      find.byType(DropdownButtonFormField<String>).at(0),
    );
    expect(page.initialValue, isNull);
    expect(find.textContaining('غير متاحة لحسابك'), findsOneWidget);
  });

  testWidgets(
    'a disabled default company or archived default page is skipped',
    (tester) async {
      VelnixGateway.instance = VelnixGateway.forTesting((name, data) async {
        switch (name) {
          case 'listAllowedPages':
            return _pages;
          case 'listCompanies':
            // comp_off exists but is disabled, so it is filtered out.
            return {
              'items': [
                {
                  'id': 'comp_off',
                  'name': 'معطلة',
                  'enabled': false,
                  'archived': false,
                },
                {'id': 'comp_aramex', 'name': 'أرامكس', 'enabled': true},
              ],
            };
          case 'getSettings':
            return {
              'organizationName': 'Velnix',
              'defaultCompanyId': 'comp_off',
              'defaultPageId': 'page_archived',
            };
        }
        throw StateError('Unexpected call $name');
      });
      await tester.pumpWidget(
        app(LiveOrderForm(policy: gm(), onSaved: (_) {})),
      );
      await tester.pumpAndSettle();

      final page = tester.widget<DropdownButtonFormField<String>>(
        find.byType(DropdownButtonFormField<String>).at(0),
      );
      expect(page.initialValue, isNull);
      final company = tester.widget<DropdownButtonFormField<String>>(
        find.byType(DropdownButtonFormField<String>).at(1),
      );
      expect(company.initialValue, isNull);
      expect(find.text('بدون شركة الآن'), findsOneWidget);
      expect(find.textContaining('غير متاحة'), findsWidgets);
    },
  );

  testWidgets('selecting a company never auto-sends the shipment', (
    tester,
  ) async {
    final calls = <String>[];
    VelnixGateway.instance = VelnixGateway.forTesting((name, data) async {
      calls.add(name);
      switch (name) {
        case 'listAllowedPages':
          return _pages;
        case 'listCompanies':
          return {'items': _companies};
        case 'getSettings':
          return {
            'organizationName': 'Velnix',
            'defaultCompanyId': 'comp_click',
            'defaultPageId': 'page_market',
          };
        case 'createOrder':
          return {'id': 'new_2', 'orderNumber': 'VNX-000101'};
        case 'listOrderCreators':
          return {'items': <dynamic>[]};
      }
      throw StateError('Unexpected call $name');
    });
    await tester.pumpWidget(app(LiveOrderForm(policy: gm(), onSaved: (_) {})));
    await tester.pumpAndSettle();
    await fillRequired(tester);
    await tester.ensureVisible(find.text('حفظ الطلب'));
    await tester.tap(find.text('حفظ الطلب'));
    await tester.pumpAndSettle();

    expect(calls, contains('createOrder'));
    expect(calls, isNot(contains('sendOrderToDelivery')));
  });
}
