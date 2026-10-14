import 'package:flutter/material.dart';
import '../core/theme.dart';
import '../core/widgets.dart';
import '../data/demo_store.dart';
import '../models/entities.dart';
import 'orders_screen.dart';

/// Reference-video dashboard, redesigned from scratch. Two real order buckets,
/// each with drill-down status cards and correct role-scoped counts.
class DashboardScreen extends StatelessWidget {
  const DashboardScreen({
    super.key,
    required this.onOpenOrders,
    required this.onNewOrder,
    required this.onOpenFiltered,
    required this.onOpenOverdue,
  });
  final VoidCallback onOpenOrders, onNewOrder;
  final void Function(OrderBucket bucket, OrderStatus? status) onOpenFiltered;
  final VoidCallback onOpenOverdue;

  @override
  Widget build(BuildContext context) {
    final store = StoreScope.of(context);
    final me = store.me;
    final all = store.visibleOrders;
    final overdue = store.overdueOrders;
    final roleHint = switch (me.role) {
      UserRole.generalManager => 'كل العمليات أمامك لحظة بلحظة',
      UserRole.manager => 'نظرة تشغيلية ضمن صلاحياتك',
      UserRole.warehouse => 'ركز على تجهيز وتسليم الطلبات',
      UserRole.sales => 'تابع فريق إدخال البيانات وطلباتك',
      UserRole.dataEntry => 'كل ما يتعلق بالطلبات التي أدخلتها',
    };
    final width = MediaQuery.sizeOf(context).width;
    return SingleChildScrollView(
      child: VScreen(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'مساحة العمل  /  ${me.role.label}',
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w800,
                          color: VColors.brand,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'أهلاً، ${me.name.split(' ').first}',
                        style: const TextStyle(
                          fontSize: 27,
                          fontWeight: FontWeight.w900,
                          color: VColors.ink,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        roleHint,
                        style: const TextStyle(
                          fontSize: 12,
                          color: VColors.muted,
                        ),
                      ),
                    ],
                  ),
                ),
                Container(
                  width: 46,
                  height: 46,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(15),
                    border: Border.all(color: VColors.line),
                  ),
                  child: const Icon(
                    Icons.grid_view_rounded,
                    color: VColors.brand,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 17),
            if (me.role != UserRole.generalManager) ...[
              _roleFocus(store),
              const SizedBox(height: 14),
            ],
            _hero(context, store),
            const SizedBox(height: 13),
            const VDemoBanner(compact: true),
            const SizedBox(height: 6),
            VSection(
              title: me.role == UserRole.warehouse
                  ? 'ملخص تجهيز الطلبات'
                  : 'ملخص الأعمال',
              trailing: TextButton.icon(
                onPressed: onOpenOrders,
                label: const Text('كل الطلبات'),
                icon: const Icon(Icons.arrow_back_rounded, size: 16),
              ),
            ),
            LayoutBuilder(
              builder: (context, constraints) {
                final cross = constraints.maxWidth >= 700 ? 4 : 2;
                final spacing = 11.0;
                final cardWidth =
                    (constraints.maxWidth - spacing * (cross - 1)) / cross;
                return Wrap(
                  spacing: spacing,
                  runSpacing: spacing,
                  children: [
                    _metric(
                      cardWidth,
                      'إجمالي الطلبات',
                      '${all.length}',
                      Icons.layers_outlined,
                      VColors.brand,
                      () => onOpenFiltered(OrderBucket.all, null),
                    ),
                    _metric(
                      cardWidth,
                      'قيد التجهيز',
                      '${store.count(OrderStatus.preparing)}',
                      Icons.pending_actions_outlined,
                      VColors.warning,
                      () => onOpenFiltered(
                        OrderBucket.all,
                        OrderStatus.preparing,
                      ),
                    ),
                    _metric(
                      cardWidth,
                      'قيد التوصيل',
                      '${store.count(OrderStatus.inTransit)}',
                      Icons.local_shipping_outlined,
                      VColors.aqua,
                      () => onOpenFiltered(
                        OrderBucket.all,
                        OrderStatus.inTransit,
                      ),
                    ),
                    _metric(
                      cardWidth,
                      'تم التسليم',
                      '${store.count(OrderStatus.delivered)}',
                      Icons.verified_outlined,
                      const Color(0xFF0C9E78),
                      () => onOpenFiltered(
                        OrderBucket.all,
                        OrderStatus.delivered,
                      ),
                    ),
                  ],
                );
              },
            ),
            VSection(
              title: 'مركز الطلبات',
              trailing: Text(
                '${all.length} طلب متاح لك',
                style: const TextStyle(fontSize: 12, color: VColors.muted),
              ),
            ),
            LayoutBuilder(
              builder: (context, constraints) {
                final cards = <Widget>[
                  _bucketCard(
                    context,
                    store,
                    OrderBucket.delivery,
                    accent: VColors.brand,
                    icon: Icons.local_shipping_rounded,
                    heading: 'طلبات شركات التوصيل',
                    caption: 'حركة الشحن والتسليم',
                    statuses: OrderStatus.values,
                  ),
                  _bucketCard(
                    context,
                    store,
                    OrderBucket.all,
                    accent: VColors.aqua,
                    icon: Icons.receipt_long_rounded,
                    heading: 'جميع الطلبات',
                    caption:
                        'كل الطلبات بمختلف حالاتها، سواء أُسندت للتوصيل أم لا',
                    statuses: OrderStatus.values,
                  ),
                ];
                if (constraints.maxWidth >= 790) {
                  return Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(child: cards[0]),
                      const SizedBox(width: 14),
                      Expanded(child: cards[1]),
                    ],
                  );
                }
                return Column(
                  children: [cards[0], const SizedBox(height: 14), cards[1]],
                );
              },
            ),
            const SizedBox(height: 17),
            _overdueCard(store, overdue),
            VSection(
              title: me.role == UserRole.warehouse
                  ? 'آخر الطلبات للمعالجة'
                  : 'آخر الطلبات',
              trailing: TextButton(
                onPressed: onOpenOrders,
                child: const Text('عرض الكل'),
              ),
            ),
            if (all.isEmpty)
              const VPanel(child: VEmpty(title: 'لا توجد طلبات بعد'))
            else
              ...all
                  .take(width >= 900 ? 6 : 4)
                  .map(
                    (o) => Padding(
                      padding: const EdgeInsets.only(bottom: 11),
                      child: OrderTile(order: o),
                    ),
                  ),
            const SizedBox(height: 10),
          ],
        ),
      ),
    );
  }

  /// Role-driven operational focus, not just a different role label.
  Widget _roleFocus(DemoStore store) {
    final role = store.me.role;
    if (role == UserRole.warehouse) {
      final stages = [
        OrderStatus.review,
        OrderStatus.preparing,
        OrderStatus.ready,
      ];
      return VPanel(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'طابور تجهيز الطلبات',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w900,
                color: VColors.ink,
              ),
            ),
            const SizedBox(height: 5),
            const Text(
              'اختر المرحلة لعرض الطلبات والعمل عليها حسب صلاحياتك.',
              style: TextStyle(color: VColors.muted, fontSize: 12),
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 9,
              runSpacing: 9,
              children: [
                for (final stage in stages)
                  ActionChip(
                    avatar: CircleAvatar(
                      radius: 12,
                      backgroundColor: stage.color.withValues(alpha: .12),
                      child: Text(
                        '${store.count(stage)}',
                        style: TextStyle(
                          color: stage.color,
                          fontSize: 10,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                    label: Text(stage.label),
                    onPressed: () => onOpenFiltered(OrderBucket.all, stage),
                  ),
              ],
            ),
          ],
        ),
      );
    }
    if (role == UserRole.sales) {
      final assigned = store.members
          .where(
            (m) =>
                m.active &&
                m.role == UserRole.dataEntry &&
                m.salesSupervisorId == store.me.id,
          )
          .toList();
      return VPanel(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'متابعة فريق إدخال البيانات',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w900,
                color: VColors.ink,
              ),
            ),
            const SizedBox(height: 7),
            Text(
              'عدد الموظفين المرتبطين بك: ${assigned.length} • طلباتك وطلبات فريقك فقط',
              style: const TextStyle(fontSize: 12, color: VColors.muted),
            ),
            const SizedBox(height: 12),
            TextButton.icon(
              onPressed: onOpenOrders,
              icon: const Icon(Icons.arrow_back_rounded),
              label: const Text('عرض طلبات الفريق'),
            ),
          ],
        ),
      );
    }
    if (role == UserRole.dataEntry) {
      return VPanel(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'لوحة طلباتي',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w900,
                color: VColors.ink,
              ),
            ),
            const SizedBox(height: 7),
            Text(
              'أدخلت ${store.visibleOrders.length} طلباً. يمكنك إنشاء طلب آخر أو متابعة حالة طلباتك.',
              style: const TextStyle(fontSize: 12, color: VColors.muted),
            ),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: onNewOrder,
              icon: const Icon(Icons.add_rounded),
              label: const Text('إضافة طلب'),
            ),
          ],
        ),
      );
    }
    return VPanel(
      child: Row(
        children: [
          const Icon(Icons.admin_panel_settings_outlined, color: VColors.brand),
          const SizedBox(width: 12),
          const Expanded(
            child: Text(
              'لوحة متابعة الإدارة بحسب الصلاحيات المحددة لحسابك.',
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
            ),
          ),
          Text(
            '${store.visibleOrders.length}',
            style: const TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w900,
              color: VColors.brand,
            ),
          ),
        ],
      ),
    );
  }

  Widget _hero(BuildContext context, DemoStore store) => Container(
    padding: const EdgeInsets.fromLTRB(21, 23, 21, 22),
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(25),
      gradient: const LinearGradient(
        colors: [Color(0xFF222C67), Color(0xFF3849BD), Color(0xFF5E73EE)],
        begin: Alignment.topRight,
        end: Alignment.bottomLeft,
      ),
      boxShadow: [
        BoxShadow(
          color: VColors.brand.withValues(alpha: .24),
          blurRadius: 26,
          offset: const Offset(0, 12),
        ),
      ],
    ),
    child: Stack(
      children: [
        Positioned(
          top: -59,
          left: -25,
          child: Container(
            width: 176,
            height: 176,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(
                color: Colors.white.withValues(alpha: .11),
                width: 32,
              ),
            ),
          ),
        ),
        Positioned(
          top: 42,
          left: 20,
          child: Container(
            width: 58,
            height: 58,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: Colors.white.withValues(alpha: .065),
            ),
          ),
        ),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(
                  Icons.auto_awesome_rounded,
                  color: Color(0xFFFFD98B),
                  size: 17,
                ),
                const SizedBox(width: 6),
                const Expanded(
                  child: Text(
                    'VELNIX  /  OPERATIONS CENTER',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 11,
                      color: Colors.white70,
                      fontWeight: FontWeight.w800,
                      letterSpacing: .4,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Container(
                  width: 8,
                  height: 8,
                  decoration: const BoxDecoration(
                    color: Color(0xFF65F4CB),
                    shape: BoxShape.circle,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            const Text(
              'إدارة أذكى. متابعة أسرع.',
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w900,
                color: Colors.white,
              ),
            ),
            const SizedBox(height: 7),
            const Text(
              'من إدخال الطلب حتى آخر تحديث للتوصيل،\nكل شيء واضح وفي مكان واحد.',
              style: TextStyle(
                fontSize: 12,
                color: Color(0xFFE0E5FF),
                height: 1.55,
              ),
            ),
            const SizedBox(height: 17),
            Wrap(
              spacing: 9,
              runSpacing: 9,
              children: [
                FilledButton.icon(
                  onPressed: onNewOrder,
                  icon: const Icon(Icons.add_rounded, size: 20),
                  label: const Text('طلب جديد'),
                  style: FilledButton.styleFrom(
                    backgroundColor: Colors.white,
                    foregroundColor: VColors.navy,
                  ),
                ),
                OutlinedButton.icon(
                  onPressed: onOpenOrders,
                  icon: const Icon(Icons.receipt_long_outlined, size: 18),
                  label: const Text('متابعة الطلبات'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.white,
                    side: BorderSide(color: Colors.white.withValues(alpha: .5)),
                  ),
                ),
              ],
            ),
          ],
        ),
      ],
    ),
  );

  Widget _metric(
    double width,
    String title,
    String count,
    IconData icon,
    Color color,
    VoidCallback onTap,
  ) => SizedBox(
    width: width,
    child: InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: VPanel(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 37,
                  height: 37,
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: .10),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(icon, color: color, size: 20),
                ),
                const Spacer(),
                const Icon(
                  Icons.north_west_rounded,
                  size: 14,
                  color: VColors.muted,
                ),
              ],
            ),
            const SizedBox(height: 13),
            Text(
              count,
              style: const TextStyle(
                fontSize: 26,
                fontWeight: FontWeight.w900,
                color: VColors.ink,
              ),
            ),
            Text(
              title,
              maxLines: 2,
              style: const TextStyle(fontSize: 12, color: VColors.muted),
            ),
          ],
        ),
      ),
    ),
  );

  Widget _bucketCard(
    BuildContext context,
    DemoStore store,
    OrderBucket bucket, {
    required Color accent,
    required IconData icon,
    required String heading,
    required String caption,
    required List<OrderStatus> statuses,
  }) {
    final count = store.bucketCount(bucket);
    final amount = store.bucketAmount(bucket);
    return VPanel(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.all(17),
            decoration: BoxDecoration(
              color: accent.withValues(alpha: .055),
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(22),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: accent.withValues(alpha: .14),
                        borderRadius: BorderRadius.circular(13),
                      ),
                      child: Icon(icon, color: accent, size: 23),
                    ),
                    const SizedBox(width: 11),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            heading,
                            style: const TextStyle(
                              fontSize: 15,
                              color: VColors.ink,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                          Text(
                            caption,
                            style: const TextStyle(
                              fontSize: 12,
                              color: VColors.muted,
                            ),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      onPressed: () => onOpenFiltered(bucket, null),
                      tooltip: 'عرض جميع طلبات القسم',
                      icon: Icon(Icons.arrow_back_rounded, color: accent),
                    ),
                  ],
                ),
                const SizedBox(height: 15),
                Wrap(
                  alignment: WrapAlignment.spaceBetween,
                  crossAxisAlignment: WrapCrossAlignment.end,
                  spacing: 12,
                  runSpacing: 8,
                  children: [
                    Text(
                      '$count طلب',
                      style: const TextStyle(
                        fontSize: 28,
                        fontWeight: FontWeight.w900,
                        color: VColors.ink,
                      ),
                    ),
                    if (store.canSeeAmounts)
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'إجمالي المبالغ',
                            style: TextStyle(
                              color: VColors.muted,
                              fontSize: 11,
                            ),
                          ),
                          Text(
                            jod(amount),
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w900,
                              color: accent,
                            ),
                          ),
                        ],
                      ),
                  ],
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(13),
            child: LayoutBuilder(
              builder: (context, c) {
                final space = 8.0;
                final tileW = (c.maxWidth - space) / 2;
                return Wrap(
                  spacing: space,
                  runSpacing: space,
                  children: [
                    for (final s in statuses)
                      SizedBox(
                        width: tileW,
                        child: _statusTile(store, bucket, s),
                      ),
                  ],
                );
              },
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
            child: InkWell(
              onTap: () => onOpenFiltered(bucket, null),
              borderRadius: BorderRadius.circular(10),
              child: Wrap(
                alignment: WrapAlignment.center,
                children: [
                  Text(
                    'استعراض جميع الطلبات',
                    style: TextStyle(
                      color: accent,
                      fontSize: 12,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(width: 5),
                  Icon(Icons.arrow_back, size: 15, color: accent),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _statusTile(DemoStore store, OrderBucket bucket, OrderStatus status) {
    final number = store.bucketCount(bucket, status);
    final sum = store.bucketAmount(bucket, status);
    return Material(
      color: status.color.withValues(alpha: .055),
      borderRadius: BorderRadius.circular(13),
      child: InkWell(
        borderRadius: BorderRadius.circular(13),
        onTap: () => onOpenFiltered(bucket, status),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
          decoration: BoxDecoration(
            border: Border.all(color: status.color.withValues(alpha: .10)),
            borderRadius: BorderRadius.circular(13),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 7,
                    height: 7,
                    decoration: BoxDecoration(
                      color: status.color,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 7),
                  Expanded(
                    child: Text(
                      status.label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: VColors.ink,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 9),
              Row(
                children: [
                  Text(
                    '$number',
                    style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w900,
                      height: 1,
                      color: status.color,
                    ),
                  ),
                  const Spacer(),
                  const Icon(
                    Icons.arrow_outward_rounded,
                    size: 14,
                    color: VColors.muted,
                  ),
                ],
              ),
              if (store.canSeeAmounts) ...[
                const SizedBox(height: 6),
                Text(
                  jod(sum),
                  maxLines: 1,
                  style: const TextStyle(
                    color: VColors.muted,
                    fontSize: 11.5,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _overdueCard(DemoStore store, List<OrderRecord> overdue) => InkWell(
    onTap: onOpenOverdue,
    borderRadius: BorderRadius.circular(19),
    child: Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF7E8),
        border: Border.all(color: const Color(0xFFF6E6C9)),
        borderRadius: BorderRadius.circular(19),
      ),
      child: Row(
        children: [
          Container(
            width: 49,
            height: 49,
            decoration: BoxDecoration(
              color: VColors.warning.withValues(alpha: .17),
              borderRadius: BorderRadius.circular(13),
            ),
            child: const Icon(
              Icons.schedule_rounded,
              color: Color(0xFFD79223),
              size: 26,
            ),
          ),
          const SizedBox(width: 13),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'طلبات تحتاج متابعة',
                  style: TextStyle(
                    fontWeight: FontWeight.w900,
                    fontSize: 14,
                    color: VColors.ink,
                  ),
                ),
                const Text(
                  'تجاوزت 36 ساعة ولم تُغلق',
                  style: TextStyle(color: VColors.muted, fontSize: 11),
                ),
                if (store.canSeeAmounts)
                  Text(
                    jod(
                      overdue.fold<double>(
                        0.0,
                        (double n, OrderRecord o) => n + o.amount,
                      ),
                    ),
                    style: const TextStyle(
                      fontSize: 11.5,
                      color: Color(0xFFC18B35),
                    ),
                  ),
              ],
            ),
          ),
          Text(
            '${overdue.length}',
            style: const TextStyle(
              fontWeight: FontWeight.w900,
              fontSize: 24,
              color: Color(0xFFC18B35),
            ),
          ),
          const SizedBox(width: 5),
          const Icon(Icons.chevron_left_rounded, color: Color(0xFFC18B35)),
        ],
      ),
    ),
  );
}
