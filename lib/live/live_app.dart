import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'dart:math';
import 'dart:async';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'notifications_service.dart';
import 'push_routing.dart';
import 'order_filters.dart';
import 'directory_panel.dart';
import 'jordan_locations.dart';
import 'live_settings.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';
import '../printing/order_printing.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import '../core/theme.dart';
import '../core/widgets.dart';
import '../core/dates.dart';
import '../models/entities.dart';
import '../models/shipping_status.dart';
import 'gateway.dart';

part 'live_dashboard.dart';
part 'live_orders.dart';
part 'live_admin.dart';
part 'live_notices.dart';
part 'live_operations.dart';

final statusLabels = <String, String>{
  for (final status in OrderStatus.values) status.name: status.label,
};
final statusColors = <String, Color>{
  for (final status in OrderStatus.values) status.name: status.color,
};

const eventLabels = {
  'created': 'إنشاء الطلب',
  'edited': 'تعديل بيانات الطلب',
  'status_changed': 'تغيير الحالة',
  'company_assigned': 'إسناد شركة توصيل',
  'company_unassigned': 'إزالة إسناد شركة التوصيل',
  'sent_to_delivery': 'إرسال الشحنة',
  'remote_status': 'تحديث شركة التوصيل',
  'dispatch_exception_resolved': 'مراجعة نتيجة الإرسال',
  'dispatch_preparation_failed': 'تعذر تجهيز الاتصال قبل إرسال الشحنة',
  'dispatch_attempt_failed': 'نتيجة إرسال الشحنة تحتاج مراجعة',
  'click_reconciled': 'ربط شحنة Click',
  'click_status_synced': 'تحديث حالة Click',
  'click_status_stale': 'تجاهل حالة Click أقدم',
  'click_status_conflict': 'تعارض حالة Click',
  'click_sync_failed': 'فشل مزامنة Click',
};
String eventLabel(dynamic action, [dynamic details]) {
  if (action?.toString() == 'company_assigned' &&
      details is Map &&
      details['companyId'] == null) {
    return 'إزالة إسناد شركة التوصيل';
  }
  return eventLabels[action?.toString()] ?? 'تحديث الطلب';
}

String syncSourceLabel(dynamic source) => switch (source) {
  'webhook' => 'تحديث من شركة التوصيل',
  'poll' => 'مزامنة آلية',
  _ => 'تحديث حالة الشحنة',
};
String auditActionLabel(dynamic action, [dynamic extra]) {
  final value = action?.toString() ?? '';
  if (value.startsWith('order.')) {
    return eventLabel(value.substring(6), extra);
  }
  return const {
        'company.saved': 'حفظ بيانات شركة التوصيل',
        'company.archived': 'أرشفة شركة التوصيل',
        'company.restored': 'استعادة شركة التوصيل',
        'member.created': 'إضافة موظف',
        'join.requested': 'طلب انضمام',
        'join.approved': 'الموافقة على الانضمام',
        'join.rejected': 'رفض طلب الانضمام',
        'member.updated': 'تحديث بيانات الموظف وصلاحياته',
        'settings.updated': 'تحديث إعدادات المؤسسة',
      }[value] ??
      'عملية مسجلة';
}

final liveNavigatorKey = GlobalKey<NavigatorState>();
String displayAmount(dynamic amount) =>
    amount is num ? '${amount.toStringAsFixed(3)} د.أ' : '—';

class VelnixLiveApp extends StatelessWidget {
  const VelnixLiveApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'Velnix — إدارة الطلبات',
    debugShowCheckedModeBanner: false,
    theme: velnixTheme(),
    locale: const Locale('ar'),
    supportedLocales: const [Locale('ar')],
    localizationsDelegates: const [
      GlobalMaterialLocalizations.delegate,
      GlobalWidgetsLocalizations.delegate,
      GlobalCupertinoLocalizations.delegate,
    ],
    builder: (context, child) => Directionality(
      textDirection: TextDirection.rtl,
      child: child ?? const SizedBox(),
    ),
    navigatorKey: liveNavigatorKey,
    home: StreamBuilder<User?>(
      stream: VelnixGateway.instance.auth.authStateChanges(),
      builder: (context, snap) {
        if (snap.connectionState == ConnectionState.waiting) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }
        return snap.data == null
            ? const LiveLogin()
            : AuthenticatedWorkspace(key: ValueKey(snap.data!.uid));
      },
    ),
  );
}

class LiveLogin extends StatefulWidget {
  const LiveLogin({super.key});
  @override
  State<LiveLogin> createState() => _LiveLoginState();
}

class _LiveLoginState extends State<LiveLogin> {
  bool busy = false;
  String? error;
  String? info;
  bool obscurePassword = true;
  final formKey = GlobalKey<FormState>();
  final email = TextEditingController();
  final password = TextEditingController();
  static Future<void>? _googleInitialization;

  @override
  void dispose() {
    email.dispose();
    password.dispose();
    super.dispose();
  }

  String? _emailValidator(String? value) {
    final text = value?.trim() ?? '';
    if (text.isEmpty) return 'أدخل البريد الإلكتروني';
    if (!RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(text)) {
      return 'أدخل بريداً إلكترونياً صالحاً';
    }
    return null;
  }

  String _emailError(FirebaseAuthException e) => switch (e.code) {
    'invalid-email' => 'أدخل بريداً إلكترونياً صالحاً',
    'user-disabled' => 'هذا الحساب معطل؛ راجع مسؤول المؤسسة',
    'user-not-found' ||
    'wrong-password' ||
    'invalid-credential' => 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
    'email-not-verified' => 'وثّق بريدك الإلكتروني قبل تسجيل الدخول',
    'too-many-requests' => 'محاولات كثيرة؛ انتظر قليلاً ثم أعد المحاولة',
    'network-request-failed' => 'تعذر الاتصال؛ تحقق من الشبكة ثم أعد المحاولة',
    'operation-not-allowed' =>
      'تسجيل الدخول بالبريد غير مفعّل؛ راجع مسؤول Firebase',
    _ => 'تعذر تسجيل الدخول. تحقق من البريد وكلمة المرور.',
  };

  Future<void> signInWithEmailPassword() async {
    if (busy || !(formKey.currentState?.validate() ?? false)) return;
    setState(() {
      busy = true;
      error = null;
      info = null;
    });
    try {
      final credential = await VelnixGateway.instance.auth
          .signInWithEmailAndPassword(
            email: email.text.trim(),
            password: password.text,
          );
      final user = credential.user;
      if (user == null || !user.emailVerified) {
        VelnixGateway.instance.clearCache();
        await VelnixGateway.instance.auth.signOut();
        throw FirebaseAuthException(
          code: 'email-not-verified',
          message: 'email not verified',
        );
      }
      // authStateChanges opens the workspace. Cloud Functions still require an
      // active members/{uid} record; login alone grants no Velnix permission.
    } on FirebaseAuthException catch (e) {
      if (mounted) setState(() => error = _emailError(e));
    } catch (_) {
      if (mounted) {
        setState(
          () => error = 'تعذر تسجيل الدخول. تحقق من البريد وكلمة المرور.',
        );
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> sendPasswordReset() async {
    final address = email.text.trim();
    final validation = _emailValidator(address);
    if (validation != null) {
      setState(() => error = validation);
      return;
    }
    if (busy) return;
    setState(() {
      busy = true;
      error = null;
      info = null;
    });
    try {
      await VelnixGateway.instance.auth.sendPasswordResetEmail(email: address);
      if (mounted) {
        setState(
          () => info =
              'أُرسل رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني إن كان الحساب موجوداً.',
        );
      }
    } on FirebaseAuthException catch (e) {
      if (mounted) setState(() => error = _emailError(e));
    } catch (_) {
      if (mounted) {
        setState(() => error = 'تعذر إرسال رابط إعادة التعيين الآن.');
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> signInWithGoogle() async {
    if (busy) return;
    setState(() {
      busy = true;
      error = null;
      info = null;
    });
    try {
      if (kIsWeb) {
        await VelnixGateway.instance.auth.signInWithPopup(GoogleAuthProvider());
      } else if ([
        TargetPlatform.android,
        TargetPlatform.iOS,
        TargetPlatform.macOS,
      ].contains(defaultTargetPlatform)) {
        final google = GoogleSignIn.instance;
        final initialization = _googleInitialization ??= google.initialize(
          serverClientId:
              const String.fromEnvironment(
                'GOOGLE_WEB_CLIENT_ID',
                defaultValue: '',
              ).isEmpty
              ? null
              : const String.fromEnvironment('GOOGLE_WEB_CLIENT_ID'),
        );
        try {
          await initialization;
        } catch (_) {
          if (identical(_googleInitialization, initialization)) {
            _googleInitialization = null;
          }
          rethrow;
        }
        final account = await google.authenticate();
        final auth = account.authentication;
        if (auth.idToken == null) {
          throw StateError('لم يتم استلام رمز تحقق Google');
        }
        await VelnixGateway.instance.auth.signInWithCredential(
          GoogleAuthProvider.credential(idToken: auth.idToken),
        );
      } else {
        throw UnsupportedError('افتح التطبيق في متصفح مدعوم لتسجيل Google');
      }
      // Authentication alone does not grant Velnix access; Cloud Functions
      // require an active members/{uid} profile on every request.
    } catch (e, st) {
      // Emit only a non-sensitive classification. The raw exception is never
      // printed: GoogleSignInException.details is an opaque Object, and
      // FirebaseAuthException can carry `credential`, either of which may hold
      // identity tokens or authorization codes. Codes and stack frames are
      // enough to diagnose, and no verification level is relaxed.
      if (kDebugMode) {
        final codes = <String>['${e.runtimeType}'];
        if (e is GoogleSignInException) {
          codes.add('google=${e.code}');
        }
        if (e is FirebaseAuthException) {
          codes.add('firebase=${e.code}');
        }
        debugPrint('Velnix: Google sign-in failed (${codes.join('; ')})');
        debugPrintStack(stackTrace: st, label: 'Velnix Google sign-in');
      }
      if (mounted) {
        setState(
          () => error =
              'تعذر تسجيل الدخول بجوجل. تحقق من إعدادات Firebase وربط حساب الموظف.',
        );
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 470),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Icon(
                Icons.all_inbox_rounded,
                size: 65,
                color: VColors.brand,
              ),
              const SizedBox(height: 15),
              const Text(
                'Velnix',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 35, fontWeight: FontWeight.w900),
              ),
              const Text(
                'إدارة الطلبات بذكاء',
                textAlign: TextAlign.center,
                style: TextStyle(color: VColors.muted, fontSize: 15),
              ),
              const SizedBox(height: 30),
              VLivePanel(
                child: Form(
                  key: formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Text(
                        'تسجيل الدخول',
                        style: TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      const SizedBox(height: 12),
                      if (error != null)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: Text(
                            error!,
                            style: const TextStyle(color: VColors.danger),
                          ),
                        ),
                      if (info != null)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: Text(
                            info!,
                            style: const TextStyle(color: Color(0xFF006D55)),
                          ),
                        ),
                      TextFormField(
                        controller: email,
                        enabled: !busy,
                        textDirection: TextDirection.ltr,
                        keyboardType: TextInputType.emailAddress,
                        autofillHints: const [AutofillHints.email],
                        textInputAction: TextInputAction.next,
                        validator: _emailValidator,
                        decoration: const InputDecoration(
                          labelText: 'البريد الإلكتروني',
                          prefixIcon: Icon(Icons.alternate_email),
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: password,
                        enabled: !busy,
                        textDirection: TextDirection.ltr,
                        obscureText: obscurePassword,
                        autofillHints: const [AutofillHints.password],
                        textInputAction: TextInputAction.done,
                        onFieldSubmitted: (_) => signInWithEmailPassword(),
                        validator: (value) {
                          if (value == null || value.isEmpty) {
                            return 'أدخل كلمة المرور';
                          }
                          if (value.length < 6) {
                            return 'كلمة المرور يجب أن تكون 6 أحرف على الأقل';
                          }
                          return null;
                        },
                        decoration: InputDecoration(
                          labelText: 'كلمة المرور',
                          prefixIcon: const Icon(Icons.lock_outline),
                          suffixIcon: IconButton(
                            tooltip: obscurePassword
                                ? 'إظهار كلمة المرور'
                                : 'إخفاء كلمة المرور',
                            onPressed: () => setState(
                              () => obscurePassword = !obscurePassword,
                            ),
                            icon: Icon(
                              obscurePassword
                                  ? Icons.visibility_outlined
                                  : Icons.visibility_off_outlined,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 14),
                      FilledButton.icon(
                        onPressed: busy ? null : signInWithEmailPassword,
                        icon: busy
                            ? const SizedBox.square(
                                dimension: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              )
                            : const Icon(Icons.login),
                        label: const Text('تسجيل الدخول بالبريد'),
                      ),
                      TextButton(
                        onPressed: busy ? null : sendPasswordReset,
                        child: const Text('نسيت كلمة المرور؟'),
                      ),
                      const Row(
                        children: [
                          Expanded(child: Divider()),
                          Padding(
                            padding: EdgeInsets.symmetric(horizontal: 8),
                            child: Text(
                              'أو',
                              style: TextStyle(color: VColors.muted),
                            ),
                          ),
                          Expanded(child: Divider()),
                        ],
                      ),
                      const SizedBox(height: 6),
                      FilledButton.icon(
                        onPressed:
                            busy ||
                                !const bool.fromEnvironment(
                                  'VELNIX_GOOGLE_ENABLED',
                                )
                            ? null
                            : signInWithGoogle,
                        icon: busy
                            ? const SizedBox.square(
                                dimension: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              )
                            : const Icon(Icons.account_circle_outlined),
                        label: const Text('المتابعة باستخدام Google'),
                      ),
                      const Padding(
                        padding: EdgeInsets.only(top: 8),
                        child: Text(
                          'الحسابات الجديدة تنتظر موافقة المدير العام. لا يمنح تسجيل الدخول صلاحيات تلقائية.',
                          style: TextStyle(color: VColors.muted, fontSize: 11),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 15),
              const Text(
                'الوصول للعمل متاح للحسابات المعتمدة فقط',
                textAlign: TextAlign.center,
                style: TextStyle(color: VColors.muted, fontSize: 12),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

class AuthenticatedWorkspace extends StatefulWidget {
  const AuthenticatedWorkspace({super.key});
  @override
  State<AuthenticatedWorkspace> createState() => _AuthenticatedWorkspaceState();
}

class _AuthenticatedWorkspaceState extends State<AuthenticatedWorkspace> {
  late Future<Map<String, dynamic>> _session;
  Future<Map<String, dynamic>> get session => _session;
  set session(Future<Map<String, dynamic>> next) {
    // A policy refresh can fail before the next frame attaches FutureBuilder.
    // Observe it immediately, retaining the same error for the blocking UI.
    next.ignore();
    _session = next;
  }

  StreamSubscription<DocumentSnapshot<Map<String, dynamic>>>? joinDecision;

  Future<Map<String, dynamic>> loadSession() async {
    try {
      final status = await VelnixGateway.instance.call('joinSession');
      if (status['status'] != 'approved') return status;
      final member = status['member'];
      if (member is Map) {
        return {
          'status': 'approved',
          'member': Map<String, dynamic>.from(member),
        };
      }
      return {
        'status': 'approved',
        'member': await VelnixGateway.instance.me(),
      };
    } on VelnixException catch (e) {
      if (e.code == 'unauthenticated') {
        VelnixGateway.instance.clearCache();
        await VelnixGateway.instance.auth.signOut();
        return {'status': 'signed_out'};
      }
      rethrow;
    }
  }

  StreamSubscription<DocumentSnapshot<Map<String, dynamic>>>? membership;
  String? lastPolicy;
  bool _joinDecisionInitial = true;
  @override
  void initState() {
    super.initState();
    session = loadSession();
    final uid = VelnixGateway.instance.auth.currentUser!.uid;
    joinDecision = FirebaseFirestore.instance
        .doc('joinRequests/$uid')
        .snapshots()
        .listen(
          (snapshot) {
            if (_joinDecisionInitial) {
              _joinDecisionInitial = false;
              return;
            }
            if (mounted) {
              VelnixGateway.instance.clearCache();
              setState(() => session = loadSession());
            }
          },
          onError: (Object error) {
            if (mounted) {
              setState(
                () => session = Future.error(
                  VelnixException('تعذر متابعة قرار الانضمام؛ أعد المحاولة'),
                ),
              );
            }
          },
        );
    membership = FirebaseFirestore.instance
        .doc('members/$uid')
        .snapshots()
        .listen(
          (snap) {
            final d = snap.data();
            final policy =
                '${d?["active"]}:${d?["role"]}:${d?["permissions"]}:${d?["salesSupervisorId"]}:${d?["authorizationVersion"]}';
            if (lastPolicy != null && lastPolicy != policy && mounted) {
              VelnixGateway.instance.clearCache();
              liveNavigatorKey.currentState?.popUntil((route) => route.isFirst);
              setState(() => session = loadSession());
            }
            lastPolicy = policy;
          },
          onError: (Object e) {
            if (mounted) {
              liveNavigatorKey.currentState?.popUntil((route) => route.isFirst);
              setState(
                () => session = Future.error(
                  VelnixException(
                    'تعذر متابعة صلاحيات الحساب؛ أعد تسجيل الدخول',
                  ),
                ),
              );
            }
          },
        );
  }

  @override
  void dispose() {
    membership?.cancel();
    joinDecision?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<Map<String, dynamic>>(
    future: session,
    builder: (context, snap) {
      if (snap.connectionState != ConnectionState.done) {
        return const Scaffold(body: Center(child: CircularProgressIndicator()));
      }
      if (!snap.hasData || snap.hasError) {
        if (snap.hasError) {
          return Scaffold(
            body: Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      'تعذر تحميل الحساب: ${snap.error}',
                      textAlign: TextAlign.center,
                    ),
                    TextButton(
                      onPressed: () => setState(() => session = loadSession()),
                      child: const Text('إعادة المحاولة'),
                    ),
                    TextButton(
                      onPressed: () => NotificationsService.instance.signOut(),
                      child: const Text('تسجيل الخروج'),
                    ),
                  ],
                ),
              ),
            ),
          );
        }
        return const Scaffold(body: Center(child: CircularProgressIndicator()));
      }
      final status = snap.data!['status'];
      if (status != 'approved') {
        return JoinStatusScreen(
          status: status?.toString() ?? 'disabled',
          onRefresh: () => setState(() => session = loadSession()),
          onSignOut: () => NotificationsService.instance.signOut(),
        );
      }
      return LiveShell(
        key: ValueKey(lastPolicy),
        policy: SessionPolicy(
          Map<String, dynamic>.from(snap.data!['member'] as Map),
        ),
      );
    },
  );
}

class JoinStatusScreen extends StatelessWidget {
  const JoinStatusScreen({
    super.key,
    required this.status,
    required this.onRefresh,
    required this.onSignOut,
  });
  final String status;
  final VoidCallback onRefresh, onSignOut;
  @override
  Widget build(BuildContext context) => Scaffold(
    body: Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.verified_user_outlined, size: 56),
            const SizedBox(height: 16),
            Text(switch (status) {
              'pending' => 'حسابك بانتظار موافقة المدير',
              'rejected' => 'تم رفض طلب انضمامك. راجع المدير العام',
              _ => 'حسابك معطل. راجع المدير العام',
            }, textAlign: TextAlign.center),
            TextButton(
              onPressed: onRefresh,
              child: const Text('تحديث حالة الحساب'),
            ),
            TextButton(onPressed: onSignOut, child: const Text('تسجيل الخروج')),
          ],
        ),
      ),
    ),
  );
}

class LiveShell extends StatefulWidget {
  const LiveShell({super.key, required this.policy});
  final SessionPolicy policy;
  @override
  State<LiveShell> createState() => _LiveShellState();
}

class _LiveShellState extends State<LiveShell> {
  StreamSubscription<RemoteMessage>? foregroundPush, openedPush;
  final pushRouting = PushRouting();
  @override
  void initState() {
    super.initState();
    foregroundPush = FirebaseMessaging.onMessage.listen((message) {
      if (!pushRouting.shouldPresentForeground(message.data['noticeId'])) {
        return;
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: const Text('لديك تحديث جديد في Velnix'),
            action: SnackBarAction(
              label: 'فتح',
              onPressed: () => openPush(message),
            ),
          ),
        );
      }
    });
    openedPush = FirebaseMessaging.onMessageOpenedApp.listen(openPush);
    FirebaseMessaging.instance
        .getInitialMessage()
        .then((message) {
          if (message != null && mounted) openPush(message);
        })
        .catchError((Object e) {});
  }

  void openPush(RemoteMessage message) {
    final id = PushRouting.orderTarget(message.data);
    if (!mounted || id == null) return;
    Navigator.push(
      context,
      MaterialPageRoute<void>(
        builder: (_) => LiveOrderDetail(id: id, policy: widget.policy),
      ),
    );
  }

  @override
  void dispose() {
    foregroundPush?.cancel();
    openedPush?.cancel();
    super.dispose();
  }

  Map<String, dynamic> selectedFilters = {};
  bool railCollapsed = false;
  int selected = 0;
  String? selectedStatus;
  String selectedBucket = 'all';
  int refreshVersion = 0;
  final titles = [
    'الرئيسية',
    'الطلبات',
    'طلب جديد',
    'شركات التوصيل',
    'الفريق والصلاحيات',
    'العمليات',
    'الإشعارات',
    'التقارير',
    'المزامنة',
  ];
  final icons = [
    Icons.dashboard_outlined,
    Icons.receipt_long_outlined,
    Icons.add_circle_outline,
    Icons.local_shipping_outlined,
    Icons.groups_outlined,
    Icons.history_outlined,
    Icons.notifications_none_outlined,
    Icons.bar_chart_outlined,
    Icons.sync_outlined,
  ];
  void toOrders(String bucket, String? status) {
    setState(() {
      selected = 1;
      selectedBucket = bucket;
      selectedStatus = status;
      refreshVersion++;
    });
  }

  void go(int index) {
    if (!permittedEntries.contains(index)) return;
    setState(() {
      if (index == 1) {
        selectedBucket = 'all';
        selectedStatus = null;
      }
      selected = index;
      refreshVersion++;
    });
  }

  // Operations and audit pages stay implemented for backend/admin use but
  // are intentionally hidden from normal navigation. The order timeline and
  // its sync action remain the employee-facing surfaces.
  List<int> get permittedEntries => [
    0,
    1,
    2,
    3,
    if (widget.policy.can('manageEmployees')) 4,
    if (widget.policy.can('viewReports')) 7,
    6,
  ];

  Widget _navEntry(int index, {required bool expanded, bool drawer = false}) {
    final active = selected == index;
    if (expanded) {
      return ListTile(
        selected: active,
        selectedTileColor: VColors.softBlue,
        selectedColor: VColors.brand,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        leading: Icon(
          icons[index],
          color: active ? VColors.brand : VColors.muted,
        ),
        title: Text(
          titles[index],
          style: TextStyle(
            fontWeight: active ? FontWeight.w900 : FontWeight.w600,
          ),
        ),
        onTap: () {
          if (drawer) Navigator.pop(context);
          go(index);
        },
      );
    }
    return Tooltip(
      message: titles[index],
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => go(index),
        child: Container(
          height: 56,
          margin: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
          decoration: BoxDecoration(
            color: active ? VColors.softBlue : null,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Icon(
            icons[index],
            color: active ? VColors.brand : VColors.muted,
          ),
        ),
      ),
    );
  }

  void _openSettings({bool fromDrawer = false}) {
    if (fromDrawer) Navigator.pop(context);
    Navigator.push(
      context,
      MaterialPageRoute<void>(builder: (_) => const LiveSettings()),
    );
  }

  Widget _accountPanel({required bool expanded, bool drawer = false}) {
    final canSettings = widget.policy.can('manageSettings');
    if (!expanded) {
      return Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Column(
          children: [
            Tooltip(
              message: '${widget.policy.name} • ${widget.policy.roleLabel}',
              child: const CircleAvatar(
                radius: 15,
                backgroundColor: VColors.softBlue,
                child: Icon(
                  Icons.person_outline,
                  color: VColors.brand,
                  size: 18,
                ),
              ),
            ),
            const SizedBox(height: 4),
            if (canSettings)
              IconButton(
                tooltip: 'إعدادات المؤسسة',
                onPressed: () => _openSettings(fromDrawer: drawer),
                icon: const Icon(Icons.tune_outlined),
              ),
            IconButton(
              tooltip: 'تسجيل الخروج',
              onPressed: () {
                if (drawer) Navigator.pop(context);
                NotificationsService.instance.signOut();
              },
              icon: const Icon(Icons.logout),
            ),
          ],
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.fromLTRB(10, 4, 10, 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Divider(height: 1),
          const SizedBox(height: 10),
          Row(
            children: [
              const CircleAvatar(
                radius: 17,
                backgroundColor: VColors.softBlue,
                child: Icon(Icons.person_outline, color: VColors.brand),
              ),
              const SizedBox(width: 9),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      widget.policy.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 12.5,
                      ),
                    ),
                    Text(
                      widget.policy.roleLabel,
                      style: const TextStyle(
                        color: VColors.muted,
                        fontSize: 10.5,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          if (canSettings)
            ListTile(
              dense: true,
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.tune_outlined, size: 20),
              title: const Text(
                'إعدادات المؤسسة',
                style: TextStyle(fontSize: 12.5),
              ),
              onTap: () => _openSettings(fromDrawer: drawer),
            ),
          ListTile(
            dense: true,
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.logout, size: 20),
            title: const Text('تسجيل الخروج', style: TextStyle(fontSize: 12.5)),
            onTap: () {
              if (drawer) Navigator.pop(context);
              NotificationsService.instance.signOut();
            },
          ),
        ],
      ),
    );
  }

  Widget _drawer(BuildContext context) => Drawer(
    child: SafeArea(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 18, 20, 14),
            child: Row(
              children: [
                const Icon(
                  Icons.all_inbox_rounded,
                  color: VColors.brand,
                  size: 28,
                ),
                const SizedBox(width: 9),
                const Text(
                  'Velnix',
                  style: TextStyle(fontSize: 21, fontWeight: FontWeight.w900),
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(8),
              children: [
                for (final index in permittedEntries)
                  _navEntry(index, expanded: true, drawer: true),
              ],
            ),
          ),
          _accountPanel(expanded: true, drawer: true),
        ],
      ),
    ),
  );

  @override
  Widget build(BuildContext context) {
    final w = MediaQuery.sizeOf(context).width,
        wide = w >= 840,
        extended = w >= 1200;
    final entries = permittedEntries;
    if (!entries.contains(selected)) selected = 0;
    Widget screen = switch (selected) {
      0 => LiveDashboard(
        key: ValueKey('dash$refreshVersion'),
        policy: widget.policy,
        onNavigate: toOrders,
        initialFilters: selectedFilters,
        onFiltersChanged: (value) => selectedFilters = value,
      ),
      1 => LiveOrders(
        key: ValueKey('orders$refreshVersion'),
        policy: widget.policy,
        bucket: selectedBucket,
        status: selectedStatus,
        initialFilters: selectedFilters,
        onFiltersChanged: (value) => selectedFilters = value,
      ),
      2 => LiveOrderForm(
        key: ValueKey('form$refreshVersion'),
        policy: widget.policy,
        onSaved: () => go(1),
        onBack: () => go(1),
      ),
      3 => LiveCompanies(
        key: ValueKey('company$refreshVersion'),
        policy: widget.policy,
      ),
      4 => LiveMembers(
        key: ValueKey('people$refreshVersion'),
        policy: widget.policy,
      ),
      6 => LiveNotices(
        key: ValueKey('notices$refreshVersion'),
        policy: widget.policy,
      ),
      5 => LiveAudit(key: ValueKey('audit$refreshVersion')),
      7 => LiveReports(
        key: ValueKey('reports$refreshVersion'),
        policy: widget.policy,
      ),
      8 => LiveSyncCenter(key: ValueKey('sync$refreshVersion')),
      _ => LiveAudit(key: ValueKey('audit$refreshVersion')),
    };
    return Scaffold(
      drawer: wide ? null : _drawer(context),
      drawerEnableOpenDragGesture: !wide,
      appBar: AppBar(
        toolbarHeight: 70,
        backgroundColor: Colors.white,
        title: Row(
          children: [
            const Icon(Icons.all_inbox_rounded, color: VColors.brand, size: 30),
            const SizedBox(width: 9),
            const Text(
              'Velnix',
              style: TextStyle(fontSize: 23, fontWeight: FontWeight.w900),
            ),
            const Spacer(),
            if (w >= 430)
              Text(
                widget.policy.roleLabel,
                style: const TextStyle(fontSize: 12, color: VColors.muted),
              ),
          ],
        ),
      ),
      body: Row(
        children: [
          if (wide)
            Container(
              width: extended && !railCollapsed ? 230 : 85,
              decoration: const BoxDecoration(
                color: Colors.white,
                border: Border(left: BorderSide(color: VColors.line)),
              ),
              child: SafeArea(
                child: Column(
                  children: [
                    Align(
                      alignment: AlignmentDirectional.centerStart,
                      child: IconButton(
                        tooltip: railCollapsed ? 'توسيع القائمة' : 'طي القائمة',
                        onPressed: () =>
                            setState(() => railCollapsed = !railCollapsed),
                        icon: Icon(
                          railCollapsed
                              ? Icons.chevron_right_outlined
                              : Icons.chevron_left_outlined,
                        ),
                      ),
                    ),
                    Expanded(
                      child: ListView(
                        padding: const EdgeInsets.symmetric(vertical: 6),
                        children: [
                          for (final index in entries)
                            _navEntry(
                              index,
                              expanded: extended && !railCollapsed,
                            ),
                        ],
                      ),
                    ),
                    _accountPanel(expanded: extended && !railCollapsed),
                  ],
                ),
              ),
            ),
          Expanded(child: screen),
        ],
      ),
    );
  }
}

class VLivePanel extends StatelessWidget {
  const VLivePanel({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(18),
  });
  final Widget child;
  final EdgeInsets padding;
  @override
  Widget build(BuildContext context) => VPanel(padding: padding, child: child);
}

class LiveContent extends StatelessWidget {
  const LiveContent({super.key, required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) => Align(
    alignment: Alignment.topCenter,
    child: ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 1480),
      child: Padding(
        padding: EdgeInsets.symmetric(
          horizontal: MediaQuery.sizeOf(context).width < 430 ? 12 : 22,
          vertical: 20,
        ),
        child: child,
      ),
    ),
  );
}

void showError(BuildContext context, Object error) {
  if (ScaffoldMessenger.maybeOf(context) == null) return;
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(content: Text('$error'), backgroundColor: VColors.danger),
  );
}

void showSuccess(BuildContext context, String text) {
  if (ScaffoldMessenger.maybeOf(context) == null) return;
  ScaffoldMessenger.of(
    context,
  ).showSnackBar(SnackBar(content: Text(text), backgroundColor: VColors.aqua));
}

class AsyncPanel<T> extends StatelessWidget {
  const AsyncPanel({
    super.key,
    required this.future,
    required this.builder,
    required this.onRetry,
    this.loading,
  });
  final Future<T> future;
  final Widget Function(T) builder;
  final VoidCallback onRetry;
  final Widget? loading;
  @override
  Widget build(BuildContext context) => FutureBuilder<T>(
    future: future,
    builder: (context, snap) {
      if (!snap.hasData || snap.hasError) {
        if (snap.hasError) {
          return Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: VFeedbackPanel(
                title: 'تعذر تحميل البيانات',
                message: '${snap.error}',
                icon: Icons.error_outline,
                onRetry: onRetry,
              ),
            ),
          );
        }
        return loading ??
            const Center(
              child: SingleChildScrollView(
                padding: EdgeInsets.all(16),
                child: VFeedbackPanel(
                  title: 'جارٍ تحميل البيانات',
                  loading: true,
                ),
              ),
            );
      }
      return Stack(
        fit: StackFit.expand,
        children: [
          builder(snap.data as T),
          if (snap.connectionState == ConnectionState.waiting)
            const Align(
              alignment: Alignment.topCenter,
              child: LinearProgressIndicator(),
            ),
        ],
      );
    },
  );
}
