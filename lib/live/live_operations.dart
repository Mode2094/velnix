part of 'live_app.dart';

class LiveReports extends StatefulWidget {
  const LiveReports({super.key, required this.policy});
  final SessionPolicy policy;
  @override
  State<LiveReports> createState() => _LiveReportsState();
}

class _LiveReportsState extends State<LiveReports> {
  late Future<Map<String, dynamic>> request;
  Map<String, dynamic> filters = {};
  @override
  void initState() {
    super.initState();
    refresh();
  }

  void refresh() => request = VelnixGateway.instance.dashboard(filters);
  @override
  Widget build(BuildContext context) => AsyncPanel<Map<String, dynamic>>(
    future: request,
    onRetry: () => setState(refresh),
    builder: (data) {
      final all = Map<String, dynamic>.from(
        (data['counters'] as Map)['all'] as Map,
      );
      return SingleChildScrollView(
        child: LiveContent(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'تقرير الطلبات',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 7),
              const Text(
                'ملخص الحالات للطلبات التي يسمح حسابك برؤيتها؛ لا يتضمن إدارة مالية أو محاسبة.',
                style: TextStyle(color: VColors.muted),
              ),
              if (data['partial'] == true)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 10),
                  child: Text(
                    'الملخص جزئي (أحدث 1000 طلب). يلزم إعداد عدادات مجمعة لإحصائيات كاملة.',
                    style: TextStyle(color: VColors.danger),
                  ),
                ),
              const SizedBox(height: 12),
              VLivePanel(
                child: OrderFilters(
                  initialFilters: filters,
                  onChanged: (value) {
                    filters = value;
                    setState(refresh);
                  },
                ),
              ),
              const SizedBox(height: 16),
              VLivePanel(
                child: Column(
                  children: [
                    for (final e in statusLabels.entries)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: CircleAvatar(
                          radius: 12,
                          backgroundColor: statusColors[e.key],
                          child: const SizedBox(),
                        ),
                        title: Text(e.value),
                        subtitle: widget.policy.viewAmounts
                            ? Text(
                                displayAmount(
                                  ((all[e.key] as Map)['amountMinor'] as num) /
                                      1000,
                                ),
                              )
                            : null,
                        trailing: Text(
                          '${(all[e.key] as Map)['count']}',
                          style: const TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 20),
            ],
          ),
        ),
      );
    },
  );
}

class LiveSyncCenter extends StatefulWidget {
  const LiveSyncCenter({super.key});
  @override
  State<LiveSyncCenter> createState() => _LiveSyncCenterState();
}

class _LiveSyncCenterState extends State<LiveSyncCenter> {
  late Future<List<Map<String, dynamic>>> request;
  @override
  void initState() {
    super.initState();
    refresh();
  }

  void refresh() => request = VelnixGateway.instance.syncEvents();
  @override
  Widget build(BuildContext context) => AsyncPanel<List<Map<String, dynamic>>>(
    future: request,
    onRetry: () => setState(refresh),
    builder: (items) => SingleChildScrollView(
      child: LiveContent(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'مركز مزامنة التوصيل',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 6),
            const Text(
              'أحدث أحداث Webhook والمزامنة التي وصلت إلى الخادم وتم توثيقها.',
              style: TextStyle(color: VColors.muted),
            ),
            const SizedBox(height: 14),
            for (final e in items)
              Padding(
                padding: const EdgeInsets.only(bottom: 9),
                child: VLivePanel(
                  child: ListTile(
                    leading: const Icon(
                      Icons.sync_alt_outlined,
                      color: VColors.brand,
                    ),
                    title: Text(
                      '${e['companyName'] ?? ''} • ${e['rawStatus'] ?? ''}',
                    ),
                    subtitle: Text(
                      'طلب ${e['orderId'] ?? ''} • ${e['source'] ?? ''}\n${businessDate(e['receivedAt'])}',
                    ),
                  ),
                ),
              ),
            if (items.isEmpty)
              const VLivePanel(
                child: Text('لا توجد أحداث مزامنة مسجلة حتى الآن'),
              ),
            const SizedBox(height: 12),
            const Text(
              'المزامنة الآلية تحتاج نشر Cloud Scheduler وإعداد API/Webhook للشركة المختارة.',
              style: TextStyle(color: VColors.muted, fontSize: 11),
            ),
          ],
        ),
      ),
    ),
  );
}
