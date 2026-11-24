part of 'live_app.dart';

/// ---------------------------------------------------------------------------
/// Standalone Print Manager (WEB)
/// ---------------------------------------------------------------------------
/// A durable, resumable print queue that runs in its OWN browser window, not as
/// an in-page dialog, so a long run of tens or hundreds of vouchers survives a
/// hung printer, an out-of-paper stop, a reload or closing the window.
///
/// The browser cannot tell us whether paper physically came out, so this never
/// claims automatic detection: progress advances ONLY when the operator presses
/// «تأكيد الطباعة» and states the last voucher that actually printed. Nothing is
/// auto-confirmed above an unconfirmed page, and a resumed run prints the
/// remaining orders only — never the whole batch again.
///
/// The durable record (which orders, their order, the confirmed point, the
/// paper/template/orientation and the audit trail) lives server-side, scoped to
/// the user, so no customer data or PDF is ever kept in unprotected browser
/// storage.

/// Root widget of the manager window. The window is a fresh app instance opened
/// at `?velnixPrint=<batchId>` (see `main.dart`) and shares the browser session,
/// so Firebase Auth already has the signed-in user.
class VelnixPrintManagerApp extends StatelessWidget {
  const VelnixPrintManagerApp({super.key, required this.batchId});
  final String batchId;

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'مدير الطباعة — Velnix',
    debugShowCheckedModeBanner: false,
    theme: velnixTheme(),
    locale: const Locale('ar'),
    supportedLocales: const [Locale('ar')],
    localizationsDelegates: const [
      GlobalMaterialLocalizations.delegate,
      GlobalWidgetsLocalizations.delegate,
      GlobalCupertinoLocalizations.delegate,
    ],
    builder: (context, child) => Directionality(
      textDirection: TextDirection.rtl,
      child: child ?? const SizedBox.shrink(),
    ),
    home: StreamBuilder<User?>(
      stream: VelnixGateway.instance.auth.authStateChanges(),
      builder: (context, snap) {
        if (snap.connectionState == ConnectionState.waiting) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }
        if (snap.data == null) {
          return Scaffold(
            appBar: AppBar(title: const Text('مدير الطباعة — Velnix')),
            body: const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: Text(
                  'هذه النافذة تحتاج جلسة مسجّلة. سجّل الدخول من نافذة الموقع '
                  'الرئيسية ثم أعد فتح مدير الطباعة.',
                  textAlign: TextAlign.center,
                ),
              ),
            ),
          );
        }
        return PrintManagerScreen(
          batchId: batchId,
          currentUserId: snap.data!.uid,
        );
      },
    ),
  );
}

/// One durable print batch, as returned by the server.
class _PrintBatch {
  _PrintBatch(this.raw);
  final Map<String, dynamic> raw;
  String get id => raw['id'].toString();
  List<String> get orderIds =>
      (raw['orderIds'] as List? ?? const []).map((e) => e.toString()).toList();
  int get total => (raw['total'] as num?)?.toInt() ?? orderIds.length;
  int get confirmedCount => (raw['confirmedCount'] as num?)?.toInt() ?? 0;
  int get startIndex => (raw['startIndex'] as num?)?.toInt() ?? confirmedCount;
  String get status => raw['status']?.toString() ?? 'active';
  int get chunkSize => (raw['chunkSize'] as num?)?.toInt() ?? 10;
  String get paper => raw['paper']?.toString() ?? 'a4';
  String get template => raw['template']?.toString() ?? 'professional';
  bool get landscape => raw['landscape'] == true;
  String get source => raw['source']?.toString() ?? 'bulk';
  int? get issuedFrom => (raw['lastIssuedFrom'] as num?)?.toInt();
  int? get issuedTo => (raw['lastIssuedTo'] as num?)?.toInt();
  List<int> get reprintIndices => (raw['reprintIndices'] as List? ?? const [])
      .map((e) => (e as num).toInt())
      .toList();
  bool get finished => status == 'finished';
  bool get paused => status == 'paused';
}

class PrintManagerScreen extends StatefulWidget {
  const PrintManagerScreen({
    super.key,
    required this.batchId,
    required this.currentUserId,
  });
  final String batchId;
  final String currentUserId;

  @override
  State<PrintManagerScreen> createState() => _PrintManagerScreenState();
}

class _PrintManagerScreenState extends State<PrintManagerScreen> {
  static const _chunkSizes = [5, 10, 20, 25, 50, 100];

  VelnixGateway get gateway => VelnixGateway.instance;

  _PrintBatch? batch;
  final Map<String, Map<String, dynamic>> _ordersById = {};
  List<String> _incomplete = const [];
  bool loading = true;
  bool busy = false;
  String? error;

  /// The batch currently shown. Starts as the one this window was opened for and
  /// changes when the operator switches to another incomplete batch in-place.
  late String _batchId;

  OrderPaper paper = OrderPaper.a4;
  OrderTemplate template = OrderTemplate.professional;
  bool landscape = false;
  int chunkSize = 10;
  int startIndex = 0;

  /// The range that was just sent to the print dialog but NOT yet confirmed.
  int? pendingFrom;
  int? pendingTo;

  final Set<int> _checked = <int>{};
  final TextEditingController lastPageCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _batchId = widget.batchId;
    _load();
  }

  @override
  void dispose() {
    lastPageCtrl.dispose();
    super.dispose();
  }

  PdfPageFormat get format {
    final base = paper.format();
    if (!landscape) return base;
    return PdfPageFormat(base.height, base.width, marginAll: base.marginLeft);
  }

  Future<void> _load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final raw = await gateway.getPrintBatch(_batchId);
      final b = _PrintBatch(raw);
      // Fetch every order visible to THIS user; the batch is an id list only.
      final ids = b.orderIds;
      final fetched = <Map<String, dynamic>>[];
      for (var i = 0; i < ids.length; i += 60) {
        fetched.addAll(
          await gateway.ordersByIds(
            ids.sublist(i, (i + 60) > ids.length ? ids.length : i + 60),
          ),
        );
      }
      if (!mounted) return;
      List<String> incomplete = const [];
      try {
        final listed = await gateway.listPrintBatches(
          includeFinished: false,
          limit: 20,
        );
        incomplete = (listed['batches'] as List? ?? const [])
            .map((e) => (e as Map)['id'].toString())
            .where((id) => id != b.id)
            .toList();
      } catch (_) {}
      setState(() {
        batch = b;
        _ordersById
          ..clear()
          ..addEntries(fetched.map((o) => MapEntry(o['id'].toString(), o)));
        _incomplete = incomplete;
        paper = OrderPaper.values.firstWhere(
          (p) => p.name == b.paper,
          orElse: () => OrderPaper.a4,
        );
        template = OrderTemplate.values.firstWhere(
          (t) => t.name == b.template,
          orElse: () => OrderTemplate.professional,
        );
        landscape = b.landscape;
        chunkSize = _chunkSizes.contains(b.chunkSize) ? b.chunkSize : 10;
        startIndex = b.startIndex.clamp(0, b.total);
        final issuedFrom = b.issuedFrom;
        final issuedTo = b.issuedTo;
        if (issuedFrom != null &&
            issuedTo != null &&
            issuedTo >= b.confirmedCount &&
            issuedFrom <= issuedTo) {
          pendingFrom = issuedFrom < b.confirmedCount
              ? b.confirmedCount
              : issuedFrom;
          pendingTo = issuedTo;
          lastPageCtrl.text = '${issuedTo + 1}';
        }
        loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        error = '$e';
        loading = false;
      });
    }
  }

  Future<T> _run<T>(Future<T> Function() action) async {
    if (busy) return Future.error(StateError('busy'));
    setState(() => busy = true);
    try {
      return await action();
    } catch (e) {
      if (mounted) showError(context, e);
      rethrow;
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  int get _confirmed => batch?.confirmedCount ?? 0;
  int get _total => batch?.total ?? 0;

  /// The order maps for indices [from, from+count), skipping ones this user may
  /// not see (they stay unprintable and are never silently substituted).
  List<Map<String, dynamic>> _rangeOrders(int from, int count) {
    final b = batch;
    if (b == null) return const [];
    final ids = b.orderIds;
    final out = <Map<String, dynamic>>[];
    for (var i = from; i < from + count && i < ids.length; i++) {
      final o = _ordersById[ids[i]];
      if (o != null) out.add(o);
    }
    return out;
  }

  Future<void> _issueRange(int from, {bool recordIssue = true}) async {
    final b = batch;
    if (b == null || busy) return;
    final to = (from + chunkSize).clamp(0, b.total);
    if (from >= to) return;
    final orders = _rangeOrders(from, to - from);
    if (orders.isEmpty) {
      if (mounted) {
        showError(context, 'لا توجد طلبات قابلة للطباعة في هذا النطاق.');
      }
      return;
    }
    await _run(() async {
      await Printing.layoutPdf(
        name: 'Velnix-print-${b.id}-${from + 1}-$to.pdf',
        onLayout: (_) => OrderInvoicePdf.generateMany(
          orders: orders,
          format: format,
          template: template,
        ),
      );
      // The dialog closing is NOT proof paper came out: record that the range
      // was issued, then wait for the operator's explicit confirmation. The
      // confirmed point is never advanced here.
      if (recordIssue) {
        await gateway.updatePrintBatch(
          b.id,
          op: 'record_issue',
          fromIndex: from,
          toIndex: to - 1,
        );
      }
    });
    if (!mounted) return;
    setState(() {
      pendingFrom = from;
      pendingTo = to - 1;
      lastPageCtrl.text = '$to';
    });
    showSuccess(
      context,
      'أُرسلت الورقات ${from + 1}–$to إلى نافذة الطباعة. بعد خروج الورق، '
      'اكتب آخر ورقة خرجت فعلاً ثم اضغط «تأكيد الطباعة».',
    );
  }

  Future<void> _confirm() async {
    final b = batch;
    if (b == null || busy) return;
    final entered = int.tryParse(lastPageCtrl.text.trim());
    final from = pendingFrom ?? _confirmed;
    final to = pendingTo ?? _total - 1;
    if (entered == null || entered < from + 1 || entered > to + 1) {
      showError(
        context,
        'أدخل رقم آخر ورقة خرجت فعلاً بين ${from + 1} و ${to + 1}.',
      );
      return;
    }
    await _run(() async {
      final res = await gateway.updatePrintBatch(
        b.id,
        op: 'confirm',
        confirmedCount: entered,
      );
      if (!mounted) return;
      setState(() {
        batch = _PrintBatch(res);
        if (entered > to) {
          pendingFrom = null;
          pendingTo = null;
        } else {
          pendingFrom = entered;
        }
        startIndex = batch!.confirmedCount.clamp(0, _total);
      });
    });
    if (mounted) {
      showSuccess(context, 'تم تأكيد الطباعة حتى الورقة $entered.');
    }
  }

  Future<void> _setStartFromChecked() async {
    if (_checked.length != 1) {
      showError(context, 'حدّد طلباً واحداً لتحديد نقطة البداية منه.');
      return;
    }
    final index = _checked.first;
    await _run(() async {
      final res = await gateway.updatePrintBatch(
        _batchId,
        op: 'set_start',
        startIndex: index,
      );
      if (!mounted) return;
      setState(() {
        batch = _PrintBatch(res);
        startIndex = index;
      });
    });
    if (mounted) {
      showSuccess(context, 'نقطة البداية الآن الطلب ${index + 1}.');
    }
  }

  Future<void> _pauseResume() async {
    final b = batch;
    if (b == null) return;
    await _run(() async {
      final res = await gateway.updatePrintBatch(
        b.id,
        op: b.paused ? 'resume' : 'pause',
      );
      if (!mounted) return;
      setState(() => batch = _PrintBatch(res));
    });
  }

  Future<void> _finish() async {
    final b = batch;
    if (b == null) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('إنهاء الدفعة'),
        content: Text(
          'إنهاء الدفعة عند الطلب $_confirmed من أصل $_total؟ '
          'لن تتغيّر حالات الطلبات، ويمكنك إعادة الطباعة لاحقاً.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('إلغاء'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('إنهاء'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    await _run(() async {
      final res = await gateway.updatePrintBatch(b.id, op: 'finish');
      if (!mounted) return;
      setState(() => batch = _PrintBatch(res));
    });
    if (mounted) showSuccess(context, 'تم إنهاء الدفعة.');
  }

  Future<void> _reprintChecked() async {
    final b = batch;
    if (b == null || _checked.isEmpty) {
      showError(context, 'حدّد الطلبات المطلوب إعادة طباعتها.');
      return;
    }
    final indices = _checked.toList()..sort();
    final orders = <Map<String, dynamic>>[];
    for (final i in indices) {
      final o = _ordersById[b.orderIds[i]];
      if (o != null) orders.add(o);
    }
    if (orders.isEmpty) {
      showError(context, 'لا توجد طلبات قابلة لإعادة الطباعة.');
      return;
    }
    await _run(() async {
      await Printing.layoutPdf(
        name: 'Velnix-reprint-${b.id}-${indices.length}.pdf',
        onLayout: (_) => OrderInvoicePdf.generateMany(
          orders: orders,
          format: format,
          template: template,
        ),
      );
      final res = await gateway.updatePrintBatch(
        b.id,
        op: 'reprint',
        indices: indices,
      );
      // Reflect the recorded reprint immediately: the row must show
      // «يحتاج إعادة طباعة» without needing a reload.
      if (!mounted) return;
      setState(() {
        batch = _PrintBatch(res);
        _checked.clear();
      });
    });
    if (mounted) {
      showSuccess(
        context,
        'تمت إعادة طباعة ${orders.length} طلب (مع تسجيلها للتدقيق).',
      );
    }
  }

  Future<void> _switchBatch(String id) async {
    if (busy) return;
    _batchId = id;
    setState(() {
      batch = null;
      loading = true;
      pendingFrom = null;
      pendingTo = null;
      _checked.clear();
    });
    // Reuse this screen for another batch without a new window.
    final raw = await gateway.getPrintBatch(id);
    final b = _PrintBatch(raw);
    final ids = b.orderIds;
    final fetched = <Map<String, dynamic>>[];
    for (var i = 0; i < ids.length; i += 60) {
      fetched.addAll(
        await gateway.ordersByIds(
          ids.sublist(i, (i + 60) > ids.length ? ids.length : i + 60),
        ),
      );
    }
    if (!mounted) return;
    setState(() {
      batch = b;
      _ordersById
        ..clear()
        ..addEntries(fetched.map((o) => MapEntry(o['id'].toString(), o)));
      paper = OrderPaper.values.firstWhere(
        (p) => p.name == b.paper,
        orElse: () => OrderPaper.a4,
      );
      template = OrderTemplate.values.firstWhere(
        (t) => t.name == b.template,
        orElse: () => OrderTemplate.professional,
      );
      landscape = b.landscape;
      chunkSize = _chunkSizes.contains(b.chunkSize) ? b.chunkSize : 10;
      startIndex = b.startIndex.clamp(0, b.total);
      loading = false;
    });
  }

  String _stateOf(int index) {
    final b = batch;
    if (b == null) return 'pending';
    if (b.reprintIndices.contains(index)) return 'reprint';
    if (index < b.confirmedCount) return 'confirmed';
    if (pendingFrom != null &&
        pendingTo != null &&
        index >= pendingFrom! &&
        index <= pendingTo!) {
      return 'issued';
    }
    return 'pending';
  }

  @override
  Widget build(BuildContext context) {
    final b = batch;
    return Scaffold(
      backgroundColor: const Color(0xFFF3F5F9),
      appBar: AppBar(
        title: const Text('مدير الطباعة — Velnix'),
        actions: [
          IconButton(
            tooltip: 'تحديث',
            onPressed: busy ? null : _load,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : error != null
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  'تعذّر تحميل الدفعة: $error',
                  textAlign: TextAlign.center,
                ),
              ),
            )
          : b == null
          ? const Center(child: Text('لا توجد دفعة.'))
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _progressPanel(b),
                _controlsPanel(b),
                if (pendingFrom != null && pendingTo != null) _confirmBar(b),
                Expanded(child: _orderList(b)),
              ],
            ),
    );
  }

  Widget _progressPanel(_PrintBatch b) => Container(
    color: Colors.white,
    padding: const EdgeInsets.fromLTRB(16, 12, 16, 10),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                'تم تأكيد $_confirmed من أصل $_total',
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
            _statusChip(b),
          ],
        ),
        const SizedBox(height: 8),
        ClipRRect(
          borderRadius: BorderRadius.circular(6),
          child: LinearProgressIndicator(
            value: _total == 0 ? 0 : _confirmed / _total,
            minHeight: 10,
            backgroundColor: const Color(0xFFE3E8F0),
          ),
        ),
        const SizedBox(height: 6),
        Text(
          'نقطة الاستكمال: الطلب ${startIndex + 1}'
          '${_confirmed > 0 ? ' • آخر طلب مؤكد: $_confirmed' : ''}',
          style: const TextStyle(fontSize: 12.5, color: VColors.muted),
        ),
        // The queue is a grid (canvas-painted), so keep a durable, readable
        // count of orders flagged for reprint here in the header as well.
        if (b.reprintIndices.isNotEmpty) ...[
          const SizedBox(height: 6),
          Row(
            children: [
              const Icon(
                Icons.replay_circle_filled_outlined,
                size: 16,
                color: VColors.danger,
              ),
              const SizedBox(width: 6),
              Text(
                'يحتاج إعادة طباعة: ${b.reprintIndices.length}',
                style: const TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w800,
                  color: VColors.danger,
                ),
              ),
            ],
          ),
        ],
        if (_incomplete.isNotEmpty) ...[
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              const Text(
                'دفعات غير مكتملة:',
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12.5),
              ),
              for (final id in _incomplete)
                OutlinedButton(
                  onPressed: busy ? null : () => _switchBatch(id),
                  child: Text(id.length > 12 ? id.substring(0, 12) : id),
                ),
            ],
          ),
        ],
      ],
    ),
  );

  Widget _statusChip(_PrintBatch b) {
    final (label, color) = b.finished
        ? ('منتهية', VColors.aqua)
        : b.paused
        ? ('موقوفة مؤقتاً', VColors.warning)
        : ('نشطة', VColors.brand);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontWeight: FontWeight.w900,
          fontSize: 12,
        ),
      ),
    );
  }

  Widget _controlsPanel(_PrintBatch b) => Container(
    color: Colors.white,
    padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Wrap(
          spacing: 10,
          runSpacing: 10,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            _dd<OrderPaper>(
              label: 'حجم الورق',
              value: paper,
              items: OrderPaper.values,
              labelOf: (p) => p.label,
              onChanged: (v) => setState(() => paper = v),
            ),
            _dd<OrderTemplate>(
              label: 'نوع البوليصة',
              value: template,
              items: OrderTemplate.values,
              labelOf: (t) => t.label,
              onChanged: (v) => setState(() => template = v),
            ),
            _dd<bool>(
              label: 'الاتجاه',
              value: landscape,
              items: const [false, true],
              labelOf: (v) => v ? 'أفقي' : 'عمودي',
              onChanged: (v) => setState(() => landscape = v),
            ),
            _dd<int>(
              label: 'حجم الدفعة الصغيرة',
              value: chunkSize,
              items: _chunkSizes,
              labelOf: (v) => '$v ورقة',
              onChanged: (v) => setState(() => chunkSize = v),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 10,
          runSpacing: 10,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            FilledButton.icon(
              onPressed: busy || b.finished
                  ? null
                  : () => _issueRange(startIndex),
              icon: const Icon(Icons.print, size: 18),
              label: Text(
                'طباعة (${startIndex + 1}–${(startIndex + chunkSize).clamp(0, _total)})',
              ),
            ),
            FilledButton.tonalIcon(
              onPressed: busy || b.finished
                  ? null
                  : () => _issueRange(_confirmed),
              icon: const Icon(Icons.play_arrow, size: 18),
              label: const Text('استكمال'),
            ),
            OutlinedButton.icon(
              onPressed: busy || _checked.isEmpty ? null : _reprintChecked,
              icon: const Icon(Icons.replay, size: 18),
              label: Text('إعادة طباعة المحدد (${_checked.length})'),
            ),
            OutlinedButton.icon(
              onPressed: busy ? null : _setStartFromChecked,
              icon: const Icon(Icons.flag_outlined, size: 18),
              label: const Text('تحديد نقطة البداية'),
            ),
            OutlinedButton.icon(
              onPressed: busy || b.finished ? null : _pauseResume,
              icon: Icon(
                b.paused ? Icons.play_circle : Icons.pause_circle,
                size: 18,
              ),
              label: Text(b.paused ? 'استئناف' : 'إيقاف مؤقت'),
            ),
            OutlinedButton.icon(
              onPressed: busy || b.finished ? null : _finish,
              icon: const Icon(Icons.done_all, size: 18),
              label: const Text('إنهاء الدفعة'),
            ),
            if (busy)
              const SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
          ],
        ),
      ],
    ),
  );

  Widget _confirmBar(_PrintBatch b) => Container(
    color: const Color(0xFFFFF6E5),
    padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
    child: Wrap(
      spacing: 10,
      runSpacing: 8,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        const Icon(Icons.help_outline, color: VColors.warning),
        const Text(
          'أُرسلت الورقات إلى نافذة الطباعة. المتصفح لا يعرف الورق الخارج فعلاً، '
          'فأدخل آخر ورقة خرجت:',
          style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700),
        ),
        SizedBox(
          width: 110,
          child: TextField(
            controller: lastPageCtrl,
            keyboardType: TextInputType.number,
            decoration: InputDecoration(
              isDense: true,
              labelText: 'آخر ورقة',
              helperText: '${pendingFrom! + 1}–${pendingTo! + 1}',
              border: const OutlineInputBorder(),
            ),
          ),
        ),
        FilledButton.icon(
          onPressed: busy ? null : _confirm,
          icon: const Icon(Icons.check, size: 18),
          label: const Text('تأكيد الطباعة'),
        ),
      ],
    ),
  );

  Widget _orderList(_PrintBatch b) => Padding(
    padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
    child: Container(
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: const Color(0xFFD9E1EC)),
        borderRadius: BorderRadius.circular(10),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          Container(
            color: const Color(0xFFD7E6F7),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            child: Row(
              children: const [
                SizedBox(width: 46, child: Text('#', style: _headStyle)),
                SizedBox(width: 40),
                Expanded(child: Text('رقم الطلب', style: _headStyle)),
                SizedBox(width: 150, child: Text('الحالة', style: _headStyle)),
                SizedBox(
                  width: 150,
                  child: Text('حالة الطباعة', style: _headStyle),
                ),
              ],
            ),
          ),
          Expanded(
            child: ListView.builder(
              itemCount: b.total,
              itemBuilder: (context, i) {
                final order = _ordersById[b.orderIds[i]];
                final state = _stateOf(i);
                final isStart = i == startIndex;
                return Container(
                  decoration: BoxDecoration(
                    color: isStart
                        ? const Color(0xFFEAF3FF)
                        : (i.isEven ? Colors.white : const Color(0xFFFAFBFD)),
                    border: const Border(
                      top: BorderSide(color: Color(0xFFEDF1F7)),
                    ),
                  ),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 4,
                  ),
                  child: Row(
                    children: [
                      SizedBox(
                        width: 46,
                        child: Text(
                          '${i + 1}',
                          style: TextStyle(
                            fontWeight: FontWeight.w800,
                            color: isStart ? VColors.brand : VColors.ink,
                          ),
                        ),
                      ),
                      SizedBox(
                        width: 40,
                        child: Checkbox(
                          value: _checked.contains(i),
                          onChanged: busy
                              ? null
                              : (v) => setState(() {
                                  if (v == true) {
                                    _checked.add(i);
                                  } else {
                                    _checked.remove(i);
                                  }
                                }),
                        ),
                      ),
                      Expanded(
                        child: Text(
                          order == null
                              ? 'غير متاح (لا تملك صلاحية عرضه)'
                              : '${order['orderNumber'] ?? order['id']}',
                          style: TextStyle(
                            fontWeight: FontWeight.w700,
                            color: order == null ? VColors.muted : VColors.ink,
                          ),
                        ),
                      ),
                      SizedBox(
                        width: 150,
                        child: Text(
                          statusLabels[order?['status']?.toString() ?? ''] ??
                              (order?['status']?.toString() ?? '—'),
                          style: const TextStyle(fontSize: 12.5),
                        ),
                      ),
                      SizedBox(width: 150, child: _printStateChip(state)),
                    ],
                  ),
                );
              },
            ),
          ),
        ],
      ),
    ),
  );

  Widget _printStateChip(String state) {
    final (label, color) = switch (state) {
      'confirmed' => ('مؤكد', VColors.aqua),
      'issued' => ('أُرسل بلا تأكيد', VColors.warning),
      'reprint' => ('يحتاج إعادة طباعة', VColors.danger),
      _ => ('معلّق', VColors.muted),
    };
    return Align(
      alignment: AlignmentDirectional.centerStart,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: color,
            fontSize: 12,
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
    );
  }

  Widget _dd<T>({
    required String label,
    required T value,
    required List<T> items,
    required String Function(T) labelOf,
    required ValueChanged<T> onChanged,
  }) => SizedBox(
    width: 170,
    child: DropdownButtonFormField<T>(
      key: ValueKey('$label-$value'),
      initialValue: value,
      isExpanded: true,
      isDense: true,
      decoration: InputDecoration(
        isDense: true,
        labelText: label,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 10,
          vertical: 10,
        ),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
      ),
      items: [
        for (final it in items)
          DropdownMenuItem(value: it, child: Text(labelOf(it))),
      ],
      onChanged: busy ? null : (v) => onChanged(v as T),
    ),
  );
}

const _headStyle = TextStyle(
  fontSize: 13,
  fontWeight: FontWeight.w900,
  color: VColors.ink,
);

/// The one entry point every print action on the web funnels through: single
/// order, a selected group, or the optional print after a status change.
///
/// It MUST be called from a direct user interaction. The browser window is
/// claimed synchronously (before the first `await`) so it can never be lost to
/// the pop-up blocker while the durable batch is being created; once created,
/// the window is navigated to `?velnixPrint=<id>`. When no window could be
/// opened (blocked, or a platform without windows) the manager opens as an
/// in-app full-screen route instead, so printing is never blocked.
Future<void> openPrintManager(
  BuildContext context, {
  required List<String> orderIds,
  required String source,
  int chunkSize = 10,
  OrderPaper paper = OrderPaper.a4,
  OrderTemplate template = OrderTemplate.professional,
  bool landscape = false,
  String? dedupeKey,
}) async {
  if (orderIds.isEmpty) return;
  final gateway = VelnixGateway.instance;
  final handle = printWindowSupported
      ? openBlankPrintWindow('velnix_print_manager')
      : null;
  Map<String, dynamic> batch;
  try {
    batch = await gateway.createPrintBatch(
      orderIds: orderIds,
      paper: paper.name,
      template: template.name,
      landscape: landscape,
      chunkSize: chunkSize,
      source: source,
      dedupeKey: dedupeKey,
    );
  } catch (e) {
    if (handle != null) focusPrintWindow(handle);
    if (context.mounted) showError(context, e);
    return;
  }
  final id = batch['id'].toString();
  final skipped = (batch['skipped'] as num?)?.toInt() ?? 0;
  if (handle != null) {
    final url = Uri.base
        .replace(
          queryParameters: {...Uri.base.queryParameters, 'velnixPrint': id},
        )
        .toString();
    navigatePrintWindow(handle, url);
    if (context.mounted && skipped > 0) {
      showSuccess(context, 'تم استثناء $skipped طلباً لا تملك صلاحية طباعتها.');
    }
    return;
  }
  if (!context.mounted) return;
  await Navigator.of(context).push(
    MaterialPageRoute<void>(
      builder: (_) => PrintManagerScreen(
        batchId: id,
        currentUserId: gateway.auth.currentUser?.uid ?? '',
      ),
    ),
  );
}
