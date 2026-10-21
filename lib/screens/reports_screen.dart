import 'package:flutter/material.dart';
import '../core/theme.dart';
import '../core/widgets.dart';
import '../data/demo_store.dart';
import '../models/entities.dart';

class ReportsScreen extends StatelessWidget {
  const ReportsScreen({super.key});
  @override
  Widget build(BuildContext context) {
    final store = StoreScope.of(context);
    if (!store.can(AppPermission.viewReports)) {
      return const Scaffold(
        body: Center(child: Text('التقارير غير متاحة لدورك')),
      );
    }
    final orders = store.visibleOrders;
    final total = orders.fold(0.0, (double n, OrderRecord o) => n + o.amount);
    final delivered = orders
        .where((o) => o.status == OrderStatus.delivered)
        .fold(0.0, (double n, OrderRecord o) => n + o.amount);
    final denominator = orders.isEmpty ? 1 : orders.length;
    return Scaffold(
      appBar: AppBar(title: const Text('التقارير')),
      body: SingleChildScrollView(
        child: VScreen(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const VPageTitle(
                title: 'تحليل أداء الطلبات',
                subtitle:
                    'أرقام حقيقية محسوبة من بيانات المعاينة المتاحة لدورك',
              ),
              const VDemoBanner(compact: true),
              const SizedBox(height: 15),
              LayoutBuilder(
                builder: (context, c) {
                  final cross = c.maxWidth > 760 ? 4 : 2;
                  final itemWidth = (c.maxWidth - (cross - 1) * 10) / cross;
                  return Wrap(
                    spacing: 10,
                    runSpacing: 10,
                    children: [
                      SizedBox(
                        width: itemWidth,
                        child: VMetric(
                          label: 'جميع الطلبات',
                          value: '${orders.length}',
                          icon: Icons.layers_outlined,
                        ),
                      ),
                      SizedBox(
                        width: itemWidth,
                        child: VMetric(
                          label: 'إجمالي المبالغ',
                          value: store.can(AppPermission.viewAmounts)
                              ? jod(total)
                              : 'غير مصرح',
                          icon: Icons.account_balance_wallet_outlined,
                          accent: VColors.violet,
                        ),
                      ),
                      SizedBox(
                        width: itemWidth,
                        child: VMetric(
                          label: 'طلبات مسلّمة',
                          value:
                              '${orders.where((o) => o.status == OrderStatus.delivered).length}',
                          icon: Icons.verified_outlined,
                          accent: VColors.aqua,
                        ),
                      ),
                      SizedBox(
                        width: itemWidth,
                        child: VMetric(
                          label: 'مبالغ مسلّمة',
                          value: store.can(AppPermission.viewAmounts)
                              ? jod(delivered)
                              : 'غير مصرح',
                          icon: Icons.payments_outlined,
                          accent: VColors.warning,
                        ),
                      ),
                    ],
                  );
                },
              ),
              const VSection(title: 'حالات الطلبات'),
              VPanel(
                child: Column(
                  children: [
                    for (final s in OrderStatus.values)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        child: _progress(
                          s,
                          orders.where((o) => o.status == s).length,
                          denominator,
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 17),
              const VPanel(
                color: Color(0xFFFAFBFF),
                child: Row(
                  children: [
                    Icon(Icons.info_outline_rounded, color: VColors.brand),
                    SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'هذه معاينة لتقارير الطلبات فقط. لا يوجد تصدير أو محاسبة متقدمة أو تكامل خارجي مفعل.',
                        style: TextStyle(fontSize: 12, color: VColors.muted),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _progress(OrderStatus status, int count, int total) => Column(
    children: [
      Row(
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(
              color: status.color,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 7),
          Expanded(
            child: Text(
              status.label,
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
            ),
          ),
          Text(
            '$count',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w900,
              color: status.color,
            ),
          ),
        ],
      ),
      const SizedBox(height: 7),
      ClipRRect(
        borderRadius: BorderRadius.circular(6),
        child: LinearProgressIndicator(
          value: count / total,
          backgroundColor: VColors.canvas,
          color: status.color,
          minHeight: 7,
        ),
      ),
    ],
  );
}
