part of 'live_app.dart';

/// Organization "electronic pages" (the client's Facebook pages). Managers with
/// `managePages` (or the general manager) create, edit, disable, archive and
/// restore pages and see the order volume per page. This is independent from the
/// still-placeholder «المتاجر» tab.
class LivePages extends StatefulWidget {
  const LivePages({super.key, required this.policy});
  final SessionPolicy policy;
  @override
  State<LivePages> createState() => _LivePagesState();
}

class _LivePagesState extends State<LivePages> {
  late Future<List<Map<String, dynamic>>> request;
  final search = TextEditingController();
  Map<String, int> orderCounts = {};
  bool _loadingCounts = false;

  bool get canManage =>
      widget.policy.can('managePages') ||
      widget.policy.role == 'generalManager';

  @override
  void initState() {
    super.initState();
    reload();
  }

  @override
  void dispose() {
    search.dispose();
    super.dispose();
  }

  void reload() {
    request = VelnixGateway.instance.pages();
    request.then(_loadCounts).catchError((Object _) {});
  }

  Future<void> _loadCounts(List<Map<String, dynamic>> pages) async {
    if (pages.isEmpty || !mounted) return;
    setState(() => _loadingCounts = true);
    try {
      final counts = await VelnixGateway.instance.pageStats(
        pages.map((p) => p['id'].toString()).toList(),
      );
      if (mounted) setState(() => orderCounts = counts);
    } catch (_) {
      // A missing count must never block the page list.
    } finally {
      if (mounted) setState(() => _loadingCounts = false);
    }
  }

  Future<void> _refresh() async {
    setState(reload);
    await request.catchError((Object _) => <Map<String, dynamic>>[]);
  }

  String _statusLabel(Map<String, dynamic> p) {
    if (p['archived'] == true) return 'مؤرشفة';
    if (p['active'] == true) return 'مفعلة';
    return 'معطلة';
  }

  Color _statusColor(Map<String, dynamic> p) {
    if (p['archived'] == true) return VColors.muted;
    if (p['active'] == true) return VColors.aqua;
    return VColors.warning;
  }

  Future<void> _openForm([Map<String, dynamic>? page]) async {
    final changed = await Navigator.push<bool>(
      context,
      MaterialPageRoute<bool>(builder: (_) => LivePageForm(initial: page)),
    );
    if (changed == true) _refresh();
  }

  Future<void> _archive(Map<String, dynamic> page) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('أرشفة الصفحة'),
        content: Text(
          'ستُخفى «${page['name']}» من الإنشاء الجديد، وتبقى الطلبات السابقة كما هي. '
          'هل تريد المتابعة؟',
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
    if (confirmed != true) return;
    try {
      await VelnixGateway.instance.archivePage(page['id'].toString());
      if (mounted) showSuccess(context, 'تم أرشفة الصفحة');
      _refresh();
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  Future<void> _restore(Map<String, dynamic> page) async {
    try {
      await VelnixGateway.instance.restorePage(page['id'].toString());
      if (mounted) showSuccess(context, 'تم استعادة الصفحة');
      _refresh();
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) => RefreshIndicator(
    onRefresh: _refresh,
    child: SingleChildScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      child: LiveContent(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Wrap(
              alignment: WrapAlignment.spaceBetween,
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: 10,
              runSpacing: 10,
              children: [
                Text(
                  'الصفحات الإلكترونية',
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                if (canManage)
                  FilledButton.icon(
                    onPressed: () => _openForm(),
                    icon: const Icon(Icons.add),
                    label: const Text('إضافة صفحة'),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            VLivePanel(
              padding: const EdgeInsets.all(12),
              child: TextField(
                controller: search,
                textInputAction: TextInputAction.search,
                onChanged: (_) => setState(() {}),
                onSubmitted: (_) => _refresh(),
                decoration: const InputDecoration(
                  prefixIcon: Icon(Icons.search),
                  labelText: 'بحث عن صفحة بالاسم',
                ),
              ),
            ),
            const SizedBox(height: 14),
            FutureBuilder<List<Map<String, dynamic>>>(
              future: request,
              builder: (context, snap) {
                if (snap.connectionState != ConnectionState.done) {
                  return const VFeedbackPanel(
                    title: 'جارٍ تحميل الصفحات',
                    loading: true,
                  );
                }
                if (snap.hasError) {
                  return VFeedbackPanel(
                    title: 'تعذر تحميل الصفحات',
                    message: '${snap.error}',
                    icon: Icons.error_outline,
                    onRetry: _refresh,
                  );
                }
                final query = search.text.trim().toLowerCase();
                final pages = (snap.data ?? [])
                    .where(
                      (p) =>
                          query.isEmpty ||
                          p['name'].toString().toLowerCase().contains(query),
                    )
                    .toList();
                if (pages.isEmpty) {
                  return const VFeedbackPanel(
                    title: 'لا توجد صفحات',
                    message: 'أضف صفحة Facebook لبدء ربط الطلبات بها.',
                    icon: Icons.facebook_outlined,
                  );
                }
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    for (final page in pages)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: _pageCard(page),
                      ),
                  ],
                );
              },
            ),
            const SizedBox(height: 30),
          ],
        ),
      ),
    ),
  );

  Widget _pageCard(Map<String, dynamic> p) {
    final id = p['id'].toString();
    final logo = p['logoDataUri']?.toString() ?? '';
    final count = orderCounts[id];
    return VLivePanel(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _logo(logo),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      p['name']?.toString() ?? '',
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        _chip(_statusLabel(p), _statusColor(p)),
                        const SizedBox(width: 8),
                        if (count != null)
                          Text(
                            '$count طلب',
                            style: const TextStyle(
                              color: VColors.muted,
                              fontSize: 12,
                            ),
                          )
                        else if (_loadingCounts)
                          const SizedBox(
                            width: 12,
                            height: 12,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          ),
                      ],
                    ),
                    if ((p['phone'] ?? '').toString().isNotEmpty ||
                        (p['whatsapp'] ?? '').toString().isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(
                          [
                            if ((p['phone'] ?? '').toString().isNotEmpty)
                              'هاتف: ${p['phone']}',
                            if ((p['whatsapp'] ?? '').toString().isNotEmpty)
                              'واتساب: ${p['whatsapp']}',
                          ].join(' • '),
                          style: const TextStyle(
                            color: VColors.muted,
                            fontSize: 12,
                          ),
                        ),
                      ),
                    if ((p['note'] ?? '').toString().isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(
                          p['note'].toString(),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: VColors.muted,
                            fontSize: 12,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              if ((p['facebookUrl'] ?? '').toString().isNotEmpty)
                OutlinedButton.icon(
                  onPressed: () {},
                  icon: const Icon(Icons.link, size: 16),
                  label: const Text('رابط الصفحة'),
                ),
              if (canManage) ...[
                OutlinedButton.icon(
                  onPressed: () => _openForm(p),
                  icon: const Icon(Icons.edit_outlined, size: 16),
                  label: const Text('تعديل'),
                ),
                if (p['archived'] == true)
                  TextButton.icon(
                    onPressed: () => _restore(p),
                    icon: const Icon(Icons.unarchive_outlined, size: 16),
                    label: const Text('استعادة'),
                  )
                else
                  TextButton.icon(
                    onPressed: () => _archive(p),
                    icon: const Icon(Icons.archive_outlined, size: 16),
                    label: const Text('أرشفة'),
                  ),
              ],
            ],
          ),
        ],
      ),
    );
  }

  Widget _logo(String dataUri) {
    final bytes = decodeLogoDataUri(dataUri);
    if (bytes == null) {
      return Container(
        width: 46,
        height: 46,
        decoration: BoxDecoration(
          color: VColors.softBlue,
          borderRadius: BorderRadius.circular(12),
        ),
        child: const Icon(Icons.facebook, color: VColors.brand),
      );
    }
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: Image.memory(
        bytes,
        width: 46,
        height: 46,
        fit: BoxFit.cover,
        errorBuilder: (_, _, _) => Container(
          width: 46,
          height: 46,
          color: VColors.softBlue,
          child: const Icon(Icons.facebook, color: VColors.brand),
        ),
      ),
    );
  }

  Widget _chip(String text, Color color) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
    decoration: BoxDecoration(
      color: color.withValues(alpha: .12),
      borderRadius: BorderRadius.circular(10),
    ),
    child: Text(
      text,
      style: TextStyle(
        color: color,
        fontSize: 11.5,
        fontWeight: FontWeight.w800,
      ),
    ),
  );
}

/// Create/edit form for an electronic page. Optional logo is a small image the
/// manager picks; it is sent as a bounded base64 data URI (no Storage bucket is
/// required) and validated again on the server.
class LivePageForm extends StatefulWidget {
  const LivePageForm({super.key, this.initial});
  final Map<String, dynamic>? initial;
  @override
  State<LivePageForm> createState() => _LivePageFormState();
}

class _LivePageFormState extends State<LivePageForm> {
  final form = GlobalKey<FormState>();
  final name = TextEditingController();
  final facebookUrl = TextEditingController();
  final phone = TextEditingController();
  final whatsapp = TextEditingController();
  final note = TextEditingController();
  bool active = true;
  String logoDataUri = '';
  bool busy = false;

  @override
  void initState() {
    super.initState();
    final i = widget.initial;
    name.text = i?['name']?.toString() ?? '';
    facebookUrl.text = i?['facebookUrl']?.toString() ?? '';
    phone.text = i?['phone']?.toString() ?? '';
    whatsapp.text = i?['whatsapp']?.toString() ?? '';
    note.text = i?['note']?.toString() ?? '';
    active = i == null ? true : (i['active'] == true);
    logoDataUri = i?['logoDataUri']?.toString() ?? '';
  }

  @override
  void dispose() {
    name.dispose();
    facebookUrl.dispose();
    phone.dispose();
    whatsapp.dispose();
    note.dispose();
    super.dispose();
  }

  Future<void> _pickLogo() async {
    // Opens the platform image picker (gallery/camera/file dialog), shrinks the
    // image to a bounded square, previews it, and stores a small data URI. The
    // server re-validates type and size before saving.
    try {
      final picked = await PageLogoService().pick();
      if (picked == null || !mounted) return;
      if (picked.bytes.length > PageLogoService.maxBytes) {
        showError(context, 'الصورة كبيرة جداً بعد المعالجة؛ اختر صورة أصغر');
        return;
      }
      setState(() => logoDataUri = picked.dataUri);
    } catch (e) {
      if (mounted) {
        showError(context, 'تعذر اختيار الصورة. جرّب صورة أخرى.');
      }
    }
  }

  Future<void> save() async {
    if (!form.currentState!.validate() || busy) return;
    setState(() => busy = true);
    try {
      final payload = <String, dynamic>{
        if (widget.initial != null) 'id': widget.initial!['id'],
        'name': name.text.trim(),
        'facebookUrl': facebookUrl.text.trim(),
        'phone': phone.text.trim(),
        'whatsapp': whatsapp.text.trim(),
        'note': note.text.trim(),
        'active': active,
        'logoDataUri': logoDataUri,
      };
      await VelnixGateway.instance.savePage(payload);
      if (mounted) {
        showSuccess(context, 'تم حفظ الصفحة');
        Navigator.pop(context, true);
      }
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(
        widget.initial == null ? 'إضافة صفحة إلكترونية' : 'تعديل الصفحة',
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
                    TextFormField(
                      controller: name,
                      maxLength: 120,
                      decoration: const InputDecoration(
                        labelText: 'اسم الصفحة *',
                      ),
                      validator: (v) => (v == null || v.trim().isEmpty)
                          ? 'اسم الصفحة مطلوب'
                          : null,
                    ),
                    const SizedBox(height: 10),
                    TextFormField(
                      controller: facebookUrl,
                      maxLength: 300,
                      textDirection: TextDirection.ltr,
                      decoration: const InputDecoration(
                        labelText: 'رابط Facebook (اختياري)',
                      ),
                      validator: (v) {
                        final t = v?.trim() ?? '';
                        if (t.isEmpty) return null;
                        if (!RegExp(
                          r'^https?://',
                          caseSensitive: false,
                        ).hasMatch(t)) {
                          return 'يجب أن يبدأ الرابط بـ http أو https';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(
                          child: TextFormField(
                            controller: phone,
                            textDirection: TextDirection.ltr,
                            keyboardType: TextInputType.phone,
                            maxLength: 20,
                            decoration: const InputDecoration(
                              labelText: 'رقم الهاتف (اختياري)',
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: TextFormField(
                            controller: whatsapp,
                            textDirection: TextDirection.ltr,
                            keyboardType: TextInputType.phone,
                            maxLength: 20,
                            decoration: const InputDecoration(
                              labelText: 'رقم WhatsApp (اختياري)',
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    TextFormField(
                      controller: note,
                      maxLines: 2,
                      maxLength: 600,
                      decoration: const InputDecoration(
                        labelText: 'وصف أو ملاحظات (اختياري)',
                      ),
                    ),
                    const SizedBox(height: 6),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      value: active,
                      onChanged: (v) => setState(() => active = v),
                      title: const Text('الصفحة مفعّلة'),
                      subtitle: const Text(
                        'الصفحات المعطلة أو المؤرشفة لا تُستخدم لإنشاء طلبات جديدة.',
                      ),
                    ),
                    const SizedBox(height: 6),
                    Wrap(
                      crossAxisAlignment: WrapCrossAlignment.center,
                      spacing: 8,
                      runSpacing: 6,
                      children: [
                        if (logoDataUri.isNotEmpty) _thumb(logoDataUri),
                        TextButton.icon(
                          onPressed: _pickLogo,
                          icon: const Icon(Icons.image_outlined, size: 18),
                          label: Text(
                            logoDataUri.isEmpty
                                ? 'اختيار شعار'
                                : 'تغيير الشعار',
                          ),
                        ),
                        if (logoDataUri.isNotEmpty)
                          TextButton(
                            onPressed: () => setState(() => logoDataUri = ''),
                            child: const Text('إزالة'),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              FilledButton.icon(
                onPressed: busy ? null : save,
                icon: const Icon(Icons.save_outlined),
                label: Text(busy ? 'جارٍ الحفظ...' : 'حفظ الصفحة'),
              ),
              const SizedBox(height: 20),
            ],
          ),
        ),
      ),
    ),
  );

  Widget _thumb(String dataUri) {
    final bytes = decodeLogoDataUri(dataUri);
    if (bytes == null) return const Icon(Icons.broken_image_outlined);
    return ClipRRect(
      borderRadius: BorderRadius.circular(10),
      child: Image.memory(bytes, width: 44, height: 44, fit: BoxFit.cover),
    );
  }
}
