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

/// Whether a bucket shows delivery-company states (the carrier vocabulary) or
/// the internal store/warehouse statuses. The two are never mixed: assignment
/// to a company is not sending, so only real carrier states appear here.
bool bucketShowsShipping(String bucket) => bucket == 'delivery';

/// A single tile in the bucket status grid: either an internal [OrderStatus] or
/// a carrier [ShippingStatus]. Keeps the two vocabularies visibly separate.
class _StatusTile {
  const _StatusTile({
    required this.wire,
    required this.label,
    required this.icon,
    required this.color,
    required this.count,
    this.note,
  });
  final String wire;
  final String label;
  final IconData icon;
  final Color color;
  final int count;
  final String? note;
}

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

  /// Opens the orders list for this bucket. When the bucket shows delivery
  /// states the second argument is a [ShippingStatus] name; otherwise it is an
  /// internal [OrderStatus] name. The third argument names which facet was
  /// chosen so the list never confuses a carrier state with an internal one.
  final void Function(String bucket, String state, bool isShipping)
  onOpenOrders;
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

  /// Reads the correct counter facet for this bucket. The delivery bucket shows
  /// the carrier vocabulary (`counters.shipping`), every other bucket shows the
  /// internal order statuses (`counters[bucket]`). The `all` facet stays the
  /// single grand total and is never derived from the delivery facet.
  List<_StatusTile> _tiles(Map<String, dynamic> data) {
    final counters = Map<String, dynamic>.from(data['counters'] as Map? ?? {});
    if (bucketShowsShipping(widget.bucket)) {
      final facet = Map<String, dynamic>.from(
        counters['shipping'] as Map? ?? {},
      );
      return [
        for (final status in ShippingStatus.values)
          _StatusTile(
            wire: status.name,
            label: status.label,
            icon: _shippingIcon(status),
            color: _shippingColor(status),
            count: (facet[status.name] as Map?)?['count'] as int? ?? 0,
            note: _shippingNote(status),
          ),
      ];
    }
    final bucket = Map<String, dynamic>.from(
      counters[widget.bucket] as Map? ?? {},
    );
    return [
      for (final status in OrderStatus.values)
        _StatusTile(
          wire: status.name,
          label: status.label,
          icon: statusIcons[status.name] ?? Icons.circle_outlined,
          color: status.color,
          count: (bucket[status.name] as Map?)?['count'] as int? ?? 0,
        ),
    ];
  }

  static IconData _shippingIcon(ShippingStatus status) => switch (status) {
    ShippingStatus.awaitingPickup => Icons.hourglass_empty,
    ShippingStatus.carrierWarehouse => Icons.warehouse_outlined,
    ShippingStatus.outForDelivery => Icons.local_shipping_outlined,
    ShippingStatus.delivered => Icons.check_circle_outline,
    ShippingStatus.partiallyDelivered => Icons.rule_outlined,
    ShippingStatus.deferred => Icons.schedule_outlined,
    ShippingStatus.cancelled => Icons.cancel_outlined,
    ShippingStatus.returned => Icons.assignment_return_outlined,
    ShippingStatus.partiallyReturned => Icons.keyboard_return_outlined,
    ShippingStatus.returnedWarehouse => Icons.undo_outlined,
    ShippingStatus.inShippingToSender => Icons.reply_outlined,
    ShippingStatus.clientReceivedReturn => Icons.inbox_outlined,
  };

  static Color _shippingColor(ShippingStatus status) => switch (status) {
    ShippingStatus.awaitingPickup => const Color(0xFFB26A00),
    ShippingStatus.carrierWarehouse => const Color(0xFF5B4BC4),
    ShippingStatus.outForDelivery => const Color(0xFF176391),
    ShippingStatus.delivered => const Color(0xFF006D55),
    ShippingStatus.partiallyDelivered => const Color(0xFF00756F),
    ShippingStatus.deferred => const Color(0xFF965B10),
    ShippingStatus.cancelled => const Color(0xFFB52B3F),
    ShippingStatus.returned => const Color(0xFF9F520E),
    ShippingStatus.partiallyReturned => const Color(0xFF9F520E),
    ShippingStatus.returnedWarehouse => const Color(0xFF7A4B12),
    ShippingStatus.inShippingToSender => const Color(0xFF8A5A00),
    ShippingStatus.clientReceivedReturn => const Color(0xFF6B4A00),
  };

  /// Marks carrier states that are documented by the portal but not yet seen in
  /// a real Click API response, and highlights return/exception states.
  static String? _shippingNote(ShippingStatus status) {
    if (status.isException) return 'حالة استثناء';
    if (!status.isApiConfirmed) return 'موثّقة (غير مؤكدة من API)';
    return null;
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(bucketTitles[widget.bucket] ?? 'الطلبات')),
    body: AsyncPanel<Map<String, dynamic>>(
      future: request,
      onRetry: refresh,
      loading: const Center(child: CircularProgressIndicator()),
      builder: (data) {
        final tiles = _tiles(data);
        final total = tiles.fold<int>(0, (acc, tile) => acc + tile.count);
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
                    bucketShowsShipping(widget.bucket)
                        ? 'اختر حالة شحنة (من شركة التوصيل) لعرض الطلبات المطابقة'
                        : 'اختر حالة داخلية لعرض الطلبات المطابقة',
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
                    _statusGrid(tiles),
                ],
              ),
            ),
          ),
        );
      },
    ),
  );

  Widget _statusGrid(List<_StatusTile> tiles) {
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
            for (final tile in tiles)
              SizedBox(width: tileWidth, child: _statusCard(tile)),
          ],
        );
      },
    );
  }

  Widget _statusCard(_StatusTile tile) {
    final color = tile.color;
    final enabled = tile.count > 0;
    return Semantics(
      button: true,
      enabled: enabled,
      label: '${tile.label}، ${tile.count} طلب',
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
                ? () => widget.onOpenOrders(
                    widget.bucket,
                    tile.wire,
                    bucketShowsShipping(widget.bucket),
                  )
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
                        child: Icon(tile.icon, color: color, size: 22),
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
                    tile.label,
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
                    '${tile.count} طلب',
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: VColors.muted,
                    ),
                  ),
                  if (tile.note != null) ...[
                    const SizedBox(height: 4),
                    Text(
                      tile.note!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 10.5,
                        fontWeight: FontWeight.w600,
                        color: VColors.muted,
                      ),
                    ),
                  ],
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
    this.shippingStatus,
  });
  final SessionPolicy policy;
  final String bucket;
  final String? status;
  final String? shippingStatus;
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('قائمة الطلبات')),
    body: LiveOrders(
      policy: policy,
      bucket: bucket,
      status: status,
      shippingStatus: shippingStatus,
    ),
  );
}

/// Order search opened from the phone bottom bar. Reuses [LiveOrders] with the
/// existing searchOrders flow and the query field focused on open; results open
/// order details and the AppBar back button returns to the previous screen.
class LiveOrderSearchPage extends StatelessWidget {
  const LiveOrderSearchPage({super.key, required this.policy});
  final SessionPolicy policy;
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('بحث عن طلب')),
    body: LiveOrders(policy: policy, autoSearchFocus: true),
  );
}
