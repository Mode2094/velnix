/// Server failure must not prevent attempting to invalidate the device token.
Future<void> revokeDeviceToken({
  required Future<void> Function() unregister,
  required Future<void> Function() invalidate,
}) async {
  try {
    await unregister();
  } finally {
    await invalidate();
  }
}
