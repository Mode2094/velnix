import 'package:flutter/material.dart';
import '../core/theme.dart';
import '../core/widgets.dart';
import '../data/demo_store.dart';
import '../models/entities.dart';
import 'delivery_screens.dart';
import 'team_screen.dart';
import 'reports_screen.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key, required this.onLogout});
  final VoidCallback onLogout;

  @override
  Widget build(BuildContext context) {
    final store = StoreScope.of(context);
    return SingleChildScrollView(
      child: VScreen(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const VPageTitle(
              title: 'مركز التحكم',
              subtitle: 'إعدادات خاصة بحسابك وصلاحياتك',
            ),
            _profile(context, store),
            const VSection(title: 'الأدوات المتاحة لك'),
            LayoutBuilder(
              builder: (context, c) {
                final items = <Widget>[
                  if (store.can(AppPermission.manageEmployees))
                    _feature(
                      context,
                      Icons.groups_2_outlined,
                      'الفريق والصلاحيات',
                      'إدارة الموظفين وأدوارهم',
                      VColors.violet,
                      const TeamScreen(),
                    ),
                  _feature(
                    context,
                    Icons.local_shipping_outlined,
                    'شركات التوصيل',
                    store.can(AppPermission.manageCompanies)
                        ? 'الشركات والحالات وإعدادات الربط'
                        : 'طلبات الشركات وحالاتها',
                    VColors.brand,
                    const DeliveryCompaniesScreen(),
                  ),
                  if (store.can(AppPermission.viewSync))
                    _feature(
                      context,
                      Icons.sync_rounded,
                      'مزامنة الحالات',
                      'سجل تحديثات شركات الشحن',
                      VColors.aqua,
                      const SyncCenterScreen(),
                    ),
                  if (store.can(AppPermission.viewReports))
                    _feature(
                      context,
                      Icons.insights_rounded,
                      'التقارير',
                      'مؤشرات الطلبات والمبالغ',
                      VColors.warning,
                      const ReportsScreen(),
                    ),
                  if (store.can(AppPermission.viewAudit))
                    _feature(
                      context,
                      Icons.history_rounded,
                      'سجل العمليات',
                      'تاريخ التعديلات',
                      VColors.violet,
                      const AuditScreen(),
                    ),
                  _feature(
                    context,
                    Icons.person_outline_rounded,
                    'ملفي الشخصي',
                    'الحساب والدور الحالي',
                    VColors.aqua,
                    const ProfileScreen(),
                  ),
                  if (store.can(AppPermission.manageSettings))
                    _feature(
                      context,
                      Icons.tune_rounded,
                      'إعدادات التطبيق',
                      'معلومات النظام',
                      VColors.brand,
                      const GeneralSettingsScreen(),
                    ),
                ];
                if (c.maxWidth < 630) {
                  return Column(
                    children: [
                      for (final item in items)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: item,
                        ),
                    ],
                  );
                }
                return Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: [
                    for (final item in items)
                      SizedBox(width: (c.maxWidth - 10) / 2, child: item),
                  ],
                );
              },
            ),
            const SizedBox(height: 17),
            const VDemoBanner(),
            const SizedBox(height: 15),
            OutlinedButton.icon(
              onPressed: onLogout,
              icon: const Icon(
                Icons.switch_account_rounded,
                color: VColors.brand,
              ),
              label: const Text('تبديل المستخدم لمعاينة الصلاحيات'),
            ),
            const SizedBox(height: 20),
            const Center(
              child: Text(
                'Velnix • Flutter UI Revamp',
                style: TextStyle(fontSize: 11.5, color: VColors.muted),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _profile(BuildContext context, DemoStore store) => Container(
    padding: const EdgeInsets.all(18),
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(22),
      gradient: const LinearGradient(colors: [VColors.navy, Color(0xFF3946A7)]),
    ),
    child: Row(
      children: [
        Container(
          width: 53,
          height: 53,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(15),
            color: Colors.white.withValues(alpha: .13),
          ),
          child: Center(
            child: Text(
              store.me.name.substring(0, 1),
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w900,
                fontSize: 23,
              ),
            ),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                store.me.name,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 17,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 3),
              Text(
                store.me.role.label,
                style: const TextStyle(fontSize: 12, color: Color(0xFFE0E3FF)),
              ),
              Text(
                store.me.email,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 11.5,
                  color: Color(0xFFD3D9FF),
                ),
              ),
            ],
          ),
        ),
        const Icon(Icons.verified_user_outlined, color: Color(0xFFDDE5FF)),
      ],
    ),
  );

  Widget _feature(
    BuildContext context,
    IconData icon,
    String title,
    String subtitle,
    Color accent,
    Widget page,
  ) => InkWell(
    onTap: () =>
        Navigator.push(context, MaterialPageRoute(builder: (_) => page)),
    borderRadius: BorderRadius.circular(20),
    child: VPanel(
      padding: const EdgeInsets.all(15),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: accent.withValues(alpha: .11),
              borderRadius: BorderRadius.circular(13),
            ),
            child: Icon(icon, color: accent, size: 22),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w900,
                    color: VColors.ink,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  subtitle,
                  maxLines: 2,
                  style: const TextStyle(fontSize: 11.5, color: VColors.muted),
                ),
              ],
            ),
          ),
          const Icon(
            Icons.chevron_left_rounded,
            size: 19,
            color: VColors.muted,
          ),
        ],
      ),
    ),
  );
}

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});
  @override
  Widget build(BuildContext context) {
    final me = StoreScope.of(context).me;
    return Scaffold(
      appBar: AppBar(title: const Text('الملف الشخصي')),
      body: SingleChildScrollView(
        child: VScreen(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const VPageTitle(
                title: 'بيانات الحساب',
                subtitle: 'العرض التجريبي للمستخدم الحالي',
              ),
              VCard(
                child: Column(
                  children: [
                    const SizedBox(height: 8),
                    const Icon(
                      Icons.account_circle_outlined,
                      size: 65,
                      color: VColors.brand,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      me.name,
                      style: const TextStyle(
                        fontSize: 21,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    Text(
                      me.role.label,
                      style: const TextStyle(color: VColors.muted),
                    ),
                    const Divider(height: 26),
                    ListTile(
                      title: const Text('البريد الإلكتروني'),
                      subtitle: Text(me.email),
                    ),
                    ListTile(
                      title: const Text('رقم الهاتف'),
                      subtitle: Text(me.phone.isEmpty ? 'غير محدد' : me.phone),
                    ),
                    const Divider(),
                    const ListTile(
                      leading: Icon(Icons.shield_outlined),
                      title: Text('الحسابات وكلمات المرور'),
                      subtitle: Text(
                        'سيتم ربطها بنظام Firebase Authentication لاحقاً',
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class AuditScreen extends StatelessWidget {
  const AuditScreen({super.key});
  @override
  Widget build(BuildContext context) {
    final store = StoreScope.of(context);
    if (!store.can(AppPermission.viewAudit)) {
      return const Scaffold(
        body: Center(child: Text('لا تملك صلاحية سجل العمليات')),
      );
    }
    final events = store.audit;
    return Scaffold(
      appBar: AppBar(title: const Text('سجل العمليات')),
      body: SingleChildScrollView(
        child: VScreen(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const VPageTitle(
                title: 'سجل العمليات',
                subtitle: 'مراقبة تغييرات المستخدمين داخل نسخة العرض',
              ),
              const VDemoBanner(compact: true),
              const SizedBox(height: 15),
              VCard(
                child: events.isEmpty
                    ? const VEmpty(
                        title: 'لا توجد أحداث بعد',
                        subtitle: 'أضف طلباً أو غيّر حالة لتظهر هنا',
                      )
                    : Column(
                        children: events
                            .map(
                              (e) => ListTile(
                                contentPadding: EdgeInsets.zero,
                                leading: const Icon(
                                  Icons.history,
                                  color: VColors.brand,
                                ),
                                title: Text(e.title),
                                subtitle: Text(
                                  '${e.actor} • ${formatDate(e.time)} • ${formatTime(e.time)}',
                                ),
                              ),
                            )
                            .toList(),
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class GeneralSettingsScreen extends StatelessWidget {
  const GeneralSettingsScreen({super.key});
  @override
  Widget build(BuildContext context) {
    if (!StoreScope.of(context).can(AppPermission.manageSettings)) {
      return const Scaffold(
        body: Center(child: Text('غير مصرح بإعدادات النظام')),
      );
    }
    return Scaffold(
      appBar: AppBar(title: const Text('إعدادات عامة')),
      body: SingleChildScrollView(
        child: VScreen(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const VPageTitle(
                title: 'Velnix',
                subtitle: 'Smart Order Management',
              ),
              const VDemoBanner(),
              const VSection(title: 'معلومات النظام'),
              const VCard(
                child: Column(
                  children: [
                    ListTile(
                      leading: Icon(
                        Icons.language_outlined,
                        color: VColors.brand,
                      ),
                      title: Text('اللغة'),
                      subtitle: Text('العربية • اتجاه من اليمين لليسار'),
                    ),
                    Divider(),
                    ListTile(
                      leading: Icon(
                        Icons.devices_outlined,
                        color: VColors.brand,
                      ),
                      title: Text('التخطيط'),
                      subtitle: Text('متجاوب للجوال والشاشات الكبيرة'),
                    ),
                    Divider(),
                    ListTile(
                      leading: Icon(Icons.cloud_outlined, color: VColors.brand),
                      title: Text('Firebase'),
                      subtitle: Text(
                        'غير مهيأ بعد — سيتم الربط في خطوات Open Code',
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
