import 'package:flutter/material.dart';
import '../core/theme.dart';
import '../core/widgets.dart';
import '../data/demo_store.dart';
import '../models/entities.dart';

class TeamScreen extends StatelessWidget {
  const TeamScreen({super.key});
  @override Widget build(BuildContext context) {
    final store = StoreScope.of(context);
    if (!store.can(AppPermission.manageEmployees)) {
      return const Scaffold(body: Center(child: Text('ليست لديك صلاحية إدارة الموظفين')));
    }
    return Scaffold(appBar: AppBar(title: const Text('الفريق والصلاحيات')),
      body: SingleChildScrollView(child: VScreen(child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        VPageTitle(title: 'فريق العمل', subtitle: 'خمسة أدوار • كل الموظفين يستطيعون إنشاء طلب',
          action: IconButton.filled(onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const EmployeeForm())),
            icon: const Icon(Icons.person_add_alt_1_rounded))),
        const VDemoBanner(compact: true), const SizedBox(height: 15),
        LayoutBuilder(builder: (context, c) {
          final cross = c.maxWidth >= 850 ? 5 : c.maxWidth >= 550 ? 3 : 2;
          final cardWidth = (c.maxWidth - 8 * (cross - 1)) / cross;
          return Wrap(spacing: 8, runSpacing: 8, children: [
            for (final role in UserRole.values) SizedBox(width: cardWidth, child: _roleCard(store, role)),
          ]);
        }),
        const VSection(title: 'أعضاء الفريق'),
        ...store.members.map((m) => Padding(padding: const EdgeInsets.only(bottom: 10), child: VPanel(padding: const EdgeInsets.all(13), child: Row(children: [
          Container(width: 44, height: 44, decoration: BoxDecoration(color: _roleColor(m.role).withValues(alpha: .11), borderRadius: BorderRadius.circular(13)),
            child: Center(child: Text(m.name.substring(0, 1), style: TextStyle(fontSize: 20, color: _roleColor(m.role), fontWeight: FontWeight.w900)))),
          const SizedBox(width: 12), Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(m.name, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w900, color: VColors.ink)),
            const SizedBox(height: 4), Text('${m.role.label}  •  ${m.active ? 'نشط' : 'موقوف'}',
              style: TextStyle(fontSize: 12, color: m.active ? VColors.muted : VColors.danger)),
          ])),
          IconButton(onPressed: store.canAdministerMember(m) ? () => Navigator.push(context, MaterialPageRoute(builder: (_) => EmployeeForm(member: m))) : null,
            tooltip: 'الصلاحيات', icon: const Icon(Icons.manage_accounts_outlined, color: VColors.brand)),
        ])))),
      ]))));
  }
  Widget _roleCard(DemoStore store, UserRole role) {
    final color = _roleColor(role);
    return VPanel(padding: const EdgeInsets.all(13), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [Icon(Icons.admin_panel_settings_outlined, size: 20, color: color), const Spacer(),
        Text('${store.members.where((m) => m.role == role).length}', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: color))]),
      const SizedBox(height: 8), Text(role.label, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800)),
    ]));
  }
  Color _roleColor(UserRole role) => switch (role) {
    UserRole.generalManager => VColors.brand,
    UserRole.manager => VColors.violet,
    UserRole.warehouse => VColors.warning,
    UserRole.sales => VColors.aqua,
    UserRole.dataEntry => const Color(0xFF4684D9),
  };
}

class EmployeeForm extends StatefulWidget {
  const EmployeeForm({super.key, this.member});
  final TeamMember? member;
  @override State<EmployeeForm> createState() => _EmployeeFormState();
}
class _EmployeeFormState extends State<EmployeeForm> {
  final form = GlobalKey<FormState>();
  late final name = TextEditingController(text: widget.member?.name ?? '');
  late final email = TextEditingController(text: widget.member?.email ?? '');
  late final phone = TextEditingController(text: widget.member?.phone ?? '');
  late UserRole role = widget.member?.role ?? UserRole.dataEntry;
  late bool active = widget.member?.active ?? true;
  late String? salesSupervisorId = widget.member?.salesSupervisorId;
  late final Set<AppPermission> permissions = {...?widget.member?.permissions};
  @override void dispose() { name.dispose(); email.dispose(); phone.dispose(); super.dispose(); }
  @override Widget build(BuildContext context) {
    final store = StoreScope.of(context);
    if (!store.can(AppPermission.manageEmployees) ||
        (widget.member != null && !store.canAdministerMember(widget.member!))) {
      return const Scaffold(body: Center(child: Text('غير مصرح بإدارة هذا الحساب')));
    }
    return Scaffold(appBar: AppBar(title: Text(widget.member == null ? 'موظف جديد' : 'إعدادات الموظف')),
      body: SingleChildScrollView(child: VScreen(child: Form(key: form, child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const VPageTitle(title: 'بيانات الموظف', subtitle: 'الأدوار مع صلاحيات تفصيلية قابلة للتخصيص'),
        VPanel(child: Column(children: [
          VField(label: 'الاسم', controller: name, requiredField: true), const SizedBox(height: 14),
          VField(label: 'البريد الإلكتروني', controller: email, requiredField: true, keyboardType: TextInputType.emailAddress), const SizedBox(height: 14),
          VField(label: 'الهاتف', controller: phone, keyboardType: TextInputType.phone), const SizedBox(height: 14),
          DropdownButtonFormField<UserRole>(initialValue: role, decoration: const InputDecoration(labelText: 'الدور'),
            items: UserRole.values.where(store.canGrantRole)
              .map((r) => DropdownMenuItem(value: r, child: Text(r.label))).toList(),
            onChanged: (v) => setState(() {role = v ?? role; if (role != UserRole.dataEntry) salesSupervisorId = null;})),
          if (role == UserRole.dataEntry) ...[
            const SizedBox(height: 12),
            DropdownButtonFormField<String?>(
              key: ValueKey('sales-$salesSupervisorId'),
              initialValue: salesSupervisorId,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'موظف المبيعات المسؤول (اختياري)'),
              items: [const DropdownMenuItem<String?>(value: null, child: Text('بدون تعيين')),
                ...store.members.where((m) => m.role == UserRole.sales && (m.active || m.id == salesSupervisorId)).map(
                  (m) => DropdownMenuItem<String?>(value: m.id, child: Text(m.active ? m.name : '${m.name} (موقوف)')))],
              onChanged: (v) => setState(() => salesSupervisorId = v),
            ),
          ],
          const SizedBox(height: 8), SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('حساب نشط'),
            value: active, onChanged: (v) => setState(() => active = v)),
        ])),
        const VSection(title: 'الصلاحيات'),
        VPanel(child: Column(children: [
          const ListTile(contentPadding: EdgeInsets.zero, title: Text('إضافة طلب'),
            subtitle: Text('متاحة لكل الموظفين دائماً'), trailing: Icon(Icons.verified_rounded, color: VColors.aqua)),
          const Divider(),
          if (role == UserRole.generalManager) const ListTile(title: Text('وصول كامل'), subtitle: Text('المدير العام يمتلك جميع الصلاحيات'))
          else ...AppPermission.values.where((permission) => store.me.role == UserRole.generalManager || store.can(permission)).map((permission) => CheckboxListTile(
            contentPadding: EdgeInsets.zero, dense: true, controlAffinity: ListTileControlAffinity.leading,
            title: Text(permission.label, style: const TextStyle(fontSize: 12)),
            value: permissions.contains(permission),
            onChanged: (v) => setState(() { if (v == true) { permissions.add(permission); } else { permissions.remove(permission); } }),
          )),
        ])),
        const SizedBox(height: 19),
        FilledButton.icon(onPressed: () {
          if (!form.currentState!.validate()) return;
          final saved = widget.member == null
            ? store.addMember(TeamMember(id: 'u${DateTime.now().microsecondsSinceEpoch}', name: name.text.trim(), email: email.text.trim(),
                phone: phone.text.trim(), role: role, active: active, permissions: Set.of(permissions), salesSupervisorId: salesSupervisorId))
            : store.updateMember(widget.member!, name: name.text.trim(), email: email.text.trim(),
                phone: phone.text.trim(), role: role, active: active, permissions: Set.of(permissions), salesSupervisorId: salesSupervisorId);
          if (!saved) { vToast(context, 'تعذّر الحفظ: تحقق من الصلاحيات أو البريد المكرر أو حماية المدير العام'); return; }
          vToast(context, 'تم حفظ إعدادات الموظف (معاينة)'); Navigator.pop(context);
        }, icon: const Icon(Icons.save_outlined), label: const Text('حفظ الموظف والصلاحيات')),
        const SizedBox(height: 12),
        const Text('هذه صلاحيات واجهة فقط. Firebase Security Rules وCloud Functions ستفرض نفس السياسة عند الربط الفعلي.',
          style: TextStyle(fontSize: 12, color: VColors.muted)),
        const SizedBox(height: 20),
      ])))));
  }
}
