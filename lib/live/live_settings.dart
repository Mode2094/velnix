import 'package:flutter/material.dart';
import 'gateway.dart';
import 'live_app.dart';
import '../core/widgets.dart';
import '../core/theme.dart';

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
  bool loading = true, busy = false, _dirty = false;
  String? error;
  String? defaultCompanyId;
  String? defaultPageId;
  List<Map<String, dynamic>> companies = [];
  List<Map<String, dynamic>> pages = [];
  bool _staleCompany = false;
  bool _stalePage = false;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final data = await VelnixGateway.instance.call('getSettings');
      List<Map<String, dynamic>> comps = [];
      try {
        comps = (await VelnixGateway.instance.companies())
            .where((c) => c['enabled'] == true && c['archived'] != true)
            .toList();
      } catch (_) {}
      List<Map<String, dynamic>> pgs = [];
      try {
        final allowed = await VelnixGateway.instance.allowedPages();
        pgs = ((allowed['items'] as List?) ?? const [])
            .map((e) => Map<String, dynamic>.from(e as Map))
            .toList();
      } catch (_) {}
      var company = data['defaultCompanyId']?.toString();
      var page = data['defaultPageId']?.toString();
      // A default that is no longer usable (disabled/archived/deleted) is not
      // shown as selected: the field falls back to «بدون» with a clear notice.
      final staleCompany =
          company != null &&
          company.isNotEmpty &&
          !comps.any((c) => c['id']?.toString() == company);
      final stalePage =
          page != null &&
          page.isNotEmpty &&
          !pgs.any((p) => p['id']?.toString() == page);
      if (staleCompany) company = null;
      if (stalePage) page = null;
      if (mounted) {
        setState(() {
          name.text = data['organizationName']?.toString() ?? '';
          phone.text = data['supportPhone']?.toString() ?? '';
          footer.text = data['receiptFooter']?.toString() ?? '';
          defaultCompanyId = company;
          defaultPageId = page;
          companies = comps;
          pages = pgs;
          _staleCompany = staleCompany;
          _stalePage = stalePage;
          loading = false;
          error = null;
          _dirty = false;
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
        'defaultCompanyId': defaultCompanyId,
        'defaultPageId': defaultPageId,
      });
      VelnixGateway.instance.invalidate('settings');
      _dirty = false;
      if (mounted) showSuccess(context, 'تم حفظ إعدادات المؤسسة');
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !_dirty,
    onPopInvokedWithResult: (didPop, result) async {
      if (didPop) return;
      if (await confirmDiscardChanges(context) && context.mounted) {
        Navigator.pop(context);
      }
    },
    child: Scaffold(
      appBar: AppBar(title: const Text('إعدادات المؤسسة')),
      body: loading
          ? const Center(
              child: SingleChildScrollView(
                padding: EdgeInsets.all(16),
                child: VFeedbackPanel(
                  title: 'جارٍ تحميل الإعدادات',
                  loading: true,
                ),
              ),
            )
          : error != null
          ? SingleChildScrollView(
              child: LiveContent(
                child: VFeedbackPanel(
                  title: 'تعذر تحميل الإعدادات',
                  message: error,
                  icon: Icons.error_outline,
                  onRetry: load,
                ),
              ),
            )
          : SingleChildScrollView(
              child: LiveContent(
                child: Form(
                  key: form,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      VLivePanel(
                        child: Column(
                          children: [
                            TextFormField(
                              controller: name,
                              maxLength: 120,
                              onChanged: (_) => setState(() => _dirty = true),
                              decoration: const InputDecoration(
                                labelText: 'اسم المؤسسة *',
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
                              onChanged: (_) => setState(() => _dirty = true),
                              keyboardType: TextInputType.phone,
                              decoration: const InputDecoration(
                                labelText: 'هاتف الدعم (اختياري)',
                              ),
                            ),
                            const SizedBox(height: 12),
                            TextFormField(
                              controller: footer,
                              maxLength: 200,
                              onChanged: (_) => setState(() => _dirty = true),
                              maxLines: 3,
                              decoration: const InputDecoration(
                                labelText: 'تذييل سند الطلب (اختياري)',
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 14),
                      VLivePanel(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            const Row(
                              children: [
                                Icon(
                                  Icons.tune_rounded,
                                  size: 18,
                                  color: VColors.brand,
                                ),
                                SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    'الإعدادات الافتراضية للطلبات الجديدة',
                                    style: TextStyle(
                                      fontWeight: FontWeight.w900,
                                      fontSize: 14,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 4),
                            const Text(
                              'تُطبَّق على نموذج «طلب جديد» فقط، ويمكن للموظف تغييرها يدوياً. '
                              'اختيار الشركة لا يُرسل الشحنة تلقائياً.',
                              style: TextStyle(
                                color: VColors.muted,
                                fontSize: 11.5,
                              ),
                            ),
                            const SizedBox(height: 14),
                            DropdownButtonFormField<String>(
                              key: ValueKey(
                                'default-company-${defaultCompanyId ?? ''}',
                              ),
                              initialValue: defaultCompanyId,
                              isExpanded: true,
                              decoration: const InputDecoration(
                                labelText: 'شركة التوصيل الافتراضية',
                              ),
                              items: [
                                const DropdownMenuItem<String>(
                                  value: null,
                                  child: Text('بدون شركة افتراضية'),
                                ),
                                for (final c in companies)
                                  DropdownMenuItem(
                                    value: c['id']?.toString(),
                                    child: Text(
                                      c['name']?.toString() ?? '',
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                              ],
                              onChanged: (v) => setState(() {
                                defaultCompanyId = v;
                                _staleCompany = false;
                                _dirty = true;
                              }),
                            ),
                            if (_staleCompany)
                              const Padding(
                                padding: EdgeInsets.only(top: 6),
                                child: Text(
                                  'الشركة الافتراضية المحفوظة لم تعد متاحة؛ اختر شركة أخرى أو اترك «بدون».',
                                  style: TextStyle(
                                    color: VColors.warning,
                                    fontSize: 11.5,
                                  ),
                                ),
                              ),
                            const SizedBox(height: 12),
                            DropdownButtonFormField<String>(
                              key: ValueKey(
                                'default-page-${defaultPageId ?? ''}',
                              ),
                              initialValue: defaultPageId,
                              isExpanded: true,
                              decoration: const InputDecoration(
                                labelText: 'صفحة فيسبوك الافتراضية',
                              ),
                              items: [
                                const DropdownMenuItem<String>(
                                  value: null,
                                  child: Text('بدون صفحة افتراضية'),
                                ),
                                for (final p in pages)
                                  DropdownMenuItem(
                                    value: p['id']?.toString(),
                                    child: Text(
                                      p['name']?.toString() ?? '',
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                              ],
                              onChanged: (v) => setState(() {
                                defaultPageId = v;
                                _stalePage = false;
                                _dirty = true;
                              }),
                            ),
                            if (_stalePage)
                              const Padding(
                                padding: EdgeInsets.only(top: 6),
                                child: Text(
                                  'الصفحة الافتراضية المحفوظة لم تعد متاحة؛ اختر صفحة أخرى أو اترك «بدون».',
                                  style: TextStyle(
                                    color: VColors.warning,
                                    fontSize: 11.5,
                                  ),
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
    ),
  );
}
