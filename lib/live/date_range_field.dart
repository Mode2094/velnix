import 'package:flutter/material.dart';
import '../core/theme.dart';

/// Ready-made date ranges shared by every Velnix filter bar.
enum VRangePreset {
  today,
  yesterday,
  last7,
  last30,
  thisMonth,
  lastMonth,
  custom;

  String get label => switch (this) {
    VRangePreset.today => 'اليوم',
    VRangePreset.yesterday => 'أمس',
    VRangePreset.last7 => 'آخر 7 أيام',
    VRangePreset.last30 => 'آخر 30 يومًا',
    VRangePreset.thisMonth => 'هذا الشهر',
    VRangePreset.lastMonth => 'الشهر الماضي',
    VRangePreset.custom => 'فترة مخصصة',
  };
}

/// Resolves a preset to an inclusive [start, end] pair of local calendar days.
/// Returns null for [VRangePreset.custom] (the caller supplies the dates).
({DateTime start, DateTime end})? presetRange(
  VRangePreset preset, {
  DateTime? now,
}) {
  final today = _dayOnly(now ?? DateTime.now());
  switch (preset) {
    case VRangePreset.today:
      return (start: today, end: today);
    case VRangePreset.yesterday:
      final y = today.subtract(const Duration(days: 1));
      return (start: y, end: y);
    case VRangePreset.last7:
      return (start: today.subtract(const Duration(days: 6)), end: today);
    case VRangePreset.last30:
      return (start: today.subtract(const Duration(days: 29)), end: today);
    case VRangePreset.thisMonth:
      return (
        start: DateTime(today.year, today.month, 1),
        end: DateTime(today.year, today.month + 1, 0),
      );
    case VRangePreset.lastMonth:
      final firstThis = DateTime(today.year, today.month, 1);
      final lastPrev = firstThis.subtract(const Duration(days: 1));
      return (start: DateTime(lastPrev.year, lastPrev.month, 1), end: lastPrev);
    case VRangePreset.custom:
      return null;
  }
}

DateTime _dayOnly(DateTime value) =>
    DateTime(value.year, value.month, value.day);

String formatDay(DateTime value) => '${value.day}/${value.month}/${value.year}';

/// Compact, RTL date-range field used across Velnix.
///
/// A single dropdown selects a preset and applies it in one tap. Choosing
/// "فترة مخصصة" reveals only the two "من تاريخ / إلى تاريخ" fields; tapping a
/// field opens a compact calendar (fast month/year jump + manual entry).
class VDateRangeField extends StatefulWidget {
  const VDateRangeField({
    super.key,
    this.from,
    this.to,
    required this.onChanged,
    this.label = 'الفترة الزمنية',
  });

  final DateTime? from;
  final DateTime? to;

  /// Called with the resolved inclusive [from, to] local days, or (null, null)
  /// when the range is cleared.
  final void Function(DateTime? from, DateTime? to) onChanged;
  final String label;

  @override
  State<VDateRangeField> createState() => _VDateRangeFieldState();
}

class _VDateRangeFieldState extends State<VDateRangeField> {
  VRangePreset? preset;
  DateTime? from;
  DateTime? to;

  @override
  void initState() {
    super.initState();
    from = widget.from;
    to = widget.to;
    preset = _matchPreset(from, to);
  }

  /// Detects whether the current from/to pair equals a preset so the dropdown
  /// reflects the state when the screen is re-entered.
  VRangePreset? _matchPreset(DateTime? a, DateTime? b) {
    if (a == null || b == null) return null;
    for (final p in VRangePreset.values) {
      if (p == VRangePreset.custom) continue;
      final r = presetRange(p);
      if (r == null) continue;
      if (_sameDay(r.start, a) && _sameDay(r.end, b)) return p;
    }
    return VRangePreset.custom;
  }

  bool _sameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;

  void _applyPreset(VRangePreset value) {
    if (value == VRangePreset.custom) {
      setState(() => preset = value);
      return;
    }
    final r = presetRange(value);
    if (r == null) return;
    setState(() {
      preset = value;
      from = r.start;
      to = r.end;
    });
    widget.onChanged(r.start, r.end);
  }

  void _clear() {
    setState(() {
      preset = null;
      from = null;
      to = null;
    });
    widget.onChanged(null, null);
  }

  Future<void> _pick(bool isFrom) async {
    final initial = isFrom
        ? (from ?? to ?? DateTime.now())
        : (to ?? from ?? DateTime.now());
    final picked = await showVCompactDatePicker(
      context,
      initialDate: initial,
      firstDate: DateTime(2018),
      lastDate: DateTime.now().add(const Duration(days: 1)),
    );
    if (picked == null || !mounted) return;
    setState(() {
      if (isFrom) {
        from = picked;
        if (to != null && to!.isBefore(picked)) to = picked;
      } else {
        to = picked;
        if (from != null && from!.isAfter(picked)) from = picked;
      }
      preset = VRangePreset.custom;
    });
    if (from != null && to != null) widget.onChanged(from, to);
  }

  String get _summary {
    if (from == null || to == null) return widget.label;
    if (_sameDay(from!, to!)) return formatDay(from!);
    return '${formatDay(from!)} – ${formatDay(to!)}';
  }

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      DropdownButtonFormField<VRangePreset>(
        key: ValueKey('range-preset-${preset?.name ?? 'none'}'),
        isExpanded: true,
        initialValue: preset,
        decoration: InputDecoration(
          labelText: widget.label,
          prefixIcon: const Icon(Icons.date_range_outlined, size: 20),
        ),
        hint: Text(widget.label),
        items: [
          const DropdownMenuItem<VRangePreset>(
            value: null,
            child: Text('كل الفترات'),
          ),
          for (final p in VRangePreset.values)
            DropdownMenuItem<VRangePreset>(value: p, child: Text(p.label)),
        ],
        onChanged: (value) {
          if (value == null) {
            _clear();
          } else {
            _applyPreset(value);
          }
        },
      ),
      if (preset == VRangePreset.custom) ...[
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: _dateField(
                label: 'من تاريخ',
                value: from,
                onTap: () => _pick(true),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _dateField(
                label: 'إلى تاريخ',
                value: to,
                onTap: () => _pick(false),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: FilledButton.icon(
                onPressed: (from != null && to != null)
                    ? () => widget.onChanged(from, to)
                    : null,
                icon: const Icon(Icons.check, size: 18),
                label: const Text('تأكيد الفترة'),
              ),
            ),
            const SizedBox(width: 8),
            TextButton(onPressed: _clear, child: const Text('مسح')),
          ],
        ),
      ] else if (from != null && to != null) ...[
        const SizedBox(height: 6),
        Row(
          children: [
            const Icon(Icons.event_available, size: 16, color: VColors.muted),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                _summary,
                style: const TextStyle(fontSize: 12.5, color: VColors.muted),
              ),
            ),
            TextButton.icon(
              onPressed: _clear,
              icon: const Icon(Icons.close, size: 16),
              label: const Text('مسح الفترة'),
            ),
          ],
        ),
      ],
    ],
  );

  Widget _dateField({
    required String label,
    required DateTime? value,
    required VoidCallback onTap,
  }) => InkWell(
    onTap: onTap,
    borderRadius: BorderRadius.circular(10),
    child: InputDecorator(
      decoration: InputDecoration(
        labelText: label,
        isDense: true,
        suffixIcon: const Icon(Icons.calendar_month_outlined, size: 18),
      ),
      child: IgnorePointer(
        child: Text(
          value == null ? 'اختر التاريخ' : formatDay(value),
          style: TextStyle(
            color: value == null ? VColors.muted : VColors.ink,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    ),
  );
}

/// Compact month calendar dialog: month/year jump, manual date entry and a
/// small grid. Returns the selected local calendar day or null.
Future<DateTime?> showVCompactDatePicker(
  BuildContext context, {
  required DateTime initialDate,
  required DateTime firstDate,
  required DateTime lastDate,
}) => showDialog<DateTime>(
  context: context,
  builder: (_) => _VCompactDatePicker(
    initialDate: initialDate,
    firstDate: firstDate,
    lastDate: lastDate,
  ),
);

class _VCompactDatePicker extends StatefulWidget {
  const _VCompactDatePicker({
    required this.initialDate,
    required this.firstDate,
    required this.lastDate,
  });
  final DateTime initialDate;
  final DateTime firstDate;
  final DateTime lastDate;
  @override
  State<_VCompactDatePicker> createState() => _VCompactDatePickerState();
}

class _VCompactDatePickerState extends State<_VCompactDatePicker> {
  late int year = widget.initialDate.year;
  late int month = widget.initialDate.month;
  late DateTime selected = _dayOnly(widget.initialDate);
  final manual = TextEditingController();
  String? manualError;
  bool showManual = false;

  static const _months = [
    'يناير',
    'فبراير',
    'مارس',
    'أبريل',
    'مايو',
    'يونيو',
    'يوليو',
    'أغسطس',
    'سبتمبر',
    'أكتوبر',
    'نوفمبر',
    'ديسمبر',
  ];

  @override
  void dispose() {
    manual.dispose();
    super.dispose();
  }

  bool _within(DateTime d) =>
      !d.isBefore(_dayOnly(widget.firstDate)) &&
      !d.isAfter(_dayOnly(widget.lastDate));

  void _shiftMonth(int delta) {
    setState(() {
      final next = DateTime(year, month + delta, 1);
      year = next.year;
      month = next.month;
    });
  }

  void _submitManual() {
    final raw = manual.text.trim().replaceAll(RegExp(r'[-.]'), '/');
    final parts = raw.split('/');
    if (parts.length != 3) {
      setState(() => manualError = 'استخدم الصيغة يوم/شهر/سنة');
      return;
    }
    final d = int.tryParse(parts[0]),
        m = int.tryParse(parts[1]),
        y = int.tryParse(parts[2]);
    if (d == null || m == null || y == null || m < 1 || m > 12) {
      setState(() => manualError = 'تاريخ غير صالح');
      return;
    }
    final date = DateTime(y, m, d);
    if (date.month != m || !_within(date)) {
      setState(() => manualError = 'تاريخ خارج النطاق المسموح');
      return;
    }
    Navigator.pop(context, date);
  }

  @override
  Widget build(BuildContext context) => Dialog(
    insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
    child: ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 340),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                const Icon(Icons.calendar_month_outlined, color: VColors.brand),
                const SizedBox(width: 8),
                const Expanded(
                  child: Text(
                    'اختر تاريخًا',
                    style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16),
                  ),
                ),
                IconButton(
                  tooltip: showManual ? 'التقويم' : 'إدخال يدوي',
                  onPressed: () => setState(() => showManual = !showManual),
                  icon: Icon(
                    showManual ? Icons.grid_on_outlined : Icons.edit_outlined,
                  ),
                ),
              ],
            ),
            if (showManual)
              Column(
                children: [
                  TextField(
                    controller: manual,
                    autofocus: true,
                    textAlign: TextAlign.center,
                    keyboardType: TextInputType.datetime,
                    decoration: InputDecoration(
                      hintText: 'يوم/شهر/سنة',
                      errorText: manualError,
                    ),
                    onSubmitted: (_) => _submitManual(),
                  ),
                  const SizedBox(height: 8),
                  FilledButton(
                    onPressed: _submitManual,
                    child: const Text('تطبيق'),
                  ),
                ],
              )
            else ...[
              Row(
                children: [
                  IconButton(
                    tooltip: 'الشهر السابق',
                    onPressed: () => _shiftMonth(-1),
                    icon: const Icon(Icons.chevron_right),
                  ),
                  Expanded(
                    child: Center(
                      child: TextButton(
                        onPressed: _pickMonthAndYear,
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              '${_months[month - 1]} $year',
                              style: const TextStyle(
                                fontWeight: FontWeight.w900,
                                fontSize: 15,
                              ),
                            ),
                            const Icon(Icons.arrow_drop_down, size: 18),
                          ],
                        ),
                      ),
                    ),
                  ),
                  IconButton(
                    tooltip: 'الشهر التالي',
                    onPressed: () => _shiftMonth(1),
                    icon: const Icon(Icons.chevron_left),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              _grid(),
            ],
            const SizedBox(height: 6),
            Row(
              children: [
                TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('إلغاء'),
                ),
                const Spacer(),
                FilledButton(
                  onPressed: _within(selected)
                      ? () => Navigator.pop(context, selected)
                      : null,
                  child: const Text('تأكيد'),
                ),
              ],
            ),
          ],
        ),
      ),
    ),
  );

  /// Compact month/year jump: a year list with the months of the chosen year,
  /// so distant years (e.g. 2025 → 2026) take a couple of taps, not a month-
  /// by-month walk.
  Future<void> _pickMonthAndYear() async {
    final chosenYear = await showModalBottomSheet<int>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SizedBox(
        height: 320,
        child: ListView(
          children: [
            for (var y = widget.lastDate.year; y >= widget.firstDate.year; y--)
              ListTile(
                dense: true,
                title: Text('$y'),
                trailing: y == year
                    ? const Icon(Icons.check, color: VColors.brand)
                    : null,
                onTap: () => Navigator.pop(ctx, y),
              ),
          ],
        ),
      ),
    );
    if (chosenYear == null || !mounted) return;
    final chosenMonth = await showModalBottomSheet<int>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SizedBox(
        height: 320,
        child: ListView(
          children: [
            for (var i = 0; i < _months.length; i++)
              ListTile(
                dense: true,
                title: Text(_months[i]),
                trailing: (i + 1) == month && chosenYear == year
                    ? const Icon(Icons.check, color: VColors.brand)
                    : null,
                onTap: () => Navigator.pop(ctx, i + 1),
              ),
          ],
        ),
      ),
    );
    if (!mounted) return;
    setState(() {
      year = chosenYear;
      if (chosenMonth != null) month = chosenMonth;
    });
  }

  Widget _grid() {
    const weekdays = ['ن', 'ث', 'ر', 'خ', 'ج', 'س', 'ح'];
    final first = DateTime(year, month, 1);
    final daysInMonth = DateTime(year, month + 1, 0).day;
    final leading = first.weekday % 7; // Sunday-first in RTL context
    final cells = <Widget>[];
    for (var i = 0; i < leading; i++) {
      cells.add(const SizedBox.shrink());
    }
    for (var d = 1; d <= daysInMonth; d++) {
      final date = DateTime(year, month, d);
      final isSelected = date == selected;
      final enabled = _within(date);
      final isToday = date == _dayOnly(DateTime.now());
      cells.add(
        InkWell(
          onTap: enabled ? () => setState(() => selected = date) : null,
          borderRadius: BorderRadius.circular(10),
          child: Container(
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: isSelected ? VColors.brand : Colors.transparent,
              borderRadius: BorderRadius.circular(10),
              border: isToday && !isSelected
                  ? Border.all(color: VColors.brand.withValues(alpha: .5))
                  : null,
            ),
            child: Text(
              '$d',
              style: TextStyle(
                fontWeight: isSelected || isToday
                    ? FontWeight.w900
                    : FontWeight.w500,
                color: !enabled
                    ? VColors.muted.withValues(alpha: .4)
                    : isSelected
                    ? Colors.white
                    : VColors.ink,
              ),
            ),
          ),
        ),
      );
    }
    return Column(
      children: [
        Row(
          children: [
            for (final w in weekdays)
              Expanded(
                child: Center(
                  child: Text(
                    w,
                    style: const TextStyle(
                      fontSize: 11,
                      color: VColors.muted,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 4),
        GridView.count(
          crossAxisCount: 7,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 2,
          crossAxisSpacing: 2,
          childAspectRatio: 1.1,
          children: cells,
        ),
      ],
    );
  }
}
