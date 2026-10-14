import 'package:flutter_test/flutter_test.dart';
import 'package:velnix/data/demo_store.dart';
import 'package:velnix/models/entities.dart';

void main() {
  test('all five roles exist, and each can create a new order', () {
    final store = DemoStore();
    expect(store.members.map((m) => m.role).toSet(), UserRole.values.toSet());
    for (final member in store.members) {
      store.chooseUser(member.id);
      final count = store.orders.length;
      store.addOrder(OrderRecord(
        id: 'TEST-${member.id}', customer: 'مستلم تجريبي', phone: '0790000000',
        city: 'عمّان', area: 'منطقة', address: 'شارع', description: 'طرد',
        quantity: 1, amount: 10, createdBy: member.id, createdByName: member.name,
        createdByRole: member.role, createdAt: DateTime.now(),
      ));
      expect(store.orders.length, count + 1, reason: member.role.label);
    }
  });

  test('role-scoped access does not show the same orders to everyone', () {
    final store = DemoStore();
    final allCount = store.visibleOrders.length;
    store.chooseUser('u4');
    final sales = store.visibleOrders;
    expect(sales, isNotEmpty);
    expect(sales.length, lessThan(allCount));
    expect(sales.every((o) => o.createdBy == store.me.id || o.createdByRole == UserRole.dataEntry), isTrue);
    store.chooseUser('u5');
    final dataEntry = store.visibleOrders;
    expect(dataEntry, isNotEmpty);
    expect(dataEntry.length, lessThan(sales.length));
    expect(dataEntry.every((o) => o.createdBy == 'u5'), isTrue);
    store.chooseUser('u3');
    expect(store.visibleOrders.length, allCount);
    expect(store.canUpdateStatus, isTrue);
    expect(store.can(AppPermission.manageCompanies), isFalse);
    expect(store.canSeeAmounts, isFalse);
    store.chooseUser('u2');
    expect(store.can(AppPermission.viewReports), isTrue);
    expect(store.can(AppPermission.manageEmployees), isFalse);
    store.chooseUser('u1');
    expect(store.can(AppPermission.manageEmployees), isTrue);
    expect(store.can(AppPermission.manageCompanies), isTrue);
  });

  test('delivery/internal buckets have disjoint counts and aggregate correctly', () {
    final store = DemoStore();
    expect(store.bucketCount(OrderBucket.delivery) + store.bucketCount(OrderBucket.internal), store.orders.length);
    for (final bucket in [OrderBucket.internal, OrderBucket.delivery]) {
      final sum = OrderStatus.values.fold(0, (int n, OrderStatus status) => n + store.bucketCount(bucket, status));
      expect(sum, store.bucketCount(bucket));
    }
    store.chooseUser('u5');
    expect(store.bucketCount(OrderBucket.delivery) + store.bucketCount(OrderBucket.internal), store.visibleOrders.length);
  });

  test('unauthorized role cannot update orders or manage delivery companies', () {
    final store = DemoStore()..chooseUser('u5');
    final existing = store.visibleOrders.first;
    final old = existing.status;
    store.setStatus(existing, OrderStatus.delivered);
    expect(existing.status, old);
    final n = store.companies.length;
    store.addCompany(DeliveryCompany(id: 'new-company', name: 'غير مصرح', apiUrl: 'https://example.com'));
    expect(store.companies.length, n);
    store.archiveCompany(store.companies.first);
    expect(store.companies.first.archived, isFalse);
  });

  test('status changes keep immutable order history and archived company references', () {
    final store = DemoStore();
    final count = store.orders.length;
    final order = store.orders.firstWhere((o) => !o.status.isClosed);
    store.setStatus(order, OrderStatus.cancelled);
    expect(store.orders.length, count);
    expect(order.status, OrderStatus.cancelled);
    expect(order.events.first.title, contains('ملغي'));
    final oldCompanyId = store.orders.firstWhere((o) => o.companyId != null).companyId;
    store.archiveCompany(store.companies.first);
    expect(store.companies.first.archived, isTrue);
    expect(store.orders.firstWhere((o) => o.companyId != null).companyId, oldCompanyId);
  });
}
