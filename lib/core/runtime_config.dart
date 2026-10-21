/// Build intent is explicit; a release QA build is not a production deployment.
class RuntimeConfig {
  const RuntimeConfig({
    this.mode = 'live',
    this.environment = 'development',
    this.debugAppCheck = false,
  });
  final String mode, environment;
  final bool debugAppCheck;

  void validate({required bool release}) {
    if (!['demo', 'live'].contains(mode) ||
        !['development', 'staging', 'production'].contains(environment)) {
      throw StateError('إعداد بيئة التشغيل غير صالح');
    }
    if (environment == 'production' && mode != 'live') {
      throw StateError('وضع Demo ممنوع في إعداد الإنتاج');
    }
    if (debugAppCheck && (release || environment == 'production')) {
      throw StateError('App Check debug غير مسموح في هذا الإصدار');
    }
  }

  void validateProject(String projectId) {
    if (environment == 'production' &&
        (projectId.isEmpty || projectId.startsWith('demo-'))) {
      throw StateError('يلزم مشروع Firebase حقيقي ومحدد لإعداد الإنتاج');
    }
  }
}
