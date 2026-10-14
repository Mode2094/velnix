import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';
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
