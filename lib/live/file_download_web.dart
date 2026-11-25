import 'dart:js_interop';

import 'package:web/web.dart' as web;

/// Triggers a real browser download of [content] as [fileName] without a server
/// round-trip. Uses a Blob + a synthetic anchor click, then revokes the URL.
void downloadTextFile(
  String fileName,
  String content, {
  String mime = 'text/csv',
}) {
  final blob = web.Blob(
    <JSAny>[content.toJS].toJS,
    web.BlobPropertyBag(type: '$mime;charset=utf-8'),
  );
  final url = web.URL.createObjectURL(blob);
  final anchor = web.document.createElement('a') as web.HTMLAnchorElement
    ..href = url
    ..download = fileName
    ..style.display = 'none';
  web.document.body!.appendChild(anchor);
  anchor.click();
  anchor.remove();
  web.URL.revokeObjectURL(url);
}
