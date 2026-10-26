import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pdf/pdf.dart';
import 'package:velnix/core/theme.dart';
import 'package:velnix/live/gateway.dart';
import 'package:velnix/live/live_app.dart';
import 'package:velnix/printing/order_printing.dart';

void main() {
  final original = VelnixGateway.instance;
  setUp(() {
    VelnixGateway.instance = VelnixGateway.forTesting((name, data) async {
      if (name == 'listCompanies' || name == 'listOrderCreators') {
        return {'items': <Map<String, dynamic>>[]};
      }
      if (name == 'dashboardStats') {
        return {
          'counters': {
            for (final bucket in ['all', 'delivery', 'internal'])
              bucket: {
                for (final status in statusLabels.keys)
                  status: {'count': 12, 'amountMinor': 12345},
              },
          },
          'partial': false,
          'amountsVisible': true,
        };
      }
      throw StateError('Unexpected operation: $name');
    });
  });
  tearDown(() => VelnixGateway.instance = original);
  Widget app(Widget child, double scale) => MaterialApp(
    theme: velnixTheme(),
    locale: const Locale('ar'),
    supportedLocales: const [Locale('ar')],
    localizationsDelegates: const [
      GlobalMaterialLocalizations.delegate,
      GlobalWidgetsLocalizations.delegate,
      GlobalCupertinoLocalizations.delegate,
    ],
    builder: (context, child) => MediaQuery(
      data: MediaQuery.of(
        context,
      ).copyWith(textScaler: TextScaler.linear(scale)),
      child: child!,
    ),
    home: Scaffold(body: child),
  );
  for (final width in [
    320.0,
    360.0,
    390.0,
    430.0,
    600.0,
    768.0,
    1024.0,
    1280.0,
    1440.0,
    1920.0,
  ]) {
    for (final scale in [1.0, 2.0]) {
      testWidgets('live dashboard ${width.toInt()}px text $scale', (
        tester,
      ) async {
        tester.view.devicePixelRatio = 1;
        tester.view.physicalSize = Size(width, 700);
        addTearDown(() {
          tester.view.resetPhysicalSize();
          tester.view.resetDevicePixelRatio();
        });
        String? selected;
        await tester.pumpWidget(
          app(
            LiveDashboard(
              policy: SessionPolicy({
                'id': 'gm',
                'name': 'مدير الاختبار',
                'role': 'generalManager',
                'active': true,
              }),
              onNavigate: (bucket, status) {
                selected = '$bucket:${status ?? 'all'}';
              },
              onOpenBucket: (bucket) => selected = bucket,
            ),
            scale,
          ),
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        final allCard = find.text('كل الطلبات').first;
        await tester.ensureVisible(allCard);
        await tester.tap(allCard);
        await tester.pumpAndSettle();
        expect(selected, 'all');
        expect(tester.takeException(), isNull);
      });
    }
  }
  testWidgets('live dashboard golden at phone width', (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(390, 900);
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    final loader = FontLoader('Cairo')
      ..addFont(rootBundle.load('assets/fonts/Cairo-Regular.ttf'))
      ..addFont(rootBundle.load('assets/fonts/Cairo-Bold.ttf'));
    await loader.load();
    await (FontLoader(
      'MaterialIcons',
    )..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
    await tester.pumpWidget(
      app(
        LiveDashboard(
          policy: SessionPolicy({
            'id': 'gm',
            'name': 'مدير الاختبار',
            'role': 'generalManager',
            'active': true,
          }),
          onNavigate: (_, _) {},
        ),
        1,
      ),
    );
    await tester.pumpAndSettle();
    await expectLater(
      find.byType(MaterialApp),
      matchesGoldenFile('goldens/live_dashboard_390.png'),
    );
  });
  test(
    'generate real Arabic PDFs offline for every paper including long orders',
    () async {
      final directory = Directory('build/qa/pdf')..createSync(recursive: true);
      final order = <String, dynamic>{
        'id': 'Order_1234567890',
        'customer': 'عميل عربي طويل الاسم',
        'phone': '+962791234567',
        'city': 'عمّان',
        'area': 'الجبيهة',
        'address': List.filled(8, 'شارع طويل').join(' '),
        'description': List.filled(20, 'محتويات عربية').join(' '),
        'quantity': 10,
        'paymentMethod': 'عند الاستلام',
        'note': List.filled(20, 'ملاحظات تشغيلية').join(' '),
        'amount': 12.345,
        'createdAt': '2026-10-14T00:00:00Z',
      };
      for (final paper in OrderPaper.values) {
        final bytes = await OrderInvoicePdf.generate(
          order: order,
          format: paper.format(widthMm: 50, heightMm: 80),
        );
        expect(String.fromCharCodes(bytes.take(5)), '%PDF-');
        expect(bytes.length, greaterThan(3000));
        await File('${directory.path}/${paper.name}.pdf').writeAsBytes(bytes);
      }
      for (final paper in [OrderPaper.thermal58, OrderPaper.thermal80]) {
        final standard = await OrderInvoicePdf.generate(
          order: {...order, 'id': 'AbCdEfGhIjKlMnOpQrSt'},
          format: paper.format(),
        );
        await File(
          '${directory.path}/${paper.name}_standard_id.pdf',
        ).writeAsBytes(standard);
      }
      final hidden = await OrderInvoicePdf.generate(
        order: Map.of(order)..remove('amount'),
        format: PdfPageFormat.a4,
      );
      await File('${directory.path}/amount_hidden.pdf').writeAsBytes(hidden);
    },
  );
}
