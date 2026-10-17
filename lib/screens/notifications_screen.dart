import 'package:flutter/material.dart';
import '../core/theme.dart';
import '../core/widgets.dart';
import '../data/demo_store.dart';

class NotificationsScreen extends StatelessWidget {
  const NotificationsScreen({super.key});
  @override
  Widget build(BuildContext context) {
    final store = StoreScope.of(context);
    final unread = store.visibleNotices
        .where((n) => !n.isReadBy(store.me.id))
        .length;
    return SingleChildScrollView(
      child: VScreen(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            VPageTitle(
              title: 'الإشعارات',
              subtitle: '$unread إشعارات غير مقروءة',
              action: TextButton(
                onPressed: store.markAllRead,
                child: const Text('قراءة الكل'),
              ),
            ),
            const VDemoBanner(compact: true),
            const SizedBox(height: 15),
            if (store.visibleNotices.isEmpty)
              const VPanel(
                child: VEmpty(
                  title: 'لا توجد إشعارات',
                  subtitle: 'ستظهر هنا تحديثات الطلبات',
                ),
              ),
            ...store.visibleNotices.map(
              (n) => Padding(
                padding: const EdgeInsets.only(bottom: 11),
                child: InkWell(
                  onTap: () => store.markNoticeRead(n),
                  borderRadius: BorderRadius.circular(19),
                  child: VPanel(
                    color: n.isReadBy(store.me.id)
                        ? Colors.white
                        : const Color(0xFFF9FAFF),
                    borderColor: n.isReadBy(store.me.id)
                        ? VColors.line
                        : const Color(0xFFDDE2FF),
                    padding: const EdgeInsets.all(15),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          width: 44,
                          height: 44,
                          decoration: BoxDecoration(
                            color: VColors.softBlue,
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child: Icon(n.icon, color: VColors.brand, size: 22),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      n.title,
                                      style: TextStyle(
                                        fontSize: 14,
                                        fontWeight: n.isReadBy(store.me.id)
                                            ? FontWeight.w700
                                            : FontWeight.w900,
                                        color: VColors.ink,
                                      ),
                                    ),
                                  ),
                                  if (!n.isReadBy(store.me.id))
                                    Container(
                                      width: 8,
                                      height: 8,
                                      decoration: const BoxDecoration(
                                        color: VColors.brand,
                                        shape: BoxShape.circle,
                                      ),
                                    ),
                                ],
                              ),
                              const SizedBox(height: 5),
                              Text(
                                n.body,
                                style: const TextStyle(
                                  fontSize: 12,
                                  color: VColors.muted,
                                  height: 1.5,
                                ),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                '${formatDate(n.time)}  •  ${formatTime(n.time)}',
                                style: const TextStyle(
                                  fontSize: 11.5,
                                  color: VColors.muted,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
