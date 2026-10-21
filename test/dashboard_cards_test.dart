import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:velnix/core/theme.dart';
import 'package:velnix/live/gateway.dart';
import 'package:velnix/live/live_app.dart';

void main() {
  final original = VelnixGateway.instance;
  tearDown(() => VelnixGateway.instance = original);

  SessionPolicy policy({String role = 'generalManager'}) => SessionPolicy({
    'id': 'user_cards',
    'name': 'مدير الاختبار',
    'role': role,
    'active': true,
  });

  Map<String, dynamic> counters({
    required int allPerStatus,
    required int deliveryPerStatus,
    required int internalCreated,
  }) => {
    'all': {
      for (final status in statusLabels.keys)
        status: {'count': allPerStatus, 'amountMinor': 1000},
    },
    'delivery': {
      for (final status in statusLabels.keys)
        status: {'count': deliveryPerStatus, 'amountMinor': 2000},
    },
    'internal': {
      for (final status in statusLabels.keys)
        status: {
          'count': status == 'created' ? internalCreated : 0,
          'amountMinor': status == 'created' ? 500 : 0,
        },
    },
  };

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

  Future<void> viewport(WidgetTester tester, double width) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = Size(width, 900);
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    await tester.pump();
  }

  testWidgets('dashboard renders three cards from a single stats call', (
    tester,
  ) async {
    var calls = 0;
    VelnixGateway.instance = VelnixGateway.forTesting((name, _) async {
      if (name == 'dashboardStats') {
        calls++;
        return {
          'counters': counters(
            allPerStatus: 2,
            deliveryPerStatus: 1,
            internalCreated: 3,
          ),
          'partial': false,
        };
      }
      throw StateError(name);
    });
    await viewport(tester, 390);
    await tester.pumpWidget(
      app(LiveDashboard(policy: policy(), onNavigate: (_, _) {})),
    );
    await tester.pumpAndSettle();
    expect(calls, 1);
    expect(find.text('كل الطلبات'), findsOneWidget);
    expect(find.text('طلبات شركات التوصيل'), findsOneWidget);
    expect(find.text('الطلبات غير المسندة لشركة'), findsOneWidget);
    expect(find.text('18'), findsOneWidget);
    expect(find.text('9'), findsOneWidget);
    expect(find.text('3'), findsOneWidget);
    expect(find.textContaining('جديد'), findsWidgets);
    expect(tester.takeException(), isNull);
  });

  testWidgets('each card opens the orders list with its own bucket', (
    tester,
  ) async {
    final navigations = <String>[];
    VelnixGateway.instance = VelnixGateway.forTesting((name, _) async {
      if (name == 'dashboardStats') {
        return {
          'counters': counters(
            allPerStatus: 2,
            deliveryPerStatus: 1,
            internalCreated: 3,
          ),
          'partial': false,
        };
      }
      throw StateError(name);
    });
    await viewport(tester, 390);
    await tester.pumpWidget(
      app(
        LiveDashboard(
          policy: policy(),
          onNavigate: (bucket, status) =>
              navigations.add('$bucket:${status ?? 'all'}'),
        ),
      ),
    );
    await tester.pumpAndSettle();
    for (final entry in {
      'كل الطلبات': 'all:all',
      'طلبات شركات التوصيل': 'delivery:all',
      'الطلبات غير المسندة لشركة': 'internal:all',
    }.entries) {
      final target = find.text(entry.key);
      await tester.ensureVisible(target);
      await tester.pumpAndSettle();
      await tester.tap(target);
      await tester.pumpAndSettle();
      expect(navigations.last, entry.value);
    }
    expect(tester.takeException(), isNull);
  });

  testWidgets('status chip inside the total card drills into that status', (
    tester,
  ) async {
    String? navigated;
    VelnixGateway.instance = VelnixGateway.forTesting((name, _) async {
      if (name == 'dashboardStats') {
        return {
          'counters': counters(
            allPerStatus: 2,
            deliveryPerStatus: 1,
            internalCreated: 3,
          ),
          'partial': false,
        };
      }
      throw StateError(name);
    });
    await viewport(tester, 390);
    await tester.pumpWidget(
      app(
        LiveDashboard(
          policy: policy(),
          onNavigate: (bucket, status) =>
              navigated = '$bucket:${status ?? 'all'}',
        ),
      ),
    );
    await tester.pumpAndSettle();
    final chip = find.textContaining('جديد').first;
    await tester.ensureVisible(chip);
    await tester.pumpAndSettle();
    await tester.tap(chip);
    await tester.pumpAndSettle();
    expect(navigated, 'all:created');
    expect(tester.takeException(), isNull);
  });

  for (final width in [320.0, 390.0, 768.0, 1440.0]) {
    testWidgets('cards stay responsive at ${width.toInt()} px', (tester) async {
      VelnixGateway.instance = VelnixGateway.forTesting((name, _) async {
        if (name == 'dashboardStats') {
          return {
            'counters': counters(
              allPerStatus: 1234,
              deliveryPerStatus: 567,
              internalCreated: 12,
            ),
            'partial': false,
          };
        }
        throw StateError(name);
      });
      await viewport(tester, width);
      await tester.pumpWidget(
        app(LiveDashboard(policy: policy(), onNavigate: (_, _) {})),
      );
      await tester.pumpAndSettle();
      expect(find.text('كل الطلبات'), findsOneWidget);
      expect(find.text('11106'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('amounts stay hidden without the viewAmounts permission', (
    tester,
  ) async {
    VelnixGateway.instance = VelnixGateway.forTesting((name, _) async {
      if (name == 'dashboardStats') {
        return {
          'counters': counters(
            allPerStatus: 2,
            deliveryPerStatus: 1,
            internalCreated: 3,
          ),
          'partial': false,
        };
      }
      throw StateError(name);
    });
    await viewport(tester, 390);
    await tester.pumpWidget(
      app(
        LiveDashboard(
          policy: policy(role: 'dataEntry'),
          onNavigate: (_, _) {},
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.textContaining('د.أ'), findsNothing);
    expect(find.text('18'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('applied bucket filter shows an indicator and can be cleared', (
    tester,
  ) async {
    final buckets = <String>[];
    VelnixGateway.instance = VelnixGateway.forTesting((name, data) async {
      if (name == 'listOrders') {
        buckets.add(data['bucket']?.toString() ?? '');
        return {'items': <Map<String, dynamic>>[]};
      }
      if (name == 'listCompanies' || name == 'listOrderCreators') {
        return {'items': <Map<String, dynamic>>[]};
      }
      throw StateError(name);
    });
    await viewport(tester, 390);
    await tester.pumpWidget(
      app(LiveOrders(policy: policy(), bucket: 'delivery')),
    );
    await tester.pumpAndSettle();
    expect(find.textContaining('الفلتر المطبق'), findsOneWidget);
    expect(find.textContaining('شركات التوصيل'), findsWidgets);
    expect(buckets.first, 'delivery');
    final clear = find.text('مسح الفلتر');
    await tester.ensureVisible(clear);
    await tester.pumpAndSettle();
    await tester.tap(clear);
    await tester.pumpAndSettle();
    expect(buckets.last, 'all');
    expect(find.textContaining('الفلتر المطبق'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('no filter indicator is shown for the default orders view', (
    tester,
  ) async {
    VelnixGateway.instance = VelnixGateway.forTesting((name, _) async {
      if (name == 'listOrders') return {'items': <Map<String, dynamic>>[]};
      if (name == 'listCompanies' || name == 'listOrderCreators') {
        return {'items': <Map<String, dynamic>>[]};
      }
      throw StateError(name);
    });
    await viewport(tester, 390);
    await tester.pumpWidget(app(LiveOrders(policy: policy())));
    await tester.pumpAndSettle();
    expect(find.textContaining('الفلتر المطبق'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('the applied filter survives refresh, paging and search', (
    tester,
  ) async {
    final calls = <Map<String, dynamic>>[];
    VelnixGateway.instance = VelnixGateway.forTesting((name, data) async {
      calls.add({...data, 'op': name});
      if (name == 'listOrders') {
        return {
          'items': <Map<String, dynamic>>[],
          'nextAfterId': 'next_${calls.length}',
        };
      }
      if (name == 'searchOrders') return {'items': <Map<String, dynamic>>[]};
      if (name == 'listCompanies' || name == 'listOrderCreators') {
        return {'items': <Map<String, dynamic>>[]};
      }
      throw StateError(name);
    });
    await viewport(tester, 390);
    await tester.pumpWidget(
      app(LiveOrders(policy: policy(), bucket: 'delivery')),
    );
    await tester.pumpAndSettle();
    expect(calls.first['op'], 'listOrders');
    expect(calls.first['bucket'], 'delivery');

    await tester.tap(find.byTooltip('تحديث القائمة'));
    await tester.pumpAndSettle();
    expect(calls.last['bucket'], 'delivery');

    final more = find.text('تحميل المزيد');
    await tester.ensureVisible(more);
    await tester.pumpAndSettle();
    await tester.tap(more);
    await tester.pumpAndSettle();
    expect(calls.last['bucket'], 'delivery');
    expect(calls.last['afterId'], isNotNull);

    await tester.enterText(find.byType(TextField).first, 'عميل');
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await tester.pumpAndSettle();
    expect(calls.last['op'], 'searchOrders');
    expect(calls.last['bucket'], 'delivery');
    expect(tester.takeException(), isNull);
  });
}
