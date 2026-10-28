import 'package:flutter/material.dart';
import 'gateway.dart';
import 'date_range_field.dart';
import 'jordan_locations.dart';
import '../models/entities.dart';
import '../core/theme.dart';

class OrderFilters extends StatefulWidget {
  const OrderFilters({
    super.key,
    required this.onChanged,
    this.fixedCompanyId,
    this.initialFilters = const {},
    this.showAmounts = false,
    this.basicOnly = false,
  });
  final ValueChanged<Map<String, dynamic>> onChanged;
  final String? fixedCompanyId;
  final Map<String, dynamic> initialFilters;

  /// Whether the amount range controls may be shown (viewAmounts permission).
  final bool showAmounts;

  /// When true only the period (and reset) controls render, matching the
  /// dashboard's lightweight filter. The orders page uses the full set.
  final bool basicOnly;
  @override
  State<OrderFilters> createState() => _OrderFiltersState();
}

class _OrderFiltersState extends State<OrderFilters> {
  List<Map<String, dynamic>> companies = [], creators = [], pages = [];
  String? company, creator, error;
  String? pageId;
  OrderType? orderType;
  String? city;
  String? dispatch;
  DateTime? from, to;
  DateTime? sentFrom, sentTo;
  bool _advancedOpen = false;
  final amountMin = TextEditingController();
  final amountMax = TextEditingController();
  final area = TextEditingController();
  final phone = TextEditingController();
  final barcode = TextEditingController();
  final product = TextEditingController();
  final note = TextEditingController();

  // Dispatch-state groups exposed to the user, matching the server vocabulary.
  static const dispatchLabels = <String, String>{
    'idle': 'غير مرسل',
    'sending': 'جاري الإرسال',
    'sent': 'تم الإرسال',
    'review': 'يحتاج مراجعة',
  };

  @override
  void initState() {
    super.initState();
    company = widget.initialFilters['companyId'] as String?;
    creator = widget.initialFilters['createdBy'] as String?;
    pageId = widget.initialFilters['pageId'] as String?;
    orderType = widget.initialFilters['orderType'] != null
        ? OrderTypeUI.fromWire(widget.initialFilters['orderType'])
        : null;
    city = widget.initialFilters['city'] as String?;
    dispatch = widget.initialFilters['dispatch'] as String?;
    area.text = widget.initialFilters['area']?.toString() ?? '';
    _advancedOpen = widget.initialFilters.keys.any(
      (key) => const {
        'companyId',
        'createdBy',
        'pageId',
        'orderType',
        'city',
        'area',
        'dispatch',
        'phone',
        'barcode',
        'product',
        'note',
        'amountMin',
        'amountMax',
      }.contains(key),
    );
    phone.text = widget.initialFilters['phone']?.toString() ?? '';
    barcode.text = widget.initialFilters['barcode']?.toString() ?? '';
    product.text = widget.initialFilters['product']?.toString() ?? '';
    note.text = widget.initialFilters['note']?.toString() ?? '';
    amountMin.text = widget.initialFilters['amountMin']?.toString() ?? '';
    amountMax.text = widget.initialFilters['amountMax']?.toString() ?? '';
    final start = DateTime.tryParse(
      widget.initialFilters['from']?.toString() ?? '',
    );
    final end = DateTime.tryParse(
      widget.initialFilters['to']?.toString() ?? '',
    );
    if (start != null && end != null) {
      final a = start.toUtc().add(const Duration(hours: 3)),
          b = end
              .toUtc()
              .add(const Duration(hours: 3))
              .subtract(const Duration(days: 1));
      from = DateTime(a.year, a.month, a.day);
      to = DateTime(b.year, b.month, b.day);
    }
    final sentStart = DateTime.tryParse(
      widget.initialFilters['sentFrom']?.toString() ?? '',
    );
    final sentEnd = DateTime.tryParse(
      widget.initialFilters['sentTo']?.toString() ?? '',
    );
    if (sentStart != null && sentEnd != null) {
      final a = sentStart.toUtc().add(const Duration(hours: 3)),
          b = sentEnd
              .toUtc()
              .add(const Duration(hours: 3))
              .subtract(const Duration(days: 1));
      sentFrom = DateTime(a.year, a.month, a.day);
      sentTo = DateTime(b.year, b.month, b.day);
    }
    load();
  }

  @override
  void dispose() {
    amountMin.dispose();
    amountMax.dispose();
    area.dispose();
    phone.dispose();
    barcode.dispose();
    product.dispose();
    note.dispose();
    super.dispose();
  }

  Future<void> load() async {
    try {
      final companiesValue = await VelnixGateway.instance.companies();
      final creatorsValue = await VelnixGateway.instance.directoryItems(
        'listOrderCreators',
      );
      final pagesValue = await VelnixGateway.instance.allowedPages().catchError(
        (_) => <String, dynamic>{'items': <dynamic>[]},
      );
      if (mounted) {
        final companyIds = companiesValue
            .map((c) => c['id'].toString())
            .toSet();
        final creatorIds = creatorsValue.map((c) => c['id'].toString()).toSet();
        final pageItems = ((pagesValue['items'] as List?) ?? [])
            .map((e) => Map<String, dynamic>.from(e as Map))
            .toList();
        final pageIds = pageItems.map((p) => p['id'].toString()).toSet();
        setState(() {
          companies = companiesValue;
          creators = creatorsValue;
          pages = pageItems;
          if (company != null && !companyIds.contains(company)) company = null;
          if (creator != null && !creatorIds.contains(creator)) creator = null;
          if (pageId != null && !pageIds.contains(pageId)) pageId = null;
          error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = 'تعذر تحميل خيارات التصفية');
    }
  }

  void emit() {
    // Rebuild the removable-condition chips as text controllers change.
    if (mounted) setState(() {});
    // Jordan business days use UTC+03:00, including the exclusive next day.
    DateTime boundary(DateTime date) => DateTime.utc(
      date.year,
      date.month,
      date.day,
    ).subtract(const Duration(hours: 3));
    final validCompany =
        company != null && companies.any((c) => c['id'].toString() == company)
        ? company
        : null;
    final validCreator =
        creator != null && creators.any((c) => c['id'].toString() == creator)
        ? creator
        : null;
    final validPage =
        pageId != null && pages.any((p) => p['id'].toString() == pageId)
        ? pageId
        : null;
    final areaText = area.text.trim();
    final phoneText = phone.text.trim();
    final barcodeText = barcode.text.trim();
    final productText = product.text.trim();
    final noteText = note.text.trim();
    widget.onChanged({
      'companyId': ?validCompany,
      'createdBy': ?validCreator,
      'pageId': ?validPage,
      'orderType': ?orderType?.wire,
      'city': ?city,
      'dispatch': ?dispatch,
      if (areaText.isNotEmpty) 'area': areaText,
      if (phoneText.isNotEmpty) 'phone': phoneText,
      if (barcodeText.isNotEmpty) 'barcode': barcodeText,
      if (productText.isNotEmpty) 'product': productText,
      if (noteText.isNotEmpty) 'note': noteText,
      if (from != null && to != null) 'from': boundary(from!).toIso8601String(),
      if (from != null && to != null)
        'to': boundary(to!.add(const Duration(days: 1))).toIso8601String(),
      if (sentFrom != null && sentTo != null)
        'sentFrom': boundary(sentFrom!).toIso8601String(),
      if (sentFrom != null && sentTo != null)
        'sentTo': boundary(
          sentTo!.add(const Duration(days: 1)),
        ).toIso8601String(),
      if (widget.showAmounts && amountMin.text.trim().isNotEmpty)
        'amountMin': amountMin.text.trim(),
      if (widget.showAmounts && amountMax.text.trim().isNotEmpty)
        'amountMax': amountMax.text.trim(),
    });
  }

  void _clearAll() {
    setState(() {
      from = null;
      to = null;
      company = null;
      creator = null;
      pageId = null;
      orderType = null;
      city = null;
      dispatch = null;
      area.clear();
      phone.clear();
      barcode.clear();
      product.clear();
      note.clear();
      amountMin.clear();
      amountMax.clear();
      sentFrom = null;
      sentTo = null;
    });
    emit();
  }

  String? _labelFor(List<Map<String, dynamic>> items, String? id) {
    if (id == null) return null;
    for (final item in items) {
      if (item['id'].toString() == id) return item['name']?.toString();
    }
    return id;
  }

  /// One removable chip per active condition, so a single filter can be cleared
  /// without losing the rest (required final-gate behavior).
  List<Widget> _chips() {
    final chips = <Widget>[];
    void add(String label, VoidCallback clear) => chips.add(
      InputChip(
        // Explicit high-contrast label: the theme's chip labelStyle has no
        // color and rendered as blank pills in the captured screenshots.
        label: Text(
          label,
          style: const TextStyle(
            color: VColors.ink,
            fontFamily: 'Cairo',
            fontSize: 12,
            fontWeight: FontWeight.w700,
          ),
        ),
        backgroundColor: VColors.softBlue,
        side: const BorderSide(color: VColors.line),
        deleteIconColor: VColors.muted,
        onDeleted: () {
          setState(clear);
          emit();
        },
      ),
    );
    if (from != null || to != null) {
      add(
        'الفترة: ${from == null ? '—' : _day(from!)} → ${to == null ? '—' : _day(to!)}',
        () {
          from = null;
          to = null;
        },
      );
    }
    if (sentFrom != null || sentTo != null) {
      add(
        'الإرسال: ${sentFrom == null ? '—' : _day(sentFrom!)} → ${sentTo == null ? '—' : _day(sentTo!)}',
        () {
          sentFrom = null;
          sentTo = null;
        },
      );
    }
    if (company != null) {
      add('الشركة: ${_labelFor(companies, company)}', () => company = null);
    }
    if (creator != null) {
      add('المنشئ: ${_labelFor(creators, creator)}', () => creator = null);
    }
    if (pageId != null) {
      add('الصفحة: ${_labelFor(pages, pageId)}', () => pageId = null);
    }
    if (orderType != null) {
      add('النوع: ${orderType!.label}', () => orderType = null);
    }
    if (city != null) add('المحافظة: $city', () => city = null);
    if (dispatch != null) {
      add('الإرسال: ${dispatchLabels[dispatch]}', () => dispatch = null);
    }
    if (area.text.trim().isNotEmpty) {
      add('المنطقة: ${area.text.trim()}', area.clear);
    }
    if (phone.text.trim().isNotEmpty) {
      add('الهاتف: ${phone.text.trim()}', phone.clear);
    }
    if (barcode.text.trim().isNotEmpty) {
      add('الباركود: ${barcode.text.trim()}', barcode.clear);
    }
    if (product.text.trim().isNotEmpty) {
      add('المنتج: ${product.text.trim()}', product.clear);
    }
    if (note.text.trim().isNotEmpty) {
      add('الملاحظات: ${note.text.trim()}', note.clear);
    }
    if (widget.showAmounts && amountMin.text.trim().isNotEmpty) {
      add('المبلغ ≥ ${amountMin.text.trim()}', amountMin.clear);
    }
    if (widget.showAmounts && amountMax.text.trim().isNotEmpty) {
      add('المبلغ ≤ ${amountMax.text.trim()}', amountMax.clear);
    }
    return chips;
  }

  static String _day(DateTime value) =>
      '${value.year}-${value.month.toString().padLeft(2, '0')}-${value.day.toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      VDateRangeField(
        from: from,
        to: to,
        onChanged: (a, b) {
          setState(() {
            from = a;
            to = b;
          });
          emit();
        },
      ),
      if (!widget.basicOnly)
        VDateRangeField(
          from: sentFrom,
          to: sentTo,
          label: 'تاريخ الإرسال',
          onChanged: (a, b) {
            setState(() {
              sentFrom = a;
              sentTo = b;
            });
            emit();
          },
        ),
      if (!widget.basicOnly)
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: TextButton.icon(
            onPressed: () => setState(() => _advancedOpen = !_advancedOpen),
            icon: Icon(
              _advancedOpen ? Icons.expand_less : Icons.tune,
              size: 18,
            ),
            label: Text(
              _advancedOpen ? 'إخفاء الفلاتر الإضافية' : 'المزيد من الفلاتر',
            ),
          ),
        ),
      if (!widget.basicOnly && _advancedOpen) ...[
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: TextField(
            controller: phone,
            keyboardType: TextInputType.phone,
            onChanged: (_) => emit(),
            decoration: const InputDecoration(labelText: 'الهاتف (أرقام)'),
          ),
        ),
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: TextField(
            controller: barcode,
            textDirection: TextDirection.ltr,
            onChanged: (_) => emit(),
            decoration: const InputDecoration(
              labelText: 'الباركود / رقم الطلب',
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: TextField(
            controller: product,
            onChanged: (_) => emit(),
            decoration: const InputDecoration(labelText: 'المنتج / المحتويات'),
          ),
        ),
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: TextField(
            controller: note,
            onChanged: (_) => emit(),
            decoration: const InputDecoration(labelText: 'الملاحظات'),
          ),
        ),
      ],
      if (_chips().isNotEmpty)
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Wrap(
            spacing: 6,
            runSpacing: 6,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              ..._chips(),
              TextButton.icon(
                onPressed: _clearAll,
                icon: const Icon(Icons.clear_all, size: 18),
                label: const Text('مسح الكل'),
              ),
            ],
          ),
        ),
      if (error != null)
        TextButton(onPressed: load, child: Text('${error!} • إعادة المحاولة')),
      if (_advancedOpen &&
          widget.fixedCompanyId == null &&
          companies.isNotEmpty)
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: DropdownButtonFormField<String>(
            key: ValueKey('company-${company ?? ''}'),
            initialValue: company,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'شركة التوصيل'),
            items: [
              const DropdownMenuItem<String>(
                value: null,
                child: Text('كل الشركات'),
              ),
              ...companies.map(
                (c) => DropdownMenuItem(
                  value: c['id'].toString(),
                  child: Text(
                    c['name'].toString(),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ),
            ],
            onChanged: (value) {
              setState(() => company = value);
              emit();
            },
          ),
        ),
      if (_advancedOpen && creators.length > 1)
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: DropdownButtonFormField<String>(
            key: ValueKey('creator-${creator ?? ''}'),
            initialValue: creator,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'الموظف المنشئ'),
            items: [
              const DropdownMenuItem<String>(
                value: null,
                child: Text('كل الموظفين المتاحين'),
              ),
              ...creators.map(
                (c) => DropdownMenuItem(
                  value: c['id'].toString(),
                  child: Text(
                    c['name'].toString(),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ),
            ],
            onChanged: (value) {
              setState(() => creator = value);
              emit();
            },
          ),
        ),
      // Electronic page (Phase 1) — filters only within visible orders.
      if (!widget.basicOnly && _advancedOpen && pages.isNotEmpty)
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: DropdownButtonFormField<String>(
            key: ValueKey('page-${pageId ?? ''}'),
            initialValue: pageId,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'الصفحة الإلكترونية'),
            items: [
              const DropdownMenuItem<String>(
                value: null,
                child: Text('كل الصفحات'),
              ),
              ...pages.map(
                (p) => DropdownMenuItem(
                  value: p['id'].toString(),
                  child: Text(
                    p['name'].toString(),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ),
            ],
            onChanged: (value) {
              setState(() => pageId = value);
              emit();
            },
          ),
        ),
      if (!widget.basicOnly && _advancedOpen)
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: DropdownButtonFormField<OrderType?>(
            key: ValueKey('type-${orderType?.wire ?? 'all'}'),
            initialValue: orderType,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'نوع الطلب'),
            items: [
              const DropdownMenuItem<OrderType?>(
                value: null,
                child: Text('كل الأنواع'),
              ),
              for (final t in OrderType.values)
                DropdownMenuItem<OrderType?>(value: t, child: Text(t.label)),
            ],
            onChanged: (value) {
              setState(() => orderType = value);
              emit();
            },
          ),
        ),
      if (!widget.basicOnly && _advancedOpen)
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: DropdownButtonFormField<String>(
            key: ValueKey('city-${city ?? ''}'),
            initialValue: city,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'المحافظة'),
            items: [
              const DropdownMenuItem<String>(
                value: null,
                child: Text('كل المحافظات'),
              ),
              for (final g in jordanGovernorates)
                DropdownMenuItem(value: g, child: Text(g)),
            ],
            onChanged: (value) {
              setState(() => city = value);
              emit();
            },
          ),
        ),
      if (!widget.basicOnly && _advancedOpen)
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: TextField(
            controller: area,
            onChanged: (_) => emit(),
            decoration: const InputDecoration(labelText: 'المنطقة (جزئي)'),
          ),
        ),
      if (!widget.basicOnly && _advancedOpen)
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: DropdownButtonFormField<String>(
            key: ValueKey('dispatch-${dispatch ?? ''}'),
            initialValue: dispatch,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'حالة الإرسال'),
            items: [
              const DropdownMenuItem<String>(
                value: null,
                child: Text('كل حالات الإرسال'),
              ),
              for (final e in dispatchLabels.entries)
                DropdownMenuItem(value: e.key, child: Text(e.value)),
            ],
            onChanged: (value) {
              setState(() => dispatch = value);
              emit();
            },
          ),
        ),
      if (!widget.basicOnly && _advancedOpen && widget.showAmounts)
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: amountMin,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  onChanged: (_) => emit(),
                  decoration: const InputDecoration(labelText: 'المبلغ من'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: TextField(
                  controller: amountMax,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  onChanged: (_) => emit(),
                  decoration: const InputDecoration(labelText: 'المبلغ إلى'),
                ),
              ),
            ],
          ),
        ),
    ],
  );
}
