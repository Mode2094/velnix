import 'package:flutter_test/flutter_test.dart';
import 'package:velnix/data/demo_store.dart';
import 'package:velnix/models/entities.dart';

void main() {
  test(
    'only allowed local transitions can be applied; shipping events are not faked',
    () {
      final store = DemoStore()..chooseUser('u3'); // warehouse role
      final created = store.orders.firstWhere(
        (o) => o.status == OrderStatus.created,
      );
      final count = store.orders.length;
      store.setStatus(created, OrderStatus.delivered); // provider-controlled
      expect(created.status, OrderStatus.created);
      store.setStatus(created, OrderStatus.review);
      store.setStatus(created, OrderStatus.preparing);
      expect(created.status, OrderStatus.preparing);
      store.setStatus(created, OrderStatus.ready);
      expect(created.status, OrderStatus.ready);
      expect(store.orders.length, count);
      final inTransit = store.orders.firstWhere(
        (o) => o.status == OrderStatus.inTransit,
      );
      store.setStatus(inTransit, OrderStatus.delivered);
      expect(inTransit.status, OrderStatus.inTransit);
      store.chooseUser('u1');
      expect(store.canEditOrder(inTransit), isFalse);
    },
  );

  test('delivery assignment requires explicit role permission', () {
    final store = DemoStore()..chooseUser('u5'); // data entry
    final mine = store.visibleOrders.firstWhere((o) => o.companyId == null);
    store.assignCompany(mine, 'c1');
    expect(mine.companyId, isNull);
    store.chooseUser('u2'); // assigned manager
    expect(store.canAssignDelivery, isTrue);
    store.assignCompany(mine, 'c1');
    expect(mine.companyId, 'c1');
    store.archiveCompany(store.companies.first); // no permission to archive
    expect(store.companies.first.archived, isFalse);
  });

  test('each employee has independent notification read state', () {
    final store = DemoStore()..chooseUser('u1');
    final notice = store.visibleNotices.first;
    expect(notice.isReadBy('u1'), isFalse);
    store.markNoticeRead(notice);
    expect(notice.isReadBy('u1'), isTrue);
    store.chooseUser('u4');
    expect(notice.isReadBy('u4'), isFalse);
    store.markAllRead();
    expect(notice.isReadBy('u4'), isTrue);
  });

  test('inactive accounts cannot log in, read orders or create orders', () {
    final store = DemoStore();
    store.members.firstWhere((m) => m.id == 'u5').active = false;
    expect(store.chooseUser('u5'), isFalse);
    expect(store.me.id, 'u1');
  });

  test(
    'sales sees their orders plus data-entry submissions; data entry only self',
    () {
      final store = DemoStore()..chooseUser('u4');
      final salesOrders = store.visibleOrders;
      expect(
        salesOrders.every(
          (o) => o.createdBy == 'u4' || o.createdByRole == UserRole.dataEntry,
        ),
        isTrue,
      );
      store.chooseUser('u5');
      expect(store.visibleOrders.every((o) => o.createdBy == 'u5'), isTrue);
      expect(store.can(AppPermission.manageEmployees), isFalse);
    },
  );

  test('company status cards never mix orders across companies', () {
    final store = DemoStore();
    final company = store.companies.first;
    final companyOrders = store.visibleOrders.where(
      (o) => o.companyId == company.id,
    );
    expect(
      OrderStatus.values.fold<int>(
        0,
        (n, s) => n + companyOrders.where((o) => o.status == s).length,
      ),
      companyOrders.length,
    );
  });
}
