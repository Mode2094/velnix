import 'package:flutter/material.dart';
import 'gateway.dart';
import '../core/widgets.dart';

/// Cursor-based administration lists. A failed refresh discards cached rows.
class DirectoryPanel extends StatefulWidget {
  const DirectoryPanel({
    super.key,
    required this.endpoint,
    required this.builder,
    this.searchable = true,
  });
  final String endpoint;
  final bool searchable;
  final Widget Function(List<Map<String, dynamic>>) builder;
  @override
  State<DirectoryPanel> createState() => _DirectoryPanelState();
}

class _DirectoryPanelState extends State<DirectoryPanel> {
  final search = TextEditingController();
  List<Map<String, dynamic>> rows = [];
  String? cursor, error;
  bool busy = false, more = true;
  int generation = 0;
  String appliedQuery = '';
  @override
  void initState() {
    super.initState();
    load(reset: true);
  }

  @override
  void dispose() {
    search.dispose();
    super.dispose();
  }

  Future<void> load({bool reset = false}) async {
    if (busy && !reset) return;
    final request = ++generation;
    setState(() {
      busy = true;
      error = null;
      if (reset) {
        appliedQuery = search.text.trim();
        rows = [];
        cursor = null;
        more = true;
      }
    });
    try {
      final data = await VelnixGateway.instance.call(widget.endpoint, {
        'pageSize': 30,
        'query': appliedQuery,
        'afterId': ?cursor,
      });
      if (!mounted || request != generation) return;
      if (data['more'] == true &&
          (data['afterId'] == null || data['afterId'] == cursor)) {
        throw VelnixException('تعذر متابعة القائمة؛ حدّثها');
      }
      setState(() {
        rows = [...rows, ...VelnixGateway.instance.listResult(data)];
        cursor = data['afterId'] as String?;
        more = data['more'] == true;
        busy = false;
      });
    } catch (e) {
      if (mounted && request == generation) {
        setState(() {
          rows = [];
          cursor = null;
          more = false;
          busy = false;
          error = e.toString();
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => Column(
    children: [
      Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            if (widget.searchable)
              Expanded(
                child: TextField(
                  controller: search,
                  onSubmitted: (_) => load(reset: true),
                  decoration: const InputDecoration(
                    labelText: 'البحث ببداية الاسم',
                    prefixIcon: Icon(Icons.search),
                  ),
                ),
              ),
            if (widget.searchable)
              IconButton(
                tooltip: 'بحث',
                onPressed: busy ? null : () => load(reset: true),
                icon: const Icon(Icons.search),
              ),
            IconButton(
              tooltip: 'تحديث القائمة',
              onPressed: busy ? null : () => load(reset: true),
              icon: const Icon(Icons.refresh),
            ),
          ],
        ),
      ),
      if (busy) const LinearProgressIndicator(),
      Expanded(
        child: error != null || (busy && rows.isEmpty)
            ? Center(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(12),
                  child: VFeedbackPanel(
                    title: error != null
                        ? 'تعذر تحميل القائمة'
                        : 'جارٍ تحميل القائمة',
                    message: error,
                    loading: error == null,
                    icon: Icons.error_outline,
                    onRetry: error != null ? () => load(reset: true) : null,
                  ),
                ),
              )
            : widget.builder(rows),
      ),
      if (more && !busy)
        Padding(
          padding: const EdgeInsets.all(8),
          child: OutlinedButton.icon(
            onPressed: () => load(),
            icon: const Icon(Icons.expand_more),
            label: const Text('تحميل المزيد'),
          ),
        ),
    ],
  );
}
