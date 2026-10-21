import 'package:flutter/material.dart';
import '../core/theme.dart';
import '../core/widgets.dart';
import '../data/demo_store.dart';
import '../models/entities.dart';
import '../printing/order_printing.dart';

class OrdersScreen extends StatefulWidget {
  const OrdersScreen({
    super.key,
    this.initialBucket = OrderBucket.all,
    this.initialStatus,
    this.initialOverdueOnly = false,
  });
  final OrderBucket initialBucket;
  final OrderStatus? initialStatus;
  final bool initialOverdueOnly;
  @override
  State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen> {
  String keyword = '';
  String? companyFilter;
  late OrderStatus? status = widget.initialStatus;
  late OrderBucket bucket = widget.initialBucket;
  late bool overdueOnly = widget.initialOverdueOnly;

  @override
  Widget build(BuildContext context) {
    final store = StoreScope.of(context);
    final filtered = store.visibleOrders.where((o) {
      final q = keyword.trim().toLowerCase();
      return bucket.matches(o) &&
          (companyFilter == null || o.companyId == companyFilter) &&
          (!overdueOnly || store.isOverdue(o)) &&
          (q.isEmpty ||
              '${o.id} ${o.customer} ${o.phone} ${o.city} ${o.createdByName}'
                  .toLowerCase()
                  .contains(q));
    }).toList();
    final orders = filtered
        .where((o) => status == null || o.status == status)
        .toList();
    return SingleChildScrollView(
      child: VScreen(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            VPageTitle(
              title: 'الطلبات',
              subtitle: 'جميع الطلبات المتاحة وفق صلاحياتك',
              action: IconButton.filled(
                onPressed: () => Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const OrderFormScreen()),
                ),
                tooltip: 'إضافة طلب',
                icon: const Icon(Icons.add_rounded),
              ),
            ),
            const VDemoBanner(compact: true),
            const SizedBox(height: 16),
            VPanel(
              padding: const EdgeInsets.all(13),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'نوع الطلبات',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w900,
                      color: VColors.ink,
                    ),
                  ),
                  const SizedBox(height: 10),
                  LayoutBuilder(
                    builder: (context, c) => Wrap(
                      spacing: 7,
                      runSpacing: 7,
                      children: [
                        for (final b in OrderBucket.values)
                          _bucketChip(b, store),
                      ],
                    ),
                  ),
                  if (bucket != OrderBucket.internal) ...[
                    const SizedBox(height: 13),
                    DropdownButtonFormField<String?>(
                      key: ValueKey('company-$companyFilter'),
                      initialValue: companyFilter,
                      decoration: const InputDecoration(
                        labelText: 'شركة التوصيل',
                      ),
                      isExpanded: true,
                      items: [
                        const DropdownMenuItem<String?>(
                          value: null,
                          child: Text('كل الشركات'),
                        ),
                        ...store.companies
                            .where(
                              (c) =>
                                  !c.archived &&
                                  store.visibleOrders.any(
                                    (o) => o.companyId == c.id,
                                  ),
                            )
                            .map(
                              (c) => DropdownMenuItem<String?>(
                                value: c.id,
                                child: Text(c.name),
                              ),
                            ),
                      ],
                      onChanged: (v) => setState(() => companyFilter = v),
                    ),
                  ],
                  const SizedBox(height: 13),
                  TextField(
                    onChanged: (value) => setState(() => keyword = value),
                    decoration: const InputDecoration(
                      hintText: 'ابحث برقم الطلب، المستلم، الهاتف...',
                      prefixIcon: Icon(Icons.search_rounded),
                    ),
                  ),
                  const SizedBox(height: 12),
                  FilterChip(
                    label: const Text('طلبات متأخرة فقط'),
                    selected: overdueOnly,
                    onSelected: (value) => setState(() => overdueOnly = value),
                  ),
                  const SizedBox(height: 9),
                  const Text(
                    'الحالة',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w900,
                      color: VColors.ink,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 7,
                    runSpacing: 7,
                    children: [
                      _statusChip(null, 'الكل', filtered.length),
                      ...OrderStatus.values.map(
                        (s) => _statusChip(
                          s,
                          s.label,
                          filtered.where((o) => o.status == s).length,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 18),
            Wrap(
              alignment: WrapAlignment.spaceBetween,
              spacing: 12,
              runSpacing: 8,
              children: [
                Text(
                  '${orders.length} طلب',
                  style: const TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w900,
                    color: VColors.ink,
                  ),
                ),
                const Text(
                  'لا حذف نهائي',
                  style: TextStyle(color: VColors.muted, fontSize: 10),
                ),
              ],
            ),
            const SizedBox(height: 11),
            if (orders.isEmpty)
              const VPanel(
                child: VEmpty(
                  title: 'لا توجد طلبات في هذا القسم',
                  subtitle: 'اختر حالة أخرى أو جرّب بحثاً مختلفاً',
                ),
              ),
            ...orders.map(
              (order) => Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: OrderTile(order: order),
              ),
            ),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }

  Widget _bucketChip(OrderBucket b, DemoStore store) {
    final active = bucket == b;
    return ChoiceChip(
      label: Text('${b.label}  ${store.bucketCount(b)}'),
      selected: active,
      selectedColor: VColors.softBlue,
      labelStyle: TextStyle(
        color: active ? VColors.brand : VColors.muted,
        fontWeight: FontWeight.w800,
        fontSize: 11,
      ),
      onSelected: (_) => setState(() {
        bucket = b;
        status = null;
        companyFilter = null;
      }),
    );
  }

  Widget _statusChip(OrderStatus? s, String label, int n) {
    final active = status == s;
    return FilterChip(
      label: Text('$label  $n'),
      selected: active,
      showCheckmark: false,
      selectedColor: s == null
          ? VColors.softBlue
          : s.color.withValues(alpha: .12),
      labelStyle: TextStyle(
        fontSize: 12,
        fontWeight: FontWeight.w800,
        color: active ? (s?.color ?? VColors.brand) : VColors.muted,
      ),
      onSelected: (_) => setState(() => status = s),
    );
  }
}

class OrderTile extends StatelessWidget {
  const OrderTile({super.key, required this.order});
  final OrderRecord order;
  @override
  Widget build(BuildContext context) {
    final store = StoreScope.of(context);
    final company = store.companies
        .where((c) => c.id == order.companyId)
        .firstOrNull;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => OrderDetailScreen(order: order)),
        ),
        borderRadius: BorderRadius.circular(20),
        child: VPanel(
          padding: EdgeInsets.zero,
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(15, 14, 15, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          width: 38,
                          height: 38,
                          decoration: BoxDecoration(
                            color: order.status.color.withValues(alpha: .10),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Icon(
                            order.companyId == null
                                ? Icons.inventory_2_outlined
                                : Icons.local_shipping_outlined,
                            color: order.status.color,
                            size: 19,
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                order.customer,
                                maxLines: 1,
                                style: const TextStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w900,
                                  color: VColors.ink,
                                ),
                              ),
                              Text(
                                order.id,
                                style: const TextStyle(
                                  fontSize: 11.5,
                                  fontWeight: FontWeight.w800,
                                  color: VColors.brand,
                                ),
                              ),
                            ],
                          ),
                        ),
                        Flexible(child: VStatusChip(status: order.status)),
                      ],
                    ),
                    const SizedBox(height: 14),
                    Wrap(
                      spacing: 15,
                      runSpacing: 9,
                      children: [
                        _meta(Icons.phone_in_talk_outlined, order.phone),
                        _meta(
                          Icons.location_on_outlined,
                          '${order.city} • ${order.area}',
                        ),
                        _meta(Icons.inventory_2_outlined, order.description),
                      ],
                    ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 15,
                  vertical: 10,
                ),
                decoration: const BoxDecoration(
                  color: Color(0xFFFAFBFD),
                  borderRadius: BorderRadius.vertical(
                    bottom: Radius.circular(20),
                  ),
                ),
                child: Wrap(
                  spacing: 10,
                  runSpacing: 8,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    if (store.canSeeAmount(order))
                      Text(
                        jod(order.amount),
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w900,
                          color: VColors.ink,
                        ),
                      ),
                    Text(
                      company?.name ?? 'طلب داخلي',
                      style: const TextStyle(
                        fontSize: 11.5,
                        color: VColors.muted,
                      ),
                    ),
                    Text(
                      order.createdByName,
                      style: const TextStyle(
                        fontSize: 11.5,
                        color: VColors.muted,
                      ),
                    ),
                    const Icon(
                      Icons.chevron_left_rounded,
                      color: VColors.brand,
                      size: 19,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _meta(IconData icon, String value) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Icon(icon, color: VColors.muted, size: 14),
      const SizedBox(width: 5),
      ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 200),
        child: Text(
          value,
          overflow: TextOverflow.ellipsis,
          maxLines: 1,
          style: const TextStyle(color: VColors.muted, fontSize: 11),
        ),
      ),
    ],
  );
}

class OrderFormScreen extends StatefulWidget {
  const OrderFormScreen({super.key, this.order, this.onSaved});
  final OrderRecord? order;
  final VoidCallback? onSaved;
  @override
  State<OrderFormScreen> createState() => _OrderFormScreenState();
}

class _OrderFormScreenState extends State<OrderFormScreen> {
  final form = GlobalKey<FormState>();
  final customer = TextEditingController(),
      phone = TextEditingController(),
      extraPhone = TextEditingController(),
      city = TextEditingController(),
      area = TextEditingController(),
      address = TextEditingController(),
      description = TextEditingController(),
      quantity = TextEditingController(text: '1'),
      amount = TextEditingController(),
      note = TextEditingController();
  String payment = 'عند الاستلام';
  String? companyId;
  bool saving = false;
  bool get editing => widget.order != null;
  @override
  void initState() {
    super.initState();
    final o = widget.order;
    if (o != null) {
      customer.text = o.customer;
      phone.text = o.phone;
      extraPhone.text = o.extraPhone;
      city.text = o.city;
      area.text = o.area;
      address.text = o.address;
      description.text = o.description;
      quantity.text = '${o.quantity}';
      amount.text = o.amount.toStringAsFixed(3);
      note.text = o.note;
      payment = o.paymentMethod;
      companyId = o.companyId;
    }
  }

  @override
  void dispose() {
    for (final c in [
      customer,
      phone,
      extraPhone,
      city,
      area,
      address,
      description,
      quantity,
      amount,
      note,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final store = StoreScope.of(context);
    return Scaffold(
      appBar: editing ? AppBar(title: const Text('تعديل بيانات الطلب')) : null,
      body: Form(
        key: form,
        child: SingleChildScrollView(
          child: VScreen(
            maxWidth: 880,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                VPageTitle(
                  title: editing ? 'تعديل الطلب' : 'إنشاء طلب جديد',
                  subtitle:
                      'كل الأدوار تستطيع إضافة طلب • الحقول المميزة مطلوبة',
                ),
                const VDemoBanner(compact: true),
                const VSection(title: 'معلومات المستلم'),
                VCard(
                  child: VFormFields(
                    children: [
                      VField(
                        label: 'اسم المستلم',
                        controller: customer,
                        requiredField: true,
                      ),
                      VField(
                        label: 'رقم الهاتف',
                        controller: phone,
                        keyboardType: TextInputType.phone,
                        requiredField: true,
                      ),
                      VField(
                        label: 'هاتف إضافي',
                        controller: extraPhone,
                        keyboardType: TextInputType.phone,
                      ),
                      VField(
                        label: 'المحافظة',
                        controller: city,
                        requiredField: true,
                      ),
                      VField(
                        label: 'المنطقة',
                        controller: area,
                        requiredField: true,
                      ),
                      VField(
                        label: 'العنوان التفصيلي',
                        controller: address,
                        requiredField: true,
                        maxLines: 2,
                      ),
                    ],
                  ),
                ),
                const VSection(title: 'معلومات الطلب'),
                VCard(
                  child: Column(
                    children: [
                      VField(
                        label: 'محتوى الطرد / وصف الطلب',
                        controller: description,
                        requiredField: true,
                        maxLines: 2,
                      ),
                      const SizedBox(height: 13),
                      Row(
                        children: [
                          Expanded(
                            child: VField(
                              label: 'الكمية',
                              controller: quantity,
                              keyboardType: TextInputType.number,
                              requiredField: true,
                            ),
                          ),
                          const SizedBox(width: 11),
                          Expanded(
                            child: VField(
                              label: 'المبلغ (دينار أردني)',
                              controller: amount,
                              keyboardType:
                                  const TextInputType.numberWithOptions(
                                    decimal: true,
                                  ),
                              requiredField: true,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 13),
                      DropdownButtonFormField<String>(
                        isExpanded: true,

                        initialValue: payment,
                        decoration: const InputDecoration(
                          labelText: 'طريقة الدفع',
                        ),
                        items: ['عند الاستلام', 'مدفوع مسبقاً']
                            .map(
                              (v) => DropdownMenuItem(value: v, child: Text(v)),
                            )
                            .toList(),
                        onChanged: (v) =>
                            setState(() => payment = v ?? payment),
                      ),
                      const SizedBox(height: 13),
                      VField(
                        label: 'ملاحظات داخلية',
                        controller: note,
                        maxLines: 3,
                      ),
                    ],
                  ),
                ),
                const VSection(title: 'شركة التوصيل'),
                VCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (store.canAssignDelivery)
                        DropdownButtonFormField<String>(
                          isExpanded: true,

                          initialValue: companyId,
                          decoration: const InputDecoration(
                            labelText: 'تحديد شركة التوصيل (اختياري)',
                          ),
                          items: [
                            const DropdownMenuItem<String>(
                              value: null,
                              child: Text('تحدد لاحقاً'),
                            ),
                            ...store.companies
                                .where(
                                  (c) =>
                                      (c.enabled && !c.archived) ||
                                      (editing && c.id == companyId),
                                )
                                .map(
                                  (c) => DropdownMenuItem(
                                    value: c.id,
                                    child: Text(c.name),
                                  ),
                                ),
                          ],
                          onChanged: (v) => setState(() => companyId = v),
                        ),
                      if (!store.canAssignDelivery)
                        const ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: Icon(Icons.lock_outline_rounded),
                          title: Text('تحديد شركة التوصيل يتطلب صلاحية'),
                          subtitle: Text(
                            'يمكنك تسجيل الطلب الآن، ويتولى الموظف المخوّل إسناده لاحقاً.',
                          ),
                        ),
                      const SizedBox(height: 8),
                      const Text(
                        'حفظ الطلب لا يعني إرساله فعلياً لشركة التوصيل في نسخة التصميم.',
                        style: TextStyle(color: VColors.muted, fontSize: 11),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 22),
                FilledButton.icon(
                  onPressed: saving ? null : () => _save(store),
                  icon: const Icon(Icons.save_outlined),
                  label: Text(
                    editing
                        ? 'حفظ التعديلات'
                        : 'حفظ الطلب وإرساله إلى لوحة الإدارة',
                  ),
                ),
                const SizedBox(height: 18),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _save(DemoStore store) {
    if (!form.currentState!.validate()) return;
    final q = int.tryParse(asciiDigits(quantity.text.trim()));
    final a = double.tryParse(
      asciiDigits(
        amount.text,
      ).replaceAll('٫', '.').replaceAll('٬', '').replaceAll(',', '.').trim(),
    );
    if (q == null ||
        q <= 0 ||
        q > 10000 ||
        a == null ||
        !a.isFinite ||
        a < 0 ||
        a > 1000000) {
      vToast(context, 'تحقق من صحة الكمية والمبلغ');
      return;
    }
    final normalizedPhone = asciiDigits(
      phone.text.trim(),
    ).replaceAll(RegExp(r'[\s\-()]'), '');
    final normalizedExtraPhone = asciiDigits(
      extraPhone.text.trim(),
    ).replaceAll(RegExp(r'[\s\-()]'), '');
    final phonePattern = RegExp(r'^\+?[0-9]{7,15}$');
    if (!phonePattern.hasMatch(normalizedPhone) ||
        (normalizedExtraPhone.isNotEmpty &&
            !phonePattern.hasMatch(normalizedExtraPhone))) {
      vToast(
        context,
        'تحقق من رقم الهاتف: 7 إلى 15 رقماً مع رمز الدولة إن وجد',
      );
      return;
    }
    if (editing) {
      if (!store.canEditOrder(widget.order!)) {
        vToast(context, 'لا تملك صلاحية تعديل هذا الطلب');
        return;
      }
      final o = widget.order!;
      final saved = store.updateOrder(
        o,
        customer: customer.text.trim(),
        phone: normalizedPhone,
        extraPhone: normalizedExtraPhone,
        city: city.text.trim(),
        area: area.text.trim(),
        address: address.text.trim(),
        description: description.text.trim(),
        quantity: q,
        amount: a,
        note: note.text.trim(),
        paymentMethod: payment,
        companyId: companyId,
      );
      if (!saved) {
        vToast(context, 'تعذر حفظ التعديلات بسبب الصلاحيات أو شركة التوصيل');
        return;
      }
    } else {
      final id = 'VLX-${DateTime.now().millisecondsSinceEpoch}';
      final created = store.addOrder(
        OrderRecord(
          id: id,
          customer: customer.text.trim(),
          phone: normalizedPhone,
          extraPhone: normalizedExtraPhone,
          city: city.text.trim(),
          area: area.text.trim(),
          address: address.text.trim(),
          description: description.text.trim(),
          quantity: q,
          amount: a,
          note: note.text.trim(),
          paymentMethod: payment,
          companyId: companyId,
          createdBy: store.me.id,
          createdByName: store.me.name,
          createdByRole: store.me.role,
          createdAt: DateTime.now(),
          events: [
            OrderEvent(
              title: 'إنشاء الطلب',
              actor: store.me.name,
              time: DateTime.now(),
            ),
          ],
        ),
      );
      if (!created) {
        vToast(context, 'تعذر إنشاء الطلب بسبب الصلاحيات');
        return;
      }
    }
    vToast(
      context,
      editing ? 'تم حفظ التعديلات (تجريبي)' : 'تم إضافة الطلب (تجريبي)',
    );
    if (widget.onSaved != null) {
      widget.onSaved!();
    } else {
      Navigator.of(context).pop();
    }
  }
}

class OrderDetailScreen extends StatelessWidget {
  const OrderDetailScreen({super.key, required this.order});
  final OrderRecord order;
  @override
  Widget build(BuildContext context) {
    final store = StoreScope.of(context);
    if (!store.canViewOrder(order)) {
      return const Scaffold(
        body: Center(child: Text('لا يمكنك الوصول إلى هذا الطلب')),
      );
    }
    final company = store.companies
        .where((c) => c.id == order.companyId)
        .firstOrNull;
    return Scaffold(
      appBar: AppBar(title: Text('الطلب ${order.id}')),
      body: SingleChildScrollView(
        child: VScreen(
          maxWidth: 900,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              VCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            order.customer,
                            style: const TextStyle(
                              fontSize: 21,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                        ),
                        Flexible(child: VStatusChip(status: order.status)),
                      ],
                    ),
                    const SizedBox(height: 11),
                    Text(
                      order.id,
                      style: const TextStyle(
                        color: VColors.brand,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'أُنشئ بواسطة ${order.createdByName} • ${formatDate(order.createdAt)}',
                      style: const TextStyle(
                        color: VColors.muted,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
              const VSection(title: 'بيانات العميل والتوصيل'),
              VCard(
                child: Column(
                  children: [
                    _item('رقم الهاتف', order.phone),
                    _item(
                      'هاتف إضافي',
                      order.extraPhone.isEmpty ? '—' : order.extraPhone,
                    ),
                    _item('المحافظة', order.city),
                    _item('المنطقة', order.area),
                    _item('العنوان', order.address),
                    _item('شركة التوصيل', company?.name ?? 'لم تحدد'),
                    _item('رقم التتبع', order.trackingNumber ?? 'غير متوفر'),
                  ],
                ),
              ),
              const VSection(title: 'تفاصيل الطرد'),
              VCard(
                child: Column(
                  children: [
                    _item('المحتويات', order.description),
                    _item('الكمية', '${order.quantity}'),
                    if (store.canSeeAmount(order))
                      _item('قيمة التحصيل', jod(order.amount)),
                    _item('طريقة الدفع', order.paymentMethod),
                    _item('ملاحظات', order.note.isEmpty ? '—' : order.note),
                  ],
                ),
              ),
              const VSection(title: 'إجراءات الطلب'),
              VCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    OutlinedButton.icon(
                      onPressed: () => Navigator.push(
                        context,
                        MaterialPageRoute<void>(
                          builder: (_) => OrderPrintScreen(
                            order: {
                              'id': order.id,
                              'barcodeValue': 'VNX-${order.id}',
                              'customer': order.customer,
                              'phone': order.phone,
                              'extraPhone': order.extraPhone,
                              'city': order.city,
                              'area': order.area,
                              'address': order.address,
                              'description': order.description,
                              'quantity': order.quantity,
                              'paymentMethod': order.paymentMethod,
                              'note': order.note,
                              'status': order.status.name,
                              'trackingNumber': order.trackingNumber,
                              if (store.canSeeAmount(order))
                                'amount': order.amount,
                            },
                          ),
                        ),
                      ),
                      icon: const Icon(Icons.print_outlined),
                      label: const Text('معاينة الفاتورة / طباعة / PDF'),
                    ),
                    const SizedBox(height: 8),
                    if (store.canEditOrder(order))
                      OutlinedButton.icon(
                        onPressed: () => Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => OrderFormScreen(order: order),
                          ),
                        ),
                        icon: const Icon(Icons.edit_outlined),
                        label: const Text('تعديل بيانات الطلب'),
                      ),
                    if (store.canUpdateStatus && !order.status.isClosed) ...[
                      const SizedBox(height: 8),
                      const Text(
                        'الإجراءات المتاحة لهذه المرحلة',
                        style: TextStyle(fontWeight: FontWeight.w800),
                      ),
                      const SizedBox(height: 8),
                      if (store.allowedManualTargets(order).isEmpty)
                        const Text(
                          'الحالة الحالية تابعة لشركة التوصيل؛ يتم تحديثها من API بعد الربط الفعلي.',
                          style: TextStyle(fontSize: 12, color: VColors.muted),
                        )
                      else
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            for (final s in store.allowedManualTargets(order))
                              OutlinedButton.icon(
                                onPressed: () {
                                  store.setStatus(order, s);
                                  vToast(
                                    context,
                                    'تم تحديث الحالة في المعاينة',
                                  );
                                },
                                icon: Icon(
                                  s == OrderStatus.cancelled
                                      ? Icons.cancel_outlined
                                      : Icons.arrow_forward_rounded,
                                  size: 18,
                                ),
                                label: Text(s.label),
                              ),
                          ],
                        ),
                    ],
                    if (store.canAssignDelivery && !order.status.isClosed) ...[
                      const SizedBox(height: 9),
                      OutlinedButton.icon(
                        onPressed: () => _chooseDelivery(context, store),
                        icon: const Icon(Icons.local_shipping_outlined),
                        label: const Text('تحديد شركة التوصيل'),
                      ),
                      const Text(
                        'إرسال API الحقيقي سيُنفذ لاحقاً على الخادم.',
                        style: TextStyle(fontSize: 11, color: VColors.muted),
                      ),
                    ],
                    if (!store.canUpdateStatus && !store.canEditOrder(order))
                      const Text(
                        'يمكنك مشاهدة الطلب وفق صلاحياتك.',
                        style: TextStyle(color: VColors.muted),
                      ),
                    const SizedBox(height: 8),
                    const Text(
                      'الحذف النهائي للطلبات غير متاح.',
                      style: TextStyle(color: VColors.danger, fontSize: 11),
                    ),
                  ],
                ),
              ),
              const VSection(title: 'سجل حركة الطلب'),
              VCard(
                child: order.events.isEmpty
                    ? const VEmpty(title: 'لا توجد أحداث')
                    : Column(
                        children: order.events
                            .map(
                              (e) => ListTile(
                                dense: true,
                                contentPadding: EdgeInsets.zero,
                                leading: const Icon(
                                  Icons.history,
                                  color: VColors.brand,
                                ),
                                title: Text(e.title),
                                subtitle: Text(
                                  '${e.actor} • ${formatDate(e.time)} ${formatTime(e.time)}${e.details.isEmpty ? '' : ' • ${e.details}'}',
                                  style: const TextStyle(fontSize: 11),
                                ),
                              ),
                            )
                            .toList(),
                      ),
              ),
              const SizedBox(height: 20),
            ],
          ),
        ),
      ),
    );
  }

  Widget _item(String name, String value) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 9),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 120,
          child: Text(
            name,
            style: const TextStyle(color: VColors.muted, fontSize: 12),
          ),
        ),
        Expanded(
          child: Text(
            value,
            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
          ),
        ),
      ],
    ),
  );
  void _chooseDelivery(BuildContext context, DemoStore store) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'شركة التوصيل',
                style: TextStyle(fontSize: 19, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 12),
              ...store.companies
                  .where((c) => !c.archived)
                  .map(
                    (c) => ListTile(
                      title: Text(c.name),
                      subtitle: Text(c.enabled ? 'مفعّلة' : 'معطّلة'),
                      onTap: c.enabled
                          ? () {
                              store.assignCompany(order, c.id);
                              Navigator.pop(ctx);
                            }
                          : null,
                    ),
                  ),
              const Text(
                'التحديد هنا تجريبي ولا يرسل بيانات خارج التطبيق.',
                style: TextStyle(fontSize: 11, color: VColors.muted),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
