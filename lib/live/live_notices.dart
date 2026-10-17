part of 'live_app.dart';

class LiveNotices extends StatefulWidget {
  const LiveNotices({super.key, required this.policy});
  final SessionPolicy policy;
  @override
  State<LiveNotices> createState() => _LiveNoticesState();
}

class _LiveNoticesState extends State<LiveNotices> {
  late Future<List<Map<String, dynamic>>> request;
  @override
  void initState() {
    super.initState();
    reload();
  }

  void reload() => request = VelnixGateway.instance.notices();
  void refresh() {
    setState(reload);
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
