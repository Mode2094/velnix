part of 'live_app.dart';

/// Self-service password change for email/password accounts.
///
/// Firebase requires a recent sign-in before a password change, so the screen
/// asks for the CURRENT password and re-authenticates with it. Google-only
/// accounts (no password provider) are shown a clear notice instead of a form.
/// The password is never logged, never sent to Firestore, and never cached.
class ChangePasswordScreen extends StatefulWidget {
  const ChangePasswordScreen({super.key});
  @override
  State<ChangePasswordScreen> createState() => _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends State<ChangePasswordScreen> {
  final form = GlobalKey<FormState>();
  final current = TextEditingController();
  final next = TextEditingController();
  final confirm = TextEditingController();
  bool busy = false, _obscure = true;

  @override
  void dispose() {
    current.dispose();
    next.dispose();
    confirm.dispose();
    super.dispose();
  }

  String? _validate(String? value) {
    final v = value ?? '';
    if (v.isEmpty) return 'أدخل كلمة المرور';
    if (v.length < 8) return 'كلمة المرور يجب أن تكون 8 أحرف على الأقل';
    return null;
  }

  bool get _isPasswordAccount {
    final user = VelnixGateway.instance.auth.currentUser;
    if (user == null) return false;
    // A Google-only account has no password provider.
    return user.providerData.any((p) => p.providerId == 'password');
  }

  Future<void> save() async {
    if (busy || !(form.currentState?.validate() ?? false)) return;
    if (next.text != confirm.text) {
      showError(context, 'كلمتا المرور الجديدتان غير متطابقتين');
      return;
    }
    if (next.text == current.text) {
      showError(context, 'اختر كلمة مرور جديدة مختلفة عن الحالية');
      return;
    }
    final user = VelnixGateway.instance.auth.currentUser;
    final email = user?.email;
    if (user == null || email == null) {
      showError(context, 'انتهت الجلسة؛ أعد تسجيل الدخول');
      return;
    }
    setState(() => busy = true);
    try {
      final credential = EmailAuthProvider.credential(
        email: email,
        password: current.text,
      );
      await user.reauthenticateWithCredential(credential);
      await user.updatePassword(next.text);
      if (mounted) {
        showSuccess(context, 'تم تغيير كلمة المرور بنجاح');
        Navigator.pop(context);
      }
    } on FirebaseAuthException catch (e) {
      if (mounted) {
        showError(context, switch (e.code) {
          'wrong-password' ||
          'invalid-credential' => 'كلمة المرور الحالية غير صحيحة',
          'weak-password' => 'كلمة المرور الجديدة ضعيفة؛ اختر واحدة أقوى',
          'requires-recent-login' =>
            'يلزم إعادة تسجيل الدخول قبل تغيير كلمة المرور',
          'too-many-requests' => 'محاولات كثيرة؛ انتظر قليلاً ثم أعد المحاولة',
          'network-request-failed' => 'تعذر الاتصال؛ تحقق من الشبكة',
          _ => 'تعذر تغيير كلمة المرور؛ أعد المحاولة',
        });
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('تغيير كلمة المرور')),
    body: SingleChildScrollView(
      child: LiveContent(
        child: VLivePanel(
          child: _isPasswordAccount
              ? Form(
                  key: form,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Text(
                        'لأمانك، أدخل كلمة المرور الحالية ثم كلمة مرور جديدة (8 أحرف على الأقل).',
                        style: TextStyle(color: VColors.muted, fontSize: 12),
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: current,
                        enabled: !busy,
                        obscureText: _obscure,
                        textDirection: TextDirection.ltr,
                        autofillHints: const [AutofillHints.password],
                        validator: (v) => (v == null || v.isEmpty)
                            ? 'أدخل كلمة المرور الحالية'
                            : null,
                        decoration: InputDecoration(
                          labelText: 'كلمة المرور الحالية',
                          prefixIcon: const Icon(Icons.lock_outline),
                          suffixIcon: IconButton(
                            tooltip: _obscure ? 'إظهار' : 'إخفاء',
                            onPressed: () =>
                                setState(() => _obscure = !_obscure),
                            icon: Icon(
                              _obscure
                                  ? Icons.visibility_outlined
                                  : Icons.visibility_off_outlined,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: next,
                        enabled: !busy,
                        obscureText: true,
                        textDirection: TextDirection.ltr,
                        validator: _validate,
                        decoration: const InputDecoration(
                          labelText: 'كلمة المرور الجديدة',
                          prefixIcon: Icon(Icons.lock_reset_outlined),
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: confirm,
                        enabled: !busy,
                        obscureText: true,
                        textDirection: TextDirection.ltr,
                        validator: _validate,
                        decoration: const InputDecoration(
                          labelText: 'تأكيد كلمة المرور الجديدة',
                          prefixIcon: Icon(Icons.lock_reset_outlined),
                        ),
                      ),
                      const SizedBox(height: 16),
                      FilledButton.icon(
                        onPressed: busy ? null : save,
                        icon: busy
                            ? const SizedBox.square(
                                dimension: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              )
                            : const Icon(Icons.check),
                        label: Text(
                          busy ? 'جارٍ التغيير...' : 'تغيير كلمة المرور',
                        ),
                      ),
                    ],
                  ),
                )
              : const VFeedbackPanel(
                  title: 'هذا الحساب لا يستخدم الدخول بالبريد وكلمة المرور',
                  message:
                      'تسجيل الدخول يتم عبر Google. لإدارة كلمة المرور استخدم حساب Google نفسه.',
                  icon: Icons.info_outline,
                ),
        ),
      ),
    ),
  );
}
