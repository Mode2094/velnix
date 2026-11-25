part of 'live_app.dart';

/// Web-only bulk-dispatch reporting: an honest per-order progress window and a
/// final report that distinguishes a carrier-confirmed success from a definite
/// failure and from a result that still needs review. Nothing here invents a
/// reason or treats an HTTP response as an acceptance — the counters and rows
/// come from the durable per-order results the server returned.

/// Confirmed outcome of one order inside a bulk dispatch.
enum BulkDispatchOutcome { success, failed, needsReview }

/// Live progress of a running bulk dispatch (shown in the progress window).
class BulkDispatchProgress {
  const BulkDispatchProgress({
    required this.total,
    this.processed = 0,
    this.accepted = 0,
    this.failed = 0,
    this.needsReview = 0,
    this.currentSerial,
    this.finished = false,
  });

  final int total;
  final int processed;
  final int accepted;
  final int failed;
  final int needsReview;

  /// Serial (`VNX-…`) of the order (or first order of the batch) currently being
  /// processed. Null before the first batch starts.
  final String? currentSerial;

  /// Set once the run is over so the window closes itself.
  final bool finished;

  BulkDispatchProgress copyWith({
    int? processed,
    int? accepted,
    int? failed,
    int? needsReview,
    String? currentSerial,
    bool? finished,
  }) => BulkDispatchProgress(
    total: total,
    processed: processed ?? this.processed,
    accepted: accepted ?? this.accepted,
    failed: failed ?? this.failed,
    needsReview: needsReview ?? this.needsReview,
    currentSerial: currentSerial ?? this.currentSerial,
    finished: finished ?? this.finished,
  );
}

/// One row of the final report. Only non-success orders are ever represented
/// here; a confirmed success is counted, never listed as a problem.
class BulkDispatchReportRow {
  const BulkDispatchReportRow({
    required this.orderId,
    required this.orderNumber,
    required this.company,
    required this.outcome,
    required this.reason,
  });

  final String orderId;
  final String orderNumber;
  final String company;
  final BulkDispatchOutcome outcome;
  final String reason;
}

/// Aggregated, honest result of a bulk dispatch.
class BulkDispatchReport {
  const BulkDispatchReport({
    required this.total,
    required this.success,
    required this.failed,
    required this.needsReview,
    required this.rows,
    this.operationIds = const [],
    this.interrupted = false,
  });

  final int total;
  final int success;
  final int failed;
  final int needsReview;
  final List<BulkDispatchReportRow> rows;

  /// Durable operation ids («سجل عمليات الإرسال») so the result stays reachable
  /// after the dialog is closed.
  final List<String> operationIds;

  /// True when the run stopped before every batch could be confirmed.
  final bool interrupted;

  /// Every requested order was confirmed accepted by the carrier.
  bool get allSucceeded =>
      total > 0 &&
      success == total &&
      failed == 0 &&
      needsReview == 0 &&
      !interrupted;

  int get notSucceeded => failed + needsReview;
}

/// Classifies a single server result row. `ok:false` with `uncertain` (or the
/// transport/timeout codes) is a result that NEEDS REVIEW — never a definite
/// failure, never a success. An HTTP 2xx on its own is never a success: only
/// `ok == true` is.
BulkDispatchOutcome bulkDispatchOutcome(Map<String, dynamic> r) {
  if (r['ok'] == true) return BulkDispatchOutcome.success;
  final code = r['code']?.toString() ?? '';
  if (r['uncertain'] == true ||
      code == 'unavailable' ||
      code == 'deadline-exceeded' ||
      code == 'aborted' ||
      code == 'internal' ||
      code == 'cancelled') {
    return BulkDispatchOutcome.needsReview;
  }
  return BulkDispatchOutcome.failed;
}

/// Human-readable Arabic reason for a non-success dispatch row.
///
/// Prefers the real server/carrier message; falls back to a known code mapping;
/// and when neither is available shows the honest «تعذر تحديد السبب بدقة» with a
/// diagnostic reference — it NEVER guesses a cause.
String bulkDispatchReason(Map<String, dynamic> r) {
  final code = r['code']?.toString() ?? '';
  final message = (r['message']?.toString() ?? '').trim();
  final uncertain = r['uncertain'] == true;
  // A specific server message is the real reason and always wins (except the
  // two generic auth/existence codes, where our Arabic is clearer).
  if (message.isNotEmpty &&
      code != 'permission-denied' &&
      code != 'not-found') {
    return message;
  }
  final known = switch (code) {
    'permission-denied' => 'لا تملك صلاحية إرسال هذا الطلب',
    'not-found' => 'الطلب غير موجود',
    'failed-precondition' =>
      'الطلب غير مؤهل للإرسال (تحقّق من الشركة والبيانات)',
    'invalid-argument' => 'بيانات الإرسال غير صحيحة',
    'aborted' => 'تغيّر قفل الإرسال أثناء العملية — أعد المحاولة',
    'unavailable' =>
      'تعذّر الوصول إلى شركة التوصيل — النتيجة غير مؤكدة وتحتاج مراجعة',
    'deadline-exceeded' =>
      'انتهت مهلة الإرسال — النتيجة غير مؤكدة وتحتاج مراجعة',
    'internal' => 'خطأ داخلي أثناء الإرسال — النتيجة غير مؤكدة',
    _ => '',
  };
  if (known.isNotEmpty) return known;
  final ref = r['id']?.toString() ?? '';
  final diag = code.isEmpty ? ref : '$ref • $code';
  return uncertain
      ? 'تعذر تحديد السبب بدقة — تحتاج مراجعة (مرجع: $diag)'
      : 'تعذر تحديد السبب بدقة (مرجع: $diag)';
}

/// Serial (`VNX-…`) of an order from the loaded rows, falling back to the
/// barcode value and then to the document id — never blank.
String _dispatchSerial(Map<String, Map<String, dynamic>> byId, String id) {
  final o = byId[id];
  final number = o?['orderNumber']?.toString().trim() ?? '';
  if (number.isNotEmpty) return number;
  final barcode = o?['barcodeValue']?.toString().trim() ?? '';
  if (barcode.isNotEmpty) return barcode;
  return id.isEmpty ? '—' : 'VNX-$id';
}

/// Delivery-company label for an order, from the loaded row, then the metadata
/// id→name map, then a clear «غير مسندة» — never a bare id.
String _dispatchCompanyLabel(
  Map<String, Map<String, dynamic>> byId,
  String id,
  Map<String, String> companyNames,
) {
  final order = byId[id];
  final companyId = order?['companyId']?.toString();
  final rowCompany = order?['companyName']?.toString().trim() ?? '';
  if (rowCompany.isNotEmpty) return rowCompany;
  if (companyId != null && (companyNames[companyId] ?? '').isNotEmpty) {
    return companyNames[companyId]!;
  }
  if (companyId == null || companyId.isEmpty) return 'غير مسندة';
  return '—';
}

/// Builds report rows from the merged per-order results, enriched with the order
/// serial and the delivery-company name from the already-loaded rows / metadata.
List<BulkDispatchReportRow> bulkDispatchRows(
  List<Map<String, dynamic>> results,
  Map<String, Map<String, dynamic>> byId,
  Map<String, String> companyNames,
) {
  final out = <BulkDispatchReportRow>[];
  for (final r in results) {
    if (bulkDispatchOutcome(r) == BulkDispatchOutcome.success) continue;
    final id = r['id']?.toString() ?? '';
    out.add(
      BulkDispatchReportRow(
        orderId: id,
        orderNumber: _dispatchSerial(byId, id),
        company: _dispatchCompanyLabel(byId, id, companyNames),
        outcome: bulkDispatchOutcome(r),
        reason: bulkDispatchReason(r),
      ),
    );
  }
  return out;
}

/// Arabic one-line summary used by «نسخ التقرير» and the CSV header block.
String bulkReportText(BulkDispatchReport report) {
  final lines = <String>[
    'تقرير إرسال الطلبات إلى شركة التوصيل',
    'الإجمالي: ${report.total}',
    'تم الإرسال (مؤكد): ${report.success}',
    'فشل مؤكد: ${report.failed}',
    'تحتاج مراجعة: ${report.needsReview}',
    if (report.interrupted)
      'ملاحظة: توقّف التنفيذ قبل إتمام كل الدفعات؛ لم تُعد المحاولة تلقائيًا لتجنّب تكرار غير مقصود.',
    if (report.operationIds.isNotEmpty)
      'معرّفات العمليات: ${report.operationIds.join('، ')}',
  ];
  for (final r in report.rows) {
    final label = r.outcome == BulkDispatchOutcome.needsReview
        ? 'تحتاج مراجعة'
        : 'فشل مؤكد';
    lines.add('${r.orderNumber} | ${r.company} | $label | ${r.reason}');
  }
  return lines.join('\n');
}

String _csvCell(String value) {
  final needsQuote =
      value.contains(',') || value.contains('"') || value.contains('\n');
  final escaped = value.replaceAll('"', '""');
  return needsQuote ? '"$escaped"' : escaped;
}

/// UTF-8 CSV (with a BOM so Excel shows the Arabic correctly) for the report.
String bulkReportCsv(BulkDispatchReport report) {
  final rows = <List<String>>[
    ['رقم الطلب', 'شركة التوصيل', 'النتيجة', 'سبب المشكلة'],
    for (final r in report.rows)
      [
        r.orderNumber,
        r.company,
        r.outcome == BulkDispatchOutcome.needsReview
            ? 'تحتاج مراجعة'
            : 'فشل مؤكد',
        r.reason,
      ],
  ];
  final body = rows.map((row) => row.map(_csvCell).join(',')).join('\r\n');
  return '\uFEFF$body\r\n';
}

/// Live progress window shown while a web bulk dispatch is running.
class _BulkDispatchProgressDialog extends StatefulWidget {
  const _BulkDispatchProgressDialog({required this.progress});
  final ValueListenable<BulkDispatchProgress> progress;
  @override
  State<_BulkDispatchProgressDialog> createState() =>
      _BulkDispatchProgressDialogState();
}

class _BulkDispatchProgressDialogState
    extends State<_BulkDispatchProgressDialog> {
  @override
  void initState() {
    super.initState();
    widget.progress.addListener(_onChange);
  }

  @override
  void dispose() {
    widget.progress.removeListener(_onChange);
    super.dispose();
  }

  // The dialog is closed deterministically by the caller once the run is over
  // (see `_runBulkChunked`), so it can never keep a spinner alive behind a
  // result window. This listener only repaints on each progress update.
  void _onChange() {
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.progress.value;
    final value = p.total == 0 ? 0.0 : (p.processed / p.total).clamp(0.0, 1.0);
    return PopScope(
      canPop: false,
      child: AlertDialog(
        title: const Text('جارٍ الإرسال إلى شركة التوصيل'),
        content: SizedBox(
          width: 420,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              LinearProgressIndicator(value: value),
              const SizedBox(height: 12),
              Text(
                'تمت معالجة ${p.processed} من ${p.total} طلبًا',
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 8),
              Text(
                'مقبول لدى الشركة: ${p.accepted}  •  '
                'فشل مؤكد: ${p.failed}  •  '
                'تحتاج مراجعة: ${p.needsReview}',
                style: const TextStyle(fontSize: 12, color: VColors.muted),
              ),
              if (p.currentSerial != null) ...[
                const SizedBox(height: 8),
                Text(
                  'قيد المعالجة: ${p.currentSerial}',
                  style: const TextStyle(fontSize: 12, color: VColors.muted),
                ),
              ],
              const SizedBox(height: 8),
              const Text(
                'لا يُحتسب أي طلب مقبولًا إلا بعد تأكيد شركة التوصيل فعليًا.',
                style: TextStyle(fontSize: 11, color: VColors.muted),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Full-success window: every selected order was confirmed by the carrier.
class _BulkDispatchSuccessDialog extends StatelessWidget {
  const _BulkDispatchSuccessDialog({required this.report});
  final BulkDispatchReport report;

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('تم إرسال جميع الطلبات بنجاح إلى شركة التوصيل'),
    content: SizedBox(
      width: 420,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'تم إرسال ${report.success} من أصل ${report.total} طلبًا.',
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
          if (report.operationIds.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              'معرّفات العمليات: ${report.operationIds.join('، ')}',
              style: const TextStyle(fontSize: 12, color: VColors.muted),
            ),
          ],
        ],
      ),
    ),
    actions: [
      TextButton(
        onPressed: () {
          Clipboard.setData(ClipboardData(text: bulkReportText(report)));
          showSuccess(context, 'تم نسخ التقرير.');
        },
        child: const Text('نسخ التقرير'),
      ),
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('إغلاق'),
      ),
    ],
  );
}

/// Final report window shown when at least one order was not confirmed.
///
/// Public so the widget tests can drive it directly. The Table lists ONLY the
/// non-success orders with their real reason; tapping a row opens that order.
class BulkDispatchReportDialog extends StatefulWidget {
  const BulkDispatchReportDialog({
    super.key,
    required this.report,
    this.onOpenOrder,
    this.onVerifyUncertain,
  });

  final BulkDispatchReport report;
  final void Function(String id)? onOpenOrder;

  /// Runs the EXISTING safe reconciliation (read-only, never a resend) for the
  /// given ids and returns {'confirmed': [ids], 'review': int}.
  final Future<Map<String, dynamic>> Function(List<String> ids)?
  onVerifyUncertain;

  @override
  State<BulkDispatchReportDialog> createState() =>
      BulkDispatchReportDialogState();
}

class BulkDispatchReportDialogState extends State<BulkDispatchReportDialog> {
  late bool _showFailed = widget.report.rows.isNotEmpty;
  bool _verifying = false;
  String? _verifyMessage;

  Future<void> _verify() async {
    final verify = widget.onVerifyUncertain;
    if (verify == null || _verifying) return;
    final ids = [
      for (final r in widget.report.rows)
        if (r.outcome == BulkDispatchOutcome.needsReview) r.orderId,
    ];
    if (ids.isEmpty) return;
    setState(() {
      _verifying = true;
      _verifyMessage = null;
    });
    Map<String, dynamic> result = const {};
    try {
      result = await verify(ids);
    } catch (e) {
      if (mounted) {
        setState(() {
          _verifying = false;
          _verifyMessage = 'تعذر إكمال التحقق: $e';
        });
      }
      return;
    }
    if (!mounted) return;
    final confirmed = ((result['confirmed'] as List?) ?? const [])
        .map((e) => e.toString())
        .toSet();
    final review = (result['review'] as num?)?.toInt() ?? 0;
    setState(() {
      _verifying = false;
      _verifyMessage = confirmed.isEmpty
          ? 'لم يُعثر على أي شحنة مؤكدة لدى الشركة؛ لا يزال $review طلبًا تحتاج مراجعة. لم يُعَد إرسال أي طلب.'
          : 'تم تأكيد ${confirmed.length} شحنة لدى الشركة، وتبقى $review تحتاج مراجعة. لم يُعَد إرسال أي طلب.';
    });
  }

  @override
  Widget build(BuildContext context) {
    final report = widget.report;
    return AlertDialog(
      title: const Text('نتيجة إرسال الطلبات إلى شركة التوصيل'),
      content: SizedBox(
        width: 720,
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              Wrap(
                spacing: 16,
                runSpacing: 6,
                children: [
                  _stat('الإجمالي', report.total, VColors.ink),
                  _stat('تم الإرسال (مؤكد)', report.success, VColors.aqua),
                  _stat('فشل مؤكد', report.failed, VColors.danger),
                  _stat('تحتاج مراجعة', report.needsReview, VColors.warning),
                ],
              ),
              if (report.interrupted) ...[
                const SizedBox(height: 8),
                const Text(
                  'توقّف التنفيذ قبل إتمام كل الدفعات؛ الأرقام تخص ما نُفّذ فعلاً. '
                  'الطلبات التي أُرسلت ولم تصل نتيجتها «تحتاج مراجعة» ولم يُعَد '
                  'إرسالها تلقائيًا لتجنّب تكرار غير مقصود.',
                  style: TextStyle(fontSize: 12, color: VColors.danger),
                ),
              ],
              if (report.operationIds.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  'معرّفات العمليات (يمكن تتبّعها من «سجل عمليات الإرسال»): '
                  '${report.operationIds.join('، ')}',
                  style: const TextStyle(fontSize: 12, color: VColors.muted),
                ),
              ],
              if (_showFailed && report.rows.isNotEmpty) ...[
                const SizedBox(height: 12),
                _table(),
              ],
              if (_verifyMessage != null) ...[
                const SizedBox(height: 10),
                Text(
                  _verifyMessage!,
                  style: const TextStyle(fontSize: 12, color: VColors.brand),
                ),
              ],
            ],
          ),
        ),
      ),
      actions: [
        if (report.rows.isNotEmpty)
          TextButton(
            onPressed: () => setState(() => _showFailed = !_showFailed),
            child: Text(
              _showFailed ? 'إخفاء الطلبات غير الناجحة' : 'عرض الطلبات الفاشلة',
            ),
          ),
        TextButton(
          onPressed: () {
            Clipboard.setData(ClipboardData(text: bulkReportText(report)));
            showSuccess(context, 'تم نسخ التقرير.');
          },
          child: const Text('نسخ التقرير'),
        ),
        TextButton(
          onPressed: () {
            downloadTextFile(
              'velnix-dispatch-report.csv',
              bulkReportCsv(report),
            );
            showSuccess(context, 'تم تنزيل التقرير.');
          },
          child: const Text('تنزيل التقرير (CSV)'),
        ),
        if (report.needsReview > 0 && widget.onVerifyUncertain != null)
          TextButton(
            onPressed: _verifying ? null : _verify,
            child: _verifying
                ? const Text('جارٍ التحقق…')
                : const Text('التحقق من غير المؤكد'),
          ),
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('إغلاق'),
        ),
      ],
    );
  }

  Widget _stat(String label, int value, Color color) => Column(
    mainAxisSize: MainAxisSize.min,
    children: [
      Text(
        '$value',
        style: TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.w900,
          color: color,
        ),
      ),
      Text(label, style: const TextStyle(fontSize: 12, color: VColors.muted)),
    ],
  );

  Widget _table() => Container(
    decoration: BoxDecoration(
      border: Border.all(color: VColors.line),
      borderRadius: BorderRadius.circular(8),
    ),
    clipBehavior: Clip.antiAlias,
    child: Table(
      columnWidths: const {
        0: FlexColumnWidth(2.0),
        1: FlexColumnWidth(2.2),
        2: FlexColumnWidth(1.4),
        3: FlexColumnWidth(4.4),
      },
      border: TableBorder.symmetric(inside: BorderSide(color: VColors.line)),
      children: [
        TableRow(
          decoration: const BoxDecoration(color: Color(0xFFD7E6F7)),
          children: [
            _cell('رقم الطلب', header: true),
            _cell('شركة التوصيل', header: true),
            _cell('النتيجة', header: true),
            _cell('سبب المشكلة', header: true),
          ],
        ),
        for (final r in widget.report.rows)
          TableRow(
            children: [
              _cell(r.orderNumber, onTap: r.orderId.isEmpty ? null : r.orderId),
              _cell(r.company, onTap: r.orderId.isEmpty ? null : r.orderId),
              _cell(
                r.outcome == BulkDispatchOutcome.needsReview
                    ? 'تحتاج مراجعة'
                    : 'فشل مؤكد',
                color: r.outcome == BulkDispatchOutcome.needsReview
                    ? VColors.warning
                    : VColors.danger,
                onTap: r.orderId.isEmpty ? null : r.orderId,
              ),
              _cell(
                r.reason,
                onTap: r.orderId.isEmpty ? null : r.orderId,
                ltr: true,
              ),
            ],
          ),
      ],
    ),
  );

  Widget _cell(
    String text, {
    bool header = false,
    Color? color,
    String? onTap,
    bool ltr = false,
  }) {
    final content = Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
      child: Text(
        text,
        textDirection: ltr ? TextDirection.rtl : null,
        style: TextStyle(
          fontSize: 12,
          fontWeight: header ? FontWeight.w800 : FontWeight.w400,
          color: color ?? (header ? VColors.ink : VColors.ink),
        ),
      ),
    );
    if (onTap == null) return content;
    return InkWell(
      onTap: () => widget.onOpenOrder?.call(onTap),
      child: content,
    );
  }
}
