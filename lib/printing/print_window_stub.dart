/// Non-web stand-in for the Print Manager window host. Android/desktop never
/// open a browser popup, so every entry point is inert; the caller then falls
/// back to an in-app route instead.
class PrintWindowHandle {
  const PrintWindowHandle();
}

/// Always fails to open off the web (there is no browser window to claim).
PrintWindowHandle? openBlankPrintWindow(String name) => null;

/// Navigates a handle to [url]. Always false off the web.
bool navigatePrintWindow(PrintWindowHandle? handle, String url) => false;

/// Focuses a handle. Inert off the web.
void focusPrintWindow(PrintWindowHandle? handle) {}

/// Whether this platform can host the manager in a real browser window.
const bool printWindowSupported = false;
