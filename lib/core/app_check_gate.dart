class AppCheckGate {
  AppCheckGate._();

  static Future<void> Function()? _start;
  static Future<void>? _ready;

  /// Registers activation without starting it. The login screen must not pay
  /// for reCAPTCHA/App Check before the user actually needs a protected API.
  static void configure(Future<void> Function() start) {
    _start = start;
    _ready = null;
  }

  static Future<void> wait() {
    final ready = _ready;
    if (ready != null) return ready;
    final start = _start;
    if (start == null) return Future<void>.value();
    final pending = _ready = start();
    pending.then<void>((_) {}, onError: (Object _, StackTrace _) {});
    return pending;
  }
}
