part of 'live_app.dart';

/// Barcode scanner + batch collection (up to 30 unique codes).
///
/// The camera (Code128 by default, QR when present) fills a list of codes; the
/// user can also type a code manually. Resolution to orders happens server-side
/// through `resolveBarcodes`, which never reveals whether an order exists but is
/// not visible to the caller. No customer data is stored locally.
class BarcodeScannerScreen extends StatefulWidget {
  const BarcodeScannerScreen({super.key, required this.policy});
  final SessionPolicy policy;
  @override
  State<BarcodeScannerScreen> createState() => _BarcodeScannerScreenState();
}

class _BarcodeScannerScreenState extends State<BarcodeScannerScreen> {
  /// Raw codes the user scanned/typed, in order, de-duplicated.
  final List<String> codes = [];
  final manual = TextEditingController();
  final MobileScannerController controller = MobileScannerController(
    formats: const [BarcodeFormat.code128, BarcodeFormat.qrCode],
    detectionSpeed: DetectionSpeed.noDuplicates,
  );
  bool processing = false;
  bool cameraOn = true;
  String? status;
  // Debounce so a single frame burst cannot add dozens of codes.
  DateTime _lastAccept = DateTime.fromMillisecondsSinceEpoch(0);
  // The client requires at least 20 codes per scan; 30 leaves headroom while
  // keeping the server resolution bounded (no unlimited queries).
  static const maxCodes = 30;

  @override
  void dispose() {
    manual.dispose();
    controller.dispose();
    super.dispose();
  }

  bool _addCode(String raw) {
    // Only clean control characters / surrounding whitespace / Arabic-Indic
    // digits; a valid Latin code is never rewritten (no guessing).
    final code = normalizeScannedCode(raw);
    if (code.isEmpty) {
      setState(() => status = 'لم يُقرأ أي باركود. أعد المحاولة.');
      return false;
    }
    if (codes.length >= maxCodes) {
      setState(() => status = 'الحد الأقصى $maxCodes باركوداً');
      return false;
    }
    if (codes.contains(code)) {
      setState(() => status = 'هذا الباركود مضاف مسبقاً');
      return false;
    }
    setState(() {
      codes.add(code);
      status = null;
    });
    return true;
  }

  void _onDetect(BarcodeCapture capture) {
    final now = DateTime.now();
    if (now.difference(_lastAccept).inMilliseconds < 900) return;
    for (final barcode in capture.barcodes) {
      final value = barcode.rawValue;
      if (value != null && value.trim().isNotEmpty) {
        if (_addCode(value)) {
          _lastAccept = now;
        }
        break;
      }
    }
  }

  /// Resolves the collected codes server-side.
  ///
  /// One single code that matches exactly one order opens the FULL order card
  /// immediately. Several matches, or a batch of codes, open the results list.
  /// No match shows a clear message instead of any opaque code.
  Future<void> _resolve() async {
    if (codes.isEmpty || processing) return;
    setState(() => processing = true);
    try {
      final results = await VelnixGateway.instance.resolveBarcodes(codes);
      if (!mounted) return;
      final found = results
          .where((r) => r['status'] == 'ok' && r['order'] is Map)
          .map((r) => Map<String, dynamic>.from(r['order'] as Map))
          .toList();
      if (found.isEmpty) {
        setState(
          () => status =
              'لم يتم العثور على أي طلب مطابق لهذه الباركودات. '
              'تأكد من الباركود، أو من صلاحيتك لعرض الطلب.',
        );
        return;
      }
      if (found.length == 1 && codes.length == 1) {
        final order = found.single;
        final id = order['id']?.toString() ?? '';
        if (id.isEmpty) return;
        setState(() {
          codes.clear();
          status = null;
        });
        if (!mounted) return;
        await Navigator.push(
          context,
          MaterialPageRoute<void>(
            builder: (_) => LiveOrderDetail(id: id, policy: widget.policy),
          ),
        );
        return;
      }
      await Navigator.push(
        context,
        MaterialPageRoute<void>(
          builder: (_) =>
              BarcodeResultsScreen(policy: widget.policy, results: results),
        ),
      );
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => processing = false);
    }
  }

  /// A quick scan (HID/typed code + Enter): resolves the code the operator just
  /// read, immediately.
  Future<void> _quickScan(String raw) async {
    final code = normalizeScannedCode(raw);
    manual.clear();
    if (code.isEmpty || processing) return;
    if (!codes.contains(code)) {
      if (codes.length >= maxCodes) {
        setState(() => status = 'الحد الأقصى $maxCodes باركوداً');
        return;
      }
      setState(() {
        codes.add(code);
        status = null;
      });
    }
    await _resolve();
  }

  Future<void> _clearAll() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('مسح القائمة'),
        content: Text('سيتم حذف ${codes.length} باركوداً.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('رجوع'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('مسح الكل'),
          ),
        ],
      ),
    );
    if (ok == true) setState(codes.clear);
  }

  @override
  Widget build(BuildContext context) {
    final canShowCamera = cameraOn && !kIsWeb;
    return Scaffold(
      appBar: AppBar(
        title: const Text('مسح باركود'),
        actions: [
          IconButton(
            tooltip: cameraOn ? 'إيقاف الكاميرا' : 'تشغيل الكاميرا',
            onPressed: () => setState(() => cameraOn = !cameraOn),
            icon: Icon(cameraOn ? Icons.videocam_off : Icons.videocam),
          ),
        ],
      ),
      body: Column(
        children: [
          if (canShowCamera)
            SizedBox(
              height: 260,
              child: MobileScanner(
                controller: controller,
                onDetect: _onDetect,
                errorBuilder: (context, error) => Center(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Text(
                      'تعذر تشغيل الكاميرا (${error.errorCode}). أدخل الكود يدوياً.',
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: VColors.muted),
                    ),
                  ),
                ),
              ),
            )
          else
            Padding(
              padding: const EdgeInsets.all(10),
              child: Text(
                kIsWeb
                    ? 'المسح بالكاميرا متاح على الهاتف. أدخل الكود يدوياً هنا.'
                    : 'الكاميرا متوقفة. أدخل الكود يدوياً.',
                style: const TextStyle(color: VColors.muted),
                textAlign: TextAlign.center,
              ),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(10, 6, 10, 2),
            child: Text(
              'حقل المسح المخصص: يعمل مع ماسحات USB/Bluetooth التي تُدخِل الكود '
              'كلوحة مفاتيح ثم ترسل Enter. اضبط الماسح على تخطيط لاتيني (US) '
              'وأضف Enter كلاحقة؛ فالماسح الذي يستبدل الأحرف نفسها لا يمكن '
              'للبرنامج أن يعيد فكّها بثقة.',
              style: const TextStyle(color: VColors.muted, fontSize: 11.5),
              textAlign: TextAlign.center,
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(10),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: manual,
                    autofocus: true,
                    textInputAction: TextInputAction.done,
                    autocorrect: false,
                    enableSuggestions: false,
                    // Enter ends the scan and resolves immediately (HID wedge).
                    onSubmitted: _quickScan,
                    decoration: const InputDecoration(
                      labelText: 'امسح أو الصق الباركود',
                      hintText: 'VNX-000039',
                      prefixIcon: Icon(Icons.keyboard),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.filledTonal(
                  tooltip: 'إضافة إلى القائمة',
                  onPressed: () {
                    if (_addCode(manual.text)) manual.clear();
                  },
                  icon: const Icon(Icons.add),
                ),
                const SizedBox(width: 4),
                IconButton.filled(
                  tooltip: 'مسح فوري',
                  onPressed: processing ? null : () => _quickScan(manual.text),
                  icon: const Icon(Icons.search),
                ),
              ],
            ),
          ),
          if (status != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Text(
                status!,
                style: const TextStyle(color: VColors.warning, fontSize: 12),
              ),
            ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    'الممسوحة: ${codes.length} / $maxCodes',
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  ),
                ),
                if (codes.isNotEmpty)
                  TextButton(
                    onPressed: _clearAll,
                    child: const Text('مسح القائمة'),
                  ),
              ],
            ),
          ),
          Expanded(
            child: codes.isEmpty
                ? const VFeedbackPanel(
                    title: 'لا توجد باركودات بعد',
                    message:
                        'وجّه الكاميرا نحو باركود الطلب أو QR، أو أدخل الكود.',
                    icon: Icons.qr_code_scanner,
                  )
                : ListView.builder(
                    itemCount: codes.length,
                    itemBuilder: (context, i) => ListTile(
                      dense: true,
                      leading: CircleAvatar(
                        radius: 14,
                        backgroundColor: VColors.softBlue,
                        child: Text(
                          '${i + 1}',
                          style: const TextStyle(fontSize: 12),
                        ),
                      ),
                      title: Text(codes[i], textDirection: TextDirection.ltr),
                      trailing: IconButton(
                        icon: const Icon(Icons.close),
                        tooltip: 'حذف',
                        onPressed: () => setState(() => codes.removeAt(i)),
                      ),
                    ),
                  ),
          ),
          Padding(
            padding: const EdgeInsets.all(12),
            child: FilledButton.icon(
              onPressed: codes.isEmpty || processing ? null : _resolve,
              icon: processing
                  ? const SizedBox.square(
                      dimension: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.search),
              label: Text(processing ? 'جارٍ التحقق...' : 'عرض النتائج'),
            ),
          ),
        ],
      ),
    );
  }
}

/// Shows the resolved orders for the scanned codes and lets the user select
/// them for bulk actions. Unauthorized/unknown codes are reported generically.
class BarcodeResultsScreen extends StatefulWidget {
  const BarcodeResultsScreen({
    super.key,
    required this.policy,
    required this.results,
  });
  final SessionPolicy policy;
  final List<Map<String, dynamic>> results;
  @override
  State<BarcodeResultsScreen> createState() => _BarcodeResultsScreenState();
}

class _BarcodeResultsScreenState extends State<BarcodeResultsScreen> {
  late final List<Map<String, dynamic>> found;
  late final List<String> unresolved;
  late final int duplicate;
  // Selected order ids from the scan results (reuses the shared bulk callables).
  final selected = <String>{};
  bool busy = false;
  static const _bulkChunk = 50;
  static const _dispatchChunk = 10;

  @override
  void initState() {
    super.initState();
    found = widget.results
        .where((r) => r['status'] == 'ok' && r['order'] is Map)
        .map((r) => Map<String, dynamic>.from(r['order'] as Map))
        .toList();
    // Codes that resolved to nothing visible. Kept as plain codes so the user
    // gets a clear per-code message, never an opaque technical symbol.
    unresolved = widget.results
        .where((r) => r['status'] == 'not_found' || r['status'] == 'invalid')
        .map((r) => r['code']?.toString() ?? '')
        .where((c) => c.isNotEmpty)
        .toList();
    duplicate = widget.results.where((r) => r['status'] == 'duplicate').length;
  }

  int get notFound => unresolved.length;

  void _openDetails(String id) => Navigator.push(
    context,
    MaterialPageRoute<void>(
      builder: (_) => LiveOrderDetail(id: id, policy: widget.policy),
    ),
  );

  void _toggle(String id) => setState(() {
    if (!selected.remove(id)) selected.add(id);
  });

  Future<void> _runChunked(
    List<String> ids,
    Future<Map<String, dynamic>> Function(List<String> chunk) call, {
    int chunkSize = _bulkChunk,
  }) async {
    if (busy || ids.isEmpty) return;
    setState(() => busy = true);
    try {
      var succeeded = 0, failed = 0;
      for (var i = 0; i < ids.length; i += chunkSize) {
        final chunk = ids.sublist(
          i,
          (i + chunkSize) > ids.length ? ids.length : i + chunkSize,
        );
        final r = await call(chunk);
        succeeded += (r['succeeded'] as num?)?.toInt() ?? 0;
        failed += (r['failed'] as num?)?.toInt() ?? 0;
      }
      if (mounted) {
        showSuccess(context, 'نجح: $succeeded • فشل: $failed');
      }
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _print() async {
    final ids = selected.toList();
    if (ids.isEmpty || busy) return;
    setState(() => busy = true);
    try {
      final orders = <Map<String, dynamic>>[];
      for (var i = 0; i < ids.length; i += 60) {
        orders.addAll(
          await VelnixGateway.instance.ordersByIds(
            ids.sublist(i, (i + 60) > ids.length ? ids.length : i + 60),
          ),
        );
      }
      final merged = await decorateOrdersForPrint(orders);
      if (!mounted) return;
      await Navigator.push(
        context,
        MaterialPageRoute<void>(
          builder: (_) =>
              BulkPrintScreen(orders: merged, printedBy: widget.policy.name),
        ),
      );
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _changeStatus() async {
    final target = await showDialog<String>(
      context: context,
      builder: (ctx) => SimpleDialog(
        title: Text('تغيير حالة ${selected.length} طلب'),
        children: [
          for (final t in ['review', 'preparing', 'ready'])
            SimpleDialogOption(
              onPressed: () => Navigator.pop(ctx, t),
              child: Text(statusLabels[t] ?? t),
            ),
        ],
      ),
    );
    if (target == null) return;
    await _runChunked(
      selected.toList(),
      (chunk) => VelnixGateway.instance.bulkChangeStatus(chunk, target),
    );
  }

  Future<void> _assign() async {
    final companies = (await VelnixGateway.instance.companies())
        .where((c) => c['enabled'] == true && c['archived'] != true)
        .toList();
    if (!mounted) return;
    final id = await showDialog<String>(
      context: context,
      builder: (ctx) => SimpleDialog(
        title: Text('إسناد شركة لـ ${selected.length} طلب'),
        children: [
          for (final c in companies)
            SimpleDialogOption(
              onPressed: () => Navigator.pop(ctx, c['id'].toString()),
              child: Text(c['name'].toString()),
            ),
          if (companies.isEmpty)
            const Padding(
              padding: EdgeInsets.all(16),
              child: Text('لا توجد شركات مفعّلة.'),
            ),
        ],
      ),
    );
    if (id == null) return;
    await _runChunked(
      selected.toList(),
      (chunk) => VelnixGateway.instance.bulkAssignCompany(chunk, id),
    );
  }

  Future<void> _dispatch() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('إرسال ${selected.length} طلب إلى شركة التوصيل'),
        content: const Text(
          'سيؤدي هذا إلى إنشاء شحنات فعلية لدى شركة التوصيل للطلبات المعيّنة لشركة. '
          'يمكن إرسال الطلب من أي حالة داخلية، ولا تُغيَّر حالته الداخلية عند الإرسال. '
          'لن يُعاد إرسال أي شحنة.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('إلغاء'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('إرسال'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    final base =
        'bc${DateTime.now().millisecondsSinceEpoch.toRadixString(36)}'
        '${Random.secure().nextInt(1 << 30).toRadixString(36)}';
    var idx = 0;
    await _runChunked(selected.toList(), (chunk) {
      final opId = '${base}_$idx';
      idx++;
      return VelnixGateway.instance.bulkDispatch(chunk, operationId: opId);
    }, chunkSize: _dispatchChunk);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('نتائج المسح')),
    body: LiveContent(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          VLivePanel(
            child: Wrap(
              spacing: 16,
              runSpacing: 6,
              children: [
                Text('المطابقة: ${found.length}'),
                Text('غير موجودة: $notFound'),
                Text('مكررة: $duplicate'),
                Text('المحدد: ${selected.length}'),
              ],
            ),
          ),
          if (found.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Wrap(
                spacing: 8,
                runSpacing: 6,
                children: [
                  TextButton(
                    onPressed: busy
                        ? null
                        : () => setState(() {
                            selected
                              ..clear()
                              ..addAll(found.map((o) => o['id'].toString()));
                          }),
                    child: const Text('تحديد الكل'),
                  ),
                  TextButton(
                    onPressed: busy ? null : () => setState(selected.clear),
                    child: const Text('إلغاء التحديد'),
                  ),
                ],
              ),
            ),
          if (selected.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Wrap(
                spacing: 8,
                runSpacing: 6,
                children: [
                  FilledButton.icon(
                    onPressed: busy ? null : _print,
                    icon: const Icon(Icons.print_outlined, size: 18),
                    label: const Text('طباعة'),
                  ),
                  if (widget.policy.canChangeStatus)
                    OutlinedButton.icon(
                      onPressed: busy ? null : _changeStatus,
                      icon: const Icon(Icons.sync_alt, size: 18),
                      label: const Text('تغيير الحالة'),
                    ),
                  if (widget.policy.can('sendToDelivery'))
                    OutlinedButton.icon(
                      onPressed: busy ? null : _assign,
                      icon: const Icon(Icons.local_shipping_outlined, size: 18),
                      label: const Text('إسناد شركة'),
                    ),
                  if (widget.policy.can('sendToDelivery'))
                    OutlinedButton.icon(
                      onPressed: busy ? null : _dispatch,
                      icon: const Icon(Icons.send_outlined, size: 18),
                      label: const Text('إرسال'),
                    ),
                  if (busy)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 8),
                      child: SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                    ),
                ],
              ),
            ),
          const SizedBox(height: 12),
          if (found.isEmpty)
            const VFeedbackPanel(
              title: 'لا توجد طلبات مطابقة',
              message: 'لم يتم العثور على طلبات مرئية لهذه الباركودات.',
              icon: Icons.search_off,
            ),
          for (final o in found)
            Padding(
              padding: const EdgeInsets.only(bottom: 9),
              child: VLivePanel(
                padding: EdgeInsets.zero,
                child: InkWell(
                  onTap: () => _openDetails(o['id'].toString()),
                  borderRadius: BorderRadius.circular(12),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 10,
                    ),
                    child: Row(
                      children: [
                        Checkbox(
                          value: selected.contains(o['id'].toString()),
                          onChanged: (_) => _toggle(o['id'].toString()),
                        ),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                orderDisplayNumber(o),
                                textDirection: TextDirection.ltr,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w900,
                                  fontSize: 15,
                                  color: VColors.brand,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                '${o['customer'] ?? ''} • '
                                '${statusLabels[o['status']?.toString() ?? 'created'] ?? o['status']}',
                                style: const TextStyle(
                                  color: VColors.muted,
                                  fontSize: 12,
                                ),
                              ),
                            ],
                          ),
                        ),
                        IconButton(
                          tooltip: 'فتح التفاصيل',
                          onPressed: () => _openDetails(o['id'].toString()),
                          icon: const Icon(Icons.chevron_left),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          if (unresolved.isNotEmpty) ...[
            const SizedBox(height: 12),
            VLivePanel(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    'باركودات لم يتم العثور على طلب مطابق لها',
                    style: TextStyle(fontWeight: FontWeight.w900),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'تأكد من قيمة الباركود أو من صلاحيتك لعرض الطلب. '
                    'لا تُعرض أي بيانات لطلب غير مصرّح به.',
                    style: TextStyle(color: VColors.muted, fontSize: 12),
                  ),
                  const SizedBox(height: 8),
                  for (final c in unresolved)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: Row(
                        children: [
                          const Icon(
                            Icons.error_outline,
                            size: 16,
                            color: VColors.danger,
                          ),
                          const SizedBox(width: 6),
                          Expanded(
                            child: Text(
                              c,
                              textDirection: TextDirection.ltr,
                              style: const TextStyle(fontSize: 12.5),
                            ),
                          ),
                          const Text(
                            'غير موجود',
                            style: TextStyle(
                              color: VColors.danger,
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 24),
        ],
      ),
    ),
  );
}
