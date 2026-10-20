import 'dart:convert';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';

/// All privileged reads and writes go through authenticated callable functions.
/// Firestore client rules reject orders/companies/audit access by design.
class VelnixGateway {
  VelnixGateway._();
  VelnixGateway.forTesting(this.testCall);
  Future<Map<String, dynamic>> Function(String, Map<String, dynamic>)? testCall;
  static VelnixGateway instance = VelnixGateway._();
  FirebaseFunctions get functions =>
      FirebaseFunctions.instanceFor(region: 'europe-west1');
  FirebaseAuth get auth => FirebaseAuth.instance;
  final Map<String, _GatewayCacheEntry> _cache = {};
  final Map<String, Future<dynamic>> _inflight = {};
  Duration cacheTtl = const Duration(seconds: 15);
  String get _scope =>
      testCall != null ? 'test' : (auth.currentUser?.uid ?? 'anon');
  Future<T> _cached<T>(String key, Future<T> Function() load, {Duration? ttl}) {
    if (testCall != null) return load();
    final full = '$_scope:$key';
    final hit = _cache[full];
    final now = DateTime.now();
    if (hit != null && now.difference(hit.createdAt) < (ttl ?? cacheTtl)) {
      return Future.value(hit.value as T);
    }
    final pending = _inflight[full];
    if (pending != null) return pending.then((value) => value as T);
    final future = load();
    _inflight[full] = future;
    return future
        .then((value) {
          _cache[full] = _GatewayCacheEntry(now, value);
          return value;
        })
        .whenComplete(() => _inflight.remove(full));
  }

  /// Drops cached directory/dashboard values after a mutation or permission
  /// change. Authentication and policy data are never cached.
  void invalidate(String key) {
    _cache.removeWhere((k, _) => k.contains(':$key'));
  }

  void clearCache() {
    _cache.clear();
    _inflight.clear();
  }

  Future<Map<String, dynamic>> call(
    String name, [
    Map<String, dynamic> data = const {},
  ]) async {
    if (testCall != null) return testCall!(name, data);
    const pageCacheable = {'listCompanies', 'listMembers', 'listOrderCreators'};
    final firstPage = (data['query'] ?? '') == '' && data['afterId'] == null;
    if (pageCacheable.contains(name) && firstPage) {
      return _cached(
        'page:$name:${data['pageSize'] ?? ''}',
        () => _callRaw(name, data),
        ttl: const Duration(seconds: 30),
      );
    }
    return _callRaw(name, data);
  }

  Future<Map<String, dynamic>> _callRaw(
    String name,
    Map<String, dynamic> data,
  ) async {
    try {
      final result = await functions.httpsCallable(name).call(data);
      return Map<String, dynamic>.from(result.data as Map);
    } on FirebaseFunctionsException catch (e) {
      throw VelnixException(
        callableErrorMessage(e.code, e.message),
        code: e.code,
      );
    } on FirebaseAuthException catch (e) {
      throw VelnixException(authErrorMessage(e.code));
    }
  }

  Future<Map<String, dynamic>> me() => call('me');
  Future<Map<String, dynamic>> orders({
    String? afterId,
    int pageSize = 30,
    String? status,
    String bucket = 'all',
    String? companyId,
    Map<String, dynamic> filters = const {},
    String sort = 'desc',
  }) => call('listOrders', {
    ...filters,
    'sort': sort,
    'pageSize': pageSize,
    'bucket': bucket,
    'status': ?status,
    'afterId': ?afterId,
    'companyId': ?companyId,
  });
  Future<Map<String, dynamic>> searchOrders(
    String query, {
    String? status,
    String bucket = 'all',
    String? companyId,
    Map<String, dynamic> filters = const {},
  }) => call('searchOrders', {
    ...filters,
    'query': query,
    'bucket': bucket,
    'status': ?status,
    'companyId': ?companyId,
  });
  Future<Map<String, dynamic>> dashboard([
    Map<String, dynamic> filters = const {},
  ]) {
    final keys =
        filters.entries
            .where((e) => e.value != null && e.value.toString().isNotEmpty)
            .toList()
          ..sort((a, b) => a.key.compareTo(b.key));
    return _cached(
      'dashboard:${jsonEncode({for (final e in keys) e.key: e.value})}',
      () => call('dashboardStats', filters),
      ttl: const Duration(seconds: 30),
    );
  }

  Future<Map<String, dynamic>> order(
    String id, {
    String? eventsAfterId,
    int eventsPageSize = 8,
  }) => call('getOrder', {
    'id': id,
    'eventsPageSize': eventsPageSize,
    'eventsAfterId': ?eventsAfterId,
  });
  Future<Map<String, dynamic>> createOrder(Map<String, dynamic> order) async {
    final result = await call('createOrder', order);
    _invalidateOrderData();
    return result;
  }

  Future<void> updateOrder(String id, Map<String, dynamic> fields) async {
    await call('updateOrder', {'id': id, ...fields});
    _invalidateOrderData();
  }

  Future<void> updateStatus(String id, String status) async {
    await call('changeOrderStatus', {'id': id, 'status': status});
    _invalidateOrderData();
  }

  Future<void> assignCompany(String id, String? companyId) async {
    await call('assignCompany', {'id': id, 'companyId': companyId});
    _invalidateOrderData();
  }

  Future<void> dispatch(String id) async {
    await call('sendOrderToDelivery', {'id': id});
    _invalidateOrderData();
  }

  void _invalidateOrderData() {
    invalidate('dashboard');
    invalidate('companyStats');
  }

  Future<void> resolveDispatchException(
    String id, {
    required String outcome,
    required String reason,
    String? trackingNumber,
  }) async {
    await call('resolveDispatchException', {
      'id': id,
      'outcome': outcome,
      'reason': reason,
      'trackingNumber': ?trackingNumber,
    });
    _invalidateOrderData();
  }

  Future<void> reconcileClickShipment(
    String id, {
    required String clickOrderId,
    required String clickOrderRef,
    String? clickClientSerial,
    required String shippingStatus,
    required String reason,
  }) async {
    await call('reconcileClickShipment', {
      'id': id,
      'clickOrderId': clickOrderId,
      'clickOrderRef': clickOrderRef,
      'clickClientSerial': ?clickClientSerial,
      'shippingStatus': shippingStatus,
      'reason': reason,
    });
    _invalidateOrderData();
  }

  Future<Map<String, dynamic>> syncClickOrder(String id) async {
    final result = await call('syncClickOrder', {'id': id});
    _invalidateOrderData();
    return result;
  }

  Future<Map<String, dynamic>> companyStats(String id) =>
      _cached('companyStats:$id', () => call('companyStats', {'id': id}));
  Future<List<Map<String, dynamic>>> companies() async =>
      directoryItems('listCompanies');
  Future<void> saveCompany(Map<String, dynamic> company) async {
    await call('saveCompany', company);
    invalidate('listCompanies');
    invalidate('companyStats');
  }

  Future<void> archiveCompany(String id) async {
    await call('archiveCompany', {'id': id});
    invalidate('listCompanies');
    invalidate('companyStats');
  }

  Future<void> restoreCompany(String id) async {
    await call('restoreCompany', {'id': id});
    invalidate('listCompanies');
    invalidate('companyStats');
  }

  Future<Map<String, dynamic>> testCompany(String id) async {
    final result = await call('testCompanyConnection', {'id': id});
    invalidate('listCompanies');
    return result;
  }

  Future<List<Map<String, dynamic>>> members() async =>
      directoryItems('listMembers');
  Future<void> saveMember(Map<String, dynamic> member) async {
    await call('saveMember', member);
    invalidate('listMembers');
    invalidate('listOrderCreators');
    invalidate('dashboard');
  }

  Future<Map<String, dynamic>> createEmployee(
    Map<String, dynamic> member,
  ) async {
    final result = await call('createEmployee', member);
    invalidate('listMembers');
    invalidate('listOrderCreators');
    invalidate('dashboard');
    return result;
  }

  Future<void> resetEmployeePassword(String id, String password) async {
    await call('resetEmployeePassword', {'id': id, 'password': password});
  }

  Future<List<Map<String, dynamic>>> notices() async =>
      listResult(await call('listNotices'));

  /// One page of notices. `afterId` is the cursor from the previous page; the
  /// server validates that it belongs to the caller.
  Future<({List<Map<String, dynamic>> items, bool more, String? afterId})>
  noticePage({String? afterId, int pageSize = 50}) async {
    final page = await call('listNotices', {
      'pageSize': pageSize,
      'afterId': ?afterId,
    });
    return (
      items: listResult(page),
      more: page['more'] == true,
      afterId: page['afterId'] as String?,
    );
  }

  Future<void> markNoticeRead(String id) async {
    await call('markNoticeRead', {'id': id});
  }

  Future<({List<Map<String, dynamic>> items, bool limited})>
  syncEventsPage() async {
    final page = await call('listSyncEvents');
    return (items: listResult(page), limited: page['limited'] == true);
  }

  Future<List<Map<String, dynamic>>> audit() async =>
      listResult(await call('listAudit'));

  /// One page of the audit log. `afterId` is the cursor from the previous page.
  Future<({List<Map<String, dynamic>> items, bool more, String? afterId})>
  auditPage({String? afterId, int pageSize = 50}) async {
    final page = await call('listAudit', {
      'pageSize': pageSize,
      'afterId': ?afterId,
    });
    return (
      items: listResult(page),
      more: page['more'] == true,
      afterId: page['afterId'] as String?,
    );
  }

  Future<List<Map<String, dynamic>>> directoryItems(String endpoint) async {
    const cacheable = {'listCompanies', 'listMembers', 'listOrderCreators'};
    if (!cacheable.contains(endpoint)) return _loadDirectory(endpoint);
    return _cached(
      'dir:$endpoint',
      () => _loadDirectory(endpoint),
      ttl: const Duration(seconds: 30),
    );
  }

  Future<List<Map<String, dynamic>>> _loadDirectory(String endpoint) async {
    final items = <Map<String, dynamic>>[];
    final seen = <String>{};
    String? cursor;
    do {
      final page = await call(endpoint, {'pageSize': 100, 'afterId': ?cursor});
      items.addAll(listResult(page));
      if (page['more'] != true) return items;
      final next = page['afterId'] as String?;
      if (next == null || !seen.add(next)) {
        throw VelnixException('تعذر متابعة القائمة؛ حدّثها');
      }
      cursor = next;
    } while (true);
  }

  List<Map<String, dynamic>> listResult(Map<String, dynamic> result) =>
      (result['items'] as List? ?? [])
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();
}

class VelnixException implements Exception {
  VelnixException(this.message, {this.code});
  final String message;
  final String? code;
  @override
  String toString() => message;
}

/// Transport failures can surface as SDK `internal [0]`, not `unavailable`.
/// Keep raw transport diagnostics out of UI while retaining business denials.
class _GatewayCacheEntry {
  const _GatewayCacheEntry(this.createdAt, this.value);
  final DateTime createdAt;
  final Object? value;
}

String callableErrorMessage(
  String code,
  String? serverMessage,
) => switch (code) {
  'unavailable' => 'تعذر الاتصال. تحقق من الشبكة ثم أعد المحاولة',
  'internal' =>
    'تعذر إتمام العملية. تحقق من الاتصال ثم أعد المحاولة، أو راجع المسؤول إذا استمرت المشكلة',
  'aborted' => 'تغيرت بيانات الطلب؛ أعد تحميله قبل الحفظ',
  'unauthenticated' =>
    serverMessage?.trim().isNotEmpty == true
        ? serverMessage!
        : 'انتهت الجلسة أو تعذر التحقق من أمان المتصفح؛ أعد تسجيل الدخول.',
  _ => serverMessage ?? 'حدث خطأ أثناء الاتصال بالخادم',
};

String authErrorMessage(String code) => switch (code) {
  'invalid-credential' ||
  'wrong-password' ||
  'user-not-found' => 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
  'invalid-email' => 'أدخل بريداً إلكترونياً صالحاً',
  'user-disabled' => 'الحساب موقوف؛ راجع مسؤول المؤسسة',
  'network-request-failed' => 'تعذر الاتصال؛ تحقق من الشبكة ثم أعد المحاولة',
  'too-many-requests' => 'محاولات كثيرة؛ انتظر قليلاً ثم أعد المحاولة',
  _ => 'تعذر التحقق من الحساب؛ أعد المحاولة أو راجع مسؤول المؤسسة',
};

class SessionPolicy {
  SessionPolicy(this.data);
  final Map<String, dynamic> data;
  String get id => data['id']?.toString() ?? '';
  String get name => data['name']?.toString() ?? '';
  String get role => data['role']?.toString() ?? '';
  bool get active => data['active'] == true;
  bool can(String perm) =>
      active &&
      (role == 'generalManager' ||
          (data['permissions'] as List? ?? []).contains(perm));
  bool canGrantRole(String target) =>
      role == 'generalManager' ||
      (can('manageEmployees') &&
          ['warehouse', 'sales', 'dataEntry'].contains(target) &&
          (!['warehouse', 'sales'].contains(target) ||
              role == 'warehouse' ||
              can('viewAllOrders')) &&
          (target != 'warehouse' ||
              role == 'warehouse' ||
              can('updateOrderStatus')));
  bool get canChangeStatus =>
      active &&
      (role == 'generalManager' ||
          role == 'warehouse' ||
          can('updateOrderStatus'));
  bool get viewAmounts => can('viewAmounts');
  String get roleLabel =>
      {
        'generalManager': 'مدير عام',
        'manager': 'مدير',
        'warehouse': 'موظف مستودع',
        'sales': 'مبيعات',
        'dataEntry': 'مدخل بيانات',
      }[role] ??
      'مستخدم';
}
