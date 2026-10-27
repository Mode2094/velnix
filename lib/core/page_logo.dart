import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:image_picker/image_picker.dart';

/// Result of picking and processing a page logo.
class PickedLogo {
  const PickedLogo({required this.dataUri, required this.bytes});
  final String dataUri;
  final Uint8List bytes;
}

/// Picks an image from the gallery/camera (or file dialog on desktop/web via
/// image_picker), shrinks it to a small bounded square, and returns a validated
/// base64 data URI. The server re-validates type and size; this only keeps the
/// payload small and predictable.
///
/// The logo never leaves the device except inside the authenticated callable.
class PageLogoService {
  PageLogoService({ImagePicker? picker}) : _picker = picker ?? ImagePicker();

  final ImagePicker _picker;

  /// Maximum stored size after resizing (matches the server cap of 64 KB).
  static const int maxBytes = 64 * 1024;
  static const int _maxDimension = 320;
  static const int _quality = 80;

  /// Returns null when the user cancels the picker.
  Future<PickedLogo?> pick() async {
    final file = await _picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: _maxDimension.toDouble(),
      maxHeight: _maxDimension.toDouble(),
      imageQuality: _quality,
    );
    if (file == null) return null;
    final bytes = await file.readAsBytes();
    final mime = _mimeFor(file.name, file.mimeType);
    final dataUri = 'data:$mime;base64,${base64Encode(bytes)}';
    return PickedLogo(dataUri: dataUri, bytes: bytes);
  }

  String _mimeFor(String name, String? reported) {
    final m = (reported ?? '').toLowerCase();
    if (m == 'image/png' ||
        m == 'image/jpeg' ||
        m == 'image/webp' ||
        m == 'image/gif') {
      return m;
    }
    final lower = name.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.gif')) return 'image/gif';
    // image_picker resizes/compresses to JPEG by default on most platforms.
    return 'image/jpeg';
  }
}

/// Decodes a stored data URI's bytes for preview; returns null if malformed.
Uint8List? decodeLogoDataUri(String dataUri) {
  if (dataUri.isEmpty) return null;
  final comma = dataUri.indexOf(',');
  if (comma < 0) return null;
  try {
    return base64Decode(dataUri.substring(comma + 1));
  } catch (_) {
    return null;
  }
}
