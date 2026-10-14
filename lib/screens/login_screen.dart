import 'package:flutter/material.dart';
import '../core/theme.dart';
import '../core/widgets.dart';
import '../data/demo_store.dart';
import '../models/entities.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.onDemoLogin});
  final VoidCallback onDemoLogin;
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  String selectedId = 'u1';
  @override
  Widget build(BuildContext context) {
    final store = StoreScope.of(context);
    final selected = store.members.firstWhere((m) => m.id == selectedId);
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(22),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SizedBox(height: 22),
                  const Center(child: VLogo(size: 60, withTitle: true)),
                  const SizedBox(height: 28),
                  const Text(
                    'مساحة العمل الذكية',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 27,
                      fontWeight: FontWeight.w900,
                      color: VColors.ink,
                    ),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'الطلبات، فرق العمل، وشركات التوصيل في تجربة واحدة.',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 12, color: VColors.muted),
                  ),
                  const SizedBox(height: 27),
                  VPanel(
                    padding: const EdgeInsets.all(20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'الدخول لمعاينة Velnix',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w900,
                            color: VColors.ink,
                          ),
                        ),
                        const SizedBox(height: 4),
                        const Text(
                          'اختر الموظف لتشاهد اختلاف الواجهات والصلاحيات',
                          style: TextStyle(fontSize: 12, color: VColors.muted),
                        ),
                        const SizedBox(height: 20),
                        for (final member in store.members)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: _roleTile(member),
                          ),
                        const SizedBox(height: 8),
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: VColors.softBlue,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Row(
                            children: [
                              const Icon(
                                Icons.shield_outlined,
                                color: VColors.brand,
                                size: 20,
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Text(
                                  _caption(selected.role),
                                  style: const TextStyle(
                                    fontSize: 12,
                                    color: VColors.ink,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 17),
                        SizedBox(
                          width: double.infinity,
                          child: FilledButton.icon(
                            onPressed: selected.active
                                ? () {
                                    if (store.chooseUser(selectedId)) {
                                      widget.onDemoLogin();
                                    }
                                  }
                                : null,
                            icon: const Icon(Icons.arrow_back_rounded),
                            label: const Text('دخول إلى لوحة التحكم'),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  const Center(
                    child: Text(
                      'نسخة واجهات تجريبية • بدون Firebase أو ربط توصيل فعلي',
                      style: TextStyle(color: VColors.muted, fontSize: 10),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _roleTile(TeamMember member) {
    final active = member.id == selectedId;
    return InkWell(
      onTap: member.active
          ? () => setState(() => selectedId = member.id)
          : null,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: active ? VColors.softBlue : Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: active ? VColors.brand : VColors.line,
            width: active ? 1.6 : 1,
          ),
        ),
        child: Row(
          children: [
            CircleAvatar(
              radius: 19,
              backgroundColor: active ? VColors.brand : VColors.canvas,
              child: Text(
                member.name.substring(0, 1),
                style: TextStyle(
                  fontWeight: FontWeight.w900,
                  color: active ? Colors.white : VColors.ink,
                ),
              ),
            ),
            const SizedBox(width: 11),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    member.role.label,
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w900,
                      color: VColors.ink,
                    ),
                  ),
                  Text(
                    '${member.name}${member.active ? '' : ' • حساب موقوف'}',
                    style: const TextStyle(fontSize: 12, color: VColors.muted),
                  ),
                ],
              ),
            ),
            Icon(
              active
                  ? Icons.radio_button_checked_rounded
                  : Icons.radio_button_off_rounded,
              color: active ? VColors.brand : VColors.muted,
              size: 21,
            ),
          ],
        ),
      ),
    );
  }

  String _caption(UserRole role) => switch (role) {
    UserRole.generalManager =>
      'الوصول الكامل: الفريق، الشركات، التحديثات، التقارير وكل الطلبات.',
    UserRole.manager =>
      'المتابعة والتقارير وتعديل الحالات ضمن الصلاحيات المحددة.',
    UserRole.warehouse =>
      'متابعة حركة الطلبات وتجهيزها وتغيير الحالات دون إعدادات الإدارة.',
    UserRole.sales =>
      'متابعة طلبات المبيعات ومدخلي البيانات، مع إنشاء طلبات جديدة.',
    UserRole.dataEntry =>
      'إنشاء الطلبات ومتابعة طلباتك فقط، دون إدارة الفريق أو الشركات.',
  };
}
