/// Server failure must not prevent attempting to invalidate the device token.
Future<void> revokeDeviceToken({
  required Future<void> Function() unregister,
  required Future<void> Function() invalidate,
  Future<void> Function()? stopAutoInit,
}) async {
  try {
    await unregister();
  } finally {
    try {
      await stopAutoInit?.call();
    } finally {
      await invalidate();
    }
  }
}
