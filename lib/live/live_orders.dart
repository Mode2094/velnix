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
      if (mounted && generation == current) setState(() => error = '$e');
    } finally {
      if (mounted && generation == current) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final visible = rows;
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
                child: Column(
                  children: [
                    LayoutBuilder(
                      builder: (context, box) {
                        final wide = box.maxWidth > 680;
                        final a = DropdownButtonFormField<String>(
                          isExpanded: true,

                          initialValue: bucket,
                          decoration: const InputDecoration(
                            labelText: 'مجموعة الطلبات',
                          ),
                          items: const [
                            DropdownMenuItem(
                              value: 'all',
                              child: Text('كل الطلبات'),
                            ),
                            DropdownMenuItem(
                              value: 'delivery',
                              child: Text('شركات التوصيل'),
                            ),
                            DropdownMenuItem(
                              value: 'internal',
                              child: Text('غير المسندة'),
                            ),
                          ],
                          onChanged: (v) {
                            setState(() => bucket = v ?? 'all');
                            load(reset: true);
                          },
                        );
                        final b = DropdownButtonFormField<String>(
                          isExpanded: true,

                          initialValue: status ?? 'all',
                          decoration: const InputDecoration(
                            labelText: 'حالة الطلب',
                          ),
                          items: [
                            const DropdownMenuItem(
                              value: 'all',
                              child: Text('جميع الحالات'),
                            ),
                            ...statusLabels.entries.map(
                              (e) => DropdownMenuItem(
                                value: e.key,
                                child: Text(e.value),
                              ),
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
                            : Column(
                                children: [a, const SizedBox(height: 9), b],
                              );
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
                      decoration: const InputDecoration(
                        labelText: 'ترتيب الإنشاء',
                      ),
                      items: const [
                        DropdownMenuItem(
                          value: 'desc',
                          child: Text('الأحدث أولاً'),
                        ),
                        DropdownMenuItem(
                          value: 'asc',
                          child: Text('الأقدم أولاً'),
                        ),
                      ],
                      onChanged: search.text.trim().length >= 2
                          ? null
                          : (value) {
                              sort = value ?? 'desc';
                              load(reset: true);
                            },
                    ),
                    const SizedBox(height: 10),
                    TextField(
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
                    ),
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
                    const SizedBox(height: 8),
                    const Text(
                      'البحث على الخادم. اضغط بحث في لوحة المفاتيح. الاسم من حرفين، والهاتف برقم كامل؛ تظهر أول 50 نتيجة.',
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
    return VLivePanel(
      child: InkWell(
        onTap: () => Navigator.push(
          context,
          MaterialPageRoute<void>(
            builder: (_) =>
                LiveOrderDetail(id: o['id'].toString(), policy: widget.policy),
          ),
        ).then((_) => load(reset: true)),
        child: Padding(
          padding: const EdgeInsets.all(2),
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
              const SizedBox(height: 7),
              Text(
                'طلب #${o['id']} • ${o['city'] ?? ''} / ${o['area'] ?? ''}',
                style: const TextStyle(color: VColors.muted, fontSize: 12),
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 12,
                runSpacing: 6,
                children: [
                  Text(
                    '${o['description'] ?? ''}',
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
                ],
              ),
              const SizedBox(height: 8),
              const Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  Flexible(
                    child: Text(
                      'فتح تفاصيل الطلب',
                      style: TextStyle(color: VColors.brand, fontSize: 12),
                    ),
                  ),
                  SizedBox(width: 6),
                  Icon(
                    Icons.arrow_back_ios_new,
                    size: 12,
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
  bool actionBusy = false;
  @override
  void initState() {
    super.initState();
    reload();
  }

  void reload() => request = VelnixGateway.instance.order(widget.id);
  void refresh() {
    setState(reload);
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
      builder: (data) {
        final o = Map<String, dynamic>.from(data['order'] as Map),
            state = o['status'].toString();
        final actions = Map<String, dynamic>.from(o['actions'] as Map? ?? {});
        final events = (data['events'] as List? ?? [])
            .map((v) => Map<String, dynamic>.from(v as Map))
            .toList();
        return SingleChildScrollView(
          child: LiveContent(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                VLivePanel(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        o['customer']?.toString() ?? '',
                        style: const TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'رقم الطلب: ${o['id']}',
                        style: const TextStyle(color: VColors.muted),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'الحالة: ${statusLabels[state] ?? state}',
                        style: TextStyle(
                          color: statusColors[state],
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const Divider(height: 25),
                      ...{
                            'الهاتف': o['phone'],
                            'رقم إضافي': o['extraPhone'],
                            'العنوان':
                                '${o['city']}، ${o['area']}، ${o['address']}',
                            'المحتويات': o['description'],
                            'الكمية': o['quantity'],
                            'طريقة الدفع': o['paymentMethod'],
                            'شركة التوصيل': o['companyName'],
                            if (o['companyProvider'] == 'click_delivery_v1')
                              'حالة الشحنة':
                                  ShippingStatus.parse(
                                    o['shippingStatus'],
                                  )?.label ??
                                  'غير مؤكدة؛ لم يكتمل عقد Click Delivery',
                            if (o['companyProvider'] == 'click_delivery_v1' &&
                                o['amount'] != null)
                              'التحصيل ورسوم التوصيل':
                                  'غير مؤكدة؛ قيمة الطلب المسجلة ليست مبلغ التحصيل أو صافي التسوية',
                            'رقم التتبع': o['trackingNumber'],
                            if (o['lastSyncAt'] != null)
                              'آخر مزامنة': businessDate(o['lastSyncAt']),
                            if (o['lastSyncAttemptAt'] != null)
                              'آخر محاولة مزامنة': businessDate(
                                o['lastSyncAttemptAt'],
                              ),
                            if (o['completionSource'] != null)
                              'مصدر الإكمال':
                                  o['completionSource'] == 'internal'
                                  ? 'إكمال داخلي بواسطة موظف مخوّل'
                                  : 'تأكيد شركة التوصيل',
                            if (o['amount'] != null)
                              'المبلغ': displayAmount(o['amount']),
                            'ملاحظات': o['note'],
                          }.entries
                          .where(
                            (e) =>
                                e.value != null &&
                                e.value.toString().isNotEmpty,
                          )
                          .map(
                            (e) => Padding(
                              padding: const EdgeInsets.only(bottom: 9),
                              child: Text(
                                '${e.key}: ${e.value}',
                                style: const TextStyle(fontSize: 13),
                              ),
                            ),
                          ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                VLivePanel(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Text(
                        'إجراءات الطلب',
                        style: TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      const SizedBox(height: 12),
                      AbsorbPointer(
                        absorbing: actionBusy,
                        child: Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            OutlinedButton.icon(
                              onPressed: () async {
                                try {
                                  final latest = await VelnixGateway.instance
                                      .order(widget.id);
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
                                  in (actions['statuses'] as List)
                                      .cast<String>())
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
                                onPressed: () => _confirmDispatch(),
                                icon: const Icon(Icons.send),
                                label: const Text('إرسال لشركة التوصيل'),
                              ),
                            if (actions['resolve'] == true)
                              OutlinedButton.icon(
                                onPressed: () => _resolveDispatch(),
                                icon: const Icon(Icons.fact_check_outlined),
                                label: const Text('مراجعة إرسال غير مؤكد'),
                              ),
                          ],
                        ),
                      ),
                      if (actionBusy) const LinearProgressIndicator(),
                      if (o['dispatchState'] == 'needs_review')
                        const Padding(
                          padding: EdgeInsets.only(top: 9),
                          child: Text(
                            'تحذير: يجب التحقق من شركة التوصيل قبل إعادة إرسال الشحنة لمنع الازدواج.',
                            style: TextStyle(
                              color: VColors.danger,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                      if (o['syncError'] != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 9),
                          child: Text(
                            o['syncError'].toString(),
                            style: const TextStyle(color: VColors.danger),
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
                const SizedBox(height: 14),
                VLivePanel(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Text(
                        'سجل الحركة',
                        style: TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      const SizedBox(height: 8),
                      for (final e in events)
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: const Icon(
                            Icons.history,
                            color: VColors.brand,
                          ),
                          title: Text(eventLabel(e['action'])),
                          subtitle: Text(
                            '${e['actorName'] ?? ''} • ${businessDate(e['createdAt'])}',
                          ),
                        ),
                      if (events.isEmpty)
                        const Text(
                          'لا توجد أحداث',
                          style: TextStyle(color: VColors.muted),
                        ),
                    ],
                  ),
                ),
              ],
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

class LiveOrderForm extends StatefulWidget {
  const LiveOrderForm({
    super.key,
    required this.policy,
    required this.onSaved,
    this.initial,
  });
  final SessionPolicy policy;
  final VoidCallback onSaved;
  final Map<String, dynamic>? initial;
  @override
  State<LiveOrderForm> createState() => _LiveOrderFormState();
}

class _LiveOrderFormState extends State<LiveOrderForm> {
  final form = GlobalKey<FormState>();
  final inputs = <String, TextEditingController>{};
  bool busy = false;
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

  Future<void> save() async {
    if (!form.currentState!.validate() || busy) return;
    setState(() => busy = true);
    final map = <String, dynamic>{
      for (final k in names.keys) k: inputs[k]!.text.trim(),
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
        showSuccess(context, 'تم حفظ الطلب');
        widget.onSaved();
      }
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: widget.initial != null
        ? AppBar(title: const Text('تعديل الطلب'))
        : null,
    body: SingleChildScrollView(
      child: LiveContent(
        child: Form(
          key: form,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                widget.initial == null ? 'إضافة طلب جديد' : 'تعديل الطلب',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 16),
              VLivePanel(
                child: LayoutBuilder(
                  builder: (context, box) {
                    final wide = box.maxWidth >= 620;
                    final width = wide ? (box.maxWidth - 16) / 2 : box.maxWidth;
                    return Wrap(
                      spacing: 16,
                      runSpacing: 12,
                      children: [
                        for (final entry in names.entries)
                          if (entry.key != 'amount' || _showAmount)
                            SizedBox(
                              width: width,
                              child: TextFormField(
                                controller: inputs[entry.key],
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
                                    : entry.key.toLowerCase().contains('phone')
                                    ? TextInputType.phone
                                    : TextInputType.text,
                                decoration: InputDecoration(
                                  labelText: entry.value,
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
              const SizedBox(height: 12),
              VLivePanel(
                child: DropdownButtonFormField<String>(
                  isExpanded: true,

                  initialValue:
                      ['عند الاستلام', 'مدفوع مسبقاً'].contains(paymentMethod)
                      ? paymentMethod
                      : 'عند الاستلام',
                  decoration: const InputDecoration(labelText: 'طريقة الدفع'),
                  items: const [
                    DropdownMenuItem(
                      value: 'عند الاستلام',
                      child: Text('عند الاستلام'),
                    ),
                    DropdownMenuItem(
                      value: 'مدفوع مسبقاً',
                      child: Text('مدفوع مسبقاً'),
                    ),
                  ],
                  onChanged: (value) =>
                      setState(() => paymentMethod = value ?? 'عند الاستلام'),
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
  );
}
