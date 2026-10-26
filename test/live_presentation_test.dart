import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:velnix/core/theme.dart';
import 'package:velnix/core/widgets.dart';
import 'package:velnix/live/directory_panel.dart';
import 'package:velnix/live/gateway.dart';
import 'package:velnix/live/live_app.dart';
import 'package:velnix/live/live_settings.dart';

Widget presentationApp(Widget child, {double scale = 1}) => MaterialApp(
  debugShowCheckedModeBanner: false,
  theme: velnixTheme(),
  locale: const Locale('ar'),
  supportedLocales: const [Locale('ar')],
  localizationsDelegates: const [
    GlobalMaterialLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
  ],
  builder: (context, child) => MediaQuery(
    data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(scale)),
    child: child!,
  ),
  home: Scaffold(body: child),
);

void viewport(WidgetTester tester, double width) {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = Size(width, 900);
  addTearDown(() {
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });
}

Future<void> loadPresentationFonts() async {
  await (FontLoader('Cairo')
        ..addFont(rootBundle.load('assets/fonts/Cairo-Regular.ttf'))
        ..addFont(rootBundle.load('assets/fonts/Cairo-Bold.ttf')))
      .load();
  await (FontLoader(
    'MaterialIcons',
  )..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
}

void main() {
  test(
    'callable transport errors never display raw internal SDK diagnostics',
    () {
      final message = callableErrorMessage(
        'internal',
        'internal [0] PRIVATE_DIAGNOSTIC',
      );
      expect(message, contains('تحقق من الاتصال'));
      expect(message, isNot(matches(RegExp('[a-zA-Z]'))));
      expect(message, isNot(contains('PRIVATE_DIAGNOSTIC')));
      expect(
        callableErrorMessage('unavailable', 'fetch failed'),
        contains('تعذر الاتصال'),
      );
    },
  );
  test(
    'callable mapping preserves business denials and stale revision guidance',
    () {
      expect(
        callableErrorMessage('permission-denied', 'الصلاحية غير متاحة'),
        'الصلاحية غير متاحة',
      );
      expect(
        callableErrorMessage('failed-precondition', 'هذا الانتقال غير مسموح'),
        'هذا الانتقال غير مسموح',
      );
      expect(
        callableErrorMessage('aborted', 'aborted'),
        contains('أعد تحميله قبل الحفظ'),
      );
    },
  );

  final original = VelnixGateway.instance;
  tearDown(() => VelnixGateway.instance = original);
  test(
    'authentication and operation labels stay Arabic without identifying absent accounts',
    () {
      expect(
        authErrorMessage('user-not-found'),
        authErrorMessage('wrong-password'),
      );
      for (final code in [
        'invalid-credential',
        'invalid-email',
        'user-disabled',
        'network-request-failed',
        'too-many-requests',
        'unknown',
      ]) {
        expect(authErrorMessage(code), isNot(matches(RegExp('[a-zA-Z]'))));
      }
      for (final action in [
        'order.created',
        'order.remote_status',
        'company.saved',
        'company.archived',
        'company.restored',
        'member.created',
        'member.updated',
        'settings.updated',
        'unknown',
      ]) {
        expect(auditActionLabel(action), isNot(matches(RegExp('[a-zA-Z]'))));
      }
      expect(syncSourceLabel('poll'), 'مزامنة آلية');
      expect(syncSourceLabel('webhook'), 'تحديث من شركة التوصيل');
      expect(
        eventLabel('company_assigned', {'companyId': null}),
        'إزالة إسناد شركة التوصيل',
      );
      expect(
        eventLabel('company_assigned', {'companyId': 'click_delivery_1603'}),
        'إسناد شركة توصيل',
      );
      expect(eventLabel('company_unassigned'), 'إزالة إسناد شركة التوصيل');
    },
  );

  for (final width in [320.0, 390.0, 768.0]) {
    for (final scale in [1.0, 2.0]) {
      testWidgets(
        'loading error and empty states remain usable at $width scale $scale',
        (tester) async {
          viewport(tester, width);
          if (width == 390 && scale == 1) await loadPresentationFonts();
          final pending = Completer<String>();
          int retries = 0;
          await tester.pumpWidget(
            presentationApp(
              AsyncPanel<String>(
                future: pending.future,
                onRetry: () => retries++,
                builder: (data) => Text(data),
              ),
              scale: scale,
            ),
          );
          await tester.pump();
          expect(find.text('جارٍ تحميل البيانات'), findsOneWidget);
          expect(
            Directionality.of(tester.element(find.text('جارٍ تحميل البيانات'))),
            TextDirection.rtl,
          );
          pending.completeError(
            VelnixException(
              List.filled(
                8,
                'تعذر الاتصال بالخادم؛ تحقق من الشبكة ثم أعد المحاولة.',
              ).join(' '),
            ),
          );
          await tester.pumpAndSettle();
          expect(find.text('تعذر تحميل البيانات'), findsOneWidget);
          if (width == 390 && scale == 1) {
            await expectLater(
              find.byType(MaterialApp),
              matchesGoldenFile(
                'goldens/delivery_quality/feedback-error-390.png',
              ),
            );
          }
          final retry = find.text('إعادة المحاولة');
          await tester.ensureVisible(retry);
          await tester.tap(retry);
          expect(retries, 1);
          expect(tester.takeException(), isNull);
          await tester.pumpWidget(
            presentationApp(
              const Center(
                child: VFeedbackPanel(
                  title: 'لا توجد إشعارات',
                  message: 'ستظهر تحديثات الطلبات هنا.',
                  icon: Icons.notifications_none_outlined,
                ),
              ),
              scale: scale,
            ),
          );
          await tester.pumpAndSettle();
          expect(find.text('لا توجد إشعارات'), findsOneWidget);
          expect(tester.takeException(), isNull);
          if (width == 390 && scale == 1) {
            await expectLater(
              find.byType(MaterialApp),
              matchesGoldenFile(
                'goldens/delivery_quality/feedback-empty-390.png',
              ),
            );
          }
        },
      );
    }
  }

  testWidgets(
    'directory loading and failure never masquerade as an empty list',
    (tester) async {
      final pending = Completer<Map<String, dynamic>>();
      VelnixGateway.instance = VelnixGateway.forTesting(
        (_, _) => pending.future,
      );
      await tester.pumpWidget(
        presentationApp(
          DirectoryPanel(
            endpoint: 'listMembers',
            builder: (_) => const Text('قائمة فارغة'),
          ),
        ),
      );
      await tester.pump();
      expect(find.text('جارٍ تحميل القائمة'), findsOneWidget);
      expect(find.text('قائمة فارغة'), findsNothing);
      pending.completeError(VelnixException('تعذر الاتصال'));
      await tester.pumpAndSettle();
      expect(find.text('تعذر تحميل القائمة'), findsOneWidget);
      expect(find.text('قائمة فارغة'), findsNothing);
    },
  );

  testWidgets(
    'settings failure hides unsynchronized fields and retry restores saved values',
    (tester) async {
      bool fail = true;
      VelnixGateway.instance = VelnixGateway.forTesting((name, _) async {
        expect(name, 'getSettings');
        if (fail) throw VelnixException('تعذر الاتصال');
        return {
          'organizationName': 'المؤسسة التجريبية',
          'receiptFooter': 'شكراً لكم',
        };
      });
      await tester.pumpWidget(presentationApp(const LiveSettings()));
      await tester.pumpAndSettle();
      expect(find.text('تعذر تحميل الإعدادات'), findsOneWidget);
      expect(find.byType(TextFormField), findsNothing);
      expect(find.text('حفظ الإعدادات'), findsNothing);
      fail = false;
      await tester.tap(find.text('إعادة المحاولة'));
      await tester.pumpAndSettle();
      expect(find.text('المؤسسة التجريبية'), findsOneWidget);
      expect(find.text('شكراً لكم'), findsOneWidget);
    },
  );

  for (final role in [
    'generalManager',
    'manager',
    'warehouse',
    'sales',
    'dataEntry',
  ]) {
    for (final width in [390.0, 768.0, 1440.0]) {
      testWidgets('Arabic live visual regression $role ${width.toInt()}', (
        tester,
      ) async {
        viewport(tester, width);
        await loadPresentationFonts();
        final policy = SessionPolicy({
          'id': role,
          'name': 'موظف الاختبار',
          'role': role,
          'active': true,
          'permissions': role == 'manager'
              ? ['viewAllOrders', 'viewReports']
              : [],
        });
        VelnixGateway.instance = VelnixGateway.forTesting((name, _) async {
          if (name == 'dashboardStats') {
            return {
              'counters': {
                for (final bucket in ['all', 'delivery', 'internal'])
                  bucket: {
                    for (final status in statusLabels.keys)
                      status: {'count': 12, 'amountMinor': 12345},
                  },
              },
              'partial': false,
            };
          }
          if (name == 'listOrders') {
            return {
              'items': [
                {
                  'id': 'order_test_123',
                  'customer': 'عميل اختبار عربي',
                  'city': 'عمان',
                  'area': 'وسط المدينة',
                  'description': 'طلب تجريبي دون بيانات حقيقية',
                  'status': 'ready',
                  if (policy.viewAmounts) 'amount': 12.345,
                },
              ],
            };
          }
          if (name == 'listCompanies' || name == 'listOrderCreators') {
            return {'items': []};
          }
          throw StateError(name);
        });
        for (final entry in <String, Widget>{
          'dashboard': LiveDashboard(policy: policy, onNavigate: (_, _) {}),
          'orders': LiveOrders(policy: policy),
        }.entries) {
          await tester.pumpWidget(presentationApp(entry.value));
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull, reason: entry.key);
          await expectLater(
            find.byType(MaterialApp),
            matchesGoldenFile(
              'goldens/delivery_quality/$role-${entry.key}-${width.toInt()}.png',
            ),
          );
          await tester.pumpWidget(const SizedBox());
        }
      });
    }
  }
}
