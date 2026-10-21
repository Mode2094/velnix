part of 'live_app.dart';

class LiveCompanies extends StatefulWidget {
  const LiveCompanies({super.key, required this.policy});
  final SessionPolicy policy;
  @override
  State<LiveCompanies> createState() => _LiveCompaniesState();
}

class _LiveCompaniesState extends State<LiveCompanies> {
  bool operating = false;
  Future<void> guard(Future<void> Function() operation) async {
    if (operating) return;
    setState(() => operating = true);
    try {
      await operation();
    } finally {
      if (mounted) setState(() => operating = false);
    }
  }

  late Future<List<Map<String, dynamic>>> request;
  @override
  void initState() {
    super.initState();
    refresh();
  }

  void refresh() => request = Future.value([]);
  void reload() {
    setState(refresh);
  }

  Future<void> doAction(Future<void> Function() op) async {
    try {
      await op();
      if (mounted) {
        showSuccess(context, 'اكتملت العملية');
        reload();
      }
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) => DirectoryPanel(
    key: ValueKey(request),
    endpoint: 'listCompanies',
    builder: (companies) => SingleChildScrollView(
      child: LiveContent(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Wrap(
              alignment: WrapAlignment.spaceBetween,
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: 8,
              runSpacing: 9,
              children: [
                Text(
                  'شركات التوصيل',
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                if (widget.policy.can('manageCompanies'))
                  FilledButton.icon(
                    onPressed: operating
                        ? null
                        : () => guard(() => _edit(null)),
                    icon: const Icon(Icons.add),
                    label: const Text('إضافة شركة'),
                  ),
              ],
            ),
            const SizedBox(height: 15),
            if (operating) const LinearProgressIndicator(),
            if (companies.isEmpty)
              const VLivePanel(child: Text('لم تتم إضافة شركات توصيل')),
            for (final c in companies)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: VLivePanel(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Wrap(
                        alignment: WrapAlignment.spaceBetween,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(
                                Icons.local_shipping,
                                color: VColors.brand,
                              ),
                              const SizedBox(width: 8),
                              Flexible(
                                child: Text(
                                  c['name']?.toString() ?? '',
                                  style: const TextStyle(
                                    fontSize: 17,
                                    fontWeight: FontWeight.w900,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          Text(
                            c['archived'] == true
                                ? 'مؤرشفة'
                                : c['enabled'] == true
                                ? 'مفعّلة'
                                : 'معطلة',
                            style: TextStyle(
                              color: c['enabled'] == true
                                  ? VColors.aqua
                                  : VColors.muted,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 9),
                      Text(
                        'المحوّل: ${c['provider']} • آخر اختبار: ${c['lastHealthCheck'] == null ? 'لم يتم' : businessDate(c['lastHealthCheck'])}',
                        style: const TextStyle(
                          color: VColors.muted,
                          fontSize: 12,
                        ),
                      ),
                      if (c['lastHealthError'] != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: Text(
                            c['lastHealthError'].toString(),
                            style: const TextStyle(color: VColors.danger),
                          ),
                        ),
                      const SizedBox(height: 9),
                      Text(
                        c['apiUrl']?.toString() ?? '',
                        style: const TextStyle(
                          color: VColors.muted,
                          fontSize: 11,
                        ),
                        textDirection: TextDirection.ltr,
                      ),
                      const SizedBox(height: 14),
                      CompanyStatusCards(
                        key: ValueKey(c['id']),
                        company: c,
                        policy: widget.policy,
                      ),
                      if (widget.policy.can('manageCompanies')) ...[
                        const Divider(height: 24),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            if (c['archived'] != true)
                              OutlinedButton.icon(
                                onPressed: operating
                                    ? null
                                    : () => guard(() => _edit(c)),
                                icon: const Icon(Icons.edit_outlined),
                                label: const Text('تعديل'),
                              ),
                            if (c['archived'] == true)
                              OutlinedButton.icon(
                                onPressed: operating
                                    ? null
                                    : () => guard(() => _restore(c)),
                                icon: const Icon(Icons.restore),
                                label: const Text('استعادة الشركة'),
                              ),
                            OutlinedButton.icon(
                              onPressed: operating
                                  ? null
                                  : () => guard(() => _health(c)),
                              icon: const Icon(Icons.network_check),
                              label: const Text('اختبار الاتصال'),
                            ),
                            if (c['archived'] != true)
                              OutlinedButton.icon(
                                onPressed: operating
                                    ? null
                                    : () => guard(() => _archive(c)),
                                icon: const Icon(Icons.archive_outlined),
                                label: const Text('أرشفة'),
                              ),
                          ],
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    ),
  );
  Future<void> _health(Map<String, dynamic> c) async {
    try {
      final result = await VelnixGateway.instance.testCompany(
        c['id'].toString(),
      );
      if (mounted) {
        if (result['connected'] == true) {
          showSuccess(context, 'اتصال ناجح بالخادم');
          reload();
        } else {
          showError(context, 'فشل اختبار الاتصال: ${result['error']}');
        }
      }
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  Future<void> _archive(Map<String, dynamic> c) async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('أرشفة شركة التوصيل؟'),
        content: const Text(
          'لن تُحذف الطلبات القديمة. لا يمكن إرسال طلبات جديدة إلى الشركة المؤرشفة.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('رجوع'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('أرشفة'),
          ),
        ],
      ),
    );
    if (yes == true) {
      await doAction(
        () => VelnixGateway.instance.archiveCompany(c['id'].toString()),
      );
    }
  }

  Future<void> _restore(Map<String, dynamic> company) async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('استعادة شركة التوصيل؟'),
        content: const Text(
          'سيتم استعادة الشركة بوضع معطّل، ويجب مراجعة إعدادات API قبل تفعيلها.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('رجوع'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('استعادة'),
          ),
        ],
      ),
    );
    if (yes == true) {
      await doAction(
        () => VelnixGateway.instance.restoreCompany(company['id'].toString()),
      );
    }
  }

  Future<void> _edit(Map<String, dynamic>? company) async {
    final changed = await Navigator.push<bool>(
      context,
      MaterialPageRoute<bool>(
        builder: (_) => LiveCompanyForm(initial: company),
      ),
    );
    if (changed == true) reload();
  }
}

/// Status tiles inside each delivery-company card, matching the reference hierarchy.
class CompanyStatusCards extends StatefulWidget {
  const CompanyStatusCards({
    super.key,
    required this.company,
    required this.policy,
  });
  final Map<String, dynamic> company;
  final SessionPolicy policy;
  @override
  State<CompanyStatusCards> createState() => _CompanyStatusCardsState();
}

class _CompanyStatusCardsState extends State<CompanyStatusCards> {
  late Future<Map<String, dynamic>> request;
  @override
  void initState() {
    super.initState();
    request = VelnixGateway.instance.companyStats(
      widget.company['id'].toString(),
    );
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<Map<String, dynamic>>(
    future: request,
    builder: (context, snap) {
      if (!snap.hasData) {
        if (snap.hasError) {
          return Text(
            'تعذر إظهار ملخص حالات الشركة: ${snap.error}',
            style: const TextStyle(color: VColors.danger, fontSize: 11),
          );
        }
        return const LinearProgressIndicator();
      }
      final counts = Map<String, dynamic>.from(snap.data!['counts'] as Map);
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'الطلبات حسب الحالة',
            style: TextStyle(fontWeight: FontWeight.w900, fontSize: 14),
          ),
          if (snap.data!['partial'] == true)
            const Text(
              'الأرقام تخص أحدث 1000 طلب للشركة فقط',
              style: TextStyle(color: VColors.danger, fontSize: 11),
            ),
          const SizedBox(height: 9),
          LayoutBuilder(
            builder: (ctx, box) {
              final cols = box.maxWidth >= 850
                  ? 5
                  : box.maxWidth >= 490
                  ? 3
                  : 2;
              final cardWidth = (box.maxWidth - (cols - 1) * 8) / cols;
              return Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final status in statusLabels.keys)
                    SizedBox(
                      width: cardWidth,
                      child: Material(
                        color: (statusColors[status] ?? VColors.brand)
                            .withValues(alpha: .065),
                        borderRadius: BorderRadius.circular(12),
                        child: InkWell(
                          borderRadius: BorderRadius.circular(12),
                          onTap: () => Navigator.push(
                            context,
                            MaterialPageRoute<void>(
                              builder: (_) => Scaffold(
                                appBar: AppBar(
                                  title: Text(
                                    '${widget.company['name']} • ${statusLabels[status]}',
                                  ),
                                ),
                                body: LiveOrders(
                                  policy: widget.policy,
                                  companyId: widget.company['id'].toString(),
                                  bucket: 'delivery',
                                  status: status,
                                ),
                              ),
                            ),
                          ),
                          child: Padding(
                            padding: const EdgeInsets.all(11),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  statusLabels[status]!,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                const SizedBox(height: 5),
                                Text(
                                  '${(counts[status] as Map?)?['count'] ?? 0}',
                                  style: TextStyle(
                                    fontSize: 22,
                                    fontWeight: FontWeight.w900,
                                    color: statusColors[status],
                                  ),
                                ),
                                if (widget.policy.viewAmounts)
                                  Text(
                                    displayAmount(
                                      ((counts[status] as Map?)?['amountMinor']
                                                  as num? ??
                                              0) /
                                          1000,
                                    ),
                                    style: const TextStyle(
                                      fontSize: 10,
                                      color: VColors.muted,
                                    ),
                                  ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              );
            },
          ),
        ],
      );
    },
  );
}

class LiveCompanyForm extends StatefulWidget {
  const LiveCompanyForm({super.key, this.initial});
  final Map<String, dynamic>? initial;
  @override
  State<LiveCompanyForm> createState() => _LiveCompanyFormState();
}

class _LiveCompanyFormState extends State<LiveCompanyForm> {
  final form = GlobalKey<FormState>();
  late final TextEditingController name;
  late final TextEditingController url;
  final token = TextEditingController(),
      webhook = TextEditingController(),
      remote = TextEditingController(),
      clickUserId = TextEditingController();
  late final Map<String, String> mappings = {
    for (final e in (widget.initial?['statusMap'] as Map? ?? {}).entries)
      e.key.toString(): e.value.toString(),
  };
  late bool enabled = widget.initial?['enabled'] == true;
  late String provider =
      widget.initial?['provider']?.toString() ?? 'generic_v1';
  String target = 'delivered';
  bool busy = false;
  bool _dirty = false;
  @override
  void initState() {
    super.initState();
    name = TextEditingController();
    url = TextEditingController();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      name.text = widget.initial?['name']?.toString() ?? '';
      url.text = widget.initial?['apiUrl']?.toString() ?? '';
      clickUserId.text = widget.initial?['clickUserId']?.toString() ?? '';
      setState(() {});
    });
  }

  @override
  void dispose() {
    name.dispose();
    url.dispose();
    token.dispose();
    webhook.dispose();
    remote.dispose();
    clickUserId.dispose();
    super.dispose();
  }

  Future<void> save() async {
    if (!form.currentState!.validate() || busy) return;
    setState(() => busy = true);
    try {
      await VelnixGateway.instance.saveCompany({
        if (widget.initial != null) 'id': widget.initial!['id'],
        'name': name.text.trim(),
        'apiUrl': url.text.trim(),
        'provider': provider,
        'enabled': enabled,
        'statusMap': provider == 'click_delivery_v1'
            ? <String, String>{}
            : mappings,
        if (provider == 'generic_v1' && token.text.isNotEmpty)
          'apiToken': token.text,
        if (provider == 'generic_v1' && webhook.text.isNotEmpty)
          'webhookKey': webhook.text,
        if (provider == 'click_delivery_v1' &&
            clickUserId.text.trim().isNotEmpty)
          'clickUserId': clickUserId.text.trim(),
      });
      _dirty = false;
      token.clear();
      webhook.clear();
      if (mounted) Navigator.pop(context, true);
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
      appBar: AppBar(
        title: Text(
          widget.initial == null ? 'إضافة شركة توصيل' : 'تعديل الشركة',
        ),
      ),
      body: SingleChildScrollView(
        child: LiveContent(
          child: Form(
            key: form,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                VLivePanel(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Text(
                        'بيانات الشركة',
                        style: TextStyle(
                          fontWeight: FontWeight.w900,
                          fontSize: 18,
                        ),
                      ),
                      const SizedBox(height: 14),
                      DropdownButtonFormField<String>(
                        isExpanded: true,
                        initialValue: provider,
                        decoration: const InputDecoration(
                          labelText: 'نوع التكامل',
                        ),
                        items: const [
                          DropdownMenuItem(
                            value: 'generic_v1',
                            child: Text(
                              'موصل مرجعي',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          DropdownMenuItem(
                            value: 'click_delivery_v1',
                            child: Text(
                              'Click Delivery',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                        onChanged: widget.initial != null
                            ? null
                            : (value) {
                                if (value == null) return;
                                setState(() {
                                  provider = value;
                                  enabled = false;
                                  _dirty = true;
                                  if (provider == 'click_delivery_v1') {
                                    url.text =
                                        'https://admin.clickdelivery.org/Client';
                                  }
                                });
                              },
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: name,
                        textDirection: TextDirection.rtl,
                        maxLength: 140,
                        onChanged: (_) => setState(() => _dirty = true),
                        decoration: const InputDecoration(
                          labelText: 'اسم شركة التوصيل *',
                        ),
                        validator: (v) => v == null || v.trim().isEmpty
                            ? 'أدخل اسم الشركة'
                            : null,
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: url,
                        textDirection: TextDirection.ltr,
                        keyboardType: TextInputType.url,
                        onChanged: (_) => setState(() => _dirty = true),
                        decoration: const InputDecoration(
                          labelText: 'رابط API (HTTPS) *',
                        ),
                        validator: (v) => v == null || !v.startsWith('https://')
                            ? 'يجب أن يكون رابط HTTPS'
                            : null,
                      ),
                      SwitchListTile(
                        contentPadding: EdgeInsets.zero,
                        title: const Text('الشركة مفعّلة'),
                        value: enabled,
                        onChanged: (v) => setState(() {
                          _dirty = true;
                          enabled = v;
                        }),
                      ),
                      const Text(
                        'لن يعمل الرابط إلا إذا كان مضيفه مسموحاً به في إعدادات الخادم.',
                        style: TextStyle(color: VColors.muted, fontSize: 11),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                if (provider == 'click_delivery_v1')
                  const VFeedbackPanel(
                    title: 'تكامل Click Delivery',
                    message:
                        'اختبار الاتصال يقرأ شحنة موجودة عبر getorder فقط ولا ينشئ شحنة. تفعيل الشركة يسمح بإسنادها للطلبات، بينما يبقى إرسال الشحنات محكوماً بمفتاح الإرسال وUser_ID والاعتمادات على الخادم.',
                  ),
                if (provider == 'click_delivery_v1')
                  VLivePanel(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const Text(
                          'User_ID لحساب Click',
                          style: TextStyle(
                            fontWeight: FontWeight.w900,
                            fontSize: 17,
                          ),
                        ),
                        const SizedBox(height: 8),
                        TextFormField(
                          controller: clickUserId,
                          textDirection: TextDirection.ltr,
                          keyboardType: TextInputType.number,
                          onChanged: (_) => setState(() => _dirty = true),
                          decoration: const InputDecoration(
                            labelText: 'Client ID / User_ID (مطلوب لـClick)',
                          ),
                          validator: (v) {
                            final value = v?.trim() ?? '';
                            if (value.isEmpty) return null;
                            final parsed = int.tryParse(value);
                            return parsed == null || parsed < 1
                                ? 'أدخل User_ID رقماً صالحاً'
                                : null;
                          },
                        ),
                        const SizedBox(height: 8),
                        const Text(
                          'يُستخدم لقراءة حالة الشحنة فقط عبر getorder. لا يفعّل إنشاء الشحنات.',
                          style: TextStyle(color: VColors.muted, fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                if (provider == 'generic_v1')
                  VLivePanel(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const Text(
                          'بيانات الاتصال السرية',
                          style: TextStyle(
                            fontWeight: FontWeight.w900,
                            fontSize: 17,
                          ),
                        ),
                        const SizedBox(height: 10),
                        TextField(
                          controller: token,
                          onChanged: (_) => setState(() => _dirty = true),
                          obscureText: true,
                          decoration: const InputDecoration(
                            labelText:
                                'API Token • اتركه فارغاً للاحتفاظ بالسابق',
                          ),
                        ),
                        const SizedBox(height: 11),
                        TextField(
                          controller: webhook,
                          onChanged: (_) => setState(() => _dirty = true),
                          obscureText: true,
                          decoration: const InputDecoration(
                            labelText:
                                'Webhook HMAC Secret • اتركه فارغاً للاحتفاظ بالسابق',
                          ),
                        ),
                        const SizedBox(height: 10),
                        const Text(
                          'لا يتم عرض الرموز القديمة. تُرسل للخادم وتحفظ مشفّرة باستخدام Cloud KMS؛ لا تُخزّن داخل التطبيق.',
                          style: TextStyle(color: VColors.muted, fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                const SizedBox(height: 12),
                if (provider == 'generic_v1')
                  VLivePanel(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const Text(
                          'ربط حالات التوصيل',
                          style: TextStyle(
                            fontWeight: FontWeight.w900,
                            fontSize: 17,
                          ),
                        ),
                        const SizedBox(height: 8),
                        for (final e in mappings.entries)
                          ListTile(
                            title: Text(
                              e.key,
                              textDirection: TextDirection.ltr,
                            ),
                            subtitle: Text(statusLabels[e.value] ?? e.value),
                            trailing: IconButton(
                              tooltip: 'إزالة الربط',
                              onPressed: () => setState(() {
                                _dirty = true;
                                mappings.remove(e.key);
                              }),
                              icon: const Icon(
                                Icons.close,
                                color: VColors.danger,
                              ),
                            ),
                          ),
                        TextField(
                          controller: remote,
                          onChanged: (_) => setState(() => _dirty = true),
                          decoration: const InputDecoration(
                            labelText:
                                'اسم الحالة في شركة التوصيل • مثال delivered',
                          ),
                          textDirection: TextDirection.ltr,
                        ),
                        const SizedBox(height: 9),
                        DropdownButtonFormField<String>(
                          isExpanded: true,

                          initialValue: target,
                          decoration: const InputDecoration(
                            labelText: 'الحالة الداخلية',
                          ),
                          items: statusLabels.entries
                              .where(
                                (e) => [
                                  'inTransit',
                                  'delivered',
                                  'returned',
                                  'cancelled',
                                ].contains(e.key),
                              )
                              .map(
                                (e) => DropdownMenuItem(
                                  value: e.key,
                                  child: Text(e.value),
                                ),
                              )
                              .toList(),
                          onChanged: (v) =>
                              setState(() => target = v ?? target),
                        ),
                        const SizedBox(height: 9),
                        OutlinedButton.icon(
                          onPressed: () {
                            final key = remote.text.trim();
                            if (RegExp(
                              r'^[a-zA-Z0-9_.-]{1,80}$',
                            ).hasMatch(key)) {
                              setState(() {
                                _dirty = true;
                                mappings[key] = target;
                              });
                              remote.clear();
                            } else {
                              showError(context, 'صيغة حالة غير صحيحة');
                            }
                          },
                          icon: const Icon(Icons.add),
                          label: const Text('إضافة ربط حالة'),
                        ),
                      ],
                    ),
                  ),
                const SizedBox(height: 12),
                FilledButton.icon(
                  onPressed: busy ? null : save,
                  icon: const Icon(Icons.save_outlined),
                  label: Text(busy ? 'جارٍ الحفظ' : 'حفظ إعدادات الشركة'),
                ),
                const SizedBox(height: 30),
              ],
            ),
          ),
        ),
      ),
    ),
  );
}

class LiveMembers extends StatefulWidget {
  const LiveMembers({super.key, required this.policy});
  final SessionPolicy policy;
  @override
  State<LiveMembers> createState() => _LiveMembersState();
}

class _LiveMembersState extends State<LiveMembers> {
  bool operating = false;
  Future<void> guard(Future<void> Function() operation) async {
    if (operating) return;
    setState(() => operating = true);
    try {
      await operation();
    } finally {
      if (mounted) setState(() => operating = false);
    }
  }

  late Future<List<Map<String, dynamic>>> future;
  @override
  void initState() {
    super.initState();
    reload();
  }

  void reload() => future = Future.value([]);
  void refresh() {
    setState(reload);
  }

  @override
  Widget build(BuildContext context) => DirectoryPanel(
    key: ValueKey(future),
    endpoint: 'listMembers',
    builder: (items) => SingleChildScrollView(
      child: LiveContent(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Wrap(
              alignment: WrapAlignment.spaceBetween,
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: 8,
              runSpacing: 8,
              children: [
                Text(
                  'فريق العمل والصلاحيات',
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                if (widget.policy.role == 'generalManager')
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      FilledButton.icon(
                        onPressed: operating
                            ? null
                            : () => _edit(null, items, creating: true),
                        icon: const Icon(Icons.person_add_alt_1_outlined),
                        label: const Text('إضافة موظف'),
                      ),
                      if (googleEnabled)
                        OutlinedButton.icon(
                          onPressed: operating
                              ? null
                              : () async {
                                  await Navigator.push<void>(
                                    context,
                                    MaterialPageRoute(
                                      builder: (_) => LiveJoinRequests(
                                        policy: widget.policy,
                                      ),
                                    ),
                                  );
                                  if (mounted) refresh();
                                },
                          icon: const Icon(Icons.person_add_alt),
                          label: const Text('طلبات الانضمام'),
                        ),
                    ],
                  ),
              ],
            ),
            const SizedBox(height: 14),
            if (operating) const LinearProgressIndicator(),
            if (items.isEmpty)
              const VLivePanel(child: Text('لا يوجد موظفون مطابقون')),
            for (final m in items)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: VLivePanel(
                  child: Row(
                    children: [
                      const CircleAvatar(
                        backgroundColor: VColors.softBlue,
                        child: Icon(Icons.person_outline, color: VColors.brand),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              m['name']?.toString() ?? '',
                              style: const TextStyle(
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                            Text(
                              '${m['email'] ?? ''} • ${roleName(m['role']?.toString() ?? '')}',
                              style: const TextStyle(
                                fontSize: 11,
                                color: VColors.muted,
                              ),
                              maxLines: 2,
                            ),
                          ],
                        ),
                      ),
                      Text(
                        m['active'] == false ? 'موقوف' : 'مفعّل',
                        style: TextStyle(
                          color: m['active'] == false
                              ? VColors.danger
                              : VColors.aqua,
                          fontSize: 11,
                        ),
                      ),
                      IconButton(
                        tooltip: 'إعدادات الموظف',
                        onPressed:
                            (operating ||
                                m['id'] == widget.policy.id ||
                                !widget.policy.canGrantRole(
                                  m['role'].toString(),
                                ))
                            ? null
                            : () => guard(() => _edit(m, items)),
                        icon: const Icon(Icons.settings_outlined),
                      ),
                    ],
                  ),
                ),
              ),
            const SizedBox(height: 20),
          ],
        ),
      ),
    ),
  );
  String roleName(String id) =>
      {
        'generalManager': 'مدير عام',
        'manager': 'مدير',
        'warehouse': 'موظف مستودع',
        'sales': 'مبيعات',
        'dataEntry': 'مدخل بيانات',
      }[id] ??
      id;
  Future<void> _edit(
    Map<String, dynamic>? m,
    List<Map<String, dynamic>> members, {
    bool creating = false,
  }) async {
    if (!mounted) return;
    final done = await Navigator.push<bool>(
      context,
      MaterialPageRoute<bool>(
        builder: (_) => LiveMemberForm(
          policy: widget.policy,
          initial: m,
          members: members,
          creating: creating,
        ),
      ),
    );
    if (done == true) refresh();
  }
}

class LiveMemberForm extends StatefulWidget {
  const LiveMemberForm({
    super.key,
    required this.policy,
    required this.members,
    this.initial,
    this.joinRequest = false,
    this.creating = false,
  });
  final bool joinRequest;
  final bool creating;
  final SessionPolicy policy;
  final List<Map<String, dynamic>> members;
  final Map<String, dynamic>? initial;
  @override
  State<LiveMemberForm> createState() => _LiveMemberFormState();
}

class _LiveMemberFormState extends State<LiveMemberForm> {
  final form = GlobalKey<FormState>();
  late final TextEditingController name;
  late final TextEditingController email;
  final password = TextEditingController();
  final confirmPassword = TextEditingController();
  bool get creating => widget.creating;
  late String role = widget.initial?['role']?.toString() ?? 'dataEntry';
  late bool active = widget.initial?['active'] != false;
  late String? salesSupervisor = widget.initial?['salesSupervisorId']
      ?.toString();
  late final Set<String> permissions = {
    ...(widget.initial?['permissions'] as List? ?? []).map((e) => e.toString()),
  };
  bool busy = false;
  bool _dirty = false;
  static const titles = <String, String>{
    'viewAllOrders': 'مشاهدة كل الطلبات',
    'editAllOrders': 'تعديل كل الطلبات',
    'updateOrderStatus': 'تحديث حالات الطلبات',
    'sendToDelivery': 'إرسال لشركة التوصيل',
    'viewReports': 'التقارير',
    'viewAmounts': 'مشاهدة المبالغ',
    'manageEmployees': 'إدارة الفريق',
    'manageCompanies': 'إدارة شركات التوصيل',
    'viewSync': 'مراقبة المزامنة',
    'viewAudit': 'سجل العمليات',
    'manageSettings': 'إعدادات النظام',
  };
  @override
  void initState() {
    super.initState();
    name = TextEditingController();
    email = TextEditingController(
      text: widget.initial?['email']?.toString() ?? '',
    );
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      name.text = widget.initial?['name']?.toString() ?? '';
      setState(() {});
    });
  }

  @override
  void dispose() {
    name.dispose();
    email.dispose();
    password.dispose();
    confirmPassword.dispose();
    super.dispose();
  }

  Future<void> save() async {
    if (!form.currentState!.validate() || busy) return;
    if (creating && password.text != confirmPassword.text) {
      showError(context, 'كلمتا المرور غير متطابقتين');
      return;
    }
    setState(() => busy = true);
    try {
      final payload = {
        if (widget.joinRequest) 'decision': 'approved',
        if (widget.initial != null) 'id': widget.initial!['id'],
        'name': name.text.trim(),
        'email': email.text.trim(),
        'role': role,
        'permissions': permissions.toList(),
        'active': active,
        'salesSupervisorId': role == 'dataEntry' ? salesSupervisor : null,
      };
      if (creating) {
        await VelnixGateway.instance.createEmployee({
          ...payload,
          'password': password.text,
        });
      } else {
        await VelnixGateway.instance.call(
          widget.joinRequest ? 'decideJoinRequest' : 'saveMember',
          payload,
        );
        if (widget.joinRequest) {
          VelnixGateway.instance.invalidate('listMembers');
          VelnixGateway.instance.invalidate('listOrderCreators');
        }
      }
      _dirty = false;
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _resetPassword() async {
    final next = TextEditingController(), confirm = TextEditingController();
    try {
      final go = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('تعيين كلمة مرور جديدة'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text(
                'لن تُعرض كلمة المرور الحالية. سيتم إبطال الجلسات السابقة للحساب.',
              ),
              const SizedBox(height: 10),
              TextField(
                controller: next,
                obscureText: true,
                textDirection: TextDirection.ltr,
                decoration: const InputDecoration(
                  labelText: 'كلمة المرور الجديدة',
                ),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: confirm,
                obscureText: true,
                textDirection: TextDirection.ltr,
                decoration: const InputDecoration(
                  labelText: 'تأكيد كلمة المرور *',
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('رجوع'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('تعيين'),
            ),
          ],
        ),
      );
      if (go != true) return;
      if (next.text.length < 8) {
        if (mounted) showError(context, 'كلمة المرور 8 أحرف على الأقل');
        return;
      }
      if (next.text != confirm.text) {
        if (mounted) showError(context, 'كلمتا المرور غير متطابقتين');
        return;
      }
      setState(() => busy = true);
      await VelnixGateway.instance.resetEmployeePassword(
        widget.initial!['id'].toString(),
        next.text,
      );
      if (mounted) {
        showSuccess(context, 'تم تعيين كلمة مرور جديدة وإبطال الجلسات');
      }
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => busy = false);
      next.dispose();
      confirm.dispose();
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
      appBar: AppBar(
        title: Text(
          widget.joinRequest
              ? 'اعتماد طلب الانضمام'
              : creating
              ? 'إضافة موظف'
              : 'تعديل صلاحيات الموظف',
        ),
      ),
      body: SingleChildScrollView(
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
                        readOnly: widget.joinRequest,
                        textDirection: TextDirection.rtl,
                        maxLength: 120,
                        onChanged: (_) => setState(() => _dirty = true),
                        decoration: const InputDecoration(
                          labelText: 'اسم الموظف *',
                        ),
                        validator: (v) => v == null || v.trim().isEmpty
                            ? 'الاسم مطلوب'
                            : null,
                      ),
                      const SizedBox(height: 11),
                      TextFormField(
                        controller: email,
                        readOnly: widget.initial != null && !creating,
                        textDirection: TextDirection.rtl,
                        keyboardType: TextInputType.emailAddress,
                        onChanged: (_) => setState(() => _dirty = true),
                        decoration: const InputDecoration(
                          labelText: 'البريد الإلكتروني *',
                        ),
                        validator: (v) => v == null || !v.contains('@')
                            ? 'بريد غير صحيح'
                            : null,
                      ),
                      if (creating) ...[
                        const SizedBox(height: 11),
                        TextFormField(
                          controller: password,
                          obscureText: true,
                          textDirection: TextDirection.ltr,
                          onChanged: (_) => setState(() => _dirty = true),
                          decoration: const InputDecoration(
                            labelText: 'كلمة المرور الابتدائية *',
                            helperText:
                                '8 أحرف على الأقل؛ لا تُخزّن في Firestore',
                          ),
                          validator: (v) => v == null || v.length < 8
                              ? 'كلمة المرور 8 أحرف على الأقل'
                              : null,
                        ),
                        const SizedBox(height: 11),
                        TextFormField(
                          controller: confirmPassword,
                          obscureText: true,
                          textDirection: TextDirection.ltr,
                          onChanged: (_) => setState(() => _dirty = true),
                          decoration: const InputDecoration(
                            labelText: 'تأكيد كلمة المرور *',
                          ),
                          validator: (v) => v != password.text
                              ? 'كلمتا المرور غير متطابقتين'
                              : null,
                        ),
                      ],
                      const SizedBox(height: 11),
                      DropdownButtonFormField<String>(
                        isExpanded: true,

                        initialValue: role,
                        decoration: const InputDecoration(labelText: 'الدور *'),
                        items: [
                          if (widget.policy.role == 'generalManager') ...[
                            const DropdownMenuItem(
                              value: 'generalManager',
                              child: Text('مدير عام'),
                            ),
                            const DropdownMenuItem(
                              value: 'manager',
                              child: Text('مدير'),
                            ),
                          ],
                          if (widget.policy.canGrantRole('warehouse'))
                            const DropdownMenuItem(
                              value: 'warehouse',
                              child: Text('موظف مستودع'),
                            ),
                          if (widget.policy.canGrantRole('sales'))
                            const DropdownMenuItem(
                              value: 'sales',
                              child: Text('مبيعات'),
                            ),
                          const DropdownMenuItem(
                            value: 'dataEntry',
                            child: Text('مدخل بيانات'),
                          ),
                        ],
                        onChanged: (v) => setState(() {
                          _dirty = true;
                          role = v ?? role;
                        }),
                      ),
                      if (role == 'dataEntry') ...[
                        const SizedBox(height: 11),
                        DropdownButtonFormField<String>(
                          isExpanded: true,

                          initialValue: salesSupervisor,
                          decoration: const InputDecoration(
                            labelText: 'مسؤول المبيعات المرتبط (اختياري)',
                          ),
                          items: [
                            const DropdownMenuItem<String>(
                              value: null,
                              child: Text('بدون مسؤول'),
                            ),
                            if (salesSupervisor != null &&
                                !widget.members.any(
                                  (m) => m['id'] == salesSupervisor,
                                ))
                              DropdownMenuItem<String>(
                                value: salesSupervisor,
                                child: const Text('مسؤول سابق غير متاح'),
                              ),
                            ...widget.members
                                .where(
                                  (m) =>
                                      (m['role'] == 'sales' &&
                                          m['active'] != false) ||
                                      m['id'] == salesSupervisor,
                                )
                                .map(
                                  (m) => DropdownMenuItem(
                                    value: m['id'].toString(),
                                    child: Text(
                                      m['role'] == 'sales'
                                          ? m['name'].toString()
                                          : '${m['name']} (مسؤول سابق؛ غير متاح)',
                                    ),
                                  ),
                                ),
                          ],
                          onChanged: (v) => setState(() {
                            _dirty = true;
                            salesSupervisor = v;
                          }),
                        ),
                      ],
                      if (!widget.joinRequest)
                        SwitchListTile(
                          contentPadding: EdgeInsets.zero,
                          title: const Text('الحساب مفعّل'),
                          value: active,
                          onChanged: (v) => setState(() {
                            _dirty = true;
                            active = v;
                          }),
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                VLivePanel(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Text(
                        'الصلاحيات الإضافية',
                        style: TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      const SizedBox(height: 8),
                      for (final e in titles.entries)
                        if (widget.policy.role == 'generalManager' ||
                            widget.policy.can(e.key))
                          CheckboxListTile(
                            contentPadding: EdgeInsets.zero,
                            title: Text(
                              e.value,
                              style: const TextStyle(fontSize: 13),
                            ),
                            value: permissions.contains(e.key),
                            onChanged: (v) => setState(() {
                              _dirty = true;
                              if (v == true) {
                                permissions.add(e.key);
                              } else {
                                permissions.remove(e.key);
                              }
                            }),
                          ),
                      const Text(
                        'هذه صلاحيات إضافية للدور؛ كل الموظفين يستطيعون إنشاء طلب. الخادم يتحقق من كل تعديل.',
                        style: TextStyle(color: VColors.muted, fontSize: 11),
                      ),
                    ],
                  ),
                ),
                if (!creating &&
                    !widget.joinRequest &&
                    widget.initial != null &&
                    widget.policy.role == 'generalManager') ...[
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    onPressed: busy ? null : _resetPassword,
                    icon: const Icon(Icons.password_outlined),
                    label: const Text('تعيين كلمة مرور جديدة'),
                  ),
                ],
                const SizedBox(height: 14),
                FilledButton.icon(
                  onPressed: busy ? null : save,
                  icon: const Icon(Icons.save_outlined),
                  label: Text(busy ? 'جارٍ الحفظ...' : 'حفظ الموظف'),
                ),
                const SizedBox(height: 25),
              ],
            ),
          ),
        ),
      ),
    ),
  );
}

class LiveAudit extends StatefulWidget {
  const LiveAudit({super.key});
  @override
  State<LiveAudit> createState() => _LiveAuditState();
}

class _LiveAuditState extends State<LiveAudit> {
  late Future<List<Map<String, dynamic>>> future;
  final _items = <Map<String, dynamic>>[];
  String? _cursor;
  bool _more = false;
  bool _loadingMore = false;
  int _generation = 0;
  @override
  void initState() {
    super.initState();
    reload();
  }

  Future<List<Map<String, dynamic>>> _firstPage() async {
    final generation = ++_generation;
    final page = await VelnixGateway.instance.auditPage();
    if (generation == _generation) {
      _cursor = page.afterId;
      _more = page.more;
      _items
        ..clear()
        ..addAll(page.items);
    }
    return _items;
  }

  void reload() => future = _firstPage();
  void refresh() {
    setState(reload);
  }

  Future<void> loadMore() async {
    if (_loadingMore || !_more || _cursor == null) return;
    final generation = _generation;
    setState(() => _loadingMore = true);
    try {
      final page = await VelnixGateway.instance.auditPage(afterId: _cursor);
      if (!mounted || generation != _generation) return;
      setState(() {
        _items.addAll(page.items);
        _cursor = page.afterId;
        _more = page.more;
      });
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  @override
  Widget build(BuildContext context) => AsyncPanel<List<Map<String, dynamic>>>(
    future: future,
    onRetry: refresh,
    builder: (rows) => SingleChildScrollView(
      child: LiveContent(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'سجل العمليات',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 14),
            for (final e in rows)
              Padding(
                padding: const EdgeInsets.only(bottom: 9),
                child: VLivePanel(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 2,
                  ),
                  child: ListTile(
                    dense: true,
                    visualDensity: VisualDensity.compact,
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(
                      Icons.verified_user_outlined,
                      color: VColors.brand,
                    ),
                    title: Text(auditActionLabel(e['action'], e['extra'])),
                    subtitle: Text(
                      '${e['actorName'] ?? ''} • ${e['entityId'] ?? ''}\n${businessDate(e['createdAt'])}',
                    ),
                  ),
                ),
              ),
            if (rows.isEmpty)
              const VFeedbackPanel(
                title: 'لا توجد أحداث مسجلة',
                message: 'ستظهر هنا العمليات التي يوثقها النظام.',
                icon: Icons.history_outlined,
              ),
            if (_more)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: OutlinedButton.icon(
                  onPressed: _loadingMore ? null : loadMore,
                  icon: _loadingMore
                      ? const SizedBox.square(
                          dimension: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.expand_more),
                  label: const Text('عرض أحداث أقدم'),
                ),
              ),
          ],
        ),
      ),
    ),
  );
}

class LiveJoinRequests extends StatefulWidget {
  const LiveJoinRequests({super.key, required this.policy});
  final SessionPolicy policy;
  @override
  State<LiveJoinRequests> createState() => _LiveJoinRequestsState();
}

class _LiveJoinRequestsState extends State<LiveJoinRequests> {
  int revision = 0;
  bool busy = false;
  Future<void> decide(Map<String, dynamic> request, bool approve) async {
    if (busy) return;
    setState(() => busy = true);
    try {
      if (approve) {
        final members = await VelnixGateway.instance.members();
        if (!mounted) return;
        await Navigator.push<bool>(
          context,
          MaterialPageRoute(
            builder: (_) => LiveMemberForm(
              policy: widget.policy,
              members: members,
              initial: request,
              joinRequest: true,
            ),
          ),
        );
      } else {
        final confirmed = await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('رفض طلب الانضمام؟'),
            content: Text(request['name']?.toString() ?? ''),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: const Text('تراجع'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(context, true),
                child: const Text('تأكيد الرفض'),
              ),
            ],
          ),
        );
        if (confirmed == true) {
          await VelnixGateway.instance.call('decideJoinRequest', {
            'id': request['id'],
            'decision': 'rejected',
          });
        }
      }
      if (mounted) setState(() => revision++);
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('طلبات الانضمام')),
    body: widget.policy.role != 'generalManager'
        ? const Center(child: Text('الصلاحية غير متاحة'))
        : DirectoryPanel(
            key: ValueKey(revision),
            endpoint: 'listJoinRequests',
            searchable: false,
            builder: (items) => SingleChildScrollView(
              child: LiveContent(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (busy) const LinearProgressIndicator(),
                    if (items.isEmpty)
                      const VLivePanel(
                        child: Text('لا توجد طلبات انضمام معلقة'),
                      ),
                    for (final item in items)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: VLivePanel(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Text(item['name']?.toString() ?? ''),
                              Text(
                                item['email']?.toString() ?? '',
                                textDirection: TextDirection.ltr,
                              ),
                              Wrap(
                                spacing: 8,
                                children: [
                                  FilledButton(
                                    onPressed: busy
                                        ? null
                                        : () => decide(item, true),
                                    child: const Text('مراجعة واعتماد'),
                                  ),
                                  TextButton(
                                    onPressed: busy
                                        ? null
                                        : () => decide(item, false),
                                    child: const Text('رفض'),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
  );
}
