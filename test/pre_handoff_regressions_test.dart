import 'package:flutter_test/flutter_test.dart';
import 'package:velnix/data/demo_store.dart';
import 'package:velnix/models/entities.dart';

void main() {
  test(
    'delivery dashboard is a subset of ALL orders, not the internal-only bucket',
    () {
      final store = DemoStore();
      expect(store.bucketCount(OrderBucket.all), store.orders.length);
      expect(
        store.bucketCount(OrderBucket.delivery),
        lessThan(store.bucketCount(OrderBucket.all)),
      );
      expect(
        store.bucketCount(OrderBucket.internal) +
            store.bucketCount(OrderBucket.delivery),
        store.bucketCount(OrderBucket.all),
      );
      for (final bucket in [OrderBucket.all, OrderBucket.delivery]) {
        final sum = OrderStatus.values.fold<int>(
          0,
          (n, s) => n + store.bucketCount(bucket, s),
        );
        expect(sum, store.bucketCount(bucket));
      }
    },
  );

  test('a manager without financial permission cannot see amounts', () {
    final store = DemoStore()..chooseUser('u2');
    expect(store.canSeeAmounts, isTrue);
    store.me.permissions.remove(AppPermission.viewAmounts);
    expect(store.canSeeAmounts, isFalse);
  });

  test('invalid or disabled courier assignment is rejected at store layer', () {
    final store = DemoStore();
    final order = store.orders.firstWhere(
      (o) => o.companyId == null && !o.status.isClosed,
    );
    store.assignCompany(order, 'not-a-company');
    expect(order.companyId, isNull);
    final company = store.companies.first;
    company.enabled = false;
    store.assignCompany(order, company.id);
    expect(order.companyId, isNull);
    final count = store.orders.length;
    final owner = store.me;
    expect(
      store.addOrder(
        OrderRecord(
          id: 'test-invalid-courier',
          customer: 'عميل',
          phone: '0799999999',
          city: 'عمان',
          area: 'وسط البلد',
          address: 'عنوان',
          description: 'طرد',
          quantity: 1,
          amount: 10,
          createdBy: owner.id,
          createdByName: owner.name,
          createdByRole: owner.role,
          createdAt: DateTime.now(),
          companyId: company.id,
        ),
      ),
      isFalse,
    );
    expect(store.orders.length, count);
  });

  test('unauthorized update cannot mutate any order fields', () {
    final store = DemoStore()..chooseUser('u5');
    final order = store.orders.firstWhere((o) => o.createdBy != 'u5');
    final previousCustomer = order.customer;
    final previousEvents = order.events.length;
    final ok = store.updateOrder(
      order,
      customer: 'مستلم مختلف',
      phone: '0799999999',
      extraPhone: '',
      city: 'عمان',
      area: 'جديد',
      address: 'موقع آخر',
      description: 'طرد مختلف',
      quantity: 1,
      amount: 100,
      note: '',
      paymentMethod: 'عند الاستلام',
      companyId: order.companyId,
    );
    expect(ok, isFalse);
    expect(order.customer, previousCustomer);
    expect(order.events.length, previousEvents);
  });

  test(
    'manager granted team management cannot grant beyond own privileges',
    () {
      final store = DemoStore();
      final manager = store.members.firstWhere((m) => m.id == 'u2');
      manager.permissions.add(AppPermission.manageEmployees);
      store.chooseUser('u2');
      expect(store.canGrantRole(UserRole.generalManager), isFalse);
      expect(store.canGrantRole(UserRole.manager), isFalse);
      expect(
        store.canGrantPermissions({AppPermission.manageCompanies}),
        isFalse,
      );
      final original = store.members.firstWhere((m) => m.id == 'u5');
      final oldRole = original.role;
      final updated = store.updateMember(
        original,
        name: original.name,
        email: original.email,
        phone: original.phone,
        role: UserRole.generalManager,
        active: true,
        permissions: {},
        salesSupervisorId: original.salesSupervisorId,
      );
      expect(updated, isFalse);
      expect(original.role, oldRole);
    },
  );

  test(
    'sales sees assigned data-entry team, not every data entry employee',
    () {
      final store = DemoStore()..chooseUser('u1');
      expect(
        store.addMember(
          TeamMember(
            id: 'u6',
            name: 'مدخل مستقل',
            role: UserRole.dataEntry,
            email: 'other@velnix.test',
          ),
        ),
        isTrue,
      );
      store.chooseUser('u6');
      final me = store.me;
      final newOrder = OrderRecord(
        id: 'EXTERNAL-TEAM-ORDER',
        customer: 'طلب مستقل',
        phone: '0798888888',
        city: 'عمان',
        area: 'وسط',
        address: 'عمارة',
        description: 'طرد',
        quantity: 1,
        amount: 10,
        createdBy: me.id,
        createdByName: me.name,
        createdByRole: me.role,
        createdAt: DateTime.now(),
      );
      expect(store.addOrder(newOrder), isTrue);
      store.chooseUser('u4');
      expect(store.canViewOrder(newOrder), isFalse);
    },
  );

  test('cannot deactivate the last active general manager', () {
    final store = DemoStore();
    final gm = store.members.firstWhere((m) => m.id == 'u1');
    final ok = store.updateMember(
      gm,
      name: gm.name,
      email: gm.email,
      phone: gm.phone,
      role: gm.role,
      active: false,
      permissions: gm.permissions,
      salesSupervisorId: null,
    );
    expect(ok, isFalse);
    expect(gm.active, isTrue);
  });

  test('carrier-controlled in-transit orders have no manual cancel path', () {
    final store = DemoStore();
    final inTransit = store.orders.firstWhere(
      (o) => o.status == OrderStatus.inTransit,
    );
    expect(store.allowedManualTargets(inTransit), isEmpty);
    store.setStatus(inTransit, OrderStatus.cancelled);
    expect(inTransit.status, OrderStatus.inTransit);
  });

  test('inactive current user gets no orders or notices', () {
    final store = DemoStore()..chooseUser('u5');
    store.me.active = false;
    expect(store.visibleOrders, isEmpty);
    expect(store.visibleNotices, isEmpty);
    expect(store.canCreateOrder, isFalse);
  });
}
