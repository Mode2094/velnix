import 'dart:async';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'gateway.dart';
import 'device_revocation.dart';

/// Push is opt-in; callers surface configuration failures to the employee.
///
/// The web build ships a root-scope worker (`firebase-messaging-sw.js`, generated
/// from public client config) that receives background pushes. On Android the
/// MainActivity channel receives them. Both paths register the resulting token
/// with `registerDevice` so the backend can address this device only.
class NotificationsService {
  NotificationsService._();
  static final instance = NotificationsService._();
  StreamSubscription<String>? _refresh;

  static const _swPath = 'firebase-messaging-sw.js';

  Future<void> enable() async {
    if (!const bool.fromEnvironment('VELNIX_PUSH_ENABLED')) {
      throw VelnixException(
        'إشعارات الجهاز تحتاج تهيئة المؤسسة أولاً؛ استخدم سجل الإشعارات داخل التطبيق',
      );
    }
    final settings = await FirebaseMessaging.instance.requestPermission();
    final status = settings.authorizationStatus;
    if (status == AuthorizationStatus.denied) {
      throw VelnixException(
        'تم رفض الإشعارات. اسمح بها من إعدادات الجهاز أو المتصفح ثم أعد المحاولة',
      );
    }
    if (status != AuthorizationStatus.authorized &&
        status != AuthorizationStatus.provisional) {
      throw VelnixException('اسمح بالإشعارات من إعدادات الجهاز أو المتصفح');
    }
    const vapid = String.fromEnvironment('FIREBASE_VAPID_KEY');
    // Web works with FCM's built-in web push credential. A custom VAPID key is
    // only used when the owner has registered one in the Firebase console;
    // passing an unregistered key makes FCM reject the registration (401).
    // Native defaults are disabled; explicit consent restores token renewal.
    await FirebaseMessaging.instance.setAutoInitEnabled(true);
    final String? token;
    try {
      token = await FirebaseMessaging.instance.getToken(
        vapidKey: kIsWeb && vapid.isNotEmpty ? vapid : null,
        serviceWorkerScriptPath: kIsWeb ? _swPath : null,
      );
    } catch (error) {
      throw VelnixException(_describeEnableFailure(error));
    }
    if (token == null) {
      throw VelnixException('تعذر تسجيل الإشعارات؛ راجع إعدادات Firebase');
    }
    await VelnixGateway.instance.call('registerDevice', {'token': token});
    await _refresh?.cancel();
    _refresh = FirebaseMessaging.instance.onTokenRefresh.listen((value) async {
      try {
        await VelnixGateway.instance.call('registerDevice', {'token': value});
      } catch (_) {
        /* The next explicit enable attempt retries registration. */
      }
    });
  }

  Future<void> disable() async {
    await _refresh?.cancel();
    _refresh = null;
    if (!const bool.fromEnvironment('VELNIX_PUSH_ENABLED')) return;
    await revokeDeviceToken(
      unregister: () async {
        final token = await FirebaseMessaging.instance.getToken();
        if (token != null) {
          await VelnixGateway.instance.call('unregisterDevice', {
            'token': token,
          });
        }
      },
      invalidate: () => FirebaseMessaging.instance.deleteToken(),
      stopAutoInit: () => FirebaseMessaging.instance.setAutoInitEnabled(false),
    );
  }

  Future<void> signOut() async {
    try {
      await disable();
    } catch (_) {
      /* Both cleanup paths are attempted. Offline token revocation still
         needs real-device verification; always close the local Auth session. */
    }
    VelnixGateway.instance.clearCache();
    await VelnixGateway.instance.auth.signOut();
  }

  /// True when the platform can request a device token at all.
  bool get isSupported => const bool.fromEnvironment('VELNIX_PUSH_ENABLED');

  String _describeEnableFailure(Object error) {
    final text = error.toString().toLowerCase();
    if (text.contains('permission')) {
      return 'اسمح بالإشعارات من إعدادات المتصفح أو الجهاز ثم أعد المحاولة';
    }
    if (text.contains('service worker') ||
        text.contains('no active service worker')) {
      return kIsWeb
          ? 'تعذر تحضير عامل الإشعارات في المتصفح؛ أعد تحميل الصفحة ثم حاول مجددًا'
          : 'تعذر تجهيز خدمة الإشعارات على هذا الجهاز';
    }
    if (text.contains('unsupported') || text.contains('not supported')) {
      return kIsWeb
          ? 'هذا المتصفح لا يدعم إشعارات الويب؛ استخدم Chrome أو Edge'
          : 'هذا الجهاز لا يدعم إشعارات الجهاز';
    }
    return 'تعذر تفعيل الإشعارات على هذا الجهاز؛ تأكد من الاتصال بالإنترنت ثم أعد المحاولة';
  }
}
