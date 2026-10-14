import 'package:flutter/material.dart';
import 'dart:math';
import 'dart:async';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'notifications_service.dart';
import 'order_filters.dart';
import 'directory_panel.dart';
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
  'sent_to_delivery': 'إرسال الشحنة',
  'remote_status': 'تحديث شركة التوصيل',
  'dispatch_exception_resolved': 'مراجعة نتيجة الإرسال',
  'dispatch_preparation_failed': 'تعذر تجهيز الاتصال قبل إرسال الشحنة',
  'dispatch_attempt_failed': 'نتيجة إرسال الشحنة تحتاج مراجعة',
};
String eventLabel(dynamic action) =>
    eventLabels[action?.toString()] ?? 'تحديث الطلب';
String syncSourceLabel(dynamic source) => switch (source) {
  'webhook' => 'تحديث من شركة التوصيل',
  'poll' => 'مزامنة آلية',
  _ => 'تحديث حالة الشحنة',
};
String auditActionLabel(dynamic action) {
  final value = action?.toString() ?? '';
  if (value.startsWith('order.')) return eventLabel(value.substring(6));
  return const {
        'company.saved': 'حفظ بيانات شركة التوصيل',
        'company.archived': 'أرشفة شركة التوصيل',
        'company.restored': 'استعادة شركة التوصيل',
        'member.created': 'إضافة موظف',
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
            : const AuthenticatedWorkspace();
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
  final email = TextEditingController(), password = TextEditingController();
  bool busy = false, obscure = true;
  String? error;
  static Future<void>? _googleInitialization;
  @override
  void dispose() {
    email.dispose();
    password.dispose();
    super.dispose();
  }

  Future<void> resetPassword() async {
    final value = email.text.trim();
    if (!value.contains('@')) {
      setState(
        () => error = 'أدخل بريدك الإلكتروني أولاً لاستعادة كلمة المرور',
      );
      return;
    }
    try {
      await VelnixGateway.instance.auth.sendPasswordResetEmail(email: value);
      if (mounted) {
        setState(() => error = null);
        showSuccess(
          context,
          'إذا كان البريد مسجلاً، ستصلك رسالة استعادة كلمة المرور',
        );
      }
    } on FirebaseAuthException catch (exception) {
      if ([
        'network-request-failed',
        'too-many-requests',
      ].contains(exception.code)) {
        if (mounted) {
          showError(
            context,
            'تعذر إرسال الرسالة الآن؛ تحقق من الاتصال ثم أعد المحاولة',
          );
        }
        return;
      }
      // Do not leak whether a company employee account exists.
      if (mounted) {
        showSuccess(
          context,
          'إذا كان البريد مسجلاً، ستصلك رسالة استعادة كلمة المرور',
        );
      }
    }
  }

  Future<void> login() async {
    if (busy) return;
    if (email.text.trim().isEmpty || password.text.isEmpty) {
      setState(() => error = 'أدخل البريد الإلكتروني وكلمة المرور');
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await VelnixGateway.instance.auth.signInWithEmailAndPassword(
        email: email.text.trim(),
        password: password.text,
      );
    } on FirebaseAuthException catch (e) {
      if (mounted) {
        setState(() => error = authErrorMessage(e.code));
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
        await (_googleInitialization ??= google.initialize(
          serverClientId:
              const String.fromEnvironment(
                'GOOGLE_WEB_CLIENT_ID',
                defaultValue: '',
              ).isEmpty
              ? null
              : const String.fromEnvironment('GOOGLE_WEB_CLIENT_ID'),
        ));
        final account = await google.authenticate();
        final auth = account.authentication;
        if (auth.idToken == null) {
          throw StateError('لم يتم استلام رمز تحقق Google');
        }
        await VelnixGateway.instance.auth.signInWithCredential(
          GoogleAuthProvider.credential(idToken: auth.idToken),
        );
      } else {
        throw UnsupportedError(
          'استخدم البريد الإلكتروني أو افتح التطبيق في المتصفح لتسجيل Google',
        );
      }
      // Authentication alone does not grant Velnix access; Cloud Functions
      // require an active members/{uid} profile on every request.
    } catch (e) {
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
                      const SizedBox(height: 16),
                      TextField(
                        controller: email,
                        keyboardType: TextInputType.emailAddress,
                        textDirection: TextDirection.ltr,
                        decoration: const InputDecoration(
                          labelText: 'البريد الإلكتروني',
                          prefixIcon: Icon(Icons.mail_outline),
                        ),
                      ),
                      const SizedBox(height: 13),
                      TextField(
                        controller: password,
                        obscureText: obscure,
                        onSubmitted: (_) => login(),
                        textDirection: TextDirection.ltr,
                        decoration: InputDecoration(
                          labelText: 'كلمة المرور',
                          prefixIcon: const Icon(Icons.lock_outline),
                          suffixIcon: IconButton(
                            tooltip: obscure
                                ? 'إظهار كلمة المرور'
                                : 'إخفاء كلمة المرور',
                            icon: Icon(
                              obscure
                                  ? Icons.visibility_outlined
                                  : Icons.visibility_off_outlined,
                            ),
                            onPressed: () => setState(() => obscure = !obscure),
                          ),
                        ),
                      ),
                      if (error != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 12),
                          child: Text(
                            error!,
                            style: const TextStyle(color: VColors.danger),
                          ),
                        ),
                      const SizedBox(height: 20),
                      FilledButton.icon(
                        onPressed: busy ? null : login,
                        icon: busy
                            ? const SizedBox.square(
                                dimension: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : const Icon(Icons.login),
                        label: const Text('دخول إلى مساحة العمل'),
                      ),
                      Align(
                        alignment: Alignment.centerLeft,
                        child: TextButton(
                          onPressed: busy ? null : resetPassword,
                          child: const Text('نسيت كلمة المرور؟'),
                        ),
                      ),
                      const SizedBox(height: 8),
                      if (kIsWeb ||
                          [
                            TargetPlatform.android,
                            TargetPlatform.iOS,
                            TargetPlatform.macOS,
                          ].contains(defaultTargetPlatform))
                        OutlinedButton.icon(
                          onPressed:
                              busy ||
                                  !const bool.fromEnvironment(
                                    'VELNIX_GOOGLE_ENABLED',
                                  )
                              ? null
                              : signInWithGoogle,
                          icon: const Icon(Icons.account_circle_outlined),
                          label: const Text('الدخول باستخدام Google'),
                        ),
                      const Padding(
                        padding: EdgeInsets.only(top: 8),
                        child: Text(
                          'تسجيل Google يحتاج إعداد المؤسسة وتفعيل حساب الموظف مسبقاً. لا يمنح صلاحيات تلقائية.',
                          style: TextStyle(color: VColors.muted, fontSize: 11),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 15),
              const Text(
                'الدخول مخصص للموظفين الذين فعّلهم المدير العام',
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
  late Future<SessionPolicy> session;
  StreamSubscription<DocumentSnapshot<Map<String, dynamic>>>? membership;
  String? lastPolicy;
  @override
  void initState() {
    super.initState();
    session = VelnixGateway.instance.me().then(SessionPolicy.new);
    final uid = VelnixGateway.instance.auth.currentUser!.uid;
    membership = FirebaseFirestore.instance
        .doc('members/$uid')
        .snapshots()
        .listen(
          (snap) {
            final d = snap.data();
            final policy =
                '${d?["active"]}:${d?["role"]}:${d?["permissions"]}:${d?["salesSupervisorId"]}:${d?["authorizationVersion"]}';
            if (lastPolicy != null && lastPolicy != policy && mounted) {
              liveNavigatorKey.currentState?.popUntil((route) => route.isFirst);
              setState(
                () => session = VelnixGateway.instance.me().then(
                  SessionPolicy.new,
                ),
              );
            }
            lastPolicy = policy;
          },
          onError: (Object e) {
            if (mounted) {
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
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<SessionPolicy>(
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
                      onPressed: () => setState(
                        () => session = VelnixGateway.instance.me().then(
                          SessionPolicy.new,
                        ),
                      ),
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
      if (!snap.data!.active) {
        return Scaffold(
          body: Center(
            child: TextButton(
              onPressed: () => NotificationsService.instance.signOut(),
              child: const Text('الحساب موقوف • تسجيل الخروج'),
            ),
          ),
        );
      }
      return LiveShell(key: ValueKey(lastPolicy), policy: snap.data!);
    },
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
  final seenPush = <String>{};
  @override
  void initState() {
    super.initState();
    foregroundPush = FirebaseMessaging.onMessage.listen((message) {
      final id = message.data['noticeId'];
      if (id != null && !seenPush.add(id)) return;
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
    final id = message.data['orderId'];
    if (!mounted || id == null || id.isEmpty) return;
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
  int selected = 0;
  String? selectedStatus;
  String selectedBucket = 'all';
  int refreshVersion = 0;
  final titles = [
    'الرئيسية',
    'الطلبات',
    'طلب جديد',
    'شركات التوصيل',
    'الفريق',
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
    setState(() {
      if (index == 1) {
        selectedBucket = 'all';
        selectedStatus = null;
      }
      selected = index;
      refreshVersion++;
    });
  }

  Future<void> _showMore(BuildContext context) async {
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.local_shipping_outlined),
              title: const Text('شركات التوصيل'),
              onTap: () {
                Navigator.pop(ctx);
                go(3);
              },
            ),
            if (widget.policy.can('manageEmployees'))
              ListTile(
                leading: const Icon(Icons.groups_outlined),
                title: const Text('الفريق والصلاحيات'),
                onTap: () {
                  Navigator.pop(ctx);
                  go(4);
                },
              ),
            if (widget.policy.can('viewAudit'))
              ListTile(
                leading: const Icon(Icons.history),
                title: const Text('سجل العمليات'),
                onTap: () {
                  Navigator.pop(ctx);
                  go(5);
                },
              ),
            if (widget.policy.can('viewReports'))
              ListTile(
                leading: const Icon(Icons.bar_chart_outlined),
                title: const Text('التقارير'),
                onTap: () {
                  Navigator.pop(ctx);
                  go(7);
                },
              ),
            if (widget.policy.can('viewSync'))
              ListTile(
                leading: const Icon(Icons.sync_outlined),
                title: const Text('مركز المزامنة'),
                onTap: () {
                  Navigator.pop(ctx);
                  go(8);
                },
              ),
            if (widget.policy.can('manageSettings'))
              ListTile(
                leading: const Icon(Icons.tune_outlined),
                title: const Text('إعدادات المؤسسة'),
                onTap: () {
                  Navigator.pop(ctx);
                  Navigator.push(
                    context,
                    MaterialPageRoute<void>(
                      builder: (_) => const LiveSettings(),
                    ),
                  );
                },
              ),
            ListTile(
              leading: const Icon(Icons.logout),
              title: const Text('تسجيل الخروج'),
              onTap: () {
                Navigator.pop(ctx);
                NotificationsService.instance.signOut();
              },
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final w = MediaQuery.sizeOf(context).width,
        wide = w >= 840,
        extended = w >= 1200;
    final entries = <int>[
      0,
      1,
      2,
      3,
      6,
      if (widget.policy.can('manageEmployees')) 4,
      if (widget.policy.can('viewAudit')) 5,
      if (widget.policy.can('viewReports')) 7,
      if (widget.policy.can('viewSync')) 8,
    ];
    final mobileEntries = <int>[0, 1, 2, 6];
    final railEntries = <int>[0, 1, 2, 3, 6];
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
            const SizedBox(width: 8),
            PopupMenuButton<String>(
              tooltip: 'الحساب والإدارة',
              onSelected: (v) {
                if (v == 'settings') {
                  Navigator.push(
                    context,
                    MaterialPageRoute<void>(
                      builder: (_) => const LiveSettings(),
                    ),
                  );
                }
                if (v == 'logout') NotificationsService.instance.signOut();
                if (v == 'delivery') go(3);
                if (v == 'team') go(4);
                if (v == 'audit') go(5);
                if (v == 'reports') go(7);
                if (v == 'sync') go(8);
              },
              itemBuilder: (_) => [
                PopupMenuItem(enabled: false, child: Text(widget.policy.name)),
                const PopupMenuItem(
                  value: 'delivery',
                  child: Text('شركات التوصيل'),
                ),
                if (widget.policy.can('manageEmployees'))
                  const PopupMenuItem(
                    value: 'team',
                    child: Text('الفريق والصلاحيات'),
                  ),
                if (widget.policy.can('viewAudit'))
                  const PopupMenuItem(
                    value: 'audit',
                    child: Text('سجل العمليات'),
                  ),
                if (widget.policy.can('viewReports'))
                  const PopupMenuItem(
                    value: 'reports',
                    child: Text('التقارير'),
                  ),
                if (widget.policy.can('viewSync'))
                  const PopupMenuItem(
                    value: 'sync',
                    child: Text('مركز المزامنة'),
                  ),
                if (widget.policy.can('manageSettings'))
                  const PopupMenuItem(
                    value: 'settings',
                    child: Text('إعدادات المؤسسة'),
                  ),
                const PopupMenuItem(
                  value: 'logout',
                  child: Text('تسجيل الخروج'),
                ),
              ],
              child: const CircleAvatar(
                backgroundColor: VColors.softBlue,
                child: Icon(Icons.person_outline, color: VColors.brand),
              ),
            ),
          ],
        ),
      ),
      body: Row(
        children: [
          if (wide)
            Container(
              width: extended ? 230 : 85,
              decoration: const BoxDecoration(
                color: Colors.white,
                border: Border(left: BorderSide(color: VColors.line)),
              ),
              child: NavigationRail(
                backgroundColor: Colors.white,
                selectedIndex: railEntries.contains(selected)
                    ? railEntries.indexOf(selected)
                    : railEntries.length,
                extended: extended,
                labelType: extended
                    ? NavigationRailLabelType.none
                    : NavigationRailLabelType.all,
                onDestinationSelected: (v) {
                  if (v < railEntries.length) {
                    go(railEntries[v]);
                  } else {
                    _showMore(context);
                  }
                },
                destinations: [
                  ...railEntries.map(
                    (i) => NavigationRailDestination(
                      icon: Icon(icons[i]),
                      label: Text(titles[i]),
                    ),
                  ),
                  const NavigationRailDestination(
                    icon: Icon(Icons.more_horiz),
                    label: Text('المزيد'),
                  ),
                ],
              ),
            ),
          Expanded(child: screen),
        ],
      ),
      bottomNavigationBar: wide
          ? null
          : SafeArea(
              top: false,
              child: NavigationBar(
                height: 76,
                selectedIndex: mobileEntries.contains(selected)
                    ? mobileEntries.indexOf(selected)
                    : 4,
                onDestinationSelected: (i) {
                  if (i < mobileEntries.length) {
                    go(mobileEntries[i]);
                  } else {
                    _showMore(context);
                  }
                },
                labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
                destinations: [
                  ...mobileEntries.map(
                    (i) => NavigationDestination(
                      icon: Icon(icons[i]),
                      label: titles[i],
                    ),
                  ),
                  const NavigationDestination(
                    icon: Icon(Icons.more_horiz),
                    label: 'المزيد',
                  ),
                ],
              ),
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
  });
  final Future<T> future;
  final Widget Function(T) builder;
  final VoidCallback onRetry;
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
        return const Center(
          child: SingleChildScrollView(
            padding: EdgeInsets.all(16),
            child: VFeedbackPanel(title: 'جارٍ تحميل البيانات', loading: true),
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
