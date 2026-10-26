import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:velnix/core/theme.dart';
import 'package:velnix/data/demo_store.dart';
import 'package:velnix/models/entities.dart';
import 'package:velnix/screens/dashboard_screen.dart';
import 'package:velnix/screens/orders_screen.dart';
import 'package:velnix/screens/delivery_screens.dart';
import 'package:velnix/screens/notifications_screen.dart';
import 'package:velnix/screens/reports_screen.dart';
import 'package:velnix/screens/settings_screen.dart';
import 'package:velnix/screens/team_screen.dart';

void main() {
  for (final role in UserRole.values) {
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
          'demo screens ${role.name} ${width.toInt()}px scale $scale',
          (tester) async {
            tester.view.devicePixelRatio = 1;
            tester.view.physicalSize = Size(width, width >= 1024 ? 900 : 700);
            addTearDown(() {
              tester.view.resetPhysicalSize();
              tester.view.resetDevicePixelRatio();
            });
            final store = DemoStore();
            addTearDown(store.dispose);
            store.chooseUser(
              store.members.firstWhere((member) => member.role == role).id,
            );
            final order = store.visibleOrders.first;
            final screens = <String, Widget>{
              'dashboard': DashboardScreen(
                onOpenOrders: () {},
                onNewOrder: () {},
                onOpenFiltered: (_, _) {},
                onOpenOverdue: () {},
              ),
              'orders': const OrdersScreen(),
              'create': const OrderFormScreen(),
              'details': OrderDetailScreen(order: order),
              'companies': const DeliveryCompaniesScreen(),
              'notices': const NotificationsScreen(),
              'settings': SettingsScreen(onLogout: () {}),
              'profile': const ProfileScreen(),
              if (store.can(AppPermission.viewReports))
                'reports': const ReportsScreen(),
              if (store.can(AppPermission.viewAudit))
                'audit': const AuditScreen(),
              if (store.can(AppPermission.manageEmployees))
                'team': const TeamScreen(),
              if (store.can(AppPermission.manageEmployees))
                'member_form': const EmployeeForm(),
              if (store.can(AppPermission.manageCompanies))
                'company_form': const DeliveryCompanyForm(),
              if (store.can(AppPermission.viewSync))
                'sync': const SyncCenterScreen(),
            };
            for (final entry in screens.entries) {
              await tester.pumpWidget(
                StoreScope(
                  store: store,
                  child: MaterialApp(
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
