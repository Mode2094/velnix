part of 'live_app.dart';

/// Lists the signed-in user's own bulk dispatch operations so they can recover
/// ids, status and per-order results after a restart or a dropped connection.
/// Opening this screen NEVER re-dispatches anything — it is read-only.
class BulkOperationsScreen extends StatefulWidget {
  const BulkOperationsScreen({super.key, required this.policy});
  final SessionPolicy policy;
  @override
  State<BulkOperationsScreen> createState() => _BulkOperationsScreenState();
}

class _BulkOperationsScreenState extends State<BulkOperationsScreen> {
  late Future<List<Map<String, dynamic>>> request;
  final openOp = <String, List<Map<String, dynamic>>>{};

  @override
  void initState() {
    super.initState();
    reload();
  }

  void reload() {
    request = VelnixGateway.instance.bulkOperations();
  }

  String _statusLabel(String? s) => switch (s) {
    'finished' => 'مكتملة',
    'partial' => 'جزئية (تحتاج استكمالاً)',
    'running' => 'قيد التنفيذ',
    _ => s ?? '—',
  };

  Color _statusColor(String? s) => switch (s) {
    'finished' => VColors.aqua,
    'partial' => VColors.warning,
    _ => VColors.brand,
  };

  Future<void> _toggle(String opId) async {
    if (openOp.containsKey(opId)) {
      setState(() => openOp.remove(opId));
      return;
    }
    try {
      final rec = await VelnixGateway.instance.bulkOperation(opId);
      if (!mounted) return;
      setState(() {
        final rows = <Map<String, dynamic>>[
          ...(rec['results'] as List? ?? []).map(
            (e) => Map<String, dynamic>.from(e as Map),
          ),
          // Orders still being processed elsewhere are shown distinctly, never
          // as success or failure.
          ...(rec['claimed'] as List? ?? []).map(
            (e) => {...Map<String, dynamic>.from(e as Map), 'claimed': true},
          ),
        ];
        openOp[opId] = rows;
      });
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  Widget _resultRow(Map<String, dynamic> r) {
    if (r['claimed'] == true && r['ok'] == null) {
      return Padding(
        padding: const EdgeInsets.only(bottom: 4),
        child: Row(
          children: [
            const Icon(
              Icons.hourglass_top_outlined,
              size: 16,
              color: VColors.brand,
            ),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                '•• ${r['id']}: قيد التنفيذ (لم تُحسم بعد)',
                style: const TextStyle(fontSize: 12, color: VColors.muted),
              ),
            ),
          ],
        ),
      );
    }
    final ok = r['ok'] == true;
    final uncertain = r['uncertain'] == true;
    final label = ok
        ? 'تم الإرسال'
        : uncertain
        ? 'نتيجة غير مؤكدة (لا تُعد الإرسال)'
        : 'لم يُرسل (${r['code'] ?? ''})';
    final color = ok
        ? VColors.aqua
        : uncertain
        ? VColors.warning
        : VColors.danger;
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        children: [
          Icon(
            ok ? Icons.check_circle_outline : Icons.error_outline,
            size: 16,
            color: color,
          ),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              '•• ${r['id']}: $label',
              style: TextStyle(fontSize: 12, color: color),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('سجل عمليات الإرسال'),
      actions: [
        IconButton(
          tooltip: 'تحديث',
          onPressed: () => setState(reload),
          icon: const Icon(Icons.refresh),
        ),
      ],
    ),
    body: FutureBuilder<List<Map<String, dynamic>>>(
      future: request,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) {
          return const VFeedbackPanel(title: 'جارٍ التحميل', loading: true);
        }
        if (snap.hasError) {
          return VFeedbackPanel(
            title: 'تعذر تحميل العمليات',
            message: '${snap.error}',
            icon: Icons.error_outline,
            onRetry: reload,
          );
        }
        final ops = snap.data ?? [];
        if (ops.isEmpty) {
          return const VFeedbackPanel(
            title: 'لا توجد عمليات إرسال',
            message: 'ستظهر هنا عمليات الإرسال الجماعي التي بدأتها.',
            icon: Icons.history,
          );
        }
        return LiveContent(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (final op in ops)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: VLivePanel(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Wrap(
                          alignment: WrapAlignment.spaceBetween,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          spacing: 8,
                          runSpacing: 4,
                          children: [
                            Text(
                              '${op['operationId']}',
                              textDirection: TextDirection.ltr,
                              style: const TextStyle(
                                fontWeight: FontWeight.w800,
                                fontSize: 12,
                              ),
                            ),
                            _chip(
                              _statusLabel(op['status']?.toString()),
                              _statusColor(op['status']?.toString()),
                            ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'نجح ${op['succeeded'] ?? 0} • فشل ${op['failed'] ?? 0} • غير مؤكد ${op['uncertain'] ?? 0}'
                          '${(op['remaining'] ?? 0) > 0 ? ' • متبقٍ ${op['remaining']}' : ''}',
                          style: const TextStyle(
                            color: VColors.muted,
                            fontSize: 12,
                          ),
                        ),
                        Align(
                          alignment: AlignmentDirectional.centerStart,
                          child: TextButton.icon(
                            onPressed: () =>
                                _toggle(op['operationId'].toString()),
                            icon: Icon(
                              openOp.containsKey(op['operationId'])
                                  ? Icons.expand_less
                                  : Icons.expand_more,
                              size: 18,
                            ),
                            label: const Text('عرض نتائج الطلبات'),
                          ),
                        ),
                        if (openOp.containsKey(op['operationId']))
                          ...openOp[op['operationId']]!.map(_resultRow),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        );
      },
    ),
  );

  Widget _chip(String text, Color color) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
    decoration: BoxDecoration(
      color: color.withValues(alpha: .12),
      borderRadius: BorderRadius.circular(10),
    ),
    child: Text(
      text,
      style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w800),
    ),
  );
}
