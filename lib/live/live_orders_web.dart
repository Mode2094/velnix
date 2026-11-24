part of 'live_app.dart';

/// Web-only orders view: a wide, compact, Excel-style RTL Data Grid that mirrors
/// the client's reference (one order per row, sticky light-blue header, thin
/// cell borders, hover highlight, row checkboxes, toolbar and filters).
///
/// This is presentation only. It renders the SAME orders the Android card list
/// renders, over the SAME gateway/state methods (search, filters, pagination,
/// bulk status/assign/dispatch/print, detail, scanner). Android never mounts
/// this file: `_LiveOrdersState.build` returns the card list when `!kIsWeb`.
///
/// The widget reads/mutates `_LiveOrdersState` (same library) but never calls
/// the protected `setState` directly — it goes through [webSetState].
class _WebOrdersView extends StatelessWidget {
  const _WebOrdersView({required this.state});
  final _LiveOrdersState state;

  // Light-blue header + thin grid lines, matching the reference density.
  static const _headerBlue = Color(0xFFD7E6F7);
  static const _headerBlue2 = Color(0xFFCDE0F5);
  static const _cellLine = Color(0xFFD9E1EC);
  static const _rowHeight = 46.0;
  static const _headerHeight = 46.0;

  /// Fixed pixel widths, listed in the reference's right-to-left order. A Row in
  /// the app's RTL directionality lays the first entry at the far right.
  static const _columns = <_WebCol>[
    _WebCol(key: 'select', label: '', width: 40, sortable: false),
    _WebCol(key: 'serial', label: '#', width: 42, sortable: false, ltr: true),
    _WebCol(key: 'orderNumber', label: 'رقم الطلب', width: 90, ltr: true),
    _WebCol(key: 'barcode', label: 'الباركود', width: 134, ltr: true),
    _WebCol(key: 'source', label: 'المصدر', width: 74),
    _WebCol(key: 'customer', label: 'العميل / الاسم', width: 112),
    _WebCol(key: 'phone', label: 'رقم الهاتف', width: 104, ltr: true),
    _WebCol(key: 'product', label: 'المنتج', width: 116),
    _WebCol(key: 'creator', label: 'المنشئ', width: 76),
    _WebCol(key: 'city', label: 'المحافظة', width: 84),
    _WebCol(key: 'area', label: 'المنطقة', width: 84),
    _WebCol(key: 'amount', label: 'السعر', width: 76, ltr: true),
    _WebCol(key: 'company', label: 'شركة التوصيل', width: 108),
    _WebCol(key: 'status', label: 'الحالة', width: 84),
    _WebCol(key: 'note', label: 'ملاحظات', width: 92),
    _WebCol(key: 'createdAt', label: 'تاريخ الطلب', width: 122, ltr: true),
  ];

  static double get _totalWidth =>
      _columns.fold<double>(0, (acc, c) => acc + c.width);

  // ---------------------------------------------------------------- helpers

  String _text(Map<String, dynamic> o, String key) => switch (key) {
    'orderNumber' => o['orderNumber']?.toString() ?? '—',
    'barcode' => o['barcodeValue']?.toString() ?? '—',
    'source' => o['pageName']?.toString() ?? '—',
    'customer' => o['customer']?.toString() ?? '—',
    'phone' => o['phone']?.toString() ?? '—',
    'product' => o['description']?.toString() ?? '—',
    'creator' => o['createdByName']?.toString() ?? '—',
    'city' => o['city']?.toString() ?? '—',
    'area' => o['area']?.toString() ?? '—',
    'company' => _companyName(o),
    'note' => o['note']?.toString() ?? '—',
    'amount' => displayAmount(o['amount']),
    'createdAt' => _dateTime(o['createdAt']),
    _ => '—',
  };

  String _companyName(Map<String, dynamic> o) {
    final id = o['companyId']?.toString();
    if (id == null || id.isEmpty) return '—';
    final name = state.webCompanyNames[id];
    return (name == null || name.isEmpty) ? '—' : name;
  }

  static String _dateTime(dynamic value) {
    final parsed = value is DateTime
        ? value
        : DateTime.tryParse(value?.toString() ?? '');
    if (parsed == null) return '—';
    final d = businessTime(parsed);
    String two(int n) => n.toString().padLeft(2, '0');
    return '${two(d.hour)}:${two(d.minute)} ${d.year}-${two(d.month)}-${two(d.day)}';
  }

  static num _num(dynamic v) =>
      v is num ? v : (num.tryParse(v?.toString() ?? '') ?? 0);

  static DateTime _dt(dynamic v) {
    if (v is DateTime) return v;
    return DateTime.tryParse(v?.toString() ?? '') ??
        DateTime.fromMillisecondsSinceEpoch(0);
  }

  /// Digit-aware comparison so "10" sorts after "2" in numeric-looking columns.
  static int _natural(String a, String b) {
    final re = RegExp(r'\d+|\D+');
    final ta = re.allMatches(a).map((m) => m.group(0)!).toList();
    final tb = re.allMatches(b).map((m) => m.group(0)!).toList();
    for (var i = 0; i < ta.length && i < tb.length; i++) {
      final x = ta[i], y = tb[i];
      final nx = num.tryParse(x), ny = num.tryParse(y);
      final c = (nx != null && ny != null)
          ? nx.compareTo(ny)
          : x.toLowerCase().compareTo(y.toLowerCase());
      if (c != 0) return c;
    }
    return ta.length.compareTo(tb.length);
  }

  List<Map<String, dynamic>> _sorted() {
    final rows = List<Map<String, dynamic>>.of(state.rows);
    final key = state.webSortKey;
    if (key == null) return rows;
    int cmp(Map<String, dynamic> a, Map<String, dynamic> b) {
      int c;
      if (key == 'amount') {
        c = _num(a['amount']).compareTo(_num(b['amount']));
      } else if (key == 'createdAt') {
        c = _dt(a['createdAt']).compareTo(_dt(b['createdAt']));
      } else {
        c = _natural(_text(a, key), _text(b, key));
      }
      return state.webSortAsc ? c : -c;
    }

    rows.sort(cmp);
    return rows;
  }

  void _toggleSort(String key) => state.webSetState(() {
    if (state.webSortKey == key) {
      state.webSortAsc = !state.webSortAsc;
    } else {
      state.webSortKey = key;
      state.webSortAsc = true;
    }
  });

  void _openDetail(BuildContext context, String id) {
    Navigator.push(
      context,
      MaterialPageRoute<void>(
        builder: (_) => LiveOrderDetail(id: id, policy: state.widget.policy),
      ),
    ).then((_) {
      if (state.mounted) state.load(reset: true);
    });
  }

  void _create(BuildContext context) {
    Navigator.push(
      context,
      MaterialPageRoute<void>(
        builder: (_) => LiveOrderForm(
          policy: state.widget.policy,
          onSaved: (_) {
            Navigator.pop(context);
            state.load(reset: true);
            state.widget.onCreated?.call();
          },
        ),
      ),
    );
  }

  void _selectAllVisible(bool allSelected) {
    if (allSelected) {
      state._exitSelection();
    } else {
      state._selectAllVisible();
    }
  }

  // ---------------------------------------------------------------- layout

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _topBar(context),
        _toolbar(context),
        if (state.selectionMode) _selectionBar(context),
        Expanded(child: _table(context)),
      ],
    );
  }

  // ---------------------------------------------------------------- top bar

  Widget _topBar(BuildContext context) {
    final section = _sectionLabel();
    return Container(
      color: Colors.white,
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Text(
                'قائمة الطلبات',
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w900,
                  color: VColors.ink,
                ),
              ),
              const Spacer(),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.storefront_outlined, color: VColors.brand),
                  const SizedBox(width: 8),
                  Text(
                    state.webStoreName ?? 'Velnix',
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w900,
                      color: VColors.brand,
                    ),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Text(
                section,
                style: Theme.of(
                  context,
                ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900),
              ),
              const SizedBox(width: 8),
              Material(
                color: VColors.brand,
                borderRadius: BorderRadius.circular(10),
                child: InkWell(
                  borderRadius: BorderRadius.circular(10),
                  onTap: () => _create(context),
                  child: const Padding(
                    padding: EdgeInsets.all(4),
                    child: Icon(Icons.add, color: Colors.white, size: 20),
                  ),
                ),
              ),
              const Spacer(),
              OutlinedButton.icon(
                onPressed: state.busy
                    ? null
                    : () => state.load(reset: true, fresh: true),
                icon: const Icon(Icons.refresh, size: 18),
                label: const Text('تحديث البيانات'),
              ),
              const SizedBox(width: 8),
              FilledButton.icon(
                onPressed: () => _create(context),
                icon: const Icon(Icons.add, size: 18),
                label: const Text('إضافة طلب'),
              ),
            ],
          ),
        ],
      ),
    );
  }

  String _sectionLabel() {
    if (state.status != null) {
      return statusLabels[state.status] ?? state.status!;
    }
    if (state.shippingStatus != null) return 'حالة الشحنة';
    if (state.filters['dispatch'] != null) return 'حالة الإرسال';
    return switch (state.bucket) {
      'delivery' => 'طلبات شركة التوصيل',
      'internal' => 'الطلبات الداخلية',
      _ => 'كل الطلبات',
    };
  }

  // ---------------------------------------------------------------- toolbar

  Widget _toolbar(BuildContext context) {
    return Container(
      color: Colors.white,
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
      child: LayoutBuilder(
        builder: (context, box) {
          final wide = box.maxWidth >= 1120;
          final filters = _filterControls(context);
          final actions = _actionButtons(context);
          final search = _searchBox(context);
          if (wide) {
            return Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                ...filters,
                const SizedBox(width: 12),
                ...actions,
                const SizedBox(width: 12),
                Expanded(child: search),
              ],
            );
          }
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: [...filters, ...actions],
              ),
              const SizedBox(height: 10),
              search,
            ],
          );
        },
      ),
    );
  }

  Widget _searchBox(BuildContext context) => TextField(
    controller: state.search,
    textInputAction: TextInputAction.search,
    onChanged: state._onQueryChanged,
    onSubmitted: (_) {
      state.load(reset: true);
    },
    decoration: InputDecoration(
      isDense: true,
      prefixIcon: const Icon(Icons.search, size: 20),
      hintText: 'بحث (رقم الطلب، الطلب، الاسم، الباركود...)',
      suffixIcon: state.search.text.trim().isEmpty
          ? null
          : IconButton(
              tooltip: 'مسح البحث',
              onPressed: () {
                state.search.clear();
                state.load(reset: true);
              },
              icon: const Icon(Icons.close, size: 18),
            ),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
    ),
  );

  Widget _dropdown({
    required String label,
    required String value,
    required Map<String, String> items,
    required ValueChanged<String?> onChanged,
  }) => SizedBox(
    width: 158,
    child: DropdownButtonFormField<String>(
      key: ValueKey('$label-$value-${items.length}'),
      isExpanded: true,
      isDense: true,
      initialValue: items.containsKey(value) ? value : 'all',
      decoration: InputDecoration(
        isDense: true,
        labelText: label,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 10,
          vertical: 10,
        ),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
      ),
      style: const TextStyle(
        fontFamily: 'Cairo',
        fontSize: 13,
        color: VColors.ink,
      ),
      items: [
        for (final e in items.entries)
          DropdownMenuItem(value: e.key, child: Text(e.value)),
      ],
      onChanged: onChanged,
    ),
  );

  List<Widget> _filterControls(BuildContext context) {
    final statusItems = <String, String>{
      'all': 'الكل',
      for (final e in statusLabels.entries) e.key: e.value,
    };
    final companyItems = <String, String>{
      'all': 'الكل',
      for (final e in state.webCompanyNames.entries)
        if (e.value.isNotEmpty) e.key: e.value,
    };
    final cityItems = <String, String>{
      'all': 'الكل',
      for (final g in jordanGovernorates) g: g,
    };
    return [
      _periodButton(context),
      const SizedBox(width: 10),
      _dropdown(
        label: 'المحافظة',
        value: state.filters['city']?.toString() ?? 'all',
        items: cityItems,
        onChanged: (v) => state.webSetFilter('city', v),
      ),
      const SizedBox(width: 10),
      _dropdown(
        label: 'شركة التوصيل',
        value: state.filters['companyId']?.toString() ?? 'all',
        items: companyItems,
        onChanged: (v) => state.webSetFilter('companyId', v),
      ),
      const SizedBox(width: 10),
      _dropdown(
        label: 'الحالة',
        value: state.status ?? 'all',
        items: statusItems,
        onChanged: (v) => state.webSetStatus(v),
      ),
    ];
  }

  Widget _periodButton(BuildContext context) {
    final active = state.filters['from'] != null;
    return SizedBox(
      height: 48,
      child: OutlinedButton.icon(
        onPressed: () => _pickPeriod(context),
        icon: const Icon(Icons.calendar_month_outlined, size: 18),
        label: Text(active ? 'فترة محددة' : 'الفترة الزمنية'),
      ),
    );
  }

  List<Widget> _actionButtons(BuildContext context) {
    // Right-to-left order matches the reference: QR, send, print, then the
    // advanced-filter button (all before the wide search box).
    return [
      OutlinedButton.icon(
        onPressed: state._openBarcodeScanner,
        icon: const Icon(Icons.qr_code_scanner, size: 18),
        label: const Text('QR'),
      ),
      const SizedBox(width: 10),
      FilledButton.tonalIcon(
        onPressed: () => state.selected.isEmpty
            ? showSuccess(context, 'حدّد طلباً واحداً على الأقل لإرساله.')
            : state._bulkDispatch(),
        icon: const Icon(Icons.send_outlined, size: 18),
        label: const Text('إرسال الطلبات'),
      ),
      const SizedBox(width: 10),
      FilledButton.tonalIcon(
        onPressed: () => state.selected.isEmpty
            ? showSuccess(context, 'حدّد طلباً واحداً على الأقل لطباعته.')
            : state._bulkPrint(),
        icon: const Icon(Icons.print_outlined, size: 18),
        label: const Text('طباعة'),
      ),
      const SizedBox(width: 10),
      OutlinedButton.icon(
        onPressed: () => state._openFilters(context),
        icon: const Icon(Icons.filter_alt_outlined, size: 18),
        label: const Text('فلترة متقدمة'),
      ),
    ];
  }
  // ---------------------------------------------------------------- selection

  Widget _selectionBar(BuildContext context) {
    final canManage = state.widget.policy.canChangeStatus;
    final canSend = state.widget.policy.can('sendToDelivery');
    return Container(
      color: VColors.softBlue,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          Text(
            'المحدد: ${state.selected.length}',
            style: const TextStyle(fontWeight: FontWeight.w900),
          ),
          TextButton(
            onPressed: () => _selectAllVisible(
              state.rows.isNotEmpty &&
                  state.selected.length == state.rows.length,
            ),
            child: const Text('تحديد كل المعروض'),
          ),
          TextButton(
            onPressed: state.bulkBusy ? null : state._selectAllMatching,
            child: const Text('تحديد كل النتائج'),
          ),
          TextButton(
            onPressed: state._exitSelection,
            child: const Text('إلغاء التحديد'),
          ),
          const SizedBox(width: 8),
          FilledButton.icon(
            onPressed: state.selected.isEmpty || state.bulkBusy
                ? null
                : state._bulkPrint,
            icon: const Icon(Icons.print_outlined, size: 18),
            label: const Text('طباعة المحدد'),
          ),
          if (canSend)
            OutlinedButton.icon(
              onPressed: state.selected.isEmpty || state.bulkBusy
                  ? null
                  : state._bulkDispatch,
              icon: const Icon(Icons.send_outlined, size: 18),
              label: const Text('إرسال المحدد'),
            ),
          if (canManage)
            OutlinedButton.icon(
              onPressed: state.selected.isEmpty || state.bulkBusy
                  ? null
                  : state._bulkChangeStatus,
              icon: const Icon(Icons.sync_alt, size: 18),
              label: const Text('تغيير الحالة'),
            ),
          if (canSend)
            OutlinedButton.icon(
              onPressed: state.selected.isEmpty || state.bulkBusy
                  ? null
                  : state._bulkAssign,
              icon: const Icon(Icons.local_shipping_outlined, size: 18),
              label: const Text('إسناد شركة'),
            ),
          if (state.bulkBusy)
            const SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
        ],
      ),
    );
  }

  // ---------------------------------------------------------------- table

  Widget _table(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border.all(color: _cellLine),
          borderRadius: BorderRadius.circular(10),
        ),
        clipBehavior: Clip.antiAlias,
        child: LayoutBuilder(
          builder: (context, box) {
            final width = _totalWidth < box.maxWidth
                ? box.maxWidth
                : _totalWidth;
            return SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: SizedBox(
                width: width,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _headerRow(context),
                    Expanded(child: _body(context)),
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );
  }

  Widget _headerRow(BuildContext context) {
    final allSelected =
        state.rows.isNotEmpty && state.selected.length == state.rows.length;
    return Container(
      height: _headerHeight,
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [_headerBlue2, _headerBlue],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ),
        border: Border(bottom: BorderSide(color: _cellLine)),
      ),
      child: Row(
        children: [
          for (final c in _columns) _headerCell(context, c, allSelected),
        ],
      ),
    );
  }

  Widget _headerCell(BuildContext context, _WebCol c, bool allSelected) {
    if (!c.sortable) {
      return _cellFrame(
        c.width,
        child: c.key == 'select'
            ? Center(
                child: Checkbox(
                  value: allSelected,
                  tristate: false,
                  onChanged: (_) => _selectAllVisible(allSelected),
                  visualDensity: VisualDensity.compact,
                ),
              )
            : Center(
                child: Text(
                  c.label,
                  style: const TextStyle(
                    fontWeight: FontWeight.w900,
                    color: VColors.ink,
                  ),
                ),
              ),
      );
    }
    final active = state.webSortKey == c.key;
    return _cellFrame(
      c.width,
      child: InkWell(
        onTap: () => _toggleSort(c.key),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Flexible(
                child: Text(
                  c.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontWeight: FontWeight.w900,
                    color: active ? VColors.brand : VColors.ink,
                    fontSize: 12,
                  ),
                ),
              ),
              const SizedBox(width: 2),
              Icon(
                active
                    ? (state.webSortAsc
                          ? Icons.arrow_upward
                          : Icons.arrow_downward)
                    : Icons.unfold_more,
                size: 13,
                color: active ? VColors.brand : VColors.muted,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _body(BuildContext context) {
    if (state.error != null) {
      return VFeedbackPanel(
        title: 'تعذر تحميل الطلبات',
        message: state.error,
        icon: Icons.error_outline,
        onRetry: () => state.load(reset: true, fresh: true),
      );
    }
    if (state.rows.isEmpty) {
      if (state.busy) {
        return const VFeedbackPanel(title: 'جارٍ تحميل الطلبات', loading: true);
      }
      return const VFeedbackPanel(
        title: 'لا توجد طلبات مطابقة',
        message: 'جرّب تغيير البحث أو الفلاتر، أو أنشئ طلباً جديداً.',
        icon: Icons.receipt_long_outlined,
      );
    }
    final sorted = _sorted();
    final extra = (state.more ? 1 : 0) + (state.busy ? 1 : 0);
    return ListView.builder(
      controller: state.webScroll,
      primary: false,
      itemCount: sorted.length + extra,
      itemBuilder: (context, index) {
        if (index >= sorted.length) {
          final slot = index - sorted.length;
          if (state.more && slot == 0) return _loadMore(context);
          return const Padding(
            padding: EdgeInsets.symmetric(vertical: 14),
            child: Center(
              child: SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            ),
          );
        }
        return _row(context, sorted[index], index + 1);
      },
    );
  }

  Widget _loadMore(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 12),
    child: Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            'معروض ${state.rows.length} طلب',
            style: const TextStyle(color: VColors.muted, fontSize: 12),
          ),
          const SizedBox(height: 6),
          OutlinedButton.icon(
            onPressed: () => state.load(),
            icon: const Icon(Icons.expand_more),
            label: const Text('تحميل المزيد'),
          ),
        ],
      ),
    ),
  );

  Widget _row(BuildContext context, Map<String, dynamic> o, int serial) {
    final id = o['id'].toString();
    final selected = state.selected.contains(id);
    final hovered = state.webHover == serial;
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => state.webSetState(() => state.webHover = serial),
      onExit: (_) {
        if (state.webHover == serial) {
          state.webSetState(() => state.webHover = null);
        }
      },
      child: InkWell(
        onTap: () => _openDetail(context, id),
        child: Container(
          height: _rowHeight,
          decoration: BoxDecoration(
            color: selected
                ? VColors.softBlue
                : (hovered ? const Color(0xFFF2F6FC) : Colors.white),
            border: const Border(
              bottom: BorderSide(color: _cellLine, width: .7),
            ),
          ),
          child: Row(
            children: [
              for (final c in _columns) _bodyCell(context, c, o, serial, id),
            ],
          ),
        ),
      ),
    );
  }

  Widget _bodyCell(
    BuildContext context,
    _WebCol c,
    Map<String, dynamic> o,
    int serial,
    String id,
  ) {
    if (c.key == 'select') {
      return _cellFrame(
        c.width,
        child: Center(
          child: Checkbox(
            value: state.selected.contains(id),
            visualDensity: VisualDensity.compact,
            onChanged: (_) => state._toggle(id),
          ),
        ),
      );
    }
    if (c.key == 'serial') {
      return _cellFrame(
        c.width,
        child: Center(
          child: Text(
            '$serial',
            style: const TextStyle(color: VColors.muted, fontSize: 12),
          ),
        ),
      );
    }
    if (c.key == 'status') {
      final status = o['status']?.toString() ?? 'created';
      return _cellFrame(c.width, child: Center(child: _statusPill(status)));
    }
    final text = _text(o, c.key);
    return _cellFrame(
      c.width,
      child: Tooltip(
        message: text,
        waitDuration: const Duration(milliseconds: 500),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: Align(
            alignment: c.ltr
                ? Alignment.centerLeft
                : AlignmentDirectional.centerStart,
            child: Text(
              text,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textDirection: c.ltr ? TextDirection.ltr : null,
              style: const TextStyle(fontSize: 13),
            ),
          ),
        ),
      ),
    );
  }

  Widget _statusPill(String status) {
    final label = statusLabels[status] ?? status;
    final color = statusColors[status] ?? VColors.brand;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: .12),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        label,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          color: color,
          fontWeight: FontWeight.w800,
          fontSize: 12,
        ),
      ),
    );
  }

  /// A fixed-width cell with the thin left rule that draws the grid's vertical
  /// lines (RTL rows lay the first column at the right, so the left border is
  /// the separator seen between neighbours).
  Widget _cellFrame(double width, {required Widget child}) => SizedBox(
    width: width,
    child: DecoratedBox(
      decoration: const BoxDecoration(
        border: Border(left: BorderSide(color: _cellLine, width: .7)),
      ),
      child: child,
    ),
  );

  // ---------------------------------------------------------------- period

  Future<void> _pickPeriod(BuildContext context) async {
    final initial = _currentPeriod();
    final picked = await showDialog<({DateTime? from, DateTime? to})>(
      context: context,
      builder: (_) => _WebPeriodDialog(from: initial.from, to: initial.to),
    );
    if (picked == null || !state.mounted) return;
    state.webSetPeriod(picked.from, picked.to);
  }

  ({DateTime? from, DateTime? to}) _currentPeriod() {
    final rawFrom = DateTime.tryParse(state.filters['from']?.toString() ?? '');
    final rawTo = DateTime.tryParse(state.filters['to']?.toString() ?? '');
    DateTime? day(DateTime? v) => v == null
        ? null
        : businessTime(v).subtract(const Duration(microseconds: 1));
    final from = rawFrom == null ? null : businessTime(rawFrom);
    var to = day(rawTo);
    if (from == null || to == null) return (from: null, to: null);
    return (
      from: DateTime(from.year, from.month, from.day),
      to: DateTime(to.year, to.month, to.day),
    );
  }
}

/// One column of the web grid: stable sort key, Arabic label, fixed width and
/// whether it holds LTR data (numbers, barcode, phone, date).
class _WebCol {
  const _WebCol({
    required this.key,
    required this.label,
    required this.width,
    this.ltr = false,
    this.sortable = true,
  });
  final String key;
  final String label;
  final double width;
  final bool ltr;
  final bool sortable;
}

/// Period selector dialog. Returns inclusive local calendar days, or
/// `(null, null)` to clear; the caller converts them to the store's UTC+03:00
/// boundaries before querying, exactly like the shared OrderFilters does.
class _WebPeriodDialog extends StatefulWidget {
  const _WebPeriodDialog({this.from, this.to});
  final DateTime? from;
  final DateTime? to;
  @override
  State<_WebPeriodDialog> createState() => _WebPeriodDialogState();
}

class _WebPeriodDialogState extends State<_WebPeriodDialog> {
  DateTime? from;
  DateTime? to;

  @override
  void initState() {
    super.initState();
    from = widget.from;
    to = widget.to;
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('الفترة الزمنية'),
    content: SizedBox(
      width: 360,
      child: VDateRangeField(
        from: from,
        to: to,
        onChanged: (a, b) => setState(() {
          from = a;
          to = b;
        }),
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('إلغاء'),
      ),
      TextButton(
        onPressed: () => Navigator.pop(context, (from: null, to: null)),
        child: const Text('مسح الفترة'),
      ),
      FilledButton(
        onPressed: () => Navigator.pop(context, (from: from, to: to)),
        child: const Text('تطبيق'),
      ),
    ],
  );
}
