import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:velnix/core/theme.dart';
import 'package:velnix/live/gateway.dart';
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

  test('unauthenticated errors produce a clear session message', () {
    expect(
      callableErrorMessage('unauthenticated', null),
      contains('تعذر التحقق من أمان الجهاز'),
    );
    // A raw SDK string ("Unauthenticated" / "App Check token rejected") must
    // NEVER reach the user; it falls back to clear Arabic guidance.
    expect(
      callableErrorMessage('unauthenticated', 'Unauthenticated'),
      isNot(contains('Unauthenticated')),
    );
    expect(
      callableErrorMessage('unauthenticated', 'App Check token rejected'),
      isNot(contains('App Check')),
    );
    expect(
      callableErrorMessage('unauthenticated', 'App Check token rejected'),
      contains('تعذر التحقق من أمان الجهاز'),
    );
    // A genuine Arabic server message is preserved.
    expect(
      callableErrorMessage('unauthenticated', 'انتهت الجلسة، أعد تسجيل الدخول'),
      'انتهت الجلسة، أعد تسجيل الدخول',
    );
  });

  test('a transient unauthenticated failure must not end a valid session', () {
    // App Check / transport rejections surface as 'unauthenticated'; they must
    // keep the employee's valid Firebase session so they can retry.
    expect(
      shouldEndSession(errorCode: 'unauthenticated', hasAuthUser: true),
      isFalse,
    );
    // A genuinely invalid session (no Firebase user) does end.
    expect(
      shouldEndSession(errorCode: 'unauthenticated', hasAuthUser: false),
      isTrue,
    );
    // Unrelated codes never end the session.
    expect(
      shouldEndSession(errorCode: 'unavailable', hasAuthUser: false),
      isFalse,
    );
    expect(shouldEndSession(errorCode: null, hasAuthUser: false), isFalse);
  });

  test('session errors are clear and never leak a raw SDK message', () {
    // Case 2 & 5: a rejected App Check / device-attestation token arrives as
    // 'unauthenticated'. The screen must give clear Arabic, not "Unauthenticated".
    expect(
      sessionErrorMessage(
        VelnixException('Unauthenticated', code: 'unauthenticated'),
      ),
      isNot(contains('Unauthenticated')),
    );
    expect(
      sessionErrorMessage(
        VelnixException('Unauthenticated', code: 'unauthenticated'),
      ),
      contains('تعذر التحقق من أمان الجهاز'),
    );
    expect(
      sessionErrorMessage(
        VelnixException('App Check token rejected', code: 'unauthenticated'),
      ),
      isNot(contains('App Check')),
    );
    // Case 3: a transport failure keeps the session and invites a retry.
    expect(
      sessionErrorMessage(
        VelnixException('تعذر الاتصال. تحقق من الشبكة', code: 'unavailable'),
      ),
      'تعذر الاتصال. تحقق من الشبكة',
    );
    // An unexpected/raw failure falls back to a safe Arabic sentence.
    expect(
      sessionErrorMessage(StateError('boom')),
      contains('تعذر تحميل بيانات الحساب'),
    );
    expect(sessionErrorMessage(StateError('boom')), isNot(contains('boom')));
  });
}
