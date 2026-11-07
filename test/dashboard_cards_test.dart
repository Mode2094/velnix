import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:velnix/core/theme.dart';
import 'package:velnix/live/gateway.dart';
import 'package:velnix/live/live_app.dart';
import 'package:velnix/models/shipping_status.dart';

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

  testWidgets('dashboard renders four cards from a single stats call', (
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
    expect(find.text('جميع طلبات المتجر'), findsOneWidget);
    // The store card mirrors the reference: the full order book (18), including
    // orders routed to delivery companies.
    expect(find.text('18'), findsWidgets);
    expect(find.text('9'), findsOneWidget);
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
      'جميع طلبات المتجر': 'all:all',
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

  testWidgets('tapping an order card opens its bucket status grid', (
    tester,
  ) async {
    String? openedBucket;
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
          onNavigate: (_, _) {},
          onOpenBucket: (bucket) => openedBucket = bucket,
        ),
      ),
    );
    await tester.pumpAndSettle();
    for (final entry in {
      'كل الطلبات': 'all',
      'طلبات شركات التوصيل': 'delivery',
    }.entries) {
      final target = find.text(entry.key);
      await tester.ensureVisible(target);
      await tester.pumpAndSettle();
      await tester.tap(target);
      await tester.pumpAndSettle();
      expect(openedBucket, entry.value);
      openedBucket = null;
    }
    expect(tester.takeException(), isNull);
  });

  testWidgets('the bucket status grid opens orders with the composite filter', (
    tester,
  ) async {
    VelnixGateway.instance = VelnixGateway.forTesting((name, _) async {
      if (name == 'dashboardStats') {
        return {
          'counters': {
            for (final bucket in ['all', 'delivery', 'internal'])
              bucket: {
                for (final status in statusLabels.keys)
                  status: {
                    'count': status == 'dispatched' && bucket == 'delivery'
                        ? 4
                        : 1,
                    'amountMinor': 1000,
                  },
              },
            // The delivery bucket renders the carrier vocabulary, so a
            // shipping state (never an internal status) must be what shows.
            'shipping': {
              for (final s in ShippingStatus.values)
                s.name: {
                  'count': s == ShippingStatus.deferred ? 4 : 1,
                  'amountMinor': 1000,
                },
            },
            // Operational lifecycle of assigned orders, kept apart from the
            // carrier vocabulary: assignment is not sending.
            'operations': {
              'confirmed': {'count': 2, 'amountMinor': 1000},
              'unshipped': {'count': 3, 'amountMinor': 1000},
              'sending': {'count': 0, 'amountMinor': 0},
              'needs_review': {'count': 1, 'amountMinor': 1000},
            },
          },
          'partial': false,
        };
      }
      throw StateError(name);
    });
    String? opened;
    await viewport(tester, 390);
    await tester.pumpWidget(
      app(
        LiveBucketStatusGrid(
          policy: policy(),
          bucket: 'delivery',
          onOpenOrders: (bucket, state, facet) =>
              opened = '$bucket:$state:$facet',
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('طلبات شركات التوصيل'), findsWidgets);
    // Two clearly separated sections.
    expect(find.text('حالة الإرسال التشغيلية'), findsOneWidget);
    expect(find.text('حالات شركة التوصيل الفعلية'), findsOneWidget);
    // The operational group shows assigned-but-unsent orders.
    expect(find.text('غير مرسلة (بانتظار الإرسال)'), findsOneWidget);
    expect(find.text('تحتاج مراجعة'), findsOneWidget);
    // A carrier state label, not an internal status such as «تم الإرسال».
    expect(find.text('مؤجل'), findsOneWidget);
    expect(find.text('تم الإرسال'), findsNothing);
    // The grand total is the operational partition only (2+3+0+1 = 6), never
    // the carrier facet added on top.
    expect(find.text('الإجمالي: 6 طلب'), findsOneWidget);
    final deferredTile = find.text('مؤجل');
    await tester.ensureVisible(deferredTile);
    await tester.pumpAndSettle();
    await tester.tap(deferredTile);
    await tester.pumpAndSettle();
    expect(opened, 'delivery:deferred:shipping');
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
      expect(find.text('11106'), findsWidgets);
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
    expect(find.text('18'), findsWidgets);
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
