import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:velnix/core/theme.dart';

void main() {
  testWidgets(
    'Arabic controls resolve the offline Cairo font and match their rendered baseline',
    (tester) async {
      final fonts = FontLoader('Cairo')
        ..addFont(rootBundle.load('assets/fonts/Cairo-Regular.ttf'))
        ..addFont(rootBundle.load('assets/fonts/Cairo-Bold.ttf'));
      await fonts.load();
      await (FontLoader(
        'MaterialIcons',
      )..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(390, 700);
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });
      await tester.pumpWidget(
        MaterialApp(
          theme: velnixTheme(),
          home: Directionality(
            textDirection: TextDirection.rtl,
            child: Scaffold(
              appBar: AppBar(title: const Text('تفاصيل الطلب')),
              body: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        ChoiceChip(
                          label: const Text('جميع الطلبات'),
                          selected: true,
                          onSelected: (_) {},
                        ),
                        FilterChip(
                          label: const Text('طلبات متأخرة فقط'),
                          selected: false,
                          onSelected: (_) {},
                        ),
                      ],
                    ),
                    OutlinedButton(
                      onPressed: () {},
                      child: const Text('إكمال الطلب الداخلي'),
                    ),
                    TextButton(
                      onPressed: () {},
                      child: const Text('إعادة المحاولة'),
                    ),
                    const TextField(
                      decoration: InputDecoration(
                        hintText: 'ابحث برقم الطلب أو الهاتف',
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      for (final label in [
        'جميع الطلبات',
        'طلبات متأخرة فقط',
        'إكمال الطلب الداخلي',
        'إعادة المحاولة',
        'تفاصيل الطلب',
      ]) {
        final paragraph = tester.renderObject<RenderParagraph>(
          find.text(label),
        );
        expect(paragraph.text.style?.fontFamily, 'Cairo', reason: label);
      }
      expect(tester.takeException(), isNull);
      await expectLater(
        find.byType(MaterialApp),
        matchesGoldenFile('goldens/arabic_controls_390.png'),
      );
    },
  );
}
