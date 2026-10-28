import 'dart:async';
import 'dart:convert';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../core/app_check_gate.dart';

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
      await AppCheckGate.wait();
    } catch (_) {
      throw VelnixException('تعذر تهيئة حماية App Check؛ أعد تحميل الصفحة');
    }
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
    bool fresh = false,
  }) {
    final data = <String, dynamic>{
      ...filters,
      'sort': sort,
      'pageSize': pageSize,
      'bucket': bucket,
      'status': ?status,
      'afterId': ?afterId,
      'companyId': ?companyId,
    };
    if (afterId == null && !fresh) {
      return _cached(
        'orders:${jsonEncode(data)}',
        () => call('listOrders', data),
        ttl: const Duration(seconds: 10),
      );
    }
    return call('listOrders', data);
  }

  Future<Map<String, dynamic>> searchOrders(
    String query, {
    String? status,
    String bucket = 'all',
    String? companyId,
    Map<String, dynamic> filters = const {},
    int pageSize = 30,
    String? cursor,
  }) {
    final data = <String, dynamic>{
      ...filters,
      'query': query,
      'bucket': bucket,
      'pageSize': pageSize,
      'status': ?status,
      'companyId': ?companyId,
      'cursor': ?cursor,
    };
    return call('searchOrders', data);
  }

  /// Resolves up to 20 scanned/pasted codes to orders in one server call.
  Future<List<Map<String, dynamic>>> resolveBarcodes(List<String> codes) async {
    final result = await call('resolveBarcodes', {'codes': codes});
    return (result['results'] as List? ?? [])
        .map((e) => Map<String, dynamic>.from(e as Map))
        .toList();
  }

  /// Fetches the authorized DTO for a set of order ids (used by bulk print and
  /// selection actions so orders from unloaded pages are included). Amounts are
  /// hidden server-side when the caller lacks the permission.
  Future<List<Map<String, dynamic>>> ordersByIds(List<String> ids) async {
    if (ids.isEmpty) return const [];
    final result = await call('getOrdersByIds', {'ids': ids});
    return (result['items'] as List? ?? [])
        .map((e) => Map<String, dynamic>.from(e as Map))
        .toList();
  }

  /// Reads a durable bulk dispatch record (recover results after a timeout).
  Future<Map<String, dynamic>> bulkOperation(String operationId) =>
      call('getBulkOperation', {'operationId': operationId});

  /// The caller's own bulk dispatch operations, newest first, so the app can
  /// recover operation ids and statuses after a restart.
  Future<List<Map<String, dynamic>>> bulkOperations() async {
    final result = await call('listBulkOperations', {'pageSize': 20});
    return (result['items'] as List? ?? [])
        .map((e) => Map<String, dynamic>.from(e as Map))
        .toList();
  }

  Future<Map<String, dynamic>> bulkChangeStatus(
    List<String> ids,
    String status,
  ) async {
    final result = await call('bulkChangeStatus', {
      'ids': ids,
      'status': status,
    });
    _invalidateOrderData();
    return result;
  }

  Future<Map<String, dynamic>> bulkAssignCompany(
    List<String> ids,
    String? companyId,
  ) async {
    final result = await call('bulkAssignCompany', {
      'ids': ids,
      'companyId': ?companyId,
    });
    _invalidateOrderData();
    return result;
  }

  Future<Map<String, dynamic>> bulkDispatch(
    List<String> ids, {
    String? operationId,
  }) async {
    final result = await call('bulkDispatch', {
      'ids': ids,
      'operationId': ?operationId,
    });
    _invalidateOrderData();
    return result;
  }

  Future<Map<String, dynamic>> dashboard([
    Map<String, dynamic> filters = const {},
    bool fresh = false,
  ]) {
    final keys =
        filters.entries
            .where((e) => e.value != null && e.value.toString().isNotEmpty)
            .toList()
          ..sort((a, b) => a.key.compareTo(b.key));
    if (fresh) return call('dashboardStats', filters);
    return _cached(
      'dashboard:${jsonEncode({for (final e in keys) e.key: e.value})}',
      () => call('dashboardStats', filters),
      ttl: const Duration(seconds: 60),
    );
  }

  Future<Map<String, dynamic>> order(
    String id, {
    String? eventsAfterId,
    int eventsPageSize = 8,
    bool fresh = false,
  }) {
    final data = <String, dynamic>{
      'id': id,
      'eventsPageSize': eventsPageSize,
      'eventsAfterId': ?eventsAfterId,
    };
    if (eventsAfterId == null && !fresh) {
      return _cached(
        'order:${jsonEncode(data)}',
        () => call('getOrder', data),
        ttl: const Duration(seconds: 15),
      );
    }
    return call('getOrder', data);
  }

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
    try {
      // Bound the wait so the UI never spins forever. A timeout here is
      // ambiguous: the request may still reach the vendor, so the caller must
      // treat it like an uncertain outcome (do not auto-resend).
      await call('sendOrderToDelivery', {
        'id': id,
      }).timeout(const Duration(seconds: 75));
    } on TimeoutException {
      _invalidateOrderData();
      throw VelnixException(
        'استغرقت العملية وقتاً أطول من المتوقع. قد تكون الشحنة قيد الإنشاء؛ '
        'لا تُعد الإرسال. افتح الطلب لمتابعة النتيجة.',
        code: 'deadline-exceeded',
      );
    }
    _invalidateOrderData();
  }

  void _invalidateOrderData() {
    invalidate('dashboard');
    invalidate('companyStats');
    invalidate('orders');
    invalidate('search');
    invalidate('order');
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

  /// Recovers an interrupted dispatch (server verifies with a read-only getorder
  /// or converts it to a clear review). Never resends the shipment.
  Future<Map<String, dynamic>> recoverStuckDispatch(String id) async {
    final result = await call('recoverStuckDispatch', {'id': id});
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

  // ---- Electronic pages (Facebook pages the client receives orders on) ----
  Future<List<Map<String, dynamic>>> pages() async =>
      directoryItems('listPages');

  /// Active pages the signed-in employee may create orders for. Not cached so a
  /// revoked page takes effect on the next open.
  Future<Map<String, dynamic>> allowedPages() => call('listAllowedPages', {});

  /// Organization settings (name, receipt footer, support phone, default
  /// delivery company). Cached briefly; the default company must be read fresh
  /// enough that a change reaches the order form.
  Future<Map<String, dynamic>> settings({bool fresh = false}) {
    if (fresh) return call('getSettings', {});
    return _cached(
      'settings',
      () => call('getSettings', {}),
      ttl: const Duration(seconds: 30),
    );
  }

  Future<Map<String, dynamic>> savePage(Map<String, dynamic> page) async {
    final result = await call('savePage', page);
    invalidate('listPages');
    invalidate('listAllowedPages');
    return result;
  }

  Future<void> archivePage(String id) async {
    await call('archivePage', {'id': id});
    invalidate('listPages');
    invalidate('listAllowedPages');
  }

  Future<void> restorePage(String id) async {
    await call('restorePage', {'id': id});
    invalidate('listPages');
    invalidate('listAllowedPages');
  }

  Future<Map<String, int>> pageStats(List<String> ids) async {
    final result = await call('pageStats', {'ids': ids});
    final raw = Map<String, dynamic>.from(
      (result['counts'] as Map?) ?? const {},
    );
    return raw.map((k, v) => MapEntry(k, (v as num?)?.toInt() ?? 0));
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
      ttl: const Duration(seconds: 120),
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

/// True when a server message is a safe, human-readable business message (the
/// backend's own Arabic guidance) rather than a raw SDK/transport diagnostic.
/// Only such messages may be surfaced to the user.
bool _safeServerMessage(String? message) {
  final m = message?.trim() ?? '';
  if (m.isEmpty) return false;
  // Require Arabic script and reject anything that looks like a raw SDK string
  // (latin identifiers, stack frames, bracketed codes).
  if (!RegExp(r'[\u0600-\u06FF]').hasMatch(m)) return false;
  if (RegExp(r'[A-Za-z]{3,}').hasMatch(m)) return false;
  return true;
}

String callableErrorMessage(
  String code,
  String? serverMessage,
) => switch (code) {
  // For an uncertain delivery outcome the backend sends specific Arabic
  // guidance (shipment may exist; do not resend). Surface it so the UI never
  // hides that a shipment may have been created — but never leak raw SDK text.
  'unavailable' =>
    _safeServerMessage(serverMessage)
        ? serverMessage!.trim()
        : 'تعذر الاتصال. تحقق من الشبكة ثم أعد المحاولة',
  'internal' =>
    _safeServerMessage(serverMessage)
        ? serverMessage!.trim()
        : 'تعذر إتمام العملية. تحقق من الاتصال ثم أعد المحاولة، أو راجع المسؤول إذا استمرت المشكلة',
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
