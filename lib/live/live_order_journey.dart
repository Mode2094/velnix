part of 'live_app.dart';

/// The single, guided fulfilment journey for one order.
///
/// Every step is explicit: opening the screen never changes a status. The
/// screen refetches the order after each action and advances in place, so the
/// employee completes review → preparation → readiness → company → send →
/// tracking without leaving the flow. Server rules and permissions remain the
/// only source of truth; the UI only offers the step the server allows.
class LiveOrderJourney extends StatefulWidget {
  const LiveOrderJourney({
    super.key,
    required this.orderId,
    required this.policy,
    this.initialOrder,
  });
  final String orderId;
  final SessionPolicy policy;
  final Map<String, dynamic>? initialOrder;
  @override
  State<LiveOrderJourney> createState() => _LiveOrderJourneyState();
}

class _LiveOrderJourneyState extends State<LiveOrderJourney> {
  late Future<Map<String, dynamic>> request;
  bool busy = false;
  String? note;
  bool noteOk = true;

  @override
  void initState() {
    super.initState();
    reload();
  }

  void reload({bool fresh = true}) {
    request = VelnixGateway.instance.order(widget.orderId, fresh: fresh);
  }

  Future<void> _run(
    Future<void> Function() operation, {
    required String success,
  }) async {
    if (busy) return;
    setState(() {
      busy = true;
      note = null;
    });
    try {
      await operation();
      if (!mounted) return;
      setState(() {
        note = success;
        noteOk = true;
        reload();
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          note = e.toString();
          noteOk = false;
        });
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _changeStatus(String target, String success) {
    return _run(
      () => VelnixGateway.instance.updateStatus(widget.orderId, target),
      success: success,
    );
  }

  Future<void> _chooseCompany(Map<String, dynamic> order) async {
    try {
      final companies = await VelnixGateway.instance.companies();
      if (!mounted) return;
      // Only active, non-archived carriers may be assigned.
      final available = companies
          .where((c) => c['enabled'] == true && c['archived'] != true)
          .toList();
      final selected = await showDialog<String>(
        context: context,
        builder: (ctx) => SimpleDialog(
          title: const Text('اختيار شركة التوصيل'),
          children: [
            for (final c in available)
              SimpleDialogOption(
                onPressed: () => Navigator.pop(ctx, c['id'].toString()),
                child: Row(
                  children: [
                    const Icon(
                      Icons.local_shipping_outlined,
                      size: 18,
                      color: VColors.brand,
                    ),
                    const SizedBox(width: 8),
                    Expanded(child: Text(c['name'].toString())),
                    if (order['companyId']?.toString() == c['id'].toString())
                      const Icon(Icons.check, color: VColors.brand, size: 18),
                  ],
                ),
              ),
            if (available.isEmpty)
              const Padding(
                padding: EdgeInsets.all(16),
                child: Text(
                  'لا توجد شركات توصيل مفعّلة.',
                  style: TextStyle(color: VColors.muted),
                ),
              ),
          ],
        ),
      );
      if (selected == null || !mounted) return;
      await _run(
        () => VelnixGateway.instance.assignCompany(widget.orderId, selected),
        success: 'تم حفظ شركة التوصيل.',
      );
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  Future<void> _sendToDelivery(String companyLabel) async {
    final approved = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('تأكيد الإرسال'),
        content: Text(
          'سيتم إرسال الطلب فعليًا إلى $companyLabel. '
          'لا تعِد الإرسال إذا كان الطلب قيد المعالجة.',
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
    if (approved != true) return;
    await _run(
      () => VelnixGateway.instance.dispatch(widget.orderId),
      success: 'تم إرسال الطلب.',
    );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('متابعة وتجهيز الطلب'),
      actions: [
        IconButton(
          tooltip: 'تحديث',
          onPressed: busy ? null : () => setState(reload),
          icon: const Icon(Icons.refresh),
        ),
      ],
    ),
    body: FutureBuilder<Map<String, dynamic>>(
      future: request,
      builder: (context, snap) {
        if (snap.hasError) {
          return Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: VFeedbackPanel(
                title: 'تعذر تحميل الطلب',
                message: '${snap.error}',
                icon: Icons.error_outline,
                onRetry: () => setState(reload),
              ),
            ),
          );
        }
        if (!snap.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        final order = Map<String, dynamic>.from(snap.data!['order'] as Map);
        return _body(order);
      },
    ),
  );

  Widget _body(Map<String, dynamic> o) {
    final state = o['status']?.toString() ?? 'created';
    final dispatchState = o['dispatchState']?.toString() ?? 'idle';
    final companyId = o['companyId']?.toString();
    final companyName = o['companyName']?.toString();
    final planned = _plan(o, state, dispatchState, companyId);
    return SingleChildScrollView(
      child: LiveContent(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 620),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _progress(state, dispatchState),
                const SizedBox(height: 14),
                VLivePanel(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              o['orderNumber']?.toString() ?? '',
                              style: const TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.w900,
                                color: VColors.brand,
                              ),
                            ),
                          ),
                          _stageChip(planned.stageLabel),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Text(
                        '${o['customer'] ?? ''} • ${o['phone'] ?? ''}',
                        style: const TextStyle(color: VColors.muted),
                      ),
                      const Divider(height: 22),
                      Row(
                        children: [
                          const Icon(
                            Icons.flag_outlined,
                            size: 18,
                            color: VColors.brand,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              planned.nextStep,
                              style: const TextStyle(
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                        ],
                      ),
                      if (planned.detail != null) ...[
                        const SizedBox(height: 8),
                        Text(
                          planned.detail!,
                          style: const TextStyle(
                            color: VColors.muted,
                            fontSize: 12.5,
                          ),
                        ),
                      ],
                      const SizedBox(height: 16),
                      ..._stepWidgets(o, planned, companyName),
                    ],
                  ),
                ),
                if (note != null) ...[
                  const SizedBox(height: 10),
                  VFeedbackPanel(
                    title: noteOk ? 'تم' : 'لم تكتمل العملية',
                    message: note,
                    icon: noteOk
                        ? Icons.check_circle_outline
                        : Icons.error_outline,
                  ),
                ],
                const SizedBox(height: 12),
                _summary(o, companyName),
                const SizedBox(height: 16),
                TextButton.icon(
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.arrow_back),
                  label: const Text('رجوع إلى تفاصيل الطلب'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  List<Widget> _stepWidgets(
    Map<String, dynamic> o,
    _JourneyPlan plan,
    String? companyName,
  ) {
    if (plan.action == _JourneyAction.open) {
      return const [
        VFeedbackPanel(
          title: 'جارٍ التنفيذ',
          message:
              'تم بدء إرسال الطلب إلى شركة التوصيل؛ يرجى الانتظار دون إعادة الإرسال.',
          icon: Icons.hourglass_top_outlined,
        ),
      ];
    }
    if (plan.action == _JourneyAction.reviewDispatch) {
      return [
        FilledButton.icon(
          onPressed: busy
              ? null
              : () => _run(() async {
                  await Navigator.push(
                    context,
                    MaterialPageRoute<void>(
                      builder: (_) =>
                          _DispatchReviewSheet(orderId: widget.orderId),
                    ),
                  );
                  reload();
                }, success: 'تمت المراجعة.'),
          icon: const Icon(Icons.fact_check_outlined),
          label: const Text('مراجعة نتيجة الإرسال'),
        ),
        const SizedBox(height: 8),
        const Text(
          'لن تُعاد الشحنة تلقائيًا. تحقق من بوابة شركة التوصيل ثم اربط الشحنة الموجودة أو أكّد عدم إنشائها.',
          style: TextStyle(color: VColors.muted, fontSize: 12),
        ),
      ];
    }
    if (plan.action == _JourneyAction.track) {
      return const [
        VFeedbackPanel(
          title: 'تم إرسال الشحنة',
          message: 'تابع حالة الشحنة من قسم «تتبع الشحنة» في تفاصيل الطلب.',
          icon: Icons.local_shipping_outlined,
        ),
      ];
    }
    if (plan.action == _JourneyAction.none) {
      return [
        Text(
          plan.detail ?? 'لا توجد خطوة متاحة لحسابك في هذه المرحلة.',
          style: const TextStyle(color: VColors.muted, fontSize: 12.5),
        ),
      ];
    }
    return [
      if (plan.onPressed != null)
        FilledButton.icon(
          onPressed: busy ? null : plan.onPressed,
          icon: Icon(plan.icon),
          label: Text(plan.buttonLabel),
        )
      else
        VFeedbackPanel(
          title: 'لا يمكن المتابعة',
          message:
              plan.blockedReason ??
              'لا تملك الصلاحية المطلوبة لإتمام هذه الخطوة.',
          icon: Icons.lock_outline,
        ),
    ];
  }

  _JourneyPlan _plan(
    Map<String, dynamic> o,
    String state,
    String dispatchState,
    String? companyId,
  ) {
    final isClick =
        o['companyProvider'] == 'click_delivery_v1' || companyId != null;
    if (dispatchState == 'needs_review') {
      return const _JourneyPlan(
        stageLabel: 'تحقق مطلوب',
        nextStep: 'نتيجة الإرسال غير مؤكدة',
        detail:
            'نتيجة الإرسال غير مؤكدة. يجري التحقق من الشحنة، ولا يلزم إعادة الإرسال.',
        action: _JourneyAction.reviewDispatch,
        buttonLabel: '',
        icon: Icons.fact_check_outlined,
      );
    }
    if (dispatchState == 'sending') {
      return const _JourneyPlan(
        stageLabel: 'جارٍ الإرسال',
        nextStep: 'إرسال قيد التنفيذ',
        detail: 'لا تُعِد الإرسال؛ سيُحدّث النظام حالة الطلب تلقائيًا.',
        action: _JourneyAction.open,
        buttonLabel: '',
        icon: Icons.hourglass_top_outlined,
      );
    }
    if (dispatchState == 'sent' || state == 'dispatched') {
      return const _JourneyPlan(
        stageLabel: 'تم الإرسال',
        nextStep: 'تتبع الشحنة',
        detail: 'تم إرسال الشحنة؛ لا يمكن إعادة الإرسال أو تغيير الشركة.',
        action: _JourneyAction.track,
        buttonLabel: '',
        icon: Icons.local_shipping_outlined,
      );
    }
    if (['delivered', 'returned', 'cancelled'].contains(state)) {
      return _JourneyPlan(
        stageLabel: statusLabels[state] ?? state,
        nextStep: 'الطلب مغلق',
        detail: 'لا توجد إجراءات انتقال متاحة لهذه الحالة.',
        action: _JourneyAction.none,
        buttonLabel: '',
        icon: Icons.lock_outline,
      );
    }
    switch (state) {
      case 'created':
        return _JourneyPlan(
          stageLabel: 'جديد',
          nextStep: 'مراجعة بيانات الطلب',
          detail: 'راجع بيانات العميل والعنوان والمحتويات ثم ابدأ المراجعة.',
          action: _JourneyAction.status,
          buttonLabel: 'بدء مراجعة الطلب',
          icon: Icons.fact_check_outlined,
          onPressed: _canStatus(o, 'review')
              ? () => _changeStatus('review', 'تم بدء مراجعة الطلب')
              : null,
          blockedReason: _canStatus(o, 'review')
              ? null
              : 'لا تملك صلاحية تغيير حالة الطلب.',
        );
      case 'review':
        return _JourneyPlan(
          stageLabel: 'قيد المراجعة',
          nextStep: 'تجهيز الطلب',
          detail: 'بعد التحقق من البيانات، ابدأ تجهيز الطلب.',
          action: _JourneyAction.status,
          buttonLabel: 'بدء تجهيز الطلب',
          icon: Icons.inventory_2_outlined,
          onPressed: _canStatus(o, 'preparing')
              ? () => _changeStatus('preparing', 'تم بدء تجهيز الطلب')
              : null,
          blockedReason: _canStatus(o, 'preparing')
              ? null
              : 'لا تملك صلاحية تغيير حالة الطلب.',
        );
      case 'preparing':
        return _JourneyPlan(
          stageLabel: 'قيد التجهيز',
          nextStep: 'تأكيد الجاهزية',
          detail: 'أكد جاهزية الطلب للتسليم لتظهر خطوة اختيار الشركة.',
          action: _JourneyAction.status,
          buttonLabel: 'تأكيد جاهزية الطلب',
          icon: Icons.assignment_turned_in_outlined,
          onPressed: _canStatus(o, 'ready')
              ? () => _changeStatus('ready', 'الطلب جاهز للتسليم')
              : null,
          blockedReason: _canStatus(o, 'ready')
              ? null
              : 'لا تملك صلاحية تغيير حالة الطلب.',
        );
      case 'ready':
        if (companyId == null) {
          return _JourneyPlan(
            stageLabel: 'جاهز للتسليم',
            nextStep: 'اختيار شركة التوصيل',
            detail: 'اختر شركة التوصيل. لن تُنشأ شحنة بمجرد الاختيار.',
            action: _JourneyAction.assign,
            buttonLabel: 'اختيار شركة التوصيل',
            icon: Icons.local_shipping_outlined,
            onPressed: _canAssign(o) ? () => _chooseCompany(o) : null,
            blockedReason: _canAssign(o)
                ? null
                : 'إسناد الشركة يحتاج صلاحية إرسال لشركة التوصيل.',
          );
        }
        final canSend =
            widget.policy.can('sendToDelivery') &&
            o['actions']?['dispatch'] == true;
        final sendCompany = o['companyName']?.toString();
        return _JourneyPlan(
          stageLabel: 'جاهز للتسليم',
          nextStep: 'مراجعة نهائية وإرسال',
          detail:
              'راجع الملخص ثم أرسل الطلب إلى ${sendCompany ?? 'شركة التوصيل'}.',
          action: _JourneyAction.send,
          buttonLabel: isClick
              ? 'تأكيد وإرسال إلى Click'
              : 'تأكيد وإرسال إلى شركة التوصيل',
          icon: Icons.send_outlined,
          onPressed: canSend
              ? () => _sendToDelivery(sendCompany ?? 'شركة التوصيل')
              : null,
          blockedReason: canSend
              ? null
              : 'الإرسال يحتاج حالة «جاهز للتسليم» وصلاحية إرسال وشركة مفعّلة.',
        );
      default:
        return _JourneyPlan(
          stageLabel: statusLabels[state] ?? state,
          nextStep: 'لا توجد خطوة متاحة',
          detail: null,
          action: _JourneyAction.none,
          buttonLabel: '',
          icon: Icons.info_outline,
        );
    }
  }

  bool _canStatus(Map<String, dynamic> o, String target) {
    final statuses = o['actions']?['statuses'];
    return statuses is List &&
        statuses.map((e) => e.toString()).contains(target);
  }

  bool _canAssign(Map<String, dynamic> o) => o['actions']?['assign'] == true;

  Widget _progress(String state, String dispatchState) {
    const order = ['created', 'review', 'preparing', 'ready'];
    final idx = order.indexOf(state);
    final done = dispatchState == 'sent' || state == 'dispatched';
    final labels = ['جديد', 'مراجعة', 'تجهيز', 'جاهز', 'إرسال'];
    final active = done ? 4 : (idx < 0 ? 0 : idx);
    return Row(
      children: [
        for (var i = 0; i < labels.length; i++) ...[
          if (i > 0)
            Expanded(
              child: Container(
                height: 3,
                color: i <= active ? VColors.brand : VColors.line,
              ),
            ),
          Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 22,
                height: 22,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: i <= active ? VColors.brand : VColors.softBlue,
                ),
                child: Icon(
                  i < active
                      ? Icons.check
                      : i == active
                      ? Icons.circle
                      : Icons.circle_outlined,
                  size: i == active ? 9 : 13,
                  color: i <= active ? Colors.white : VColors.muted,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                labels[i],
                style: TextStyle(
                  fontSize: 10,
                  color: i == active ? VColors.brand : VColors.muted,
                  fontWeight: i == active ? FontWeight.w800 : FontWeight.w500,
                ),
              ),
            ],
          ),
        ],
      ],
    );
  }

  Widget _stageChip(String label) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
    decoration: BoxDecoration(
      color: VColors.softBlue,
      borderRadius: BorderRadius.circular(20),
    ),
    child: Text(
      label,
      style: const TextStyle(
        color: VColors.brand,
        fontWeight: FontWeight.w800,
        fontSize: 12,
      ),
    ),
  );

  Widget _summary(Map<String, dynamic> o, String? companyName) => VLivePanel(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _sectionTitle('ملخص المراجعة', Icons.receipt_long_outlined),
        _kv('رقم الطلب', o['orderNumber']?.toString()),
        _kv('اسم العميل', o['customer']?.toString()),
        _kv('رقم الهاتف', o['phone']?.toString()),
        _kv(
          'العنوان',
          [o['city'], o['area'], o['address']]
              .where((v) => v != null && v.toString().trim().isNotEmpty)
              .join('، '),
        ),
        _kv('محتويات الطلب', o['description']?.toString()),
        _kv('الكمية', o['quantity']?.toString()),
        if (o['amount'] != null) _kv('المبلغ', displayAmount(o['amount'])),
        if (companyName != null) _kv('شركة التوصيل', companyName),
        if (o['providerOrderId'] != null)
          _kv('رقم البوليصة', o['providerOrderId'].toString()),
      ],
    ),
  );

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

  Widget _kv(String label, String? value) {
    if (value == null || value.trim().isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 110,
            child: Text(
              label,
              style: const TextStyle(color: VColors.muted, fontSize: 12.5),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(
                fontSize: 13.5,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

enum _JourneyAction { status, assign, send, reviewDispatch, track, open, none }

class _JourneyPlan {
  const _JourneyPlan({
    required this.stageLabel,
    required this.nextStep,
    required this.detail,
    required this.action,
    required this.buttonLabel,
    required this.icon,
    this.onPressed,
    this.blockedReason,
  });
  final String stageLabel;
  final String nextStep;
  final String? detail;
  final _JourneyAction action;
  final String buttonLabel;
  final IconData icon;
  final VoidCallback? onPressed;
  final String? blockedReason;
}

/// Reuses the existing resolveDispatchException / reconcileClickShipment flow
/// so an ambiguous dispatch is only ever reconciled, never blindly resent.
class _DispatchReviewSheet extends StatefulWidget {
  const _DispatchReviewSheet({required this.orderId});
  final String orderId;
  @override
  State<_DispatchReviewSheet> createState() => _DispatchReviewSheetState();
}

class _DispatchReviewSheetState extends State<_DispatchReviewSheet> {
  bool busy = false;
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('مراجعة نتيجة الإرسال')),
    body: SingleChildScrollView(
      child: LiveContent(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const VFeedbackPanel(
                  title: 'تحقق قبل أي إعادة إرسال',
                  message:
                      'افتح بوابة شركة التوصيل. إن كانت الشحنة موجودة اربطها؛ وإلا أكّد عدم إنشائها لتعود الخطوة إلى «جاهز للتسليم».',
                  icon: Icons.warning_amber_outlined,
                ),
                const SizedBox(height: 12),
                FilledButton.icon(
                  onPressed: busy ? null : () => _resolve('not_created'),
                  icon: const Icon(Icons.undo),
                  label: const Text('لم تُنشأ الشحنة — إعادة الخطوة'),
                ),
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: busy ? null : () => _resolve('shipment_exists'),
                  icon: const Icon(Icons.link),
                  label: const Text('الشحنة موجودة — ربطها'),
                ),
              ],
            ),
          ),
        ),
      ),
    ),
  );

  Future<void> _resolve(String outcome) async {
    final tracking = TextEditingController();
    final reason = TextEditingController();
    final go = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(
          outcome == 'shipment_exists' ? 'ربط الشحنة الموجودة' : 'إعادة الخطوة',
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (outcome == 'shipment_exists')
              TextField(
                controller: tracking,
                decoration: const InputDecoration(labelText: 'رقم البوليصة'),
              ),
            TextField(
              controller: reason,
              maxLines: 2,
              decoration: const InputDecoration(
                labelText: 'مرجع التحقق / سبب القرار (10 أحرف فأكثر)',
              ),
            ),
          ],
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
    if (go != true) return;
    if (reason.text.trim().length < 10) {
      if (mounted) showError(context, 'اكتب سبباً من 10 أحرف على الأقل');
      return;
    }
    if (outcome == 'shipment_exists' && tracking.text.trim().isEmpty) {
      if (mounted) showError(context, 'أدخل رقم البوليصة');
      return;
    }
    setState(() => busy = true);
    try {
      await VelnixGateway.instance.resolveDispatchException(
        widget.orderId,
        outcome: outcome,
        reason: reason.text.trim(),
        trackingNumber: outcome == 'shipment_exists'
            ? tracking.text.trim()
            : null,
      );
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }
}
