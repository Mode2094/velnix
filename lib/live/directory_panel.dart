import 'package:flutter/material.dart';
import 'gateway.dart';

/// Cursor-based administration lists. A failed refresh discards cached rows.
class DirectoryPanel extends StatefulWidget {
  const DirectoryPanel({
    super.key,
    required this.endpoint,
    required this.builder,
  });
  final String endpoint;
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
        rows = [];
        cursor = null;
        more = true;
      }
    });
    try {
      final data = await VelnixGateway.instance.call(widget.endpoint, {
        'pageSize': 30,
        'query': search.text.trim(),
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
      if (error != null)
        Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            children: [
              Text(error!),
              TextButton(
                onPressed: () => load(reset: true),
                child: const Text('إعادة المحاولة'),
              ),
            ],
          ),
        ),
      Expanded(child: widget.builder(rows)),
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
