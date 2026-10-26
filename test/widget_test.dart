import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:velnix/main.dart';

void main() {
  testWidgets('demo login leads to segmented delivery and internal dashboard', (
    tester,
  ) async {
    await tester.pumpWidget(const VelnixApp());
    expect(find.text('مساحة العمل الذكية'), findsOneWidget);
    await tester.ensureVisible(find.text('دخول إلى لوحة التحكم'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('دخول إلى لوحة التحكم'));
    await tester.pumpAndSettle();
    expect(find.text('طلبات شركات التوصيل'), findsOneWidget);
    expect(find.text('جميع الطلبات'), findsOneWidget);
    expect(find.text('مركز الطلبات'), findsOneWidget);
    expect(find.byType(MaterialApp), findsOneWidget);
  });
}
