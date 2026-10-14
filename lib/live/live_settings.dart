import 'package:flutter/material.dart';
import 'gateway.dart';
import 'live_app.dart';

class LiveSettings extends StatefulWidget {
  const LiveSettings({super.key});
  @override
  State<LiveSettings> createState() => _LiveSettingsState();
}

class _LiveSettingsState extends State<LiveSettings> {
  final form = GlobalKey<FormState>();
  final name = TextEditingController(),
      phone = TextEditingController(),
      footer = TextEditingController();
  bool loading = true, busy = false;
  String? error;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    try {
      final data = await VelnixGateway.instance.call('getSettings');
      if (mounted) {
        setState(() {
          name.text = data['organizationName']?.toString() ?? '';
          phone.text = data['supportPhone']?.toString() ?? '';
          footer.text = data['receiptFooter']?.toString() ?? '';
          loading = false;
          error = null;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          error = e.toString();
          loading = false;
        });
      }
    }
  }

  @override
  void dispose() {
    name.dispose();
    phone.dispose();
    footer.dispose();
    super.dispose();
  }

  Future<void> save() async {
    if (busy || !form.currentState!.validate()) return;
    setState(() => busy = true);
    try {
      await VelnixGateway.instance.call('saveSettings', {
        'organizationName': name.text.trim(),
        'supportPhone': phone.text.trim(),
        'receiptFooter': footer.text.trim(),
      });
      if (mounted) showSuccess(context, 'تم حفظ إعدادات المؤسسة');
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('إعدادات المؤسسة')),
    body: loading
        ? const Center(child: CircularProgressIndicator())
        : SingleChildScrollView(
            child: LiveContent(
              child: Form(
                key: form,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (error != null)
                      VLivePanel(
                        child: Column(
                          children: [
                            Text(error!),
                            TextButton(
                              onPressed: load,
                              child: const Text('إعادة المحاولة'),
                            ),
                          ],
                        ),
                      ),
                    VLivePanel(
                      child: Column(
                        children: [
                          TextFormField(
                            controller: name,
                            maxLength: 120,
                            decoration: const InputDecoration(
                              labelText: 'اسم المؤسسة',
                            ),
                            validator: (value) =>
                                (value?.trim().isEmpty ?? true)
                                ? 'الاسم مطلوب'
                                : null,
                          ),
                          const SizedBox(height: 12),
                          TextFormField(
                            controller: phone,
                            maxLength: 30,
                            keyboardType: TextInputType.phone,
                            decoration: const InputDecoration(
                              labelText: 'هاتف الدعم (اختياري)',
                            ),
                          ),
                          const SizedBox(height: 12),
                          TextFormField(
                            controller: footer,
                            maxLength: 200,
                            maxLines: 3,
                            decoration: const InputDecoration(
                              labelText: 'تذييل سند الطلب (اختياري)',
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                    FilledButton.icon(
                      onPressed: busy ? null : save,
                      icon: const Icon(Icons.save_outlined),
                      label: Text(busy ? 'جارٍ الحفظ' : 'حفظ الإعدادات'),
                    ),
                  ],
                ),
              ),
            ),
          ),
  );
}
