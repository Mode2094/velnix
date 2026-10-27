part of 'live_app.dart';

/// Barcode scanner + batch collection (up to 20 unique codes).
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
  static const maxCodes = 20;

  @override
  void dispose() {
    manual.dispose();
    controller.dispose();
    super.dispose();
  }

  bool _addCode(String raw) {
    final code = raw.trim();
    if (code.isEmpty) return false;
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

  Future<void> _resolve() async {
    if (codes.isEmpty || processing) return;
    setState(() => processing = true);
    try {
      final results = await VelnixGateway.instance.resolveBarcodes(codes);
      if (!mounted) return;
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
            padding: const EdgeInsets.all(10),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: manual,
                    textInputAction: TextInputAction.done,
                    onSubmitted: (v) {
                      if (_addCode(v)) manual.clear();
                    },
                    decoration: const InputDecoration(
                      labelText: 'إدخال كود يدوياً',
                      prefixIcon: Icon(Icons.keyboard),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.filledTonal(
                  tooltip: 'إضافة الكود',
                  onPressed: () {
                    if (_addCode(manual.text)) manual.clear();
                  },
                  icon: const Icon(Icons.add),
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
  late final int notFound;
  late final int duplicate;
  @override
  void initState() {
    super.initState();
    found = widget.results
        .where((r) => r['status'] == 'ok' && r['order'] is Map)
        .map((r) => Map<String, dynamic>.from(r['order'] as Map))
        .toList();
    notFound = widget.results
        .where((r) => r['status'] == 'not_found' || r['status'] == 'invalid')
        .length;
    duplicate = widget.results.where((r) => r['status'] == 'duplicate').length;
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
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 10,
                ),
                child: ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text('${o['customer'] ?? ''}'),
                  subtitle: Text(
                    'طلب #${o['orderNumber'] ?? o['id']} • ${statusLabels[o['status']?.toString() ?? 'created'] ?? o['status']}',
                  ),
                  trailing: const Icon(Icons.chevron_left),
                  onTap: () => Navigator.push(
                    context,
                    MaterialPageRoute<void>(
                      builder: (_) => LiveOrderDetail(
                        id: o['id'].toString(),
                        policy: widget.policy,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          const SizedBox(height: 24),
        ],
      ),
    ),
  );
}
