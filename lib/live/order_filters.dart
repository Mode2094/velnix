import 'package:flutter/material.dart';
import 'gateway.dart';
import 'date_range_field.dart';

class OrderFilters extends StatefulWidget {
  const OrderFilters({
    super.key,
    required this.onChanged,
    this.fixedCompanyId,
    this.initialFilters = const {},
  });
  final ValueChanged<Map<String, dynamic>> onChanged;
  final String? fixedCompanyId;
  final Map<String, dynamic> initialFilters;
  @override
  State<OrderFilters> createState() => _OrderFiltersState();
}

class _OrderFiltersState extends State<OrderFilters> {
  List<Map<String, dynamic>> companies = [], creators = [];
  String? company, creator, error;
  DateTime? from, to;
  @override
  void initState() {
    super.initState();
    company = widget.initialFilters['companyId'] as String?;
    creator = widget.initialFilters['createdBy'] as String?;
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

  Future<void> load() async {
    try {
      final values = await Future.wait([
        VelnixGateway.instance.companies(),
        VelnixGateway.instance.directoryItems('listOrderCreators'),
      ]);
      if (mounted) {
        final companyIds = values[0].map((c) => c['id'].toString()).toSet();
        final creatorIds = values[1].map((c) => c['id'].toString()).toSet();
        setState(() {
          companies = values[0];
          creators = values[1];
          if (company != null && !companyIds.contains(company)) company = null;
          if (creator != null && !creatorIds.contains(creator)) creator = null;
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
    widget.onChanged({
      'companyId': ?validCompany,
      'createdBy': ?validCreator,
      if (from != null && to != null) 'from': boundary(from!).toIso8601String(),
      if (from != null && to != null)
        'to': boundary(to!.add(const Duration(days: 1))).toIso8601String(),
    });
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
      if (from != null || to != null || company != null || creator != null)
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: TextButton(
            onPressed: () {
              setState(() {
                from = null;
                to = null;
                company = null;
                creator = null;
              });
              emit();
            },
            child: const Text('مسح الفلاتر'),
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
    ],
  );
}
