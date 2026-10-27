part of 'live_app.dart';

/// Index-backed aggregates in the authenticated role scope.
class LiveDashboard extends StatefulWidget {
  const LiveDashboard({
    super.key,
    required this.policy,
    required this.onNavigate,
    this.onOpenBucket,
    this.onOpenStores,
    this.initialFilters = const {},
    this.onFiltersChanged,
  });
  final SessionPolicy policy;
  final void Function(String, String?) onNavigate;
  final void Function(String bucket)? onOpenBucket;
  final VoidCallback? onOpenStores;
  final Map<String, dynamic> initialFilters;
  final ValueChanged<Map<String, dynamic>>? onFiltersChanged;
  @override
  State<LiveDashboard> createState() => _LiveDashboardState();
}

typedef _ScopeTotals = ({
  int count,
  int amountMinor,
  List<MapEntry<String, int>> ranked,
});

class _LiveDashboardState extends State<LiveDashboard> {
  late Future<Map<String, dynamic>> request;
  Map<String, dynamic> filters = {};
  @override
  void initState() {
    super.initState();
    filters = Map.of(widget.initialFilters);
    reload();
  }

  void reload({bool fresh = false}) =>
      request = VelnixGateway.instance.dashboard(filters, fresh);
  void refresh() {
    setState(() => reload(fresh: true));
  }

  @override
  Widget build(BuildContext context) => AsyncPanel<Map<String, dynamic>>(
    future: request,
    onRetry: refresh,
    loading: _skeleton(),
    builder: (data) {
      final counters = Map<String, dynamic>.from(data['counters'] as Map);
      final partial = data['partial'] == true;
      final all = _scopeTotals(counters['all']);
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
                Wrap(
                  alignment: WrapAlignment.spaceBetween,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  spacing: 12,
                  runSpacing: 10,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'أهلاً، ${widget.policy.name}',
                          style: Theme.of(context).textTheme.headlineSmall,
                        ),
                        const SizedBox(height: 5),
                        Text(
                          'لوحة متابعة ${widget.policy.roleLabel}',
                          style: const TextStyle(color: VColors.muted),
                        ),
                      ],
                    ),
                    OutlinedButton.icon(
                      onPressed: refresh,
                      icon: const Icon(Icons.refresh),
                      label: const Text('تحديث البيانات'),
                    ),
                  ],
                ),
                if (widget.policy.role == 'warehouse')
                  Padding(
                    padding: const EdgeInsets.only(top: 14),
                    child: VLivePanel(
                      child: Row(
                        children: [
                          const Icon(
                            Icons.inventory_2_outlined,
                            color: VColors.brand,
                          ),
                          const SizedBox(width: 10),
                          const Expanded(
                            child: Text(
                              'عمل المستودع: راجع الطلبات قيد التجهيز وحدّث حالتها. لا يوجد نظام مخزون ضمن هذه المرحلة.',
                            ),
                          ),
                          TextButton(
                            onPressed: () =>
                                widget.onNavigate('all', 'preparing'),
                            child: const Text('فتح'),
                          ),
                        ],
                      ),
                    ),
                  ),
                if (widget.policy.role == 'dataEntry' ||
                    widget.policy.role == 'sales')
                  Padding(
                    padding: const EdgeInsets.only(top: 14),
                    child: VLivePanel(
                      child: Row(
                        children: [
                          const Icon(
                            Icons.assignment_outlined,
                            color: VColors.brand,
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              widget.policy.role == 'dataEntry'
                                  ? 'تظهر لك طلباتك التي أدخلتها فقط.'
                                  : 'يمكنك متابعة طلباتك وطلبات فريق إدخال البيانات المرتبط بك.',
                            ),
                          ),
                          TextButton(
                            onPressed: () => widget.onNavigate('all', null),
                            child: const Text('متابعة'),
                          ),
                        ],
                      ),
                    ),
                  ),
                if (partial)
                  const Padding(
                    padding: EdgeInsets.only(top: 12),
                    child: VLivePanel(
                      child: Text(
                        'الأرقام المعروضة تغطي أحدث 1000 طلب فقط. تفعيل العدّادات الدائمة مطلوب قبل الاستخدام واسع النطاق.',
                        style: TextStyle(color: VColors.danger),
                      ),
                    ),
                  ),
                if (all.count == 0)
                  const Padding(
                    padding: EdgeInsets.only(top: 12),
                    child: VLivePanel(
                      child: Row(
                        children: [
                          Icon(
                            Icons.checklist_rtl_outlined,
                            color: VColors.brand,
                          ),
                          SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              'لا توجد طلبات مطابقة للفلاتر الحالية بعد. أنشئ أول طلب ليظهر هنا.',
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                const SizedBox(height: 14),
                VLivePanel(
                  child: OrderFilters(
                    basicOnly: true,
                    initialFilters: filters,
                    onChanged: (value) {
                      filters = value;
                      widget.onFiltersChanged?.call(value);
                      refresh();
                    },
                  ),
                ),
                const SizedBox(height: 22),
                _cards(counters, all),
              ],
            ),
          ),
        ),
      );
    },
  );

  _ScopeTotals _scopeTotals(dynamic source) {
    final map = Map<String, dynamic>.from(source as Map? ?? {});
    final order = statusLabels.keys.toList();
    var count = 0;
    var amountMinor = 0;
    final ranked = <MapEntry<String, int>>[];
    for (final status in order) {
      final info = Map<String, dynamic>.from(map[status] as Map? ?? {});
      final value = info['count'] as int? ?? 0;
      count += value;
      amountMinor += info['amountMinor'] as int? ?? 0;
      if (value > 0) ranked.add(MapEntry(status, value));
    }
    ranked.sort((a, b) {
      final byCount = b.value.compareTo(a.value);
      if (byCount != 0) return byCount;
      return order.indexOf(a.key).compareTo(order.indexOf(b.key));
    });
    return (count: count, amountMinor: amountMinor, ranked: ranked);
  }

  void _openBucket(String bucket) {
    final handler = widget.onOpenBucket;
    if (handler != null) {
      handler(bucket);
      return;
    }
    // Fallback for embeds without the push handler: keep the filter behaviour.
    widget.onNavigate(bucket, null);
  }

  Widget _cards(Map<String, dynamic> counters, _ScopeTotals all) {
    final delivery = _scopeTotals(counters['delivery']);
    final internal = _scopeTotals(counters['internal']);
    final allCard = _allCard(all);
    final deliveryCard = _scopeCard(
      title: 'طلبات شركات التوصيل',
      icon: Icons.local_shipping_outlined,
      data: delivery,
      bucket: 'delivery',
    );
    final internalCard = _scopeCard(
      title: 'الطلبات غير المسندة لشركة',
      icon: Icons.inventory_2_outlined,
      data: internal,
      bucket: 'internal',
    );
    final storesCard = _storesCard();
    final cards = [allCard, deliveryCard, internalCard, storesCard];
    return LayoutBuilder(
      builder: (context, box) {
        final width = box.maxWidth;
        // Desktop: all four in one consistent row. Tablet: two per row.
        // Mobile: a comfortable two-column grid.
        final columns = width >= 1100
            ? 4
            : width >= 560
            ? 2
            : 2;
        const spacing = 14.0;
        final tileWidth = (width - spacing * (columns - 1)) / columns;
        return Wrap(
          spacing: spacing,
          runSpacing: spacing,
          children: [
            for (final card in cards) SizedBox(width: tileWidth, child: card),
          ],
        );
      },
    );
  }

  // Unified dashboard card typography. Every card shares one scale so the row
  // reads as a set instead of a mix of oversized numbers and titles.
  static const _cardTitleStyle = TextStyle(
    fontSize: 14,
    fontWeight: FontWeight.w800,
    height: 1.25,
    color: VColors.ink,
  );
  static const _cardCountStyle = TextStyle(
    fontSize: 26,
    fontWeight: FontWeight.w900,
    height: 1,
    color: VColors.ink,
  );
  static const _cardUnitStyle = TextStyle(
    fontSize: 12,
    fontWeight: FontWeight.w600,
    color: VColors.muted,
  );
  static const _cardAmountStyle = TextStyle(
    fontSize: 13,
    fontWeight: FontWeight.w700,
    color: VColors.brand,
  );
  static const _cardSummaryStyle = TextStyle(
    fontSize: 11.5,
    fontWeight: FontWeight.w700,
    color: VColors.muted,
  );
  static const _cardMutedStyle = TextStyle(
    fontSize: 11.5,
    color: VColors.muted,
  );

  Widget _storesCard() => _cardShell(
    onTap: widget.onOpenStores ?? () {},
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            const Icon(
              Icons.storefront_outlined,
              color: VColors.brand,
              size: 19,
            ),
            const SizedBox(width: 7),
            const Expanded(
              child: Text(
                'المتاجر',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: _cardTitleStyle,
              ),
            ),
            const Icon(Icons.chevron_left, color: VColors.muted, size: 18),
          ],
        ),
        const SizedBox(height: 14),
        const Text('قريبًا...', style: _cardMutedStyle),
      ],
    ),
  );

  Widget _allCard(_ScopeTotals data) => _cardShell(
    onTap: () => _openBucket('all'),
    accent: true,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            const Icon(
              Icons.receipt_long_outlined,
              color: VColors.brand,
              size: 19,
            ),
            const SizedBox(width: 7),
            const Expanded(
              child: Text(
                'كل الطلبات',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: _cardTitleStyle,
              ),
            ),
            const Icon(Icons.chevron_left, color: VColors.muted, size: 18),
          ],
        ),
        const SizedBox(height: 14),
        _countRow(data.count),
        if (widget.policy.viewAmounts) ...[
          const SizedBox(height: 7),
          Text(displayAmount(data.amountMinor / 1000), style: _cardAmountStyle),
        ],
        const SizedBox(height: 12),
        _cardSummary(data),
      ],
    ),
  );

  /// A big number plus its unit, shrink-wrapped so a four-digit count never
  /// overflows a narrow phone column.
  Widget _countRow(int count) => Row(
    crossAxisAlignment: CrossAxisAlignment.end,
    children: [
      Flexible(
        child: FittedBox(
          fit: BoxFit.scaleDown,
          alignment: AlignmentDirectional.centerStart,
          child: Text('$count', style: _cardCountStyle),
        ),
      ),
      const Padding(
        padding: EdgeInsetsDirectional.only(start: 6, bottom: 2),
        child: Text('طلب', style: _cardUnitStyle),
      ),
    ],
  );

  Widget _scopeCard({
    required String title,
    required IconData icon,
    required _ScopeTotals data,
    required String bucket,
  }) => _cardShell(
    onTap: () => _openBucket(bucket),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Icon(icon, color: VColors.brand, size: 19),
            const SizedBox(width: 7),
            Expanded(
              child: Text(
                title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: _cardTitleStyle,
              ),
            ),
            const Icon(Icons.chevron_left, color: VColors.muted, size: 18),
          ],
        ),
        const SizedBox(height: 14),
        _countRow(data.count),
        if (widget.policy.viewAmounts) ...[
          const SizedBox(height: 7),
          Text(
            displayAmount(data.amountMinor / 1000),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: _cardAmountStyle,
          ),
        ],
        const SizedBox(height: 12),
        _cardSummary(data),
      ],
    ),
  );

  Widget _cardShell({
    required VoidCallback onTap,
    required Widget child,
    bool accent = false,
  }) => Semantics(
    button: true,
    child: Material(
      color: accent ? VColors.softBlue.withValues(alpha: .45) : Colors.white,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(
          color: accent ? VColors.brand.withValues(alpha: .35) : VColors.line,
        ),
      ),
      child: InkWell(
        onTap: onTap,
        mouseCursor: SystemMouseCursors.click,
        borderRadius: BorderRadius.circular(16),
        hoverColor: VColors.softBlue.withValues(alpha: .6),
        focusColor: VColors.softBlue,
        child: Container(
          constraints: const BoxConstraints(minHeight: 148),
          padding: const EdgeInsets.all(16),
          child: child,
        ),
      ),
    ),
  );

  /// Concise, non-crowded summary for a dashboard card: the two busiest
  /// statuses, or a clear empty note. The full breakdown lives on the status
  /// grid opened by tapping the card.
  Widget _cardSummary(_ScopeTotals data) {
    if (data.ranked.isEmpty) {
      return const Text('لا توجد طلبات في هذا النطاق.', style: _cardMutedStyle);
    }
    final top = data.ranked.take(2).toList();
    return Row(
      children: [
        for (final entry in top) ...[
          Container(
            width: 7,
            height: 7,
            margin: const EdgeInsetsDirectional.only(end: 5),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: statusColors[entry.key] ?? VColors.brand,
            ),
          ),
          Flexible(
            child: Text(
              '${statusLabels[entry.key]}: ${entry.value}',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: _cardSummaryStyle,
            ),
          ),
          if (entry != top.last) const SizedBox(width: 10),
        ],
      ],
    );
  }

  Widget _skeleton() => LiveContent(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 8),
        Container(
          height: 26,
          width: 220,
          alignment: Alignment.centerRight,
          decoration: BoxDecoration(
            color: VColors.line.withValues(alpha: .35),
            borderRadius: BorderRadius.circular(8),
          ),
        ),
        const SizedBox(height: 20),
        for (final height in [160.0, 148.0, 148.0]) ...[
          Container(
            height: height,
            decoration: BoxDecoration(
              color: VColors.line.withValues(alpha: .28),
              borderRadius: BorderRadius.circular(16),
            ),
          ),
          const SizedBox(height: 14),
        ],
      ],
    ),
  );
}
