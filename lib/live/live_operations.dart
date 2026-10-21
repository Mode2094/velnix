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
                        dense: true,
                        visualDensity: VisualDensity.compact,
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
  late Future<({List<Map<String, dynamic>> items, bool limited})> request;
  @override
  void initState() {
    super.initState();
    refresh();
  }

  void refresh() => request = VelnixGateway.instance.syncEventsPage();
  @override
  Widget build(
    BuildContext context,
  ) => AsyncPanel<({List<Map<String, dynamic>> items, bool limited})>(
    future: request,
    onRetry: () => setState(refresh),
    builder: (data) => SingleChildScrollView(
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
              'آخر تحديثات حالات الشحن الواردة من شركات التوصيل.',
              style: TextStyle(color: VColors.muted),
            ),
            if (data.limited)
              const Padding(
                padding: EdgeInsets.only(top: 10),
                child: Text(
                  'تظهر أحدث 30 شركة و6 أحداث لكل شركة؛ راجع تفاصيل الطلب للسجل الكامل.',
                  style: TextStyle(color: VColors.danger, fontSize: 12),
                ),
              ),
            const SizedBox(height: 14),
            for (final e in data.items)
              Padding(
                padding: const EdgeInsets.only(bottom: 9),
                child: VLivePanel(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 2,
                  ),
                  child: ListTile(
                    dense: true,
                    visualDensity: VisualDensity.compact,
                    leading: const Icon(
                      Icons.sync_alt_outlined,
                      color: VColors.brand,
                    ),
                    title: Text(
                      '${e['companyName'] ?? ''} • ${e['rawStatus'] ?? ''}',
                    ),
                    subtitle: Text(
                      'طلب ${e['orderId'] ?? ''} • ${syncSourceLabel(e['source'])}\n${businessDate(e['receivedAt'])}',
                    ),
                  ),
                ),
              ),
            if (data.items.isEmpty)
              const VFeedbackPanel(
                title: 'لا توجد أحداث مزامنة مسجلة حتى الآن',
                message: 'ستظهر تحديثات شركات التوصيل هنا عند ورودها.',
                icon: Icons.sync_outlined,
              ),
            const SizedBox(height: 12),
            const Text(
              'إذا تأخرت حالة شحنة، راجع آخر مزامنة في تفاصيل الطلب أو تواصل مع مسؤول المؤسسة.',
              style: TextStyle(color: VColors.muted, fontSize: 11),
            ),
          ],
        ),
      ),
    ),
  );
}
