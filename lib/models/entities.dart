import 'package:flutter/material.dart';

// These UI models intentionally remain independent of Firestore SDK.
enum UserRole { generalManager, manager, warehouse, sales, dataEntry }

extension UserRoleText on UserRole {
  String get label => switch (this) {
    UserRole.generalManager => 'مدير عام',
    UserRole.manager => 'مدير',
    UserRole.warehouse => 'موظف مستودع',
    UserRole.sales => 'مبيعات',
    UserRole.dataEntry => 'مدخل بيانات',
  };
}

enum AppPermission {
  viewAllOrders,
  editAllOrders,
  updateOrderStatus,
  sendToDelivery,
  viewReports,
  viewAmounts,
  manageEmployees,
  manageCompanies,
  viewSync,
  viewAudit,
  manageSettings,
}

extension PermissionText on AppPermission {
  String get label => switch (this) {
    AppPermission.viewAllOrders => 'مشاهدة جميع الطلبات',
    AppPermission.editAllOrders => 'تعديل جميع الطلبات',
    AppPermission.updateOrderStatus => 'تحديث حالة الطلب',
    AppPermission.sendToDelivery => 'إرسال الطلب لشركة التوصيل',
    AppPermission.viewReports => 'التقارير والإحصائيات الكاملة',
    AppPermission.viewAmounts => 'مشاهدة مبالغ الطلبات',
    AppPermission.manageEmployees => 'إدارة الموظفين والصلاحيات',
    AppPermission.manageCompanies => 'إدارة شركات التوصيل',
    AppPermission.viewSync => 'مراقبة المزامنة مع شركات التوصيل',
    AppPermission.viewAudit => 'سجل العمليات',
    AppPermission.manageSettings => 'إعدادات النظام',
  };
}

class TeamMember {
  TeamMember({
    required this.id,
    required this.name,
    required this.role,
    required this.email,
    this.phone = '',
    this.active = true,
    this.salesSupervisorId,
    Set<AppPermission>? permissions,
  }) : permissions = permissions ?? {};
  final String id;
  String name;
  UserRole role;
  String email;
  String phone;
  String?
  salesSupervisorId; // Assigned sales representative for data-entry members.
  bool active;
  Set<AppPermission> permissions;
}

enum OrderStatus {
  created,
  review,
  preparing,
  ready,
  dispatched,
  inTransit,
  delivered,
  returned,
  cancelled,
}

extension OrderStatusUI on OrderStatus {
  String get label => switch (this) {
    OrderStatus.created => 'جديد',
    OrderStatus.review => 'قيد المراجعة',
    OrderStatus.preparing => 'قيد التجهيز',
    OrderStatus.ready => 'جاهز للتسليم',
    OrderStatus.dispatched => 'تم الإرسال',
    OrderStatus.inTransit => 'قيد التوصيل',
    OrderStatus.delivered => 'تم التسليم',
    OrderStatus.returned => 'مرتجع',
    OrderStatus.cancelled => 'ملغي',
  };
  Color get color => switch (this) {
    OrderStatus.created => const Color(0xFF315FD9),
    OrderStatus.review => const Color(0xFF6946B0),
    OrderStatus.preparing => const Color(0xFF965B10),
    OrderStatus.ready => const Color(0xFF00756F),
    OrderStatus.dispatched => const Color(0xFF3C64B5),
    OrderStatus.inTransit => const Color(0xFF176391),
    OrderStatus.delivered => const Color(0xFF006D55),
    OrderStatus.returned => const Color(0xFF9F520E),
    OrderStatus.cancelled => const Color(0xFFB52B3F),
  };
  bool get isClosed =>
      this == OrderStatus.delivered ||
      this == OrderStatus.returned ||
      this == OrderStatus.cancelled;
}

class OrderEvent {
  OrderEvent({
    required this.title,
    required this.actor,
    required this.time,
    this.details = '',
  });
  final String title;
  final String actor;
  final DateTime time;
  final String details;
}

class OrderRecord {
  OrderRecord({
    required this.id,
    required this.customer,
    required this.phone,
    required this.city,
    required this.area,
    required this.address,
    required this.description,
    required this.quantity,
    required this.amount,
    required this.createdBy,
    required this.createdByName,
    required this.createdByRole,
    required this.createdAt,
    this.extraPhone = '',
    this.note = '',
    this.paymentMethod = 'عند الاستلام',
    this.companyId,
    this.trackingNumber,
    this.remoteStatus,
    this.status = OrderStatus.created,
    List<OrderEvent>? events,
  }) : events = events ?? [];
  final String id;
  String customer;
  String phone;
  String extraPhone;
  String city;
  String area;
  String address;
  String description;
  int quantity;
  double amount;
  String paymentMethod;
  String note;
  String? companyId;
  String? trackingNumber;
  String? remoteStatus;
  OrderStatus status;
  final String createdBy;
  final String createdByName;
  final UserRole createdByRole;
  final DateTime createdAt;
  final List<OrderEvent> events;
}

class DeliveryCompany {
  DeliveryCompany({
    required this.id,
    required this.name,
    required this.apiUrl,
    this.enabled = true,
    this.archived = false,
    this.connectionLabel = 'لم يتم الاختبار',
    Map<String, OrderStatus>? mappings,
  }) : mappings = mappings ?? {};
  final String id;
  String name;
  String apiUrl;
  bool enabled;
  bool archived;
  String connectionLabel; // Demo UI label only; never a real network test.
  Map<String, OrderStatus> mappings;
}

class AppNotice {
  AppNotice({
    required this.id,
    required this.title,
    required this.body,
    required this.time,
    this.icon = Icons.notifications_outlined,
    this.recipientIds,
  });
  final String id;
  final String title;
  final String body;
  final DateTime time;
  final Set<String> readBy = {};
  bool isReadBy(String userId) => readBy.contains(userId);
  final IconData icon;
  final Set<String>? recipientIds; // null only for system-wide notices
}

/// Split from the reference video: orders with a delivery-company assignment
/// and orders still managed internally. NOT a store/inventory module.
enum OrderBucket { all, delivery, internal }

extension OrderBucketLabel on OrderBucket {
  String get label => switch (this) {
    OrderBucket.all => 'كل الطلبات',
    OrderBucket.delivery => 'طلبات شركات التوصيل',
    OrderBucket.internal => 'الطلبات الداخلية',
  };
  bool matches(OrderRecord o) => switch (this) {
    OrderBucket.all => true,
    OrderBucket.delivery => o.companyId != null,
    OrderBucket.internal => o.companyId == null,
  };
}
