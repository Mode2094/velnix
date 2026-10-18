part of 'live_app.dart';

class LiveNotices extends StatefulWidget {
  const LiveNotices({super.key, required this.policy});
  final SessionPolicy policy;
  @override
  State<LiveNotices> createState() => _LiveNoticesState();
}

class _LiveNoticesState extends State<LiveNotices> {
  late Future<List<Map<String, dynamic>>> request;
  final _items = <Map<String, dynamic>>[];
  String? _cursor;
  bool _more = false;
  bool _loadingMore = false;
  int _generation = 0;
  @override
  void initState() {
    super.initState();
    reload();
  }

  Future<List<Map<String, dynamic>>> _firstPage() async {
    final generation = ++_generation;
    final page = await VelnixGateway.instance.noticePage();
    if (generation == _generation) {
      _cursor = page.afterId;
      _more = page.more;
      _items
        ..clear()
        ..addAll(page.items);
    }
    return _items;
  }

  void reload() => request = _firstPage();
  void refresh() {
    setState(reload);
  }

  /// Older notices stay reachable instead of being silently cut off once the
  /// first page is exhausted.
  Future<void> loadMore() async {
    if (_loadingMore || !_more || _cursor == null) return;
    final generation = _generation;
    setState(() => _loadingMore = true);
    try {
      final page = await VelnixGateway.instance.noticePage(afterId: _cursor);
      if (!mounted || generation != _generation) return;
      setState(() {
        _items.addAll(page.items);
        _cursor = page.afterId;
        _more = page.more;
      });
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  Future<void> openNotice(Map<String, dynamic> notice) async {
    try {
      if (notice['read'] != true) {
        await VelnixGateway.instance.markNoticeRead(notice['id'].toString());
      }
      if (mounted && notice['orderId'] != null) {
        await Navigator.push(
          context,
          MaterialPageRoute<void>(
            builder: (_) => LiveOrderDetail(
              id: notice['orderId'].toString(),
              policy: widget.policy,
            ),
          ),
        );
      }
      if (mounted) refresh();
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) => AsyncPanel<List<Map<String, dynamic>>>(
    future: request,
    onRetry: refresh,
    builder: (list) => RefreshIndicator(
      onRefresh: () async {
        refresh();
        await request;
      },
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        child: LiveContent(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Wrap(
                alignment: WrapAlignment.spaceBetween,
                spacing: 12,
                runSpacing: 8,
                children: [
                  Text(
                    'الإشعارات',
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                  OutlinedButton.icon(
                    onPressed: refresh,
                    icon: const Icon(Icons.refresh),
                    label: const Text('تحديث'),
                  ),
                  OutlinedButton.icon(
                    onPressed: () async {
                      try {
                        await NotificationsService.instance.enable();
                        if (context.mounted) {
                          showSuccess(
                            context,
                            'تم تفعيل الإشعارات لهذا الجهاز',
                          );
                        }
                      } catch (e) {
                        if (context.mounted) showError(context, e);
                      }
                    },
                    icon: const Icon(Icons.notifications_active_outlined),
                    label: const Text('تفعيل إشعارات الجهاز'),
                  ),
                  TextButton(
                    onPressed: () async {
                      try {
                        await NotificationsService.instance.disable();
                        if (context.mounted) {
                          showSuccess(context, 'تم إيقاف إشعارات هذا الجهاز');
                        }
                      } catch (e) {
                        if (context.mounted) showError(context, e);
                      }
                    },
                    child: const Text('إيقاف إشعارات الجهاز'),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              for (final item in list)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: VLivePanel(
                    child: ListTile(
                      contentPadding: EdgeInsets.zero,
                      onTap: () => openNotice(item),
                      leading: Icon(
                        item['read'] == true
                            ? Icons.notifications_none
                            : Icons.notifications_active,
                        color: VColors.brand,
                      ),
                      title: Text(
                        item['title']?.toString() ?? '',
                        style: TextStyle(
                          fontWeight: item['read'] == true
                              ? FontWeight.w500
                              : FontWeight.w900,
                        ),
                      ),
                      subtitle: Text(
                        '${item['body'] ?? ''}\n${businessDate(item['createdAt'])}',
                      ),
                      trailing: const Icon(Icons.arrow_back_ios_new, size: 14),
                    ),
                  ),
                ),
              if (list.isEmpty)
                const VFeedbackPanel(
                  title: 'لا توجد إشعارات',
                  message: 'ستظهر هنا تحديثات الطلبات المتاحة لحسابك.',
                  icon: Icons.notifications_none_outlined,
                ),
              if (_more)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: OutlinedButton.icon(
                    onPressed: _loadingMore ? null : loadMore,
                    icon: _loadingMore
                        ? const SizedBox.square(
                            dimension: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.expand_more),
                    label: const Text('عرض إشعارات أقدم'),
                  ),
                ),
              const SizedBox(height: 12),
              const Text(
                'اسمح بالإشعارات من إعدادات الجهاز لتلقي التحديثات. يبقى سجل الإشعارات متاحاً داخل التطبيق.',
                style: TextStyle(color: VColors.muted, fontSize: 11),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}
