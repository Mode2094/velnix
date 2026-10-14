import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:velnix/main.dart';

void main() {
  for (final width in [320.0, 390.0, 768.0, 1024.0, 1440.0, 1920.0]) {
    testWidgets('initial dashboard has no layout exception at ${width.toInt()} px', (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = Size(width, 900);
      addTearDown(() {
        tester.view.resetDevicePixelRatio();
        tester.view.resetPhysicalSize();
      });
      await tester.pumpWidget(const VelnixApp());
      await tester.ensureVisible(find.text('دخول إلى لوحة التحكم'));
      await tester.tap(find.text('دخول إلى لوحة التحكم'));
      await tester.pumpAndSettle();
      expect(find.text('طلبات شركات التوصيل'), findsOneWidget);
      expect(find.text('جميع الطلبات'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }
}
