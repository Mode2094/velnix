import 'package:web/web.dart' as web;

/// A real browser window claimed for the Print Manager. The type is defined
/// per-platform so no cross-platform `is` check on a JS interop type is needed.
class PrintWindowHandle {
  PrintWindowHandle(this.window);
  final web.Window window;
}

/// Synchronously opens a blank named window and returns its handle.
///
/// MUST be called inside the click handler (before any `await`): browsers only
/// honour `window.open` while the user gesture is still "transient". The blank
/// window is navigated to the manager URL later, once the durable print batch
/// has been created server-side, so a slow backend call can never lose the
/// popup to the blocker. Returns null when the popup is blocked.
PrintWindowHandle? openBlankPrintWindow(String name) {
  final window = web.window.open(
    'about:blank',
    name,
    'popup=yes,width=1240,height=940',
  );
  return window == null ? null : PrintWindowHandle(window);
}

/// Navigates a handle returned by [openBlankPrintWindow] to [url].
bool navigatePrintWindow(PrintWindowHandle? handle, String url) {
  if (handle == null) return false;
  handle.window.location.href = url;
  handle.window.focus();
  return true;
}

/// Brings an already-open manager window to the front.
void focusPrintWindow(PrintWindowHandle? handle) {
  handle?.window.focus();
}

const bool printWindowSupported = true;
