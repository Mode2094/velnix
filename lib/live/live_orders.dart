part of 'live_app.dart';

class LiveOrders extends StatefulWidget {
  const LiveOrders({
    super.key,
    required this.policy,
    this.bucket = 'all',
    this.status,
    this.companyId,
    this.initialFilters = const {},
    this.onFiltersChanged,
  });
  final SessionPolicy policy;
  final String bucket;
  final String? status;
  final String? companyId;
  final Map<String, dynamic> initialFilters;
  final ValueChanged<Map<String, dynamic>>? onFiltersChanged;
  @override
  State<LiveOrders> createState() => _LiveOrdersState();
}

class _LiveOrdersState extends State<LiveOrders> {
  final gateway = VelnixGateway.instance;
  final search = TextEditingController();
  List<Map<String, dynamic>> rows = [];
  Map<String, dynamic> filters = {};
  String sort = 'desc';
  String? after, status;
  late String bucket;
  bool busy = false, more = true, limited = false;
  String? error;
  int generation = 0;
  String appliedQuery = '';
  @override
  void initState() {
    super.initState();
    filters = Map.of(widget.initialFilters);
    status = widget.status;
    bucket = widget.bucket;
    load(reset: true);
  }

  @override
  void dispose() {
    search.dispose();
    super.dispose();
  }

  Future<void> load({bool reset = false}) async {
    if (busy && !reset) return;
    final current = ++generation;
    setState(() {
      busy = true;
      error = null;
      if (reset) {
        appliedQuery = search.text.trim();
        rows = [];
        after = null;
        more = true;
      }
    });
    final token = after;
    try {
      final query = appliedQuery;
      if (query.isNotEmpty && query.length < 2) {
        throw VelnixException('اكتب حرفين على الأقل للبحث');
      }
      final result = query.length >= 2
          ? await gateway.searchOrders(
              query,
              status: status,
              bucket: bucket,
              companyId: widget.companyId,
              filters: filters,
            )
          : await gateway.orders(
              afterId: token,
              sort: sort,
              status: status,
              bucket: bucket,
              companyId: widget.companyId,
              filters: filters,
            );
      final list = gateway.listResult(result);
      if (!mounted || generation != current) return;
      setState(() {
        limited = result['limited'] == true;
        rows.addAll(list);
        after = query.length >= 2 ? null : result['nextAfterId'] as String?;
        more = after != null;
      });
    } catch (e) {
      if (mounted && generation == current) {
        setState(() {
          error = '$e';
          if (reset) {
            rows = [];
            after = null;
            more = false;
          }
        });
      }
    } finally {
      if (mounted && generation == current) setState(() => busy = false);
    }
  }

  int get _activeFilterCount =>
      (bucket != 'all' ? 1 : 0) +
      (status != null ? 1 : 0) +
      (filters.isNotEmpty ? 1 : 0) +
      (sort != 'desc' ? 1 : 0);

  Widget _searchField() => TextField(
    controller: search,
    textInputAction: TextInputAction.search,
    onChanged: (_) => setState(() {}),
    onSubmitted: (_) => load(reset: true),
    decoration: InputDecoration(
      prefixIcon: const Icon(Icons.search),
      labelText: 'بحث في كل الطلبات المسموح لك بها',
      hintText: 'رقم الطلب، رقم الهاتف الكامل أو بداية الاسم',
      suffixIcon: IconButton(
        tooltip: 'تنفيذ البحث',
        onPressed: () => load(reset: true),
        icon: const Icon(Icons.search),
      ),
    ),
  );

  Widget _filterControls() => Column(
    children: [
      LayoutBuilder(
        builder: (context, box) {
          final wide = box.maxWidth > 680;
          final a = DropdownButtonFormField<String>(
            isExpanded: true,
            initialValue: bucket,
            decoration: const InputDecoration(labelText: 'مجموعة الطلبات'),
            items: const [
              DropdownMenuItem(value: 'all', child: Text('كل الطلبات')),
              DropdownMenuItem(value: 'delivery', child: Text('شركات التوصيل')),
              DropdownMenuItem(value: 'internal', child: Text('غير المسندة')),
            ],
            onChanged: (v) {
              setState(() => bucket = v ?? 'all');
              load(reset: true);
            },
          );
          final b = DropdownButtonFormField<String>(
            isExpanded: true,
            initialValue: status ?? 'all',
            decoration: const InputDecoration(labelText: 'حالة الطلب'),
            items: [
              const DropdownMenuItem(value: 'all', child: Text('جميع الحالات')),
              ...statusLabels.entries.map(
                (e) => DropdownMenuItem(value: e.key, child: Text(e.value)),
              ),
            ],
            onChanged: (v) {
              setState(() => status = v == 'all' ? null : v);
              load(reset: true);
            },
          );
          return wide
              ? Row(
                  children: [
                    Expanded(child: a),
                    const SizedBox(width: 12),
                    Expanded(child: b),
                  ],
                )
              : Column(children: [a, const SizedBox(height: 9), b]);
        },
      ),
      const SizedBox(height: 10),
      OrderFilters(
        fixedCompanyId: widget.companyId,
        initialFilters: filters,
        onChanged: (value) {
          filters = value;
          widget.onFiltersChanged?.call(value);
          load(reset: true);
        },
      ),
      DropdownButtonFormField<String>(
        initialValue: sort,
        isExpanded: true,
        decoration: const InputDecoration(labelText: 'ترتيب الإنشاء'),
        items: const [
          DropdownMenuItem(value: 'desc', child: Text('الأحدث أولاً')),
          DropdownMenuItem(value: 'asc', child: Text('الأقدم أولاً')),
        ],
        onChanged: search.text.trim().length >= 2
            ? null
            : (value) {
                sort = value ?? 'desc';
                load(reset: true);
              },
      ),
    ],
  );

  Future<void> _openFilters(BuildContext context) => showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (sheetContext) => SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
        child: _filterControls(),
      ),
    ),
  );

  @override
  Widget build(BuildContext context) {
    final visible = rows;
    final compact = MediaQuery.sizeOf(context).width < 720;
    return RefreshIndicator(
      onRefresh: () => load(reset: true),
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        child: LiveContent(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Wrap(
                alignment: WrapAlignment.spaceBetween,
                runSpacing: 10,
                spacing: 10,
                children: [
                  Text(
                    widget.companyId == null
                        ? 'إدارة الطلبات'
                        : 'طلبات شركة التوصيل',
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                  FilledButton.icon(
                    onPressed: () => Navigator.push(
                      context,
                      MaterialPageRoute<void>(
                        builder: (_) => LiveOrderForm(
                          policy: widget.policy,
                          onSaved: () {
                            Navigator.pop(context);
                            load(reset: true);
                          },
                        ),
                      ),
                    ),
                    icon: const Icon(Icons.add),
                    label: const Text('طلب جديد'),
                  ),
                ],
              ),
              const SizedBox(height: 15),
              VLivePanel(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (compact)
                      Row(
                        children: [
                          Expanded(child: _searchField()),
                          const SizedBox(width: 8),
                          Badge(
                            isLabelVisible: _activeFilterCount > 0,
                            label: Text('$_activeFilterCount'),
                            child: IconButton.filledTonal(
                              tooltip: 'الفلاتر والترتيب',
                              onPressed: () => _openFilters(context),
                              icon: const Icon(Icons.tune),
                            ),
                          ),
                        ],
                      )
                    else ...[
                      _filterControls(),
                      const SizedBox(height: 10),
                      _searchField(),
                    ],
                    if (search.text.trim().isNotEmpty)
                      Align(
                        alignment: Alignment.centerLeft,
                        child: TextButton.icon(
                          onPressed: () {
                            search.clear();
                            load(reset: true);
                          },
                          icon: const Icon(Icons.close),
                          label: const Text('مسح البحث'),
                        ),
                      ),
                    const SizedBox(height: 6),
                    const Text(
                      'البحث على الخادم. الاسم من حرفين، والهاتف برقم كامل؛ تظهر أول 50 نتيجة.',
                      style: TextStyle(fontSize: 11, color: VColors.muted),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              if (limited)
                const VLivePanel(
                  child: Text(
                    'توجد نتائج إضافية؛ حدّد الحالة أو الشركة أو الفترة لتضييق البحث.',
                  ),
                ),
              if (error != null)
                VFeedbackPanel(
                  title: 'تعذر تحميل الطلبات',
                  message: error,
                  icon: Icons.error_outline,
                  onRetry: () => load(reset: true),
                ),
              if (!busy && error == null && rows.isEmpty)
                const VFeedbackPanel(
                  title: 'لا توجد طلبات مطابقة',
                  message: 'جرّب تغيير البحث أو الفلاتر، أو أنشئ طلباً جديداً.',
                  icon: Icons.receipt_long_outlined,
                ),
              for (final item in visible)
                Padding(
                  padding: const EdgeInsets.only(bottom: 9),
                  child: _orderCard(item),
                ),
              const SizedBox(height: 9),
              if (busy)
                const VFeedbackPanel(
                  title: 'جارٍ تحميل الطلبات',
                  loading: true,
                ),
              if (more && !busy)
                Center(
                  child: OutlinedButton.icon(
                    onPressed: () => load(),
                    icon: const Icon(Icons.expand_more),
                    label: const Text('تحميل المزيد'),
                  ),
                ),
              const SizedBox(height: 30),
            ],
          ),
        ),
      ),
    );
  }

  Widget _orderCard(Map<String, dynamic> o) {
    final state = o['status']?.toString() ?? 'created',
        color = statusColors[state] ?? VColors.brand;
    final scope = o['companyId'] != null ? 'شركة توصيل' : 'غير مسندة';
    final created = o['createdAt'] != null
        ? businessDate(o['createdAt'])
        : null;
    return VLivePanel(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      child: InkWell(
        onTap: () => Navigator.push(
          context,
          MaterialPageRoute<void>(
            builder: (_) =>
                LiveOrderDetail(id: o['id'].toString(), policy: widget.policy),
          ),
        ).then((_) => load(reset: true)),
        child: Padding(
          padding: EdgeInsets.zero,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Wrap(
                alignment: WrapAlignment.spaceBetween,
                crossAxisAlignment: WrapCrossAlignment.center,
                spacing: 8,
                runSpacing: 6,
                children: [
                  Text(
                    '${o['customer'] ?? ''}',
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 5,
                    ),
                    decoration: BoxDecoration(
                      color: color.withValues(alpha: .10),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      statusLabels[state] ?? state,
                      style: TextStyle(
                        color: color,
                        fontWeight: FontWeight.w800,
                        fontSize: 12,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                'طلب #${o['orderNumber'] ?? o['id']} • $scope • ${o['city'] ?? ''} / ${o['area'] ?? ''}'
                '${created != null ? ' • $created' : ''}',
                style: const TextStyle(color: VColors.muted, fontSize: 11),
              ),
              const SizedBox(height: 5),
              Wrap(
                spacing: 12,
                runSpacing: 5,
                children: [
                  Text(
                    '${o['description'] ?? ''}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 12),
                  ),
                  if (o['amount'] != null)
                    Text(
                      displayAmount(o['amount']),
                      style: const TextStyle(
                        color: VColors.brand,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  if (o['trackingNumber'] != null)
                    Text(
                      'تتبع: ${o['trackingNumber']}',
                      style: const TextStyle(fontSize: 12),
                    ),
                  if (o['providerOrderId'] != null)
                    Text(
                      'شحنة Click: ${o['providerOrderId']}',
                      style: const TextStyle(fontSize: 12),
                    ),
                ],
              ),
              const SizedBox(height: 4),
              const Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  Flexible(
                    child: Text(
                      'فتح التفاصيل',
                      style: TextStyle(color: VColors.brand, fontSize: 11),
                    ),
                  ),
                  SizedBox(width: 4),
                  Icon(
                    Icons.arrow_back_ios_new,
                    size: 11,
                    color: VColors.brand,
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class LiveOrderDetail extends StatefulWidget {
  const LiveOrderDetail({super.key, required this.id, required this.policy});
  final String id;
  final SessionPolicy policy;
  @override
  State<LiveOrderDetail> createState() => _LiveOrderDetailState();
}

class _LiveOrderDetailState extends State<LiveOrderDetail> {
  late Future<Map<String, dynamic>> request;
  List<Map<String, dynamic>>? _events;
  bool _eventsMore = false;
  bool _loadingEvents = false;
  String? _eventsAfterId;
  int _generation = 0;
  bool actionBusy = false;
  @override
  void initState() {
    super.initState();
    reload();
  }

  void reload() {
    final generation = ++_generation;
    _events = null;
    _eventsMore = false;
    _eventsAfterId = null;
    request = VelnixGateway.instance.order(widget.id).then((data) {
      if (generation == _generation) {
        _events = (data['events'] as List? ?? [])
            .map((v) => Map<String, dynamic>.from(v as Map))
            .toList();
        _eventsMore = data['eventsMore'] == true;
        _eventsAfterId = data['eventsAfterId'] as String?;
      }
      return data;
    });
  }

  void refresh() {
    setState(reload);
  }

  Future<void> loadMoreEvents() async {
    if (_loadingEvents || !_eventsMore || _eventsAfterId == null) return;
    final generation = _generation;
    setState(() => _loadingEvents = true);
    try {
      final data = await VelnixGateway.instance.order(
        widget.id,
        eventsAfterId: _eventsAfterId,
      );
      if (!mounted || generation != _generation) return;
      setState(() {
        _events!.addAll(
          (data['events'] as List? ?? []).map(
            (v) => Map<String, dynamic>.from(v as Map),
          ),
        );
        _eventsMore = data['eventsMore'] == true;
        _eventsAfterId = data['eventsAfterId'] as String?;
      });
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _loadingEvents = false);
    }
  }

  Future<void> action(Future<void> Function() operation) async {
    if (actionBusy) return;
    setState(() => actionBusy = true);
    try {
      await operation();
      if (mounted) {
        showSuccess(context, 'تم تنفيذ العملية');
        refresh();
      }
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => actionBusy = false);
    }
  }

  List<String> transitions(String state) => switch (state) {
    'created' => ['review', 'cancelled'],
    'review' => ['preparing', 'cancelled'],
    'preparing' => ['ready', 'cancelled'],
    _ => [],
  };
  String? _syncFeedback;
  bool _syncFeedbackOk = false;
  bool _fullHistory = false;

  IconData _eventIcon(dynamic action) => switch (action?.toString()) {
    'created' => Icons.add_circle_outline,
    'edited' => Icons.edit_outlined,
    'status_changed' => Icons.swap_horiz,
    'company_assigned' => Icons.local_shipping_outlined,
    'company_unassigned' => Icons.link_off,
    'sent_to_delivery' => Icons.send_outlined,
    'remote_status' => Icons.cloud_done_outlined,
    'dispatch_exception_resolved' => Icons.fact_check_outlined,
    'dispatch_preparation_failed' => Icons.error_outline,
    'dispatch_attempt_failed' => Icons.warning_amber_outlined,
    'click_reconciled' => Icons.link,
    'click_status_synced' => Icons.sync,
    'click_status_stale' => Icons.history_toggle_off,
    'click_status_conflict' => Icons.warning_amber_outlined,
    'click_sync_failed' => Icons.cloud_off_outlined,
    _ => Icons.circle_outlined,
  };

  String _sourceLabel(dynamic source) => switch (source?.toString()) {
    'manual' => 'إدخال يدوي بعد التحقق من بوابة Click',
    'click_api' => 'تحديث تلقائي مؤكد من Click API',
    'webhook' => 'تحديث من شركة التوصيل',
    'poll' => 'مزامنة آلية',
    _ => 'غير متوفر',
  };

  Widget _sectionTitle(String title, IconData icon) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: Row(
      children: [
        Icon(icon, size: 20, color: VColors.brand),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            title,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900),
          ),
        ),
      ],
    ),
  );

  Widget _statusChip(String state) {
    final color = statusColors[state] ?? VColors.brand;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
      decoration: BoxDecoration(
        color: color.withValues(alpha: .12),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        statusLabels[state] ?? state,
        style: TextStyle(
          color: color,
          fontWeight: FontWeight.w900,
          fontSize: 12,
        ),
      ),
    );
  }

  Future<void> _copy(String value, String message) async {
    await Clipboard.setData(ClipboardData(text: value));
    if (mounted) showSuccess(context, message);
  }

  Widget _infoLine(
    String label,
    dynamic value, {
    bool copy = false,
    String? copyMessage,
  }) {
    if (value == null || value.toString().trim().isEmpty) {
      return const SizedBox.shrink();
    }
    final text = '$label: $value';
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Align(
        alignment: AlignmentDirectional.centerStart,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Flexible(
              child: Text(
                text,
                style: const TextStyle(fontSize: 13.5, height: 1.45),
              ),
            ),
            if (copy)
              IconButton(
                visualDensity: VisualDensity.compact,
                tooltip: 'نسخ',
                onPressed: () => _copy('$value', copyMessage ?? 'تم النسخ'),
                icon: const Icon(Icons.copy_outlined, size: 17),
              ),
          ],
        ),
      ),
    );
  }

  String? _actionHint(Map<String, dynamic> o, Map<String, dynamic> actions) {
    final state = o['status']?.toString() ?? '';
    final dispatchState = o['dispatchState']?.toString() ?? 'idle';
    if (dispatchState == 'needs_review') {
      return 'نتيجة الإرسال السابقة تحتاج مراجعة قبل أي إعادة إرسال.';
    }
    if (dispatchState == 'sent' || state == 'dispatched') {
      return 'تم إرسال الشحنة؛ لا يمكن تغيير شركة التوصيل أو إعادة الإرسال.';
    }
    if (['delivered', 'returned', 'cancelled'].contains(state)) {
      return 'الطلب مغلق؛ لا توجد إجراءات تغيير متاحة.';
    }
    if (!widget.policy.can('sendToDelivery')) {
      return 'إسناد الشركة والإرسال يحتاجان صلاحية إرسال لشركة التوصيل.';
    }
    if (state == 'ready' && o['companyId'] == null) {
      return 'اختر شركة توصيل قبل إرسال الطلب.';
    }
    return null;
  }

  Widget _trackingVisual(ShippingStatus? status) {
    if (status == null) {
      return const Text(
        'لم تُرسل الشحنة بعد.',
        style: TextStyle(color: VColors.muted, fontSize: 12),
      );
    }
    const special = {
      ShippingStatus.partiallyDelivered,
      ShippingStatus.deferred,
      ShippingStatus.cancelled,
    };
    if (special.contains(status)) {
      final color = status == ShippingStatus.cancelled
          ? VColors.danger
          : status == ShippingStatus.deferred
          ? VColors.warning
          : VColors.aqua;
      return Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: color.withValues(alpha: .08),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: color.withValues(alpha: .25)),
        ),
        child: Row(
          children: [
            Icon(
              status == ShippingStatus.cancelled
                  ? Icons.cancel_outlined
                  : status == ShippingStatus.deferred
                  ? Icons.schedule_outlined
                  : Icons.rule_outlined,
              color: color,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'حالة خاصة: ${status.label}',
                    style: TextStyle(
                      color: color,
                      fontWeight: FontWeight.w900,
                      fontSize: 12.5,
                    ),
                  ),
                  const SizedBox(height: 2),
                  const Text(
                    'هذه الحالة لا تُعرض كمسار خطي حتى لا تُفهم بشكل خاطئ.',
                    style: TextStyle(color: VColors.muted, fontSize: 11),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
    }
    const steps = [
      ShippingStatus.awaitingPickup,
      ShippingStatus.carrierWarehouse,
      ShippingStatus.outForDelivery,
      ShippingStatus.delivered,
    ];
    const labels = ['بانتظار الموافقة', 'مخزن الشحن', 'في الشحن', 'تم التسليم'];
    final current = steps.indexOf(status);
    if (current < 0) return const SizedBox.shrink();
    return Column(
      children: [
        Row(
          children: [
            for (var i = 0; i < steps.length; i++)
              Expanded(
                child: Row(
                  children: [
                    if (i > 0)
                      Expanded(
                        child: Container(
                          height: 3,
                          color: i <= current ? VColors.aqua : VColors.line,
                        ),
                      ),
                    Container(
                      width: 22,
                      height: 22,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: i <= current ? VColors.aqua : VColors.softBlue,
                      ),
                      child: Icon(
                        i < current
                            ? Icons.check
                            : i == current
                            ? Icons.circle
                            : Icons.circle_outlined,
                        size: i == current ? 9 : 13,
                        color: i <= current ? Colors.white : VColors.muted,
                      ),
                    ),
                    if (i < steps.length - 1)
                      Expanded(
                        child: Container(
                          height: 3,
                          color: i < current ? VColors.aqua : VColors.line,
                        ),
                      ),
                  ],
                ),
              ),
          ],
        ),
        const SizedBox(height: 6),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (var i = 0; i < labels.length; i++)
              Expanded(
                child: Text(
                  labels[i],
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: i == current ? VColors.brand : VColors.muted,
                    fontWeight: i == current
                        ? FontWeight.w800
                        : FontWeight.w500,
                    fontSize: 10,
                  ),
                ),
              ),
          ],
        ),
      ],
    );
  }

  Widget _timelineEvent(Map<String, dynamic> e, {required bool last}) {
    final details = e['details'];
    final hasDetails = details is Map && details.isNotEmpty;
    return Padding(
      padding: EdgeInsets.only(bottom: last ? 0 : 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Column(
            children: [
              CircleAvatar(
                radius: 15,
                backgroundColor: VColors.softBlue,
                child: Icon(
                  _eventIcon(e['action']),
                  size: 16,
                  color: VColors.brand,
                ),
              ),
              if (!last)
                Container(
                  width: 2,
                  height: 30,
                  margin: const EdgeInsets.only(top: 4),
                  color: VColors.line,
                ),
            ],
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        eventLabel(e['action'], details),
                        style: const TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 13.5,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      businessDate(e['createdAt']),
                      style: const TextStyle(
                        color: VColors.muted,
                        fontSize: 11,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  e['actorName']?.toString() ?? '',
                  style: const TextStyle(color: VColors.muted, fontSize: 11),
                ),
                if (hasDetails)
                  Theme(
                    data: Theme.of(
                      context,
                    ).copyWith(dividerColor: Colors.transparent),
                    child: ExpansionTile(
                      tilePadding: EdgeInsets.zero,
                      childrenPadding: const EdgeInsets.only(bottom: 6),
                      dense: true,
                      title: const Text(
                        'تفاصيل إضافية',
                        style: TextStyle(fontSize: 11.5, color: VColors.muted),
                      ),
                      children: [
                        for (final entry in details.entries)
                          Align(
                            alignment: AlignmentDirectional.centerStart,
                            child: Text(
                              '${entry.key}: ${entry.value}',
                              style: const TextStyle(fontSize: 11.5),
                            ),
                          ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('تفاصيل الطلب'),
      actions: [
        IconButton(
          tooltip: 'تحديث',
          onPressed: refresh,
          icon: const Icon(Icons.refresh),
        ),
      ],
    ),
    body: AsyncPanel<Map<String, dynamic>>(
      future: request,
      onRetry: refresh,
      loading: const _OrderDetailSkeleton(),
      builder: (data) {
        final o = Map<String, dynamic>.from(data['order'] as Map);
        final state = o['status'].toString();
        final actions = Map<String, dynamic>.from(o['actions'] as Map? ?? {});
        final events =
            _events ??
            (data['events'] as List? ?? [])
                .map((v) => Map<String, dynamic>.from(v as Map))
                .toList();
        final seen = <String>{};
        final timeline =
            [
              for (final e in events)
                if (seen.add(
                  '${e['action']}|${e['actorId']}|${e['createdAt']}',
                ))
                  e,
            ]..sort(
              (a, b) => (b['createdAt']?.toString() ?? '').compareTo(
                a['createdAt']?.toString() ?? '',
              ),
            );
        const technicalActions = {
          'click_status_synced',
          'click_status_stale',
          'click_status_conflict',
          'click_sync_failed',
        };
        final primaryTimeline = timeline
            .where((e) => !technicalActions.contains(e['action']))
            .toList();
        final visibleTimeline = _fullHistory
            ? timeline
            : primaryTimeline.take(4).toList();
        final isClick = o['companyProvider'] == 'click_delivery_v1';
        final shippingState = ShippingStatus.parse(o['shippingStatus']);
        final shippingLabel = shippingState?.label ?? 'لم تُرسل بعد';
        final canSync =
            widget.policy.can('sendToDelivery') &&
            o['clickOrderRef'] != null &&
            o['clickOrderRef'].toString().isNotEmpty;
        final canTechnical =
            widget.policy.role == 'generalManager' ||
            widget.policy.can('viewSync') ||
            widget.policy.can('viewAudit');
        final created = o['createdAt'] != null
            ? businessDate(o['createdAt'])
            : 'غير متوفر';
        final company = o['companyName']?.toString();
        final policyNumber = o['providerOrderId']?.toString();
        final clickRef = o['clickOrderRef']?.toString();
        final hint = _actionHint(o, actions);

        final customerInfo = Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              o['customer']?.toString() ?? '',
              style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 3),
            Row(
              children: [
                Flexible(
                  child: Text(
                    'رقم الطلب: ${o['orderNumber'] ?? o['id']}',
                    style: const TextStyle(
                      color: VColors.muted,
                      fontSize: 12.5,
                    ),
                  ),
                ),
                IconButton(
                  visualDensity: VisualDensity.compact,
                  tooltip: 'نسخ رقم الطلب',
                  onPressed: () => _copy(
                    '${o['orderNumber'] ?? o['id']}',
                    'تم نسخ رقم الطلب',
                  ),
                  icon: const Icon(Icons.copy_outlined, size: 17),
                ),
              ],
            ),
          ],
        );

        final left = Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            VLivePanel(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _sectionTitle('معلومات العميل', Icons.person_outline),
                  _infoLine('الاسم', o['customer']),
                  _infoLine(
                    'الهاتف',
                    o['phone'],
                    copy: true,
                    copyMessage: 'تم نسخ رقم الهاتف',
                  ),
                  _infoLine('هاتف إضافي', o['extraPhone']),
                  _infoLine(
                    'العنوان',
                    '${o['city'] ?? ''}، ${o['area'] ?? ''}، ${o['address'] ?? ''}',
                  ),
                  _infoLine('المحتويات', o['description']),
                  _infoLine('الكمية', o['quantity']),
                  _infoLine('الملاحظات', o['note']),
                ],
              ),
            ),
            const SizedBox(height: 12),
            VLivePanel(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _sectionTitle('سجل الحركة', Icons.history),
                  if (timeline.isEmpty)
                    const Text(
                      'لا توجد أحداث مسجلة لهذا الطلب بعد.',
                      style: TextStyle(color: VColors.muted),
                    )
                  else if (primaryTimeline.isEmpty && !_fullHistory)
                    const Text(
                      'لا توجد أحداث رئيسية؛ افتح السجل الكامل للتفاصيل.',
                      style: TextStyle(color: VColors.muted),
                    ),
                  for (var i = 0; i < visibleTimeline.length; i++)
                    _timelineEvent(
                      visibleTimeline[i],
                      last: i == visibleTimeline.length - 1,
                    ),
                  if (!_fullHistory &&
                      (timeline.length > visibleTimeline.length || _eventsMore))
                    TextButton.icon(
                      onPressed: () {
                        setState(() => _fullHistory = true);
                        if (_eventsMore && !_loadingEvents) loadMoreEvents();
                      },
                      icon: const Icon(Icons.expand_more),
                      label: const Text('عرض السجل كاملًا'),
                    ),
                  if (_fullHistory)
                    TextButton(
                      onPressed: () => setState(() => _fullHistory = false),
                      child: const Text('عرض السجل المختصر'),
                    ),
                  if (_fullHistory && _eventsMore)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: OutlinedButton.icon(
                        onPressed: _loadingEvents ? null : loadMoreEvents,
                        icon: _loadingEvents
                            ? const SizedBox.square(
                                dimension: 16,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              )
                            : const Icon(Icons.expand_more),
                        label: const Text('عرض أحداث أقدم'),
                      ),
                    ),
                ],
              ),
            ),
          ],
        );

        final right = Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (isClick)
              VLivePanel(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _sectionTitle('تتبع الشحنة', Icons.local_shipping_outlined),
                    _infoLine(
                      'شركة التوصيل',
                      company?.isNotEmpty == true ? company : 'بدون شركة',
                    ),
                    _trackingVisual(shippingState),
                    const SizedBox(height: 8),
                    _infoLine('حالة الشحنة', shippingLabel),
                    _infoLine(
                      'رقم البوليصة',
                      policyNumber,
                      copy: policyNumber != null,
                      copyMessage: 'تم نسخ رقم البوليصة',
                    ),
                    _infoLine(
                      'مرجع Click (Order_ID)',
                      clickRef,
                      copy: clickRef != null,
                      copyMessage: 'تم نسخ مرجع Click',
                    ),
                    _infoLine(
                      'آخر تحديث مؤكد من Click',
                      businessDate(
                        o['shippingStatusUpdatedAt'] ?? o['clickStatusDate'],
                      ),
                    ),
                    _infoLine('آخر مزامنة', businessDate(o['lastSyncAt'])),
                    _infoLine(
                      'مصدر حالة الشحنة',
                      _sourceLabel(o['shippingStatusSource']),
                    ),
                    _infoLine('ملاحظة شركة التوصيل', o['clickStatusNote']),
                    if (o['amount'] != null)
                      const Padding(
                        padding: EdgeInsets.only(bottom: 8),
                        child: Text(
                          'قيمة الطلب المسجلة ليست مبلغ التحصيل أو صافي التسوية.',
                          style: TextStyle(color: VColors.muted, fontSize: 11),
                        ),
                      ),
                    const SizedBox(height: 4),
                    FilledButton.tonalIcon(
                      onPressed: canSync && !actionBusy ? _syncClick : null,
                      icon: const Icon(Icons.sync),
                      label: const Text('مزامنة الحالة'),
                    ),
                    if (!canSync)
                      const Padding(
                        padding: EdgeInsets.only(top: 6),
                        child: Text(
                          'المزامنة متاحة بعد ربط الشحنة وامتلاك صلاحية الإرسال.',
                          style: TextStyle(color: VColors.muted, fontSize: 11),
                        ),
                      ),
                    if (_syncFeedback != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Text(
                          _syncFeedback!,
                          style: TextStyle(
                            color: _syncFeedbackOk
                                ? VColors.aqua
                                : VColors.danger,
                            fontWeight: FontWeight.w700,
                            fontSize: 12,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            if (isClick) const SizedBox(height: 12),
            VLivePanel(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _sectionTitle('الإجراءات', Icons.bolt_outlined),
                  AbsorbPointer(
                    absorbing: actionBusy,
                    child: Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        OutlinedButton.icon(
                          onPressed: () async {
                            try {
                              final latest = await VelnixGateway.instance.order(
                                widget.id,
                              );
                              final branding = await VelnixGateway.instance
                                  .call('getSettings');
                              if (!context.mounted) return;
                              Navigator.push(
                                context,
                                MaterialPageRoute<void>(
                                  builder: (_) => OrderPrintScreen(
                                    order: Map<String, dynamic>.from(
                                      latest['order'] as Map,
                                    )..addAll(branding),
                                  ),
                                ),
                              );
                            } catch (e) {
                              if (context.mounted) showError(context, e);
                            }
                          },
                          icon: const Icon(Icons.print_outlined),
                          label: const Text('طباعة / PDF / باركود'),
                        ),
                        if (actions['statuses'] is List)
                          for (final t
                              in (actions['statuses'] as List).cast<String>())
                            OutlinedButton(
                              onPressed: () => _changeStatus(t),
                              child: Text(
                                t == 'delivered'
                                    ? 'إكمال الطلب الداخلي'
                                    : 'تحويل إلى ${statusLabels[t]}',
                              ),
                            ),
                        if (actions['edit'] == true)
                          OutlinedButton.icon(
                            onPressed: () => Navigator.push(
                              context,
                              MaterialPageRoute<void>(
                                builder: (_) => LiveOrderForm(
                                  policy: widget.policy,
                                  initial: o,
                                  onSaved: () {
                                    Navigator.pop(context);
                                    refresh();
                                  },
                                ),
                              ),
                            ),
                            icon: const Icon(Icons.edit_outlined),
                            label: const Text('تعديل'),
                          ),
                        if (actions['assign'] == true)
                          OutlinedButton.icon(
                            onPressed: () => _chooseCompany(o),
                            icon: const Icon(Icons.local_shipping_outlined),
                            label: const Text('اختيار شركة توصيل'),
                          ),
                        if (actions['dispatch'] == true)
                          FilledButton.icon(
                            onPressed: _confirmDispatch,
                            icon: const Icon(Icons.send),
                            label: Text(
                              isClick
                                  ? 'إرسال إلى Click'
                                  : 'إرسال لشركة التوصيل',
                            ),
                          ),
                        if (actions['resolve'] == true)
                          OutlinedButton.icon(
                            onPressed: _resolveDispatch,
                            icon: const Icon(Icons.fact_check_outlined),
                            label: const Text('مراجعة إرسال غير مؤكد'),
                          ),
                        if (isClick &&
                            o['providerOrderId'] == null &&
                            widget.policy.can('sendToDelivery'))
                          OutlinedButton.icon(
                            onPressed: _reconcileClick,
                            icon: const Icon(Icons.link),
                            label: const Text('ربط شحنة Click موجودة'),
                          ),
                      ],
                    ),
                  ),
                  if (actionBusy) const LinearProgressIndicator(),
                  if (hint != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 10),
                      child: Text(
                        hint,
                        style: const TextStyle(
                          color: VColors.muted,
                          fontSize: 11.5,
                          height: 1.4,
                        ),
                      ),
                    ),
                  if (o['dispatchState'] == 'needs_review')
                    const Padding(
                      padding: EdgeInsets.only(top: 8),
                      child: Text(
                        'تحذير: يجب التحقق من شركة التوصيل قبل إعادة إرسال الشحنة لمنع الازدواج.',
                        style: TextStyle(
                          color: VColors.danger,
                          fontWeight: FontWeight.w800,
                          fontSize: 11.5,
                        ),
                      ),
                    ),
                  if (o['syncError'] != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Text(
                        o['syncError'].toString(),
                        style: const TextStyle(
                          color: VColors.danger,
                          fontSize: 11.5,
                        ),
                      ),
                    ),
                  const SizedBox(height: 8),
                  const Text(
                    'الحالات القادمة من شركة التوصيل تُحدّث في الخادم، ولا يُسمح بتزويرها يدوياً.',
                    style: TextStyle(color: VColors.muted, fontSize: 11),
                  ),
                ],
              ),
            ),
            if (canTechnical) const SizedBox(height: 12),
            if (canTechnical)
              VLivePanel(
                child: Theme(
                  data: Theme.of(
                    context,
                  ).copyWith(dividerColor: Colors.transparent),
                  child: ExpansionTile(
                    tilePadding: EdgeInsets.zero,
                    childrenPadding: const EdgeInsets.only(bottom: 8),
                    title: _sectionTitle('تفاصيل تقنية', Icons.code_outlined),
                    children: [
                      _infoLine('رقم الطلب الداخلي', o['id']),
                      _infoLine('معرف شركة التوصيل الداخلي', o['companyId']),
                      _infoLine('حالة الإرسال الداخلي', o['dispatchState']),
                      _infoLine(
                        'المرجع الأصلي لكود التاجر',
                        o['clickClientSerial'],
                      ),
                      _infoLine('الحالة الخام من Click', o['clickStatusRaw']),
                      _infoLine('تاريخ حالة Click', o['clickStatusDate']),
                      if (o['clickAmounts'] is Map)
                        _infoLine(
                          'مبالغ Click الخام (غير معتمدة)',
                          (o['clickAmounts'] as Map).entries
                              .map((e) => '${e.key}=${e.value}')
                              .join(' • '),
                        ),
                      _infoLine(
                        'آخر محاولة مزامنة',
                        businessDate(o['lastSyncAttemptAt']),
                      ),
                      _infoLine('تشخيص المزامنة', o['syncError']),
                      _infoLine('رقم إصدار السجل', o['revision']),
                      _infoLine(
                        'آخر تحديث داخلي',
                        businessDate(o['updatedAt']),
                      ),
                      _infoLine('باركود الطلب', o['barcodeValue']),
                    ],
                  ),
                ),
              ),
          ],
        );

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
                  VLivePanel(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        LayoutBuilder(
                          builder: (context, box) {
                            const avatar = CircleAvatar(
                              radius: 24,
                              backgroundColor: VColors.softBlue,
                              child: Icon(
                                Icons.person_outline,
                                color: VColors.brand,
                                size: 27,
                              ),
                            );
                            if (box.maxWidth < 600) {
                              return Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  Row(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      avatar,
                                      const SizedBox(width: 12),
                                      Expanded(child: customerInfo),
                                    ],
                                  ),
                                  const SizedBox(height: 8),
                                  Row(
                                    children: [
                                      Flexible(child: _statusChip(state)),
                                      const Spacer(),
                                      IconButton(
                                        tooltip: 'تحديث',
                                        onPressed: refresh,
                                        icon: const Icon(Icons.refresh),
                                      ),
                                    ],
                                  ),
                                ],
                              );
                            }
                            return Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                avatar,
                                const SizedBox(width: 12),
                                Expanded(child: customerInfo),
                                Flexible(child: _statusChip(state)),
                                IconButton(
                                  tooltip: 'تحديث',
                                  onPressed: refresh,
                                  icon: const Icon(Icons.refresh),
                                ),
                              ],
                            );
                          },
                        ),
                        const SizedBox(height: 10),
                        LayoutBuilder(
                          builder: (context, box) {
                            final facts = <Widget>[
                              _infoLine(
                                'المبلغ',
                                o['amount'] != null
                                    ? displayAmount(o['amount'])
                                    : 'غير متاح',
                              ),
                              _infoLine(
                                'شركة التوصيل',
                                company?.isNotEmpty == true
                                    ? company
                                    : 'بدون شركة',
                              ),
                              _infoLine(
                                'رقم البوليصة',
                                policyNumber,
                                copy: policyNumber != null,
                                copyMessage: 'تم نسخ رقم البوليصة',
                              ),
                              _infoLine('تاريخ الإنشاء', created),
                              _infoLine(
                                'مصدر الإكمال',
                                o['completionSource'] == 'internal'
                                    ? 'إكمال داخلي بواسطة موظف مخوّل'
                                    : o['completionSource'] == null
                                    ? null
                                    : 'تأكيد شركة التوصيل',
                              ),
                            ];
                            if (box.maxWidth < 700) {
                              return Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: facts,
                              );
                            }
                            return Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.stretch,
                                    children: [
                                      facts[0],
                                      facts[3],
                                      if (facts.length > 4) facts[4],
                                    ],
                                  ),
                                ),
                                const SizedBox(width: 20),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.stretch,
                                    children: [facts[1]],
                                  ),
                                ),
                                const SizedBox(width: 20),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.stretch,
                                    children: [facts[2]],
                                  ),
                                ),
                              ],
                            );
                          },
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  LayoutBuilder(
                    builder: (context, box) {
                      if (box.maxWidth < 980) {
                        return Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [left, const SizedBox(height: 12), right],
                        );
                      }
                      return Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(flex: 3, child: left),
                          const SizedBox(width: 12),
                          Expanded(flex: 2, child: right),
                        ],
                      );
                    },
                  ),
                ],
              ),
            ),
          ),
        );
      },
    ),
  );

  Future<void> _resolveDispatch() async {
    final reason = TextEditingController(), tracking = TextEditingController();
    String outcome = 'not_created';
    try {
      final decision = await showDialog<Map<String, String>>(
        context: context,
        builder: (ctx) => StatefulBuilder(
          builder: (ctx, setDialog) => AlertDialog(
            title: const Text('مراجعة الشحنة لدى شركة التوصيل'),
            content: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text(
                      'تحقق فعلياً من حساب شركة التوصيل قبل القرار. لا تعِد إرسال الشحنة تلقائياً.',
                    ),
                    DropdownButtonFormField<String>(
                      initialValue: outcome,
                      isExpanded: true,
                      decoration: const InputDecoration(
                        labelText: 'نتيجة مراجعة الشركة',
                      ),
                      items: const [
                        DropdownMenuItem(
                          value: 'not_created',
                          child: Text('لم تُنشأ شحنة'),
                        ),
                        DropdownMenuItem(
                          value: 'shipment_exists',
                          child: Text('الشحنة موجودة'),
                        ),
                      ],
                      onChanged: (value) =>
                          setDialog(() => outcome = value ?? 'not_created'),
                    ),
                    if (outcome == 'shipment_exists')
                      TextField(
                        controller: tracking,
                        decoration: const InputDecoration(
                          labelText: 'رقم تتبع الشركة',
                        ),
                        textDirection: TextDirection.ltr,
                      ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: reason,
                      maxLines: 2,
                      decoration: const InputDecoration(
                        labelText: 'تفاصيل التحقق / رقم البلاغ (10 أحرف فأكثر)',
                      ),
                    ),
                  ],
                ),
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('رجوع'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(ctx, {
                  'outcome': outcome,
                  'reason': reason.text.trim(),
                  'trackingNumber': tracking.text.trim(),
                }),
                child: const Text('حفظ المراجعة'),
              ),
            ],
          ),
        ),
      );
      if (decision != null) {
        if ((decision['reason'] ?? '').length < 10 ||
            (decision['outcome'] == 'shipment_exists' &&
                (decision['trackingNumber'] ?? '').isEmpty)) {
          if (mounted) {
            showError(
              context,
              'أدخل تفاصيل التحقق ورقم التتبع عند وجود الشحنة',
            );
          }
          return;
        }
        await action(
          () => VelnixGateway.instance.resolveDispatchException(
            widget.id,
            outcome: decision['outcome']!,
            reason: decision['reason']!,
            trackingNumber: decision['outcome'] == 'shipment_exists'
                ? decision['trackingNumber']
                : null,
          ),
        );
      }
    } finally {
      reason.dispose();
      tracking.dispose();
    }
  }

  Future<void> _syncClick() async {
    if (actionBusy) return;
    setState(() {
      actionBusy = true;
      _syncFeedback = null;
    });
    try {
      await VelnixGateway.instance.syncClickOrder(widget.id);
      if (mounted) {
        setState(() {
          _syncFeedback = 'تمت مزامنة حالة Click بنجاح.';
          _syncFeedbackOk = true;
        });
        refresh();
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _syncFeedback = 'تعذر تحديث حالة Click: $e';
          _syncFeedbackOk = false;
        });
      }
    } finally {
      if (mounted) setState(() => actionBusy = false);
    }
  }

  Future<void> _reconcileClick() async {
    final clickOrderId = TextEditingController(),
        clickOrderRef = TextEditingController(),
        clickClientSerial = TextEditingController(),
        reason = TextEditingController();
    var state = ShippingStatus.awaitingPickup;
    try {
      final decision = await showDialog<Map<String, String>>(
        context: context,
        builder: (ctx) => StatefulBuilder(
          builder: (ctx, setDialog) => AlertDialog(
            title: const Text('ربط شحنة Click موجودة'),
            content: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text(
                      'أدخل رقم البوليصة ومرجع Click (Order_ID) والحالة المؤكدة من البوابة. لن يُنشئ هذا الإجراء شحنة جديدة.',
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: clickOrderId,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        labelText: 'رقم البوليصة في Click (مثال 1318368)',
                      ),
                      textDirection: TextDirection.ltr,
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: clickOrderRef,
                      maxLength: 25,
                      decoration: const InputDecoration(
                        labelText: 'مرجع Click (Order_ID / Client_Serial)',
                      ),
                      textDirection: TextDirection.ltr,
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: clickClientSerial,
                      decoration: const InputDecoration(
                        labelText: 'كود التاجر الأصلي الكامل (اختياري)',
                      ),
                      textDirection: TextDirection.ltr,
                    ),
                    const SizedBox(height: 8),
                    DropdownButtonFormField<ShippingStatus>(
                      initialValue: state,
                      isExpanded: true,
                      decoration: const InputDecoration(
                        labelText: 'حالة الشحنة المؤكدة',
                      ),
                      items: [
                        for (final value in ShippingStatus.values)
                          DropdownMenuItem(
                            value: value,
                            child: Text(value.label),
                          ),
                      ],
                      onChanged: (value) =>
                          setDialog(() => state = value ?? state),
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: reason,
                      maxLines: 2,
                      decoration: const InputDecoration(
                        labelText: 'مرجع التحقق / سبب الربط (10 أحرف فأكثر)',
                      ),
                    ),
                  ],
                ),
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('رجوع'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(ctx, {
                  'clickOrderId': clickOrderId.text.trim(),
                  'clickOrderRef': clickOrderRef.text.trim(),
                  'clickClientSerial': clickClientSerial.text.trim(),
                  'shippingStatus': state.name,
                  'reason': reason.text.trim(),
                }),
                child: const Text('ربط الشحنة'),
              ),
            ],
          ),
        ),
      );
      if (decision != null) {
        final ref = decision['clickOrderRef'] ?? '';
        if (!RegExp(
              r'^[0-9]{1,20}$',
            ).hasMatch(decision['clickOrderId'] ?? '') ||
            ref.isEmpty ||
            ref.length > 25 ||
            (decision['reason'] ?? '').length < 10) {
          if (mounted) {
            showError(
              context,
              'أدخل رقم البوليصة ومرجع Click (حتى 25 حرفاً) وسبب الربط (10 أحرف فأكثر)',
            );
          }
          return;
        }
        await action(
          () => VelnixGateway.instance.reconcileClickShipment(
            widget.id,
            clickOrderId: decision['clickOrderId']!,
            clickOrderRef: ref,
            clickClientSerial: (decision['clickClientSerial'] ?? '').isEmpty
                ? null
                : decision['clickClientSerial'],
            shippingStatus: decision['shippingStatus']!,
            reason: decision['reason']!,
          ),
        );
      }
    } finally {
      clickOrderId.dispose();
      clickOrderRef.dispose();
      clickClientSerial.dispose();
      reason.dispose();
    }
  }

  Future<void> _changeStatus(String target) async {
    if (target == 'cancelled' || target == 'delivered') {
      final yes = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text(
            target == 'delivered'
                ? 'تأكيد إكمال الطلب الداخلي'
                : 'تأكيد إلغاء الطلب',
          ),
          content: Text(
            target == 'delivered'
                ? 'سيُسجّل إكمال الطلب داخلياً بحالة نهائية. تأكد من تسليمه؛ هذا الإجراء لا يمثل تأكيد شركة توصيل.'
                : 'سيتم وضع الطلب بحالة ملغي مع الاحتفاظ بسجل الطلب. لا يمكن إعادة فتحه بهذه المرحلة.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('تراجع'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: Text(
                target == 'delivered' ? 'تأكيد الإكمال' : 'تأكيد الإلغاء',
              ),
            ),
          ],
        ),
      );
      if (yes != true) return;
    }
    await action(() => VelnixGateway.instance.updateStatus(widget.id, target));
  }

  Future<void> _confirmDispatch() async {
    final approved = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('تأكيد الإرسال'),
        content: const Text(
          'سيتم إرسال الطلب فعلياً إلى API الشركة. لا تعِد الإرسال إذا كان الطلب قيد المعالجة.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('رجوع'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('تأكيد'),
          ),
        ],
      ),
    );
    if (approved == true) {
      await action(() => VelnixGateway.instance.dispatch(widget.id));
    }
  }

  Future<void> _chooseCompany(Map<String, dynamic> o) async {
    try {
      final companies = await VelnixGateway.instance.companies();
      if (!mounted) return;
      final selected = await showDialog<String>(
        context: context,
        builder: (ctx) => SimpleDialog(
          title: const Text('اختيار شركة التوصيل'),
          children: [
            SimpleDialogOption(
              onPressed: () => Navigator.pop(ctx, '__none__'),
              child: const Text('بدون شركة'),
            ),
            for (final c in companies.where(
              (e) => e['enabled'] == true && e['archived'] != true,
            ))
              SimpleDialogOption(
                onPressed: () => Navigator.pop(ctx, c['id'].toString()),
                child: Text(c['name']?.toString() ?? ''),
              ),
          ],
        ),
      );
      if (selected != null) {
        await action(
          () => VelnixGateway.instance.assignCompany(
            widget.id,
            selected == '__none__' ? null : selected,
          ),
        );
      }
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }
}

class _OrderDetailSkeleton extends StatelessWidget {
  const _OrderDetailSkeleton();
  @override
  Widget build(BuildContext context) => SingleChildScrollView(
    padding: const EdgeInsets.all(16),
    child: LiveContent(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const _SkeletonCard(height: 150),
          const SizedBox(height: 12),
          LayoutBuilder(
            builder: (context, box) => box.maxWidth < 980
                ? Column(
                    children: [
                      const _SkeletonCard(height: 330),
                      const SizedBox(height: 12),
                      const _SkeletonCard(height: 300),
                    ],
                  )
                : Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        flex: 3,
                        child: const _SkeletonCard(height: 500),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        flex: 2,
                        child: const _SkeletonCard(height: 400),
                      ),
                    ],
                  ),
          ),
        ],
      ),
    ),
  );
}

class _SkeletonCard extends StatelessWidget {
  const _SkeletonCard({required this.height});
  final double height;
  @override
  Widget build(BuildContext context) => VLivePanel(
    child: Container(
      height: height,
      decoration: BoxDecoration(
        color: VColors.softBlue,
        borderRadius: BorderRadius.circular(12),
      ),
    ),
  );
}

class LiveOrderForm extends StatefulWidget {
  const LiveOrderForm({
    super.key,
    required this.policy,
    required this.onSaved,
    this.onBack,
    this.initial,
  });
  final SessionPolicy policy;
  final VoidCallback onSaved;
  final VoidCallback? onBack;
  final Map<String, dynamic>? initial;
  @override
  State<LiveOrderForm> createState() => _LiveOrderFormState();
}

class _LiveOrderFormState extends State<LiveOrderForm> {
  final form = GlobalKey<FormState>();
  final inputs = <String, TextEditingController>{};
  bool busy = false;
  bool _dirty = false;
  String? city;
  bool _leaving = false;
  final String _requestKey = List.generate(
    5,
    (_) => Random.secure().nextInt(1 << 30).toRadixString(36).padLeft(6, '0'),
  ).join();
  late String paymentMethod =
      widget.initial?['paymentMethod']?.toString() ?? 'عند الاستلام';
  final names = const {
    'customer': 'اسم المستلم',
    'phone': 'رقم الهاتف',
    'extraPhone': 'هاتف إضافي',
    'city': 'المحافظة',
    'area': 'المنطقة',
    'address': 'العنوان التفصيلي',
    'description': 'وصف محتويات الطلب',
    'quantity': 'الكمية',
    'amount': 'المبلغ (دينار أردني)',
    'note': 'ملاحظات',
  };
  @override
  void initState() {
    super.initState();
    city = widget.initial?['city']?.toString();
    for (final key in names.keys) {
      inputs[key] = TextEditingController(
        text:
            widget.initial?[key]?.toString() ?? (key == 'quantity' ? '1' : ''),
      );
    }
  }

  @override
  void dispose() {
    for (final c in inputs.values) {
      c.dispose();
    }
    super.dispose();
  }

  bool get _showAmount =>
      widget.initial == null ||
      widget.policy.viewAmounts ||
      widget.initial?['createdBy'] == widget.policy.id;
  String normalizedNumber(String value) {
    const ar = '٠١٢٣٤٥٦٧٨٩', fa = '۰۱۲۳۴۵۶۷۸۹';
    return value.replaceAllMapped(RegExp(r'[٠-٩۰-۹٫]'), (m) {
      final v = m.group(0)!;
      if (v == '٫') return '.';
      final a = ar.indexOf(v), f = fa.indexOf(v);
      return (a >= 0 ? a : f).toString();
    });
  }

  Future<void> _leave() async {
    if (_leaving) return;
    if (_dirty && !await confirmDiscardChanges(context)) return;
    if (!mounted) return;
    _leaving = true;
    _dirty = false;
    if (widget.onBack != null) {
      widget.onBack!();
    } else {
      Navigator.pop(context);
    }
  }

  Future<void> save() async {
    if (!form.currentState!.validate() || busy) return;
    setState(() => busy = true);
    final map = <String, dynamic>{
      for (final k in names.keys)
        k: k == 'city' ? (city ?? '') : inputs[k]!.text.trim(),
      'paymentMethod': paymentMethod,
    };
    map['phone'] = normalizedNumber(map['phone']!.toString());
    map['extraPhone'] = normalizedNumber(map['extraPhone']!.toString());
    try {
      if (_showAmount) {
        map['amount'] = double.parse(
          normalizedNumber(inputs['amount']!.text.trim()),
        );
      } else {
        map.remove('amount');
      }
      map['quantity'] = int.parse(
        normalizedNumber(inputs['quantity']!.text.trim()),
      );
      if (widget.initial == null) {
        await VelnixGateway.instance.createOrder({
          ...map,
          'requestKey': _requestKey,
        });
      } else {
        await VelnixGateway.instance.updateOrder(
          widget.initial!['id'].toString(),
          {...map, 'revision': widget.initial!['revision'] ?? 0},
        );
      }
      if (mounted) {
        _dirty = false;
        showSuccess(context, 'تم حفظ الطلب');
        widget.onSaved();
      }
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  String _label(String key) =>
      '${names[key]}${['extraPhone', 'note'].contains(key) ? ' (اختياري)' : ' *'}';

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: widget.onBack == null && !_dirty,
    onPopInvokedWithResult: (didPop, result) async {
      if (didPop) return;
      await _leave();
    },
    child: Scaffold(
      appBar: widget.initial == null
          ? null
          : AppBar(
              leading: BackButton(onPressed: _leave),
              title: const Text('تعديل الطلب'),
            ),
      body: SingleChildScrollView(
        child: LiveContent(
          child: Form(
            key: form,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (widget.initial == null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Row(
                      children: [
                        BackButton(onPressed: _leave),
                        const SizedBox(width: 4),
                        Expanded(
                          child: Text(
                            'إضافة طلب جديد',
                            style: Theme.of(context).textTheme.headlineSmall,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  ),
                VLivePanel(
                  child: LayoutBuilder(
                    builder: (context, box) {
                      final wide = box.maxWidth >= 620;
                      final width = wide
                          ? (box.maxWidth - 16) / 2
                          : box.maxWidth;
                      return Wrap(
                        spacing: 16,
                        runSpacing: 12,
                        children: [
                          SizedBox(
                            width: width,
                            child: FormField<String>(
                              validator: (_) => city == null || city!.isEmpty
                                  ? 'اختر المحافظة'
                                  : null,
                              builder: (field) => Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  DropdownMenu<String>(
                                    initialSelection: city,
                                    requestFocusOnTap: true,
                                    enableFilter: true,
                                    expandedInsets: EdgeInsets.zero,
                                    label: const Text('المحافظة *'),
                                    dropdownMenuEntries: [
                                      for (final governorate
                                          in jordanGovernorates)
                                        DropdownMenuEntry(
                                          value: governorate,
                                          label: governorate,
                                        ),
                                      if (city != null &&
                                          !jordanGovernorates.contains(city))
                                        DropdownMenuEntry(
                                          value: city!,
                                          label: '${city!} (قيمة قديمة)',
                                        ),
                                    ],
                                    onSelected: (value) {
                                      setState(() {
                                        city = value;
                                        _dirty = true;
                                      });
                                      field.didChange(value);
                                    },
                                  ),
                                  if (field.hasError)
                                    Padding(
                                      padding: const EdgeInsets.only(
                                        top: 6,
                                        right: 12,
                                      ),
                                      child: Text(
                                        field.errorText!,
                                        style: const TextStyle(
                                          color: VColors.danger,
                                          fontSize: 12,
                                        ),
                                      ),
                                    ),
                                ],
                              ),
                            ),
                          ),
                          for (final entry in names.entries)
                            if (entry.key != 'city' &&
                                (entry.key != 'amount' || _showAmount))
                              SizedBox(
                                width: width,
                                child: TextFormField(
                                  controller: inputs[entry.key],
                                  onChanged: (_) =>
                                      setState(() => _dirty = true),
                                  textDirection:
                                      [
                                        'phone',
                                        'extraPhone',
                                        'quantity',
                                        'amount',
                                      ].contains(entry.key)
                                      ? TextDirection.ltr
                                      : TextDirection.rtl,
                                  maxLength: const {
                                    'customer': 120,
                                    'phone': 30,
                                    'extraPhone': 30,
                                    'city': 80,
                                    'area': 120,
                                    'address': 240,
                                    'description': 500,
                                    'note': 600,
                                    'quantity': 5,
                                    'amount': 11,
                                  }[entry.key],
                                  keyboardType: entry.key == 'amount'
                                      ? const TextInputType.numberWithOptions(
                                          decimal: true,
                                        )
                                      : entry.key == 'quantity'
                                      ? TextInputType.number
                                      : entry.key.toLowerCase().contains(
                                          'phone',
                                        )
                                      ? TextInputType.phone
                                      : TextInputType.text,
                                  inputFormatters:
                                      entry.key == 'phone' ||
                                          entry.key == 'extraPhone'
                                      ? [
                                          FilteringTextInputFormatter.allow(
                                            RegExp(r'[0-9٠-٩۰-۹+\- ()]'),
                                          ),
                                        ]
                                      : entry.key == 'quantity'
                                      ? [
                                          FilteringTextInputFormatter.allow(
                                            RegExp(r'[0-9٠-٩۰-۹]'),
                                          ),
                                        ]
                                      : entry.key == 'amount'
                                      ? [
                                          FilteringTextInputFormatter.allow(
                                            RegExp(r'[0-9٠-٩۰-۹.٫]'),
                                          ),
                                        ]
                                      : null,
                                  decoration: InputDecoration(
                                    labelText: _label(entry.key),
                                  ),
                                  maxLines:
                                      entry.key == 'note' ||
                                          entry.key == 'description'
                                      ? 2
                                      : 1,
                                  validator: (v) {
                                    if (![
                                          'note',
                                          'extraPhone',
                                        ].contains(entry.key) &&
                                        (v == null || v.trim().isEmpty)) {
                                      return 'الحقل مطلوب';
                                    }
                                    if (entry.key == 'phone' ||
                                        entry.key == 'extraPhone') {
                                      final phone = normalizedNumber(
                                        v ?? '',
                                      ).replaceAll(RegExp(r'[ ()\-]'), '');
                                      if (phone.isNotEmpty &&
                                          !RegExp(
                                            r'^\+?[0-9]{7,15}$',
                                          ).hasMatch(phone)) {
                                        return 'أدخل 7 إلى 15 رقماً مع رمز الدولة إن وجد';
                                      }
                                    }
                                    if (entry.key == 'quantity') {
                                      final quantity = int.tryParse(
                                        normalizedNumber(v ?? ''),
                                      );
                                      if (quantity == null ||
                                          quantity < 1 ||
                                          quantity > 10000) {
                                        return 'الكمية من 1 إلى 10000';
                                      }
                                    }
                                    if (entry.key == 'amount') {
                                      final text = normalizedNumber(v ?? '');
                                      final amount = double.tryParse(text);
                                      if (!RegExp(
                                            r'^\d+(?:\.\d{1,3})?$',
                                          ).hasMatch(text) ||
                                          amount == null ||
                                          !amount.isFinite ||
                                          amount < 0 ||
                                          amount > 1000000) {
                                        return 'أدخل مبلغاً صالحاً حتى ثلاث منازل عشرية';
                                      }
                                    }
                                    return null;
                                  },
                                ),
                              ),
                        ],
                      );
                    },
                  ),
                ),
                const SizedBox(height: 16),
                FilledButton.icon(
                  onPressed: busy ? null : save,
                  icon: const Icon(Icons.save_outlined),
                  label: Text(busy ? 'جارٍ الحفظ...' : 'حفظ الطلب'),
                ),
                const SizedBox(height: 20),
              ],
            ),
          ),
        ),
      ),
    ),
  );
}
