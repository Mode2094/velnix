/// Saves a small text file (CSV/txt) from the app. On the web it triggers a
/// real browser download; everywhere else it is a no-op (Android has no report
/// download surface — the bulk dispatch report is web-only).
library;

export 'file_download_stub.dart'
    if (dart.library.js_interop) 'file_download_web.dart';
