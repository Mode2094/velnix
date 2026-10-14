import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';

/// Public options are supplied by a local file for the selected platform.
/// No project credentials or generated private configuration live in source.
class FirebaseConfiguration {
  static const supplied = FirebaseOptions(
    apiKey: String.fromEnvironment('FIREBASE_API_KEY'),
    appId: String.fromEnvironment('FIREBASE_APP_ID'),
    messagingSenderId: String.fromEnvironment('FIREBASE_SENDER_ID'),
    projectId: String.fromEnvironment('FIREBASE_PROJECT_ID'),
    authDomain: String.fromEnvironment('FIREBASE_AUTH_DOMAIN'),
    storageBucket: String.fromEnvironment('FIREBASE_STORAGE_BUCKET'),
    iosBundleId: String.fromEnvironment('FIREBASE_IOS_BUNDLE_ID'),
  );

  static void validate(
    FirebaseOptions options, {
    required bool web,
    required TargetPlatform platform,
  }) {
    final kind = web
        ? 'web'
        : switch (platform) {
            TargetPlatform.android => 'android',
            TargetPlatform.iOS => 'ios',
            _ => throw StateError('منصة Firebase غير مدعومة'),
          };
    final prefix = '1:${options.messagingSenderId}:$kind:';
    if (options.apiKey.isEmpty ||
        options.projectId.isEmpty ||
        options.messagingSenderId.isEmpty ||
        !options.appId.startsWith(prefix) ||
        options.appId.length == prefix.length) {
      throw StateError('إعداد Firebase لا يطابق المنصة أو المشروع');
    }
    if (kind == 'ios' && options.iosBundleId != 'com.mode2094.velnix') {
      throw StateError('معرف تطبيق iOS غير مطابق');
    }
  }
}
