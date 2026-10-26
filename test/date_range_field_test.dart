import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:velnix/core/theme.dart';
import 'package:velnix/live/date_range_field.dart';

Widget app(Widget child) => MaterialApp(
  theme: velnixTheme(),
  locale: const Locale('ar'),
  supportedLocales: const [Locale('ar')],
  localizationsDelegates: const [
    GlobalMaterialLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
  ],
  home: Scaffold(body: SingleChildScrollView(child: child)),
);

/// Taps the "من تاريخ" field by hitting its wrapping InkWell (the InputDecorator
/// label alone is not a hit target).
Future<void> _openFromField(WidgetTester tester) async {
  final inkwell = find
      .ancestor(of: find.text('من تاريخ'), matching: find.byType(InkWell))
      .first;
  await tester.tap(inkwell);
  await tester.pumpAndSettle();
}

void main() {
  test('presets resolve to inclusive local day ranges', () {
    final now = DateTime(2026, 10, 26, 14, 30);

    final today = presetRange(VRangePreset.today, now: now)!;
    expect(today.start, DateTime(2026, 10, 26));
    expect(today.end, DateTime(2026, 10, 26));

    final y = presetRange(VRangePreset.yesterday, now: now)!;
    expect(y.start, DateTime(2026, 10, 25));
    expect(y.end, DateTime(2026, 10, 25));

    final l7 = presetRange(VRangePreset.last7, now: now)!;
    expect(l7.start, DateTime(2026, 10, 20));
    expect(l7.end, DateTime(2026, 10, 26));

    final l30 = presetRange(VRangePreset.last30, now: now)!;
    expect(l30.start, DateTime(2026, 9, 27));
    expect(l30.end, DateTime(2026, 10, 26));

    final tm = presetRange(VRangePreset.thisMonth, now: now)!;
    expect(tm.start, DateTime(2026, 10, 1));
    expect(tm.end, DateTime(2026, 10, 31));

    final lm = presetRange(VRangePreset.lastMonth, now: now)!;
    expect(lm.start, DateTime(2026, 9, 1));
    expect(lm.end, DateTime(2026, 9, 30));

    expect(presetRange(VRangePreset.custom, now: now), isNull);
  });

  test('last month handles a January boundary', () {
    final lm = presetRange(VRangePreset.lastMonth, now: DateTime(2026, 1, 15))!;
    expect(lm.start, DateTime(2025, 12, 1));
    expect(lm.end, DateTime(2025, 12, 31));
  });

  testWidgets('choosing a preset applies it in one tap', (tester) async {
    DateTime? outFrom, outTo;
    await tester.pumpWidget(
      app(
        VDateRangeField(
          onChanged: (a, b) {
            outFrom = a;
            outTo = b;
          },
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('كل الفترات'), findsOneWidget);

    await tester.tap(find.text('كل الفترات'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('آخر 7 أيام').last);
    await tester.pumpAndSettle();

    expect(outFrom, isNotNull);
    expect(outTo, isNotNull);
    final r = presetRange(VRangePreset.last7)!;
    expect(outFrom, r.start);
    expect(outTo, r.end);
    expect(tester.takeException(), isNull);
  });

  testWidgets('choosing custom reveals only the two date fields', (
    tester,
  ) async {
    await tester.pumpWidget(app(VDateRangeField(onChanged: (_, _) {})));
    await tester.pumpAndSettle();
    await tester.tap(find.text('كل الفترات'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('فترة مخصصة').last);
    await tester.pumpAndSettle();
    expect(find.text('من تاريخ'), findsOneWidget);
    expect(find.text('إلى تاريخ'), findsOneWidget);
    expect(find.text('تأكيد الفترة'), findsOneWidget);
    expect(find.text('مسح'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('the compact calendar jumps by year and picks a distant date', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(390, 800);
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    DateTime? picked;
    await tester.pumpWidget(
      app(
        VDateRangeField(
          onChanged: (a, b) {
            picked = a ?? b;
          },
        ),
      ),
    );
    await tester.pumpAndSettle();
    // Open the from field via the custom preset.
    await tester.tap(find.text('كل الفترات'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('فترة مخصصة').last);
    await tester.pumpAndSettle();
    await _openFromField(tester);

    // The compact picker shows a month/year stepper and manual entry toggle.
    expect(find.text('اختر تاريخًا'), findsOneWidget);
    expect(find.byIcon(Icons.edit_outlined), findsOneWidget);

    // Fast year jump: open the month/year sheet and choose a distant year
    // (e.g. 2025 → 2026 range) in two taps instead of walking month by month.
    final dialog = find.byType(Dialog);
    final monthYearButton = find.descendant(
      of: dialog,
      matching: find.byType(TextButton),
    );
    await tester.tap(monthYearButton.first);
    await tester.pumpAndSettle();
    final targetYear = '${DateTime.now().year - 1}';
    expect(find.text(targetYear), findsWidgets);
    await tester.tap(find.text(targetYear).last);
    await tester.pumpAndSettle();
    // Month sheet opens; pick a visible month.
    expect(find.text('يناير'), findsOneWidget);
    await tester.tap(find.text('يناير'));
    await tester.pumpAndSettle();
    // The header now reflects the chosen year/month.
    expect(find.text('يناير $targetYear'), findsOneWidget);
    expect(picked, isNull);
    expect(tester.takeException(), isNull);
  });

  testWidgets('manual entry accepts an explicit day/month/year', (
    tester,
  ) async {
    await tester.pumpWidget(app(VDateRangeField(onChanged: (_, _) {})));
    await tester.pumpAndSettle();
    await tester.tap(find.text('كل الفترات'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('فترة مخصصة').last);
    await tester.pumpAndSettle();
    await _openFromField(tester);
    // Switch to manual entry.
    await tester.tap(find.byIcon(Icons.edit_outlined));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).first, '15/1/2025');
    await tester.tap(find.text('تطبيق'));
    await tester.pumpAndSettle();
    // The dialog closes and the field shows the typed date.
    expect(find.text('اختر تاريخًا'), findsNothing);
    expect(find.text('15/1/2025'), findsWidgets);
    expect(tester.takeException(), isNull);
  });

  testWidgets('clearing a preset range emits nulls', (tester) async {
    var cleared = false;
    await tester.pumpWidget(
      app(
        VDateRangeField(
          onChanged: (a, b) {
            cleared = a == null && b == null;
          },
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('كل الفترات'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('اليوم').last);
    await tester.pumpAndSettle();
    expect(find.text('مسح الفترة'), findsOneWidget);
    await tester.tap(find.text('مسح الفترة'));
    await tester.pumpAndSettle();
    expect(cleared, isTrue);
    expect(tester.takeException(), isNull);
  });

  testWidgets('the field has no overflow at every phone width', (tester) async {
    for (final width in [320.0, 375.0, 390.0, 430.0]) {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = Size(width, 800);
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });
      await tester.pumpWidget(
        app(
          VDateRangeField(
            from: DateTime(2026, 10, 1),
            to: DateTime(2026, 10, 26),
            onChanged: (_, _) {},
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull, reason: '${width}px');
      await tester.pumpWidget(const SizedBox());
    }
  });
}
