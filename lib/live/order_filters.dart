import 'package:flutter/material.dart';
import 'gateway.dart';
import 'date_range_field.dart';
import 'jordan_locations.dart';
import '../models/entities.dart';

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
  final amountMin = TextEditingController();
  final amountMax = TextEditingController();
  final area = TextEditingController();

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
    load();
  }

  @override
  void dispose() {
    amountMin.dispose();
    amountMax.dispose();
    area.dispose();
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
    widget.onChanged({
      'companyId': ?validCompany,
      'createdBy': ?validCreator,
      'pageId': ?validPage,
      'orderType': ?orderType?.wire,
      'city': ?city,
      'dispatch': ?dispatch,
      if (areaText.isNotEmpty) 'area': areaText,
      if (from != null && to != null) 'from': boundary(from!).toIso8601String(),
      if (from != null && to != null)
        'to': boundary(to!.add(const Duration(days: 1))).toIso8601String(),
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
      amountMin.clear();
      amountMax.clear();
    });
    emit();
  }

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
      if (from != null ||
          to != null ||
          company != null ||
          creator != null ||
          pageId != null ||
          orderType != null ||
          city != null ||
          dispatch != null ||
          area.text.trim().isNotEmpty ||
          amountMin.text.trim().isNotEmpty ||
          amountMax.text.trim().isNotEmpty)
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: TextButton.icon(
            onPressed: _clearAll,
            icon: const Icon(Icons.close, size: 18),
            label: const Text('مسح الفلاتر'),
          ),
        ),
      if (error != null)
        TextButton(onPressed: load, child: Text('${error!} • إعادة المحاولة')),
      if (widget.fixedCompanyId == null && companies.isNotEmpty)
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
      if (creators.length > 1)
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
      if (!widget.basicOnly && pages.isNotEmpty)
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
      if (!widget.basicOnly)
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
      if (!widget.basicOnly)
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
      if (!widget.basicOnly)
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: TextField(
            controller: area,
            onChanged: (_) => emit(),
            decoration: const InputDecoration(labelText: 'المنطقة (جزئي)'),
          ),
        ),
      if (!widget.basicOnly)
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
      if (!widget.basicOnly && widget.showAmounts)
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
