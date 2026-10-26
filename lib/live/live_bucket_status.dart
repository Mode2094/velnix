part of 'live_app.dart';

/// Icons for the nine real order statuses. Colour comes from
/// [OrderStatusUI.color]; the icon adds a second, non-colour cue so the grids
/// stay readable for colour-blind users and in grayscale.
const statusIcons = <String, IconData>{
  'created': Icons.fiber_new_outlined,
  'review': Icons.rate_review_outlined,
  'preparing': Icons.inventory_2_outlined,
  'ready': Icons.assignment_turned_in_outlined,
  'dispatched': Icons.local_shipping_outlined,
  'inTransit': Icons.moving_outlined,
  'delivered': Icons.check_circle_outline,
  'returned': Icons.assignment_return_outlined,
  'cancelled': Icons.cancel_outlined,
};

/// Arabic titles for the three order buckets shared by the dashboard cards and
/// the per-bucket status grid.
const bucketTitles = <String, String>{
  'all': 'كل الطلبات',
  'delivery': 'طلبات شركات التوصيل',
  'internal': 'الطلبات غير المسندة لشركة توصيل',
};

/// Pushed intermediate screen: shows one coloured card per real order status
/// for a bucket. Counts come from the same cached `dashboardStats` aggregation
/// the dashboard uses, so no extra or heavy query is issued.
class LiveBucketStatusGrid extends StatefulWidget {
  const LiveBucketStatusGrid({
    super.key,
    required this.policy,
    required this.bucket,
    required this.onOpenOrders,
  });
  final SessionPolicy policy;
  final String bucket;
  final void Function(String bucket, String status) onOpenOrders;
  @override
  State<LiveBucketStatusGrid> createState() => _LiveBucketStatusGridState();
}

class _LiveBucketStatusGridState extends State<LiveBucketStatusGrid> {
  late Future<Map<String, dynamic>> request;
  @override
  void initState() {
    super.initState();
    request = VelnixGateway.instance.dashboard();
  }

  void refresh() =>
      setState(() => request = VelnixGateway.instance.dashboard({}, true));

  Map<String, int> _counts(Map<String, dynamic> data) {
    final counters = Map<String, dynamic>.from(data['counters'] as Map? ?? {});
    final bucket = Map<String, dynamic>.from(
      counters[widget.bucket] as Map? ?? {},
    );
    return {
      for (final status in OrderStatus.values)
        status.name: (bucket[status.name] as Map?)?['count'] as int? ?? 0,
    };
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(bucketTitles[widget.bucket] ?? 'الطلبات')),
    body: AsyncPanel<Map<String, dynamic>>(
      future: request,
      onRetry: refresh,
      loading: const Center(child: CircularProgressIndicator()),
      builder: (data) {
        final counts = _counts(data);
        final total = counts.values.fold<int>(0, (acc, value) => acc + value);
        return RefreshIndicator(
          onRefresh: () async {
            refresh();
            await request;
          },
          child: SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            child: LiveContent(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'اختر حالة لعرض الطلبات المطابقة',
                    style: const TextStyle(color: VColors.muted),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'الإجمالي: $total طلب',
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 18),
                  if (total == 0)
                    const VFeedbackPanel(
                      title: 'لا توجد طلبات في هذا القسم',
                      message:
                          'ستظهر الحالات هنا فور وجود طلبات في هذا النطاق.',
                      icon: Icons.inbox_outlined,
                    )
                  else
                    _statusGrid(counts),
                ],
              ),
            ),
          ),
        );
      },
    ),
  );

  Widget _statusGrid(Map<String, int> counts) {
    final entries = OrderStatus.values
        .map((status) => MapEntry(status, counts[status.name] ?? 0))
        .toList();
    return LayoutBuilder(
      builder: (context, box) {
        final width = box.maxWidth;
        final columns = width >= 1100
            ? 4
            : width >= 720
            ? 3
            : 2;
        const spacing = 12.0;
        final tileWidth = (width - spacing * (columns - 1)) / columns;
        return Wrap(
          spacing: spacing,
          runSpacing: spacing,
          children: [
            for (final entry in entries)
              SizedBox(
                width: tileWidth,
                child: _statusCard(entry.key, entry.value),
              ),
          ],
        );
      },
    );
  }

  Widget _statusCard(OrderStatus status, int count) {
    final color = status.color;
    final enabled = count > 0;
    return Semantics(
      button: true,
      enabled: enabled,
      label: '${status.label}، $count طلب',
      child: Opacity(
        opacity: enabled ? 1 : .55,
        child: Material(
          color: Colors.white,
          clipBehavior: Clip.antiAlias,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: BorderSide(color: color.withValues(alpha: .35)),
          ),
          child: InkWell(
            onTap: enabled
                ? () => widget.onOpenOrders(widget.bucket, status.name)
                : null,
            mouseCursor: enabled
                ? SystemMouseCursors.click
                : SystemMouseCursors.basic,
            hoverColor: color.withValues(alpha: .06),
            child: Container(
              constraints: const BoxConstraints(minHeight: 132),
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: color.withValues(alpha: .12),
                        ),
                        child: Icon(
                          statusIcons[status.name] ?? Icons.circle_outlined,
                          color: color,
                          size: 22,
                        ),
                      ),
                      const Spacer(),
                      if (enabled)
                        Icon(
                          Icons.arrow_back,
                          color: VColors.muted.withValues(alpha: .7),
                          size: 18,
                        ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Text(
                    status.label,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w800,
                      color: color,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    '$count طلب',
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: VColors.muted,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// A [LiveOrders] pushed as its own page with an AppBar back button and the
/// bucket/status pre-applied.
class LiveOrdersPage extends StatelessWidget {
  const LiveOrdersPage({
    super.key,
    required this.policy,
    required this.bucket,
    this.status,
  });
  final SessionPolicy policy;
  final String bucket;
  final String? status;
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('قائمة الطلبات')),
    body: LiveOrders(policy: policy, bucket: bucket, status: status),
  );
}
