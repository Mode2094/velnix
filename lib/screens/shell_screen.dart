import 'package:flutter/material.dart';
import '../core/theme.dart';
import '../core/widgets.dart';
import '../data/demo_store.dart';
import '../models/entities.dart';
import 'dashboard_screen.dart';
import 'orders_screen.dart';
import 'notifications_screen.dart';
import 'settings_screen.dart';

/// All five roles can create orders. Each role has a separately scoped
/// dashboard/orders/settings experience. The real back end must mirror this
/// access policy with Security Rules / Cloud Functions.
class ShellScreen extends StatefulWidget {
  const ShellScreen({super.key, required this.onLogout});
  final VoidCallback onLogout;
  @override
  State<ShellScreen> createState() => _ShellScreenState();
}

class _ShellScreenState extends State<ShellScreen> {
  int selected = 0;
  OrderBucket orderBucket = OrderBucket.all;
  OrderStatus? orderStatus;
  bool overdueOnly = false;
  int orderRouteVersion = 0;
  static const labels = [
    'الرئيسية',
    'الطلبات',
    'إضافة',
    'الإشعارات',
    'الإعدادات',
  ];
  static const icons = [
    Icons.space_dashboard_outlined,
    Icons.receipt_long_outlined,
    Icons.add_circle_outline_rounded,
    Icons.notifications_none_rounded,
    Icons.tune_rounded,
  ];
  static const selectedIcons = [
    Icons.space_dashboard_rounded,
    Icons.receipt_long_rounded,
    Icons.add_circle_rounded,
    Icons.notifications_rounded,
    Icons.tune_rounded,
  ];

  void openOrders([OrderBucket b = OrderBucket.all, OrderStatus? s]) {
    setState(() {
      orderBucket = b;
      orderStatus = s;
      overdueOnly = false;
      orderRouteVersion++;
      selected = 1;
    });
  }

  void openOverdue() {
    setState(() {
      orderBucket = OrderBucket.all;
      orderStatus = null;
      overdueOnly = true;
      orderRouteVersion++;
      selected = 1;
    });
  }

  void choose(int index) {
    if (index == 1) {
      openOrders();
      return;
    }
    setState(() => selected = index);
  }

  @override
  Widget build(BuildContext context) {
    final store = StoreScope.of(context);
    if (!store.me.active) {
      return Scaffold(
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.lock_person_outlined,
                  size: 50,
                  color: VColors.danger,
                ),
                const SizedBox(height: 12),
                const Text(
                  'هذا الحساب موقوف',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 12),
                FilledButton(
                  onPressed: widget.onLogout,
                  child: const Text('العودة لتسجيل الدخول'),
                ),
              ],
            ),
          ),
        ),
      );
    }
    final wide = MediaQuery.sizeOf(context).width >= 850;
    final views = <Widget>[
      DashboardScreen(
        onOpenOrders: () => openOrders(),
        onNewOrder: () => choose(2),
        onOpenFiltered: (b, s) => openOrders(b, s),
        onOpenOverdue: openOverdue,
      ),
      OrdersScreen(
        key: ValueKey('orders-$orderRouteVersion'),
        initialBucket: orderBucket,
        initialStatus: orderStatus,
        initialOverdueOnly: overdueOnly,
      ),
      OrderFormScreen(
        key: ValueKey("create-$orderRouteVersion"),
        onSaved: () => openOrders(),
      ),
      const NotificationsScreen(),
      SettingsScreen(onLogout: widget.onLogout),
    ];
    return Scaffold(
      appBar: AppBar(
        toolbarHeight: 73,
        backgroundColor: Colors.white,
        titleSpacing: 16,
        title: Row(
          children: [
            VLogo(size: 36, withTitle: MediaQuery.sizeOf(context).width >= 440),
            const Spacer(),
            if (wide) ...[
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 8,
                ),
                decoration: BoxDecoration(
                  color: VColors.softBlue,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  store.me.role.label,
                  style: const TextStyle(
                    color: VColors.brand,
                    fontWeight: FontWeight.w900,
                    fontSize: 11,
                  ),
                ),
              ),
              const SizedBox(width: 11),
            ],
            IconButton(
              tooltip: 'الإشعارات',
              onPressed: () => choose(3),
              icon: Badge(
                isLabelVisible: store.visibleNotices.any(
                  (n) => !n.isReadBy(store.me.id),
                ),
                child: const Icon(
                  Icons.notifications_none_rounded,
                  color: VColors.ink,
                ),
              ),
            ),
            const SizedBox(width: 4),
            InkWell(
              onTap: () => choose(4),
              borderRadius: BorderRadius.circular(20),
              child: CircleAvatar(
                radius: 19,
                backgroundColor: VColors.softBlue,
                child: Text(
                  store.me.name.substring(0, 1),
                  style: const TextStyle(
                    color: VColors.brand,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
      body: Row(
        children: [
          if (wide)
            Container(
              width: MediaQuery.sizeOf(context).width >= 1120 ? 260 : 82,
              decoration: const BoxDecoration(
                color: Colors.white,
                border: Border(left: BorderSide(color: VColors.line)),
              ),
              child: Column(
                children: [
                  const SizedBox(height: 14),
                  Expanded(
                    child: NavigationRail(
                      backgroundColor: Colors.white,
                      extended: MediaQuery.sizeOf(context).width >= 1120,
                      minWidth: 80,
                      groupAlignment: -.9,
                      labelType: MediaQuery.sizeOf(context).width >= 1120
                          ? NavigationRailLabelType.none
                          : NavigationRailLabelType.all,
                      selectedIndex: selected,
                      onDestinationSelected: choose,
                      indicatorColor: VColors.softBlue,
                      destinations: List.generate(
                        labels.length,
                        (i) => NavigationRailDestination(
                          icon: Icon(icons[i], color: VColors.muted),
                          selectedIcon: Icon(
                            selectedIcons[i],
                            color: VColors.brand,
                          ),
                          label: Text(labels[i]),
                        ),
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.all(12),
                    child: Text(
                      'VELNIX • UI DEMO',
                      style: TextStyle(
                        fontSize: 9,
                        color: VColors.muted.withValues(alpha: .8),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          Expanded(
            child: IndexedStack(index: selected, children: views),
          ),
        ],
      ),
      bottomNavigationBar: wide
          ? null
          : SafeArea(
              top: false,
              child: NavigationBar(
                height: 72,
                backgroundColor: Colors.white,
                indicatorColor: VColors.softBlue,
                selectedIndex: selected,
                onDestinationSelected: choose,
                labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
                destinations: List.generate(
                  labels.length,
                  (i) => NavigationDestination(
                    icon: Icon(icons[i], color: VColors.muted, size: 23),
                    selectedIcon: Icon(
                      selectedIcons[i],
                      color: VColors.brand,
                      size: 23,
                    ),
                    label: labels[i],
                  ),
                ),
              ),
            ),
    );
  }
}
