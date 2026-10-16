import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_app_check/firebase_app_check.dart';
import 'package:flutter/material.dart';
import 'package:velnix/main.dart' show SetupFailureApp;
import 'package:velnix/live/live_app.dart' show LiveLogin;
import 'package:flutter_test/flutter_test.dart';
import 'package:velnix/core/firebase_configuration.dart';

FirebaseOptions fixture(String kind, {String sender = '123', String? bundle}) =>
    FirebaseOptions(
      apiKey: 'public-fixture',
      appId: '1:$sender:$kind:fixture',
      messagingSenderId: '123',
      projectId: 'fixture-project',
      iosBundleId: bundle,
    );

void main() {
  test('Web App Check uses Enterprise only and rejects missing keys', () {
    final provider = FirebaseConfiguration.webAppCheckProvider(
      'unit-public-enterprise-key',
    );
    expect(provider, isA<ReCaptchaEnterpriseProvider>());
    expect(provider, isNot(isA<ReCaptchaV3Provider>()));
    expect(provider.siteKey, 'unit-public-enterprise-key');
    for (final key in ['', '   ']) {
      expect(
        () => FirebaseConfiguration.webAppCheckProvider(key),
        throwsStateError,
      );
    }
  });
  testWidgets('missing Enterprise key shows setup error without login', (
    tester,
  ) async {
    await tester.pumpWidget(
      const SetupFailureApp(
        message: FirebaseConfiguration.enterpriseSiteKeyRequired,
      ),
    );
    expect(
      find.text(FirebaseConfiguration.enterpriseSiteKeyRequired),
      findsOneWidget,
    );
    expect(find.byType(LiveLogin), findsNothing);
    expect(find.text('المتابعة باستخدام Google'), findsNothing);
  });
  testWidgets('Google button is controlled by the runtime flag only', (
    tester,
  ) async {
    await tester.pumpWidget(const MaterialApp(home: LiveLogin()));
    final button = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'المتابعة باستخدام Google'),
    );
    expect(
      button.onPressed != null,
      const bool.fromEnvironment('VELNIX_GOOGLE_ENABLED'),
    );
    expect(find.byType(TextField), findsNothing);
  });

  test('each platform accepts its own registration, including Web on iOS', () {
    FirebaseConfiguration.validate(
      fixture('web'),
      web: true,
      platform: TargetPlatform.iOS,
    );
    FirebaseConfiguration.validate(
      fixture('android'),
      web: false,
      platform: TargetPlatform.android,
    );
    FirebaseConfiguration.validate(
      fixture('ios', bundle: 'com.mode2094.velnix'),
      web: false,
      platform: TargetPlatform.iOS,
    );
  });
  test('Web registration cannot initialize a native application', () {
    for (final platform in [TargetPlatform.android, TargetPlatform.iOS]) {
      expect(
        () => FirebaseConfiguration.validate(
          fixture('web'),
          web: false,
          platform: platform,
        ),
        throwsStateError,
      );
    }
  });
  test(
    'missing identifiers and mixed sender IDs fail before Firebase init',
    () {
      for (final options in [
        fixture('android', sender: '999'),
        fixture('android').copyWith(projectId: ''),
        fixture('android').copyWith(apiKey: ''),
        fixture('android').copyWith(appId: '1:123:android:'),
      ]) {
        expect(
          () => FirebaseConfiguration.validate(
            options,
            web: false,
            platform: TargetPlatform.android,
          ),
          throwsStateError,
        );
      }
    },
  );
  test('iOS bundle and unsupported desktop targets are rejected', () {
    expect(
      () => FirebaseConfiguration.validate(
        fixture('ios', bundle: 'different.bundle'),
        web: false,
        platform: TargetPlatform.iOS,
      ),
      throwsStateError,
    );
    expect(
      () => FirebaseConfiguration.validate(
        fixture('android'),
        web: false,
        platform: TargetPlatform.linux,
      ),
      throwsStateError,
    );
  });
}
