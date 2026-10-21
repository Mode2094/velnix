import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:velnix/core/theme.dart';
import 'package:velnix/live/live_app.dart';

Widget app(Widget child, {double? width, double? height}) => MaterialApp(
  theme: velnixTheme(),
  locale: const Locale('ar'),
  supportedLocales: const [Locale('ar')],
  localizationsDelegates: const [
    GlobalMaterialLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
  ],
  home: width == null
      ? Scaffold(body: child)
      : MediaQuery(
          data: MediaQueryData(size: Size(width, height ?? 844)),
          child: Scaffold(
            body: SizedBox(width: width, child: child),
          ),
        ),
);

VelnixBottomBar bar({
  required int selected,
  List<int?> slots = const [0, 1, null, 6],
  required List<int> selectedCalls,
  VoidCallback? onCreate,
  VoidCallback? onMenu,
}) => VelnixBottomBar(
  selectedIndex: selected,
  slots: slots,
  titles: const [
    'الرئيسية',
    'الطلبات',
    'طلب جديد',
    'شركات التوصيل',
    'الفريق',
    'العمليات',
    'الإشعارات',
  ],
  icons: const [
    Icons.dashboard_outlined,
    Icons.receipt_long_outlined,
    Icons.add_circle_outline,
    Icons.local_shipping_outlined,
    Icons.groups_outlined,
    Icons.history_outlined,
    Icons.notifications_none_outlined,
  ],
  onSelect: selectedCalls.add,
  onCreateOrder: () => onCreate?.call(),
  onOpenMenu: () => onMenu?.call(),
);

void main() {
  testWidgets('phone bar keeps the RTL order and one-tap destinations', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(390, 844);
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    final selectedCalls = <int>[];
    int? created;
    var menus = 0;
    await tester.pumpWidget(
      app(
        bar(
          selected: 0,
          selectedCalls: selectedCalls,
          onCreate: () => created = 1,
          onMenu: () => menus++,
        ),
      ),
    );
    await tester.pumpAndSettle();

    for (final label in ['الرئيسية', 'الطلبات', 'الإشعارات', 'القائمة']) {
      expect(find.text(label), findsOneWidget, reason: label);
    }
    expect(find.bySemanticsLabel('طلب جديد'), findsOneWidget);
    expect(find.byIcon(Icons.add), findsOneWidget);

    // RTL: home sits at the right edge, the menu at the left edge.
    final home = tester.getRect(find.text('الرئيسية'));
    final menu = tester.getRect(find.text('القائمة'));
    final orders = tester.getRect(find.text('الطلبات'));
    final notifications = tester.getRect(find.text('الإشعارات'));
    final create = tester.getRect(find.bySemanticsLabel('طلب جديد'));
    expect(home.right, greaterThan(menu.right));
    expect(home.right, greaterThan(orders.right));
    expect(orders.right, greaterThan(create.right));
    expect(create.right, greaterThan(notifications.right));
    expect(notifications.right, greaterThan(menu.right));

    await tester.tap(find.text('الطلبات'));
    await tester.pumpAndSettle();
    expect(selectedCalls, [1]);

    await tester.tap(find.bySemanticsLabel('طلب جديد'));
    await tester.pumpAndSettle();
    expect(created, 1);

    await tester.tap(find.text('القائمة'));
    await tester.pumpAndSettle();
    expect(menus, 1);
    expect(tester.takeException(), isNull);
  });

  testWidgets('the bar has no overflow at every phone width', (tester) async {
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    for (final size in const [
      Size(320, 640),
      Size(375, 812),
      Size(390, 844),
      Size(430, 932),
      Size(767, 1024),
    ]) {
      tester.view.physicalSize = size;
      await tester.pumpWidget(
        app(bar(selected: 1, selectedCalls: <int>[]), width: size.width),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull, reason: '${size.width}px');
      // Every destination keeps a comfortable touch target.
      for (final label in ['الرئيسية', 'الطلبات', 'الإشعارات', 'القائمة']) {
        final rect = tester.getRect(find.text(label));
        final target = tester.getRect(
          find
              .ancestor(of: find.text(label), matching: find.byType(InkWell))
              .first,
        );
        expect(target.height, greaterThanOrEqualTo(48), reason: label);
        expect(rect.width, greaterThan(0));
      }
      await tester.pumpWidget(const SizedBox());
    }
  });

  testWidgets(
    'a role that cannot create orders gets a balanced four-slot bar',
    (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(320, 640);
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });
      final selectedCalls = <int>[];
      await tester.pumpWidget(
        app(
          bar(
            selected: 0,
            slots: const [0, 1, 6],
            selectedCalls: selectedCalls,
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.bySemanticsLabel('طلب جديد'), findsNothing);
      expect(find.byIcon(Icons.add), findsNothing);
      expect(find.text('الرئيسية'), findsOneWidget);
      expect(find.text('الطلبات'), findsOneWidget);
      expect(find.text('الإشعارات'), findsOneWidget);
      expect(find.text('القائمة'), findsOneWidget);
      // The four remaining slots still split the bar evenly.
      final home = tester.getRect(find.text('الرئيسية'));
      final menu = tester.getRect(find.text('القائمة'));
      expect(home.right - menu.right, greaterThan(300 * 0.6));
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('the active destination is highlighted and the create slot is', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(390, 844);
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    Icon iconOf(IconData data) => tester.widget<Icon>(find.byIcon(data));

    await tester.pumpWidget(app(bar(selected: 2, selectedCalls: <int>[])));
    await tester.pumpAndSettle();
    // The create slot is active, so every other destination stays muted.
    expect(iconOf(Icons.receipt_long_outlined).color, VColors.muted);
    expect(iconOf(Icons.notifications_none_outlined).color, VColors.muted);
    expect(iconOf(Icons.menu).color, VColors.muted);

    await tester.pumpWidget(app(bar(selected: 1, selectedCalls: <int>[])));
    await tester.pumpAndSettle();
    expect(iconOf(Icons.receipt_long_outlined).color, VColors.brand);
    expect(iconOf(Icons.notifications_none_outlined).color, VColors.muted);
    expect(iconOf(Icons.menu).color, VColors.muted);
    expect(tester.takeException(), isNull);
  });

  test('the phone bar stops at the 768px layout transition', () {
    expect(isPhoneShellWidth(320), isTrue);
    expect(isPhoneShellWidth(375), isTrue);
    expect(isPhoneShellWidth(390), isTrue);
    expect(isPhoneShellWidth(430), isTrue);
    expect(isPhoneShellWidth(767.9), isTrue);
    expect(isPhoneShellWidth(768), isFalse);
    expect(isPhoneShellWidth(840), isFalse);
    expect(isPhoneShellWidth(1440), isFalse);
  });
}
