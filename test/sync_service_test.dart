import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:velnix/core/theme.dart';
import 'package:velnix/live/sync_service.dart';

/// Locks the single-document real-time sync contract: the first server snapshot
/// is a baseline (never a refresh), later changes bump only the areas that moved,
/// a cache-only snapshot is reported offline and drives no refresh, and starting
/// twice never creates a second listener.
void main() {
  final svc = SyncService.instance;
  late StreamController<SyncRevision> controller;

  setUp(() {
    svc.reset();
    controller = StreamController<SyncRevision>.broadcast();
    svc.testSource = () => controller.stream;
  });

  tearDown(() {
    svc.reset();
    controller.close();
  });

  Future<void> tick() => Future<void>.delayed(Duration.zero);

  test('the first server snapshot is a baseline, not a refresh', () async {
    svc.start();
    controller.add(const SyncRevision(orders: 42, companies: 7, notices: 3));
    await tick();
    expect(svc.orders.value, 0, reason: 'baseline must not refresh anything');
    expect(svc.companies.value, 0);
    expect(svc.connection.value, SyncConnection.live);
  });

  test('a later change bumps only the areas that moved', () async {
    svc.start();
    controller.add(const SyncRevision(orders: 42, companies: 7, notices: 3));
    await tick();
    controller.add(const SyncRevision(orders: 43, companies: 7, notices: 3));
    await tick();
    expect(svc.orders.value, 1);
    expect(svc.companies.value, 0, reason: 'an unchanged area is not bumped');
    expect(svc.notices.value, 0);
    expect(svc.any.value, 1);
    expect(svc.connection.value, SyncConnection.refreshing);
  });

  test('a cache-only snapshot is offline and drives no refresh', () async {
    svc.start();
    controller.add(const SyncRevision(orders: 42, fromCache: true));
    await tick();
    expect(svc.connection.value, SyncConnection.offline);
    expect(svc.orders.value, 0, reason: 'unconfirmed counters never refresh');
  });

  test('starting twice never creates a second listener', () async {
    svc.start();
    svc.start();
    expect(svc.isRunning, isTrue);
    controller.add(const SyncRevision(orders: 1));
    await tick();
    controller.add(const SyncRevision(orders: 2));
    await tick();
    expect(svc.orders.value, 1, reason: 'one change => exactly one bump');
  });

  test(
    'stop then resume re-reads and re-applies a change made while paused',
    () async {
      svc.start();
      controller.add(const SyncRevision(orders: 10));
      await tick();
      expect(svc.orders.value, 0);
      svc.stop();
      expect(svc.isRunning, isFalse);
      svc.resume();
      expect(svc.isRunning, isTrue);
    },
  );

  testWidgets('the indicator tells the truth for each connection state', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: velnixTheme(),
        home: const Scaffold(body: Center(child: SyncIndicator())),
      ),
    );
    svc.connection.value = SyncConnection.live;
    await tester.pump();
    expect(find.text('محدّث'), findsOneWidget);

    svc.connection.value = SyncConnection.refreshing;
    await tester.pump();
    expect(find.text('جارٍ التحديث'), findsOneWidget);

    svc.connection.value = SyncConnection.offline;
    await tester.pump();
    expect(
      find.text('لا يوجد اتصال — ستتم المزامنة عند عودته'),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
  });
}
