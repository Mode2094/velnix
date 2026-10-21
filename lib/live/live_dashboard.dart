part of 'live_app.dart';

/// Index-backed aggregates in the authenticated role scope.
class LiveDashboard extends StatefulWidget {
  const LiveDashboard({
    super.key,
    required this.policy,
    required this.onNavigate,
    this.initialFilters = const {},
    this.onFiltersChanged,
  });
  final SessionPolicy policy;
  final void Function(String, String?) onNavigate;
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

  Widget _cards(Map<String, dynamic> counters, _ScopeTotals all) {
    final delivery = _scopeTotals(counters['delivery']);
    final internal = _scopeTotals(counters['internal']);
    final allCard = _allCard(all);
    final deliveryCard = _scopeCard(
      title: 'طلبات شركات التوصيل',
      icon: Icons.local_shipping_outlined,
      data: delivery,
      bucket: 'delivery',
      hint: delivery.ranked.isEmpty
          ? null
          : '${statusLabels[delivery.ranked.first.key]}: ${delivery.ranked.first.value}',
    );
    final newCreated = internal.ranked
        .where((entry) => entry.key == 'created')
        .fold<int>(0, (total, entry) => total + entry.value);
    final internalCard = _scopeCard(
      title: 'الطلبات غير المسندة لشركة',
      icon: Icons.inventory_2_outlined,
      data: internal,
      bucket: 'internal',
      hint: internal.count == 0
          ? 'كل الطلبات مسندة إلى شركات التوصيل.'
          : 'طلبات بانتظار المتابعة: $newCreated',
    );
    return LayoutBuilder(
      builder: (context, box) {
        final width = box.maxWidth;
        if (width >= 1100) {
          return IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(flex: 2, child: allCard),
                const SizedBox(width: 14),
                Expanded(child: deliveryCard),
                const SizedBox(width: 14),
                Expanded(child: internalCard),
              ],
            ),
          );
        }
        if (width >= 480) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              allCard,
              const SizedBox(height: 14),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(child: deliveryCard),
                  const SizedBox(width: 12),
                  Expanded(child: internalCard),
                ],
              ),
            ],
          );
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            allCard,
            const SizedBox(height: 12),
            deliveryCard,
            const SizedBox(height: 12),
            internalCard,
          ],
        );
      },
    );
  }

  Widget _allCard(_ScopeTotals data) => _cardShell(
    onTap: () => widget.onNavigate('all', null),
    label: 'كل الطلبات، ${data.count} طلب',
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Icon(
              Icons.receipt_long_outlined,
              color: VColors.brand,
              size: 22,
            ),
            const SizedBox(width: 8),
            const Expanded(
              child: Text(
                'كل الطلبات',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
              ),
            ),
            const Icon(Icons.arrow_back, color: VColors.muted, size: 20),
          ],
        ),
        const SizedBox(height: 14),
        Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Flexible(
              child: FittedBox(
                fit: BoxFit.scaleDown,
                alignment: AlignmentDirectional.centerStart,
                child: Text(
                  '${data.count}',
                  style: const TextStyle(
                    fontSize: 36,
                    fontWeight: FontWeight.w900,
                    height: 1,
                  ),
                ),
              ),
            ),
            const Padding(
              padding: EdgeInsets.only(bottom: 4, right: 6),
              child: Text(
                'طلب',
                style: TextStyle(color: VColors.muted, fontSize: 14),
              ),
            ),
          ],
        ),
        if (widget.policy.viewAmounts) ...[
          const SizedBox(height: 8),
          Text(
            displayAmount(data.amountMinor / 1000),
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800),
          ),
        ],
        const SizedBox(height: 14),
        _miniStatuses('all', data.ranked.take(3)),
      ],
    ),
  );

  Widget _scopeCard({
    required String title,
    required IconData icon,
    required _ScopeTotals data,
    required String bucket,
    String? hint,
  }) => _cardShell(
    onTap: () => widget.onNavigate(bucket, null),
    label: '$title، ${data.count} طلب',
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(icon, color: VColors.brand, size: 20),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                title,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
            const Icon(Icons.arrow_back, color: VColors.muted, size: 18),
          ],
        ),
        const SizedBox(height: 12),
        Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Flexible(
              child: FittedBox(
                fit: BoxFit.scaleDown,
                alignment: AlignmentDirectional.centerStart,
                child: Text(
                  '${data.count}',
                  style: const TextStyle(
                    fontSize: 30,
                    fontWeight: FontWeight.w900,
                    height: 1,
                  ),
                ),
              ),
            ),
            const Padding(
              padding: EdgeInsets.only(bottom: 3, right: 5),
              child: Text(
                'طلب',
                style: TextStyle(color: VColors.muted, fontSize: 12),
              ),
            ),
          ],
        ),
        if (widget.policy.viewAmounts) ...[
          const SizedBox(height: 6),
          Text(
            displayAmount(data.amountMinor / 1000),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
          ),
        ],
        if (hint != null) ...[
          const SizedBox(height: 8),
          Text(
            hint,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 12, color: VColors.muted),
          ),
        ],
      ],
    ),
  );

  Widget _cardShell({
    required VoidCallback onTap,
    required String label,
    required Widget child,
  }) => Semantics(
    button: true,
    label: label,
    child: Material(
      color: Colors.white,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: const BorderSide(color: VColors.line),
      ),
      child: InkWell(
        onTap: onTap,
        mouseCursor: SystemMouseCursors.click,
        borderRadius: BorderRadius.circular(18),
        hoverColor: VColors.softBlue.withValues(alpha: .6),
        focusColor: VColors.softBlue,
        child: Container(
          constraints: const BoxConstraints(minHeight: 170),
          padding: const EdgeInsets.all(18),
          child: child,
        ),
      ),
    ),
  );

  Widget _miniStatuses(String bucket, Iterable<MapEntry<String, int>> entries) {
    if (entries.isEmpty) {
      return const Text(
        'لا توجد طلبات في هذا النطاق.',
        style: TextStyle(fontSize: 12, color: VColors.muted),
      );
    }
    return Wrap(
      spacing: 8,
      runSpacing: 6,
      children: [for (final entry in entries) _statusChip(bucket, entry)],
    );
  }

  Widget _statusChip(String bucket, MapEntry<String, int> entry) {
    final color = statusColors[entry.key] ?? VColors.brand;
    return Semantics(
      button: true,
      label: '${statusLabels[entry.key]}، ${entry.value} طلب',
      child: Material(
        color: color.withValues(alpha: .08),
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: BorderSide(color: color.withValues(alpha: .16)),
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(20),
          mouseCursor: SystemMouseCursors.click,
          onTap: () => widget.onNavigate(bucket, entry.key),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            child: Text(
              '${statusLabels[entry.key]}: ${entry.value}',
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
            ),
          ),
        ),
      ),
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
        for (final height in [190.0, 150.0, 150.0]) ...[
          Container(
            height: height,
            decoration: BoxDecoration(
              color: VColors.line.withValues(alpha: .28),
              borderRadius: BorderRadius.circular(18),
            ),
          ),
          const SizedBox(height: 14),
        ],
      ],
    ),
  );
}
