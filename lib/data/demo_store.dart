import 'package:flutter/material.dart';
import '../models/entities.dart';

/// In-memory demo state. Must be replaced by repositories and Firebase Auth,
/// Firestore, Cloud Functions in subsequent Open Code steps.
/// NEVER use UI role checks as a security boundary in production.
class DemoStore extends ChangeNotifier {
  final List<TeamMember> members = [
    TeamMember(
      id: 'u1',
      name: 'محمد أحمد',
      role: UserRole.generalManager,
      email: 'admin@velnix.app',
    ),
    TeamMember(
      id: 'u2',
      name: 'أحمد خالد',
      role: UserRole.manager,
      email: 'manager@velnix.app',
      permissions: {
        AppPermission.viewAllOrders,
        AppPermission.editAllOrders,
        AppPermission.updateOrderStatus,
        AppPermission.sendToDelivery,
        AppPermission.viewSync,
        AppPermission.viewReports,
        AppPermission.viewAmounts,
      },
    ),
    TeamMember(
      id: 'u3',
      name: 'سارة علي',
      role: UserRole.warehouse,
      email: 'warehouse@velnix.app',
    ),
    TeamMember(
      id: 'u4',
      name: 'عمر محمود',
      role: UserRole.sales,
      email: 'sales@velnix.app',
    ),
    TeamMember(
      id: 'u5',
      name: 'ليان يوسف',
      role: UserRole.dataEntry,
      email: 'data@velnix.app',
      salesSupervisorId: 'u4',
    ),
  ];
  final List<OrderRecord> orders = [];
  final List<DeliveryCompany> companies = [
    DeliveryCompany(
      id: 'c1',
      name: 'شركة التوصيل التجريبية',
      apiUrl: 'https://api.example-delivery.com',
      enabled: true,
      mappings: {
        'delivered': OrderStatus.delivered,
        'in_transit': OrderStatus.inTransit,
        'returned': OrderStatus.returned,
        'cancelled': OrderStatus.cancelled,
      },
    ),
  ];
  final List<AppNotice> notices = [];
  final List<OrderEvent> audit = [];
  String currentUserId = 'u1';
  DemoStore() {
    for (int i = 0; i < 48; i++) {
      final owner = members[[4, 3, 4, 0, 1, 4, 3, 4, 0, 1, 4, 3, 4][i % 13]];
      final statuses = OrderStatus.values;
      final order = OrderRecord(
        id: 'VLX-${(2401 + i)}',
        customer: [
          'نور أحمد',
          'خالد سالم',
          'رنا محمود',
          'ياسر عادل',
          'مريم حسن',
          'رامي شادي',
          'دينا حمد',
          'علي ناصر',
          'هبة زياد',
          'ليث سامر',
          'سما يوسف',
          'آدم طارق',
          'لمى إياد',
        ][i % 13],
        phone: '079${(1234567 + i * 15931).toString().padLeft(7, '0')}',
        city: ['عمّان', 'الزرقاء', 'إربد'][i % 3],
        area: ['الجبيهة', 'المدينة', 'شارع الجامعة', 'عبدون'][i % 4],
        address: 'شارع ${i + 5}، بناية ${i + 2}',
        description: [
          'طرد ملابس',
          'إكسسوارات',
          'طلب إلكترونيات',
          'مستلزمات منزلية',
        ][i % 4],
        quantity: (i % 3) + 1,
        amount: (18 + i * 4).toDouble(),
        createdBy: owner.id,
        createdByName: owner.name,
        createdByRole: owner.role,
        createdAt: DateTime.now().subtract(Duration(hours: 5 * i + 1)),
        companyId: i % 4 == 0 ? null : 'c1',
        trackingNumber: i % 3 == 0 ? null : 'DEMO-${1000 + i}',
        status: statuses[(i * 5) % statuses.length],
      );
      order.events.add(
        OrderEvent(
          title: 'إنشاء الطلب',
          actor: owner.name,
          time: order.createdAt,
        ),
      );
      orders.add(order);
    }
    notices.addAll([
      AppNotice(
        id: 'n1',
        title: 'طلب جديد',
        body: 'تم إنشاء طلب جديد من مدخل البيانات',
        time: DateTime.now().subtract(const Duration(minutes: 8)),
        recipientIds: {'u1', 'u2', 'u3', 'u4', 'u5'},
      ),
      AppNotice(
        id: 'n2',
        title: 'تحديث حالة شحنة',
        body: 'مثال توضيحي لتحديث حالة بواسطة شركة التوصيل',
        time: DateTime.now().subtract(const Duration(hours: 1)),
        icon: Icons.local_shipping_outlined,
        recipientIds: {'u1', 'u2', 'u3'},
      ),
      AppNotice(
        id: 'n3',
        title: 'مراجعة طلب',
        body: 'يوجد طلب بانتظار المراجعة',
        time: DateTime.now().subtract(const Duration(hours: 3)),
        icon: Icons.inventory_2_outlined,
        recipientIds: {'u1', 'u2', 'u3'},
      ),
    ]);
  }
  TeamMember get me => members.firstWhere((e) => e.id == currentUserId);
  bool can(AppPermission p) =>
      me.active &&
      (me.role == UserRole.generalManager || me.permissions.contains(p));
  bool get canCreateOrder => me.active;
  bool get canAssignDelivery => can(AppPermission.sendToDelivery);
  List<AppNotice> get visibleNotices => !me.active
      ? <AppNotice>[]
      : notices
            .where(
              (n) => n.recipientIds == null || n.recipientIds!.contains(me.id),
            )
            .toList();
  bool canAdministerMember(TeamMember member) =>
      can(AppPermission.manageEmployees) &&
      (me.role == UserRole.generalManager ||
          (member.role != UserRole.generalManager &&
              member.role != UserRole.manager &&
              member.id != me.id));
  bool canGrantRole(UserRole role) =>
      me.role == UserRole.generalManager ||
      (can(AppPermission.manageEmployees) &&
          role != UserRole.generalManager &&
          role != UserRole.manager &&
          (!{UserRole.sales, UserRole.warehouse}.contains(role) ||
              me.role == UserRole.warehouse ||
              can(AppPermission.viewAllOrders)) &&
          (role != UserRole.warehouse ||
              me.role == UserRole.warehouse ||
              can(AppPermission.updateOrderStatus)));
  bool canGrantPermissions(Set<AppPermission> requested) =>
      me.role == UserRole.generalManager ||
      (can(AppPermission.manageEmployees) && requested.every(can));

  /// Delivery-provider events will use an authenticated Cloud Function in production.
  /// These transitions are LOCAL user actions, never impersonated API statuses.
  List<OrderStatus> allowedManualTargets(OrderRecord o) {
    if (!me.active ||
        !canViewOrder(o) ||
        !canUpdateStatus ||
        o.status.isClosed) {
      return [];
    }
    return switch (o.status) {
      OrderStatus.created => [OrderStatus.review, OrderStatus.cancelled],
      OrderStatus.review => [OrderStatus.preparing, OrderStatus.cancelled],
      OrderStatus.preparing => [OrderStatus.ready, OrderStatus.cancelled],
      OrderStatus.ready => [OrderStatus.cancelled],
      // Carrier-controlled shipping states may never be overridden locally.
      OrderStatus.dispatched => [],
      OrderStatus.inTransit => [],
      OrderStatus.delivered ||
      OrderStatus.returned ||
      OrderStatus.cancelled => [],
    };
  }

  bool canViewOrder(OrderRecord o) {
    if (!me.active) return false;
    if (me.role == UserRole.generalManager ||
        can(AppPermission.viewAllOrders)) {
      return true;
    }
    if (me.role == UserRole.warehouse) return true;
    if (me.role == UserRole.sales) {
      return o.createdBy == me.id ||
          members.any(
            (m) =>
                m.id == o.createdBy &&
                m.role == UserRole.dataEntry &&
                m.salesSupervisorId == me.id,
          );
    }
    return o.createdBy == me.id;
  }

  bool canEditOrder(OrderRecord o) =>
      me.active &&
      canViewOrder(o) &&
      {
        OrderStatus.created,
        OrderStatus.review,
        OrderStatus.preparing,
        OrderStatus.ready,
      }.contains(o.status) &&
      (can(AppPermission.editAllOrders) ||
          (o.createdBy == me.id &&
              {OrderStatus.created, OrderStatus.review}.contains(o.status)));
  bool get canUpdateStatus =>
      me.active &&
      (me.role == UserRole.generalManager ||
          me.role == UserRole.warehouse ||
          can(AppPermission.updateOrderStatus));
  List<OrderRecord> get visibleOrders =>
      orders.where(canViewOrder).toList()
        ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
  List<OrderRecord> bucketOrders(OrderBucket bucket) =>
      visibleOrders.where(bucket.matches).toList();
  int count(OrderStatus status) =>
      visibleOrders.where((o) => o.status == status).length;
  int bucketCount(OrderBucket bucket, [OrderStatus? status]) => bucketOrders(
    bucket,
  ).where((o) => status == null || o.status == status).length;
  double bucketAmount(OrderBucket bucket, [OrderStatus? status]) =>
      bucketOrders(bucket)
          .where((o) => status == null || o.status == status)
          .fold(0, (double total, OrderRecord o) => total + o.amount);
  bool isOverdue(OrderRecord o) =>
      !o.status.isClosed &&
      DateTime.now().difference(o.createdAt).inHours >= 36;
  List<OrderRecord> get overdueOrders =>
      visibleOrders.where(isOverdue).toList();
  bool get canSeeAmounts => can(AppPermission.viewAmounts);
  bool canSeeAmount(OrderRecord order) =>
      me.active && (canSeeAmounts || order.createdBy == me.id);
  bool get canSeeDeliveryDashboard =>
      me.role != UserRole.dataEntry ||
      bucketOrders(OrderBucket.delivery).isNotEmpty;

  bool chooseUser(String id) {
    if (!members.any((m) => m.id == id && m.active)) return false;
    currentUserId = id;
    notifyListeners();
    return true;
  }

  bool isValidCompany(String? companyId) =>
      companyId == null ||
      companies.any((c) => c.id == companyId && c.enabled && !c.archived);
  bool addOrder(OrderRecord order) {
    if (order.quantity < 1 ||
        order.quantity > 10000 ||
        !order.amount.isFinite ||
        order.amount < 0 ||
        order.amount > 1000000 ||
        !canCreateOrder ||
        order.createdBy != me.id ||
        orders.any((o) => o.id == order.id)) {
      return false;
    }
    if (!isValidCompany(order.companyId) ||
        (order.companyId != null && !canAssignDelivery)) {
      return false;
    }
    orders.insert(0, order);
    _record('إنشاء الطلب ${order.id}');
    _notifyForOrder(order, 'طلب جديد', 'تم تسجيل الطلب ${order.id}');
    return true;
  }

  /// Atomic demo update: authorization is checked BEFORE any order field changes.
  bool updateOrder(
    OrderRecord order, {
    required String customer,
    required String phone,
    required String extraPhone,
    required String city,
    required String area,
    required String address,
    required String description,
    required int quantity,
    required double amount,
    required String note,
    required String paymentMethod,
    required String? companyId,
  }) {
    if (!canEditOrder(order) ||
        quantity <= 0 ||
        quantity > 10000 ||
        !amount.isFinite ||
        amount < 0 ||
        amount > 1000000) {
      return false;
    }
    if (!isValidCompany(companyId) && companyId != order.companyId) {
      return false;
    }
    if (companyId != order.companyId && !canAssignDelivery) return false;
    order.customer = customer;
    order.phone = phone;
    order.extraPhone = extraPhone;
    order.city = city;
    order.area = area;
    order.address = address;
    order.description = description;
    order.quantity = quantity;
    if (canSeeAmount(order)) order.amount = amount;
    order.note = note;
    order.paymentMethod = paymentMethod;
    if (canAssignDelivery) order.companyId = companyId;
    order.events.insert(
      0,
      OrderEvent(
        title: 'تعديل بيانات الطلب',
        actor: me.name,
        time: DateTime.now(),
      ),
    );
    _record('تعديل ${order.id}');
    return true;
  }

  void setStatus(OrderRecord order, OrderStatus newStatus) {
    if (!allowedManualTargets(order).contains(newStatus)) return;
    order.status = newStatus;
    order.events.insert(
      0,
      OrderEvent(
        title: 'الحالة: ${newStatus.label}',
        actor: me.name,
        time: DateTime.now(),
      ),
    );
    _record('تغيير حالة ${order.id} إلى ${newStatus.label}');
    _notifyForOrder(
      order,
      'تغيرت حالة طلب',
      'الطلب ${order.id}: ${newStatus.label}',
    );
  }

  void assignCompany(OrderRecord order, String? companyId) {
    if (!canAssignDelivery ||
        !canViewOrder(order) ||
        order.status.isClosed ||
        order.status == OrderStatus.dispatched ||
        order.status == OrderStatus.inTransit) {
      return;
    }
    if (!isValidCompany(companyId)) return;
    order.companyId = companyId;
    order.events.insert(
      0,
      OrderEvent(
        title: 'اختيار شركة توصيل',
        actor: me.name,
        time: DateTime.now(),
        details: 'لم يتم الإرسال عبر API - وضع العرض',
      ),
    );
    _record('تحديد شركة التوصيل للطلب ${order.id}');
  }

  bool addCompany(DeliveryCompany company) {
    final url = Uri.tryParse(company.apiUrl);
    if (!can(AppPermission.manageCompanies) ||
        company.name.trim().isEmpty ||
        url == null ||
        url.scheme != 'https' ||
        url.host.isEmpty ||
        companies.any((c) => c.id == company.id)) {
      return false;
    }
    companies.add(company);
    _record('إضافة شركة توصيل ${company.name}');
    return true;
  }

  bool updateCompany(
    DeliveryCompany company, {
    required String name,
    required String apiUrl,
    required bool enabled,
    required Map<String, OrderStatus> mappings,
  }) {
    final url = Uri.tryParse(apiUrl);
    if (!can(AppPermission.manageCompanies) ||
        company.archived ||
        !companies.contains(company) ||
        name.trim().isEmpty ||
        url == null ||
        url.scheme != 'https' ||
        url.host.isEmpty) {
      return false;
    }
    company.name = name.trim();
    company.apiUrl = apiUrl;
    company.enabled = enabled;
    company.mappings = Map.of(mappings);
    _record('تعديل إعدادات شركة توصيل ${company.name}');
    return true;
  }

  void archiveCompany(DeliveryCompany c) {
    if (!can(AppPermission.manageCompanies)) return;
    c.archived = true;
    c.enabled = false;
    _record('أرشفة شركة توصيل ${c.name} مع الحفاظ على الطلبات المرتبطة');
  }

  bool validSalesSupervisor(UserRole role, String? salesId) =>
      role != UserRole.dataEntry
      ? salesId == null
      : salesId == null ||
            members.any(
              (m) => m.id == salesId && m.role == UserRole.sales && m.active,
            );
  bool addMember(TeamMember member) {
    if (!validSalesSupervisor(member.role, member.salesSupervisorId) ||
        !can(AppPermission.manageEmployees) ||
        !canGrantRole(member.role) ||
        !canGrantPermissions(member.permissions) ||
        member.name.trim().isEmpty ||
        members.any(
          (m) =>
              m.id == member.id ||
              m.email.toLowerCase() == member.email.toLowerCase(),
        )) {
      return false;
    }
    members.add(member);
    _record('إضافة موظف ${member.name}');
    return true;
  }

  /// Do not mutate a TeamMember in the widget BEFORE authorization.
  bool updateMember(
    TeamMember member, {
    required String name,
    required String email,
    required String phone,
    required UserRole role,
    required bool active,
    required Set<AppPermission> permissions,
    required String? salesSupervisorId,
  }) {
    if (!validSalesSupervisor(role, salesSupervisorId) ||
        !canAdministerMember(member) ||
        !canGrantRole(role) ||
        !canGrantPermissions(permissions) ||
        name.trim().isEmpty ||
        members.any(
          (m) =>
              m.id != member.id && m.email.toLowerCase() == email.toLowerCase(),
        )) {
      return false;
    }
    // The sole active general-manager account cannot be disabled/demoted.
    if (member.role == UserRole.generalManager &&
        (!active || role != UserRole.generalManager) &&
        members
                .where((m) => m.role == UserRole.generalManager && m.active)
                .length <=
            1) {
      return false;
    }
    member.name = name.trim();
    member.email = email.trim();
    member.phone = phone.trim();
    member.role = role;
    member.active = active;
    member.permissions = Set.of(permissions);
    member.salesSupervisorId = salesSupervisorId;
    _record('تعديل بيانات أو صلاحيات موظف ${member.name}');
    return true;
  }

  void markNoticeRead(AppNotice item) {
    if (!visibleNotices.contains(item)) return;
    item.readBy.add(me.id);
    notifyListeners();
  }

  void markAllRead() {
    for (final n in visibleNotices) {
      n.readBy.add(me.id);
    }
    notifyListeners();
  }

  void _notifyForOrder(OrderRecord o, String title, String body) {
    final targets = <String>{
      o.createdBy,
      ...members
          .where(
            (m) =>
                m.role == UserRole.generalManager || m.role == UserRole.manager,
          )
          .map((m) => m.id),
    };
    if (o.status == OrderStatus.preparing ||
        o.status == OrderStatus.ready ||
        o.status == OrderStatus.dispatched) {
      targets.addAll(
        members.where((m) => m.role == UserRole.warehouse).map((m) => m.id),
      );
    }
    notices.insert(
      0,
      AppNotice(
        id: 'n${DateTime.now().microsecondsSinceEpoch}',
        title: title,
        body: body,
        time: DateTime.now(),
        recipientIds: targets,
      ),
    );
    notifyListeners();
  }

  void _record(String title) {
    audit.insert(
      0,
      OrderEvent(title: title, actor: me.name, time: DateTime.now()),
    );
    notifyListeners();
  }
}

class StoreScope extends InheritedNotifier<DemoStore> {
  const StoreScope({super.key, required DemoStore store, required super.child})
    : super(notifier: store);
  static DemoStore of(BuildContext context) {
    final result = context.dependOnInheritedWidgetOfExactType<StoreScope>();
    assert(result != null, 'StoreScope missing');
    return result!.notifier!;
  }
}
