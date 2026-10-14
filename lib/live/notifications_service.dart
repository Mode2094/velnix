import 'dart:async';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'gateway.dart';
import 'device_revocation.dart';

/// Push is opt-in; callers surface configuration failures to the employee.
class NotificationsService {
  NotificationsService._();
  static final instance = NotificationsService._();
  StreamSubscription<String>? _refresh;
  Future<void> enable() async {
    if (!const bool.fromEnvironment('VELNIX_PUSH_ENABLED')) {
      throw VelnixException(
        'إشعارات الجهاز تحتاج تهيئة المؤسسة أولاً؛ استخدم سجل الإشعارات داخل التطبيق',
      );
    }
    final settings = await FirebaseMessaging.instance.requestPermission();
    if (settings.authorizationStatus != AuthorizationStatus.authorized &&
        settings.authorizationStatus != AuthorizationStatus.provisional) {
      throw VelnixException('اسمح بالإشعارات من إعدادات الجهاز أو المتصفح');
    }
    const vapid = String.fromEnvironment('FIREBASE_VAPID_KEY');
    final token = await FirebaseMessaging.instance.getToken(
      vapidKey: vapid.isEmpty ? null : vapid,
    );
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
    );
  }

  Future<void> signOut() async {
    try {
      await disable();
    } catch (_) {
      /* Both cleanup paths are attempted. Offline token revocation still
         needs real-device verification; always close the local Auth session. */
    }
    await VelnixGateway.instance.auth.signOut();
  }
}
