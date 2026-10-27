import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:velnix/core/theme.dart';
import 'package:velnix/live/gateway.dart';
import 'package:velnix/live/live_app.dart';
import 'package:velnix/live/live_settings.dart';

void main() {
  final original = VelnixGateway.instance;
  tearDown(() => VelnixGateway.instance = original);
  for (final role in [
    'generalManager',
    'manager',
    'warehouse',
    'sales',
    'dataEntry',
  ]) {
    for (final width in [
      320.0,
      360.0,
      390.0,
      430.0,
      600.0,
      768.0,
      1024.0,
      1280.0,
      1440.0,
      1920.0,
    ]) {
      for (final scale in [1.0, 2.0]) {
        testWidgets(
          'live screen matrix $role ${width.toInt()}px scale $scale',
          (tester) async {
            tester.view.devicePixelRatio = 1;
            tester.view.physicalSize = Size(width, width >= 1024 ? 900 : 700);
            addTearDown(() {
              tester.view.resetPhysicalSize();
              tester.view.resetDevicePixelRatio();
            });
            final policy = SessionPolicy({
              'id': role,
              'name': 'موظف اختبار عربي',
              'role': role,
              'active': true,
              'permissions': role == 'manager'
                  ? ['viewAllOrders', 'viewReports', 'viewAmounts', 'viewSync']
                  : [],
            });
            final company = <String, dynamic>{
              'id': 'company',
              'name': 'شركة توصيل للاختبار المحلي فقط',
              'provider': 'generic_v1',
              'enabled': false,
              'archived': false,
              'apiUrl': 'https://local-contract.example',
              'statusMap': {'done': 'delivered'},
            };
            final page = <String, dynamic>{
              'id': 'page_x',
              'name': 'صفحة اختبار',
              'active': true,
              'archived': false,
            };
            final order = <String, dynamic>{
              'id': 'order_1234567890',
              'customer': 'عميل اختبار طويل الاسم',
              'createdBy': role,
              'createdByName': 'موظف الاختبار',
              'status': 'created',
              'phone': '0791234567',
              'extraPhone': '',
              'city': 'عمان',
              'area': 'وسط',
              'address': 'عنوان اختبار طويل',
              'description': 'محتويات طلب اختبار',
              'quantity': 1,
              'amount': 12.345,
              'paymentMethod': 'عند الاستلام',
              'note': '',
              'dispatchState': 'idle',
              'revision': 0,
              'actions': {
                'edit': true,
                'statuses': policy.canChangeStatus
                    ? ['review', 'cancelled']
                    : [],
                'assign': policy.can('sendToDelivery'),
                'dispatch': false,
                'resolve': false,
              },
            };
            final counts = {
              for (final status in statusLabels.keys)
                status: {'count': 1, 'amountMinor': 12345},
            };
            final members = <Map<String, dynamic>>[
              {
                'id': 'generalManager',
                'name': 'مدير الاختبار',
                'role': 'generalManager',
                'active': true,
                'permissions': [],
                'email': 'gm@velnix.test',
              },
              {
                'id': 'entry',
                'name': 'مدخل اختبار',
                'role': 'dataEntry',
                'active': true,
                'permissions': [],
                'email': 'entry@velnix.test',
              },
            ];
            VelnixGateway.instance = VelnixGateway.forTesting((
              name,
              data,
            ) async {
              switch (name) {
                case 'getOrder':
                  return {'order': order, 'events': []};
                case 'listOrders':
                case 'searchOrders':
                  return {
                    'items': [order],
                  };
                case 'listCompanies':
                  return {
                    'items': [company],
                  };
                case 'listPages':
                  return {
                    'items': [page],
                  };
                case 'listAllowedPages':
                  return {
                    'items': [page],
                  };
                case 'listOrderCreators':
                  return {'items': []};
                case 'companyStats':
                  return {'counts': counts, 'partial': false};
                case 'dashboardStats':
                  return {
                    'counters': {
                      'all': counts,
                      'delivery': counts,
                      'internal': counts,
                    },
                    'partial': false,
                  };
                case 'listMembers':
                  return {'items': members};
                case 'listNotices':
                  return {
                    'items': [
                      {
                        'id': 'notice',
                        'title': 'تحديث طلب',
                        'body': 'افتح الطلب لعرض التفاصيل',
                        'orderId': order['id'],
                        'read': false,
                      },
                    ],
                  };
                case 'listAudit':
                case 'listSyncEvents':
                  return {'items': []};
                case 'getSettings':
                  return {
                    'organizationName': 'مؤسسة اختبار',
                    'supportPhone': '',
                    'receiptFooter': '',
                  };
              }
              throw StateError('Unexpected call $name');
            });
            final screens = <String, Widget>{
              'login': const LiveLogin(),
              'dashboard': LiveDashboard(policy: policy, onNavigate: (_, _) {}),
              'orders': LiveOrders(policy: policy),
              'create': LiveOrderForm(policy: policy, onSaved: (_) {}),
              'details': LiveOrderDetail(
                id: order['id'] as String,
                policy: policy,
              ),
              'companies': LiveCompanies(policy: policy),
              'notices': LiveNotices(policy: policy),
              if (policy.can('viewReports'))
                'reports': LiveReports(policy: policy),
              if (policy.can('viewSync')) 'sync': const LiveSyncCenter(),
              if (policy.can('viewAudit')) 'audit': const LiveAudit(),
              if (policy.can('manageEmployees'))
                'members': LiveMembers(policy: policy),
              if (policy.can('manageEmployees'))
                'member_form': LiveMemberForm(policy: policy, members: members),
              if (policy.can('manageCompanies'))
                'company_form': LiveCompanyForm(initial: company),
              if (policy.can('manageSettings'))
                'settings': const LiveSettings(),
            };
            for (final entry in screens.entries) {
              await tester.pumpWidget(
                MaterialApp(
                  theme: velnixTheme(),
                  locale: const Locale('ar'),
                  supportedLocales: const [Locale('ar')],
                  localizationsDelegates: const [
                    GlobalMaterialLocalizations.delegate,
                    GlobalWidgetsLocalizations.delegate,
                    GlobalCupertinoLocalizations.delegate,
                  ],
                  builder: (context, child) => MediaQuery(
                    data: MediaQuery.of(
                      context,
                    ).copyWith(textScaler: TextScaler.linear(scale)),
                    child: child!,
                  ),
                  home: Scaffold(body: entry.value),
                ),
              );
              await tester.pumpAndSettle();
              expect(tester.takeException(), isNull, reason: entry.key);
              await tester.pumpWidget(const SizedBox());
            }
          },
        );
      }
    }
  }
}
