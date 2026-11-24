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
  'all': 'جميع طلبات المتجر',
  'delivery': 'طلبات شركة التوصيل',
  'internal': 'الطلبات الداخلية',
};

/// Whether a bucket shows delivery-company states (the carrier vocabulary) or
/// the internal store/warehouse statuses. The two are never mixed: assignment
/// to a company is not sending, so only real carrier states appear here.
bool bucketShowsShipping(String bucket) => bucket == 'delivery';

/// A single tile in the bucket status grid. [facet] names which server filter
/// the tile opens with so a carrier state, an operational lifecycle category and
/// an internal status are never confused:
///   'shipping' -> shippingStatus (carrier vocabulary)
///   'dispatch' -> dispatch lifecycle (unshipped / sending / needs_review / sent)
///   'status'   -> internal OrderStatus
class _StatusTile {
  const _StatusTile({
    required this.wire,
    required this.label,
    required this.icon,
    required this.color,
    required this.count,
    required this.facet,
    this.note,
    this.enabled,
  });
  final String wire;
  final String label;
  final IconData icon;
  final Color color;
  final int count;
  final String facet;
  final String? note;

  /// Overrides the default "enabled when count > 0". Used by the reminder-only
  /// control tile so it stays reachable while the count is still zero.
  final bool? enabled;
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

  /// Opens the orders list for this bucket. [state] is a [ShippingStatus] name
  /// for a 'shipping' tile, a dispatch lifecycle key for a 'dispatch' tile
  /// (unshipped/sending/needs_review/sent) or an internal [OrderStatus] name.
  /// [facet] names which server filter to apply so the two vocabularies are
  /// never confused.
  final void Function(String bucket, String state, String facet) onOpenOrders;
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

  /// Reads the correct counter facet for this bucket. On Android the delivery
  /// bucket shows TWO clearly separated groups: the operational lifecycle of
  /// assigned orders (never sent / sending / needs review / send confirmed) and,
  /// below it, the real carrier states reported by the delivery company. On the
  /// web the operational group is not rendered at all — the delivery dashboard
  /// shows ONLY the real carrier states (the requirements still live in the
  /// order lists and their dedicated processing paths). Every other bucket shows
  /// the internal order statuses. The `all` facet stays the single grand total
  /// and is never derived from the delivery facets.
  List<_StatusTile> _tiles(Map<String, dynamic> data) {
    final counters = Map<String, dynamic>.from(data['counters'] as Map? ?? {});
    if (bucketShowsShipping(widget.bucket)) {
      final operations = Map<String, dynamic>.from(
        counters['operations'] as Map? ?? {},
      );
      final shippingFacet = Map<String, dynamic>.from(
        counters['shipping'] as Map? ?? {},
      );
      int countOf(Map<String, dynamic> f, String key) =>
          (f[key] as Map?)?['count'] as int? ?? 0;
      // Operational lifecycle of assigned orders. Built only when it will be
      // shown (Android); the web returns the carrier states alone.
      final operational = <_StatusTile>[
        // Operational lifecycle: an assigned order that was never sent must not
        // be presented as a carrier state.
        _StatusTile(
          wire: 'unshipped',
          label: 'غير مرسلة (بانتظار الإرسال)',
          icon: Icons.pending_actions_outlined,
          color: const Color(0xFF8A5A00),
          count: countOf(operations, 'unshipped'),
          facet: 'dispatch',
          note: 'معيّنة لشركة، لم تُرسل بعد',
        ),
        _StatusTile(
          wire: 'sending',
          label: 'جاري الإرسال',
          icon: Icons.upload_outlined,
          color: const Color(0xFF176391),
          count: countOf(operations, 'sending'),
          facet: 'dispatch',
          note: 'محاولة إرسال قيد التنفيذ',
        ),
        _StatusTile(
          wire: 'review',
          label: 'تحتاج مراجعة',
          icon: Icons.help_outline,
          color: const Color(0xFFB52B3F),
          count: countOf(operations, 'needs_review'),
          facet: 'dispatch',
          note: 'نتيجة إرسال غير مؤكدة',
        ),
        _StatusTile(
          wire: 'sent',
          label: 'تم تأكيد الإرسال',
          icon: Icons.mark_email_read_outlined,
          color: const Color(0xFF006D55),
          count: countOf(operations, 'confirmed'),
          facet: 'dispatch',
          note: 'أُرسلت الشحنة للشركة',
        ),
      ];
      // Carrier vocabulary, only from the shipping facet.
      final carrier = <_StatusTile>[
        for (final status in ShippingStatus.values)
          _StatusTile(
            wire: status.name,
            label: status.label,
            icon: _shippingIcon(status),
            color: _shippingColor(status),
            count: countOf(shippingFacet, status.name),
            facet: 'shipping',
            note: _shippingNote(status),
          ),
      ];
      // Web hides the operational group entirely; Android keeps the two-group
      // layout. The list and its per-item handling stay available elsewhere.
      return kIsWeb ? carrier : [...operational, ...carrier];
    }
    final bucket = Map<String, dynamic>.from(
      counters[widget.bucket] as Map? ?? {},
    );
    // Web-only: the internal section shows ONLY the internal accounting statuses.
    // The carrier/dispatch states «تم الإرسال» (dispatched) and «قيد التوصيل»
    // (inTransit) are driven by the delivery flow, so they belong to the delivery
    // section and its status filters and are never mixed into the internal grid.
    // Android keeps the legacy nine-card grid untouched.
    final internalWebFilter = kIsWeb && widget.bucket == 'internal';
    final statuses = internalWebFilter
        ? OrderStatus.values
              .where(
                (s) =>
                    s != OrderStatus.dispatched && s != OrderStatus.inTransit,
              )
              .toList()
        : OrderStatus.values;
    final tiles = [
      for (final status in statuses)
        _StatusTile(
          wire: status.name,
          label: status.label,
          icon: statusIcons[status.name] ?? Icons.circle_outlined,
          color: status.color,
          count: (bucket[status.name] as Map?)?['count'] as int? ?? 0,
          facet: 'status',
          note: internalWebFilter && status == OrderStatus.delivered
              ? 'تأكيد محاسبي يدوي بعد مطابقة كشف الشركة'
              : null,
        ),
    ];
    // Web-only control tile: the orders whose shipment was CONFIRMED deleted at
    // the delivery company. It is a separate monitoring view, so it is added to
    // the internal section without joining the internal status total, and it
    // never changes the order, its amounts or `deliveryAccepted`. Suspicions
    // (needs_review) are shown as a reminder and are never counted as deletions.
    if (internalWebFilter) {
      final control = Map<String, dynamic>.from(
        counters['carrierDeletion'] as Map? ?? {},
      );
      final confirmed = (control['confirmed'] as Map?)?['count'] as int? ?? 0;
      final review = (control['needs_review'] as Map?)?['count'] as int? ?? 0;
      tiles.add(
        _StatusTile(
          wire: confirmed > 0 ? 'confirmed' : 'needs_review',
          label: 'المحذوف',
          icon: Icons.delete_sweep_outlined,
          color: const Color(0xFF8A1F2B),
          count: confirmed,
          facet: 'deleted',
          note: review > 0 ? '$review تحتاج تحقق' : 'حذف مؤكد من شركة التوصيل',
          enabled: confirmed > 0 || review > 0,
        ),
      );
    }
    return tiles;
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
  Widget build(BuildContext context) {
    // Web-only: the store-wide «جميع طلبات المتجر» section becomes a compact
    // filter bar + Excel-style Data Grid (the same widget the orders page uses)
    // instead of the nine status cards. Every other bucket keeps its cards, and
    // Android is untouched.
    if (kIsWeb && widget.bucket == 'all') {
      return Scaffold(
        appBar: AppBar(title: Text(bucketTitles[widget.bucket] ?? 'الطلبات')),
        body: AsyncPanel<Map<String, dynamic>>(
          future: request,
          onRetry: refresh,
          loading: const Center(child: CircularProgressIndicator()),
          builder: (data) {
            final counters = Map<String, dynamic>.from(
              data['counters'] as Map? ?? {},
            );
            return LiveOrders(
              policy: widget.policy,
              bucket: 'all',
              sectionMode: true,
              sectionTotal: _allTotal(counters['all']),
            );
          },
        ),
      );
    }
    return Scaffold(
      appBar: AppBar(title: Text(bucketTitles[widget.bucket] ?? 'الطلبات')),
      body: AsyncPanel<Map<String, dynamic>>(
        future: request,
        onRetry: refresh,
        loading: const Center(child: CircularProgressIndicator()),
        builder: (data) => _cardsBody(data),
      ),
    );
  }

  /// Exact store-wide total for the atomic counters strip: the sum of the
  /// per-status counts of the `all` facet. The server guarantees
  /// all == internal + delivery (delivery is the confirmed `deliveryAccepted`
  /// subset), so this never double-counts a shipped order.
  static int _allTotal(dynamic source) {
    final map = Map<String, dynamic>.from(source as Map? ?? {});
    var count = 0;
    for (final value in map.values) {
      count += (value as Map?)?['count'] as int? ?? 0;
    }
    return count;
  }

  /// Exact count of the carrier-confirmed delivery queue on the web: the sum of
  /// the `delivery` facet, which the server builds from `deliveryAccepted == true`
  /// — the same subset the delivery bucket's order list uses.
  static int _deliveryAcceptedTotal(Map<String, dynamic> counters) {
    final facet = Map<String, dynamic>.from(counters['delivery'] as Map? ?? {});
    var count = 0;
    for (final value in facet.values) {
      count += (value as Map?)?['count'] as int? ?? 0;
    }
    return count;
  }

  Widget _cardsBody(Map<String, dynamic> data) {
    final tiles = _tiles(data);
    final shipping = bucketShowsShipping(widget.bucket);
    final counters = Map<String, dynamic>.from(data['counters'] as Map? ?? {});
    // For the delivery bucket the total must reflect the orders the section
    // actually covers. The carrier states overlap (a shipped order is both "out
    // for delivery" and later "delivered"), so they are never summed.
    //   • Web    : the carrier-confirmed shipments only (deliveryAccepted == true),
    //              the same subset the bucket's order list uses.
    //   • Android: the operational partition of assigned orders (unchanged).
    final total = shipping
        ? (kIsWeb
              ? _deliveryAcceptedTotal(counters)
              : tiles
                    .where((t) => t.facet == 'dispatch')
                    .fold<int>(0, (acc, t) => acc + t.count))
        : tiles
              .where((t) => t.facet != 'deleted')
              .fold<int>(0, (acc, tile) => acc + tile.count);
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
                shipping
                    ? (kIsWeb
                          ? 'حالات شركة التوصيل الفعلية كما وردت من الشركة — لا تُخلط مع حالة الطلب الداخلية'
                          : 'حالة الإرسال التشغيلية، ثم حالات شركة التوصيل الفعلية — كل مجموعة مستقلة')
                    : kIsWeb && widget.bucket == 'internal'
                    ? 'حالات داخلية فقط. «تم التسليم» تأكيد محاسبي يدوي بعد مطابقة كشف شركة التوصيل، ولا يتغيّر تلقائياً مع حالة الشحنة.'
                    : 'اختر حالة داخلية لعرض الطلبات المطابقة',
                style: const TextStyle(color: VColors.muted),
              ),
              const SizedBox(height: 6),
              Text(
                'الإجمالي: $total طلب',
                style: const TextStyle(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 18),
              if (total == 0 && !tiles.any((t) => t.facet == 'deleted'))
                const VFeedbackPanel(
                  title: 'لا توجد طلبات في هذا القسم',
                  message: 'ستظهر الحالات هنا فور وجود طلبات في هذا النطاق.',
                  icon: Icons.inbox_outlined,
                )
              else if (shipping)
                _sectionedGrid(tiles)
              else
                _internalGrid(tiles),
            ],
          ),
        ),
      ),
    );
  }

  /// Delivery bucket: the real carrier states. On Android the operational
  /// lifecycle section is rendered above them; on the web that whole group
  /// (header, cards and notes) is omitted, so only the carrier section remains.
  Widget _sectionedGrid(List<_StatusTile> tiles) {
    final ops = tiles.where((t) => t.facet == 'dispatch').toList();
    final carriers = tiles.where((t) => t.facet == 'shipping').toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (ops.isNotEmpty) ...[
          _sectionHeader('حالة الإرسال التشغيلية'),
          const SizedBox(height: 10),
          _statusGrid(ops),
          const SizedBox(height: 26),
        ],
        _sectionHeader('حالات شركة التوصيل الفعلية'),
        const SizedBox(height: 6),
        Text(
          kIsWeb
              ? 'تُملأ من شركة التوصيل فقط.'
              : 'تُملأ من شركة التوصيل فقط؛ لا تُخلط مع حالة الإرسال التشغيلية.',
          style: const TextStyle(fontSize: 11.5, color: VColors.muted),
        ),
        const SizedBox(height: 10),
        _statusGrid(carriers),
      ],
    );
  }

  Widget _sectionHeader(String title) => Text(
    title,
    style: const TextStyle(
      fontSize: 15,
      fontWeight: FontWeight.w800,
      color: VColors.ink,
    ),
  );

  /// Internal bucket: the internal accounting statuses, plus (on the web only)
  /// the separate carrier-deletion control tile. The control tile is kept in its
  /// own labelled group and out of the status total, so an order still shows once
  /// in its real status and is only additionally listed as a monitoring view.
  Widget _internalGrid(List<_StatusTile> tiles) {
    final controls = tiles.where((t) => t.facet == 'deleted').toList();
    final statuses = tiles.where((t) => t.facet != 'deleted').toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _statusGrid(statuses),
        if (controls.isNotEmpty) ...[
          const SizedBox(height: 26),
          _sectionHeader('رقابة حذف الشحنات لدى شركة التوصيل'),
          const SizedBox(height: 6),
          const Text(
            'عرض رقابي مستقل: يوضّح الطلبات المحذوفة لدى الشركة دون تغيير حالة الطلب أو تصنيف القبول أو حذفه من Velnix.',
            style: TextStyle(fontSize: 11.5, color: VColors.muted),
          ),
          const SizedBox(height: 10),
          _statusGrid(controls),
        ],
      ],
    );
  }

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
    final enabled = tile.enabled ?? (tile.count > 0);
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
                ? () =>
                      widget.onOpenOrders(widget.bucket, tile.wire, tile.facet)
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
    this.dispatch,
    this.deletion,
  });
  final SessionPolicy policy;
  final String bucket;
  final String? status;
  final String? shippingStatus;
  final String? dispatch;

  /// Carrier-deletion monitoring scope ('confirmed' or 'needs_review'), opening
  /// the control list from the internal section's «المحذوف» tile. Null keeps the
  /// ordinary order list.
  final String? deletion;
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('قائمة الطلبات')),
    body: LiveOrders(
      policy: policy,
      bucket: bucket,
      status: status,
      shippingStatus: shippingStatus,
      dispatch: dispatch,
      deletion: deletion,
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
