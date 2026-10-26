/// Pure push routing and de-duplication decisions.
///
/// Kept free of Flutter widgets and plugin types so both the foreground
/// listener and the tap handlers share one tested rule, and so the behaviour
/// can be verified without a platform channel.
class PushRouting {
  PushRouting();

  /// Returns the order this push should open, or null when the payload carries
  /// no usable target. Never invents a destination from other fields.
  static String? orderTarget(Map<String, dynamic> data) {
    final id = data['orderId'];
    if (id is! String) return null;
    final target = id.trim();
    return target.isEmpty ? null : target;
  }

  final Set<String> _seenForeground = <String>{};

  /// Foreground notices are shown once per noticeId. A push without a usable
  /// noticeId is still shown, matching the pre-existing behaviour.
  bool shouldPresentForeground(Object? noticeId) {
    if (noticeId is! String || noticeId.isEmpty) return true;
    return _seenForeground.add(noticeId);
  }
}
