import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:velnix/core/theme.dart';
import 'package:velnix/live/live_app.dart';

Widget app(Widget child) => MaterialApp(
  theme: velnixTheme(),
  locale: const Locale('ar'),
  supportedLocales: const [Locale('ar')],
  localizationsDelegates: const [
    GlobalMaterialLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
  ],
  home: child,
);

void main() {
  testWidgets(
    'email/password login exposes validated fields and password visibility',
    (tester) async {
      await tester.pumpWidget(app(const LiveLogin()));
      await tester.pumpAndSettle();
      expect(find.text('البريد الإلكتروني'), findsOneWidget);
      expect(find.text('كلمة المرور'), findsOneWidget);
      expect(find.text('تسجيل الدخول بالبريد'), findsOneWidget);
      expect(find.text('نسيت كلمة المرور؟'), findsOneWidget);
      expect(find.byTooltip('إظهار كلمة المرور'), findsOneWidget);
      await tester.tap(find.byTooltip('إظهار كلمة المرور'));
      await tester.pump();
      expect(find.byTooltip('إخفاء كلمة المرور'), findsOneWidget);

      await tester.enterText(find.byType(TextFormField).first, 'not-an-email');
      await tester.enterText(find.byType(TextFormField).last, '123');
      await tester.tap(find.text('تسجيل الدخول بالبريد'));
      await tester.pump();
      expect(find.text('أدخل بريداً إلكترونياً صالحاً'), findsOneWidget);
      expect(
        find.text('كلمة المرور يجب أن تكون 6 أحرف على الأقل'),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
    },
  );
}
