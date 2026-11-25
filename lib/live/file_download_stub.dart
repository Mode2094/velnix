/// Non-web no-op. Kept in its own file so the conditional export in
/// `file_download.dart` never pulls browser APIs into the Android build.
library;

void downloadTextFile(
  String fileName,
  String content, {
  String mime = 'text/csv',
}) {
  // Intentionally empty: the bulk dispatch report download is web-only.
}
