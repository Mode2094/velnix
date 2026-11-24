/// Opens the standalone Print Manager in its own browser window on the web and
/// degrades to a no-op everywhere else (Android never mounts the manager).
///
/// A separate window — not an in-page dialog — is the whole point: it lets the
/// operator keep working on the orders list while a long print queue runs, and
/// it survives as its own document so reloading the app does not disturb it.
library;

export 'print_window_stub.dart'
    if (dart.library.js_interop) 'print_window_web.dart';
