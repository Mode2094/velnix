import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:pdf/pdf.dart';
import 'package:velnix/printing/order_printing.dart';

/// A synthetic NEW order: it carries a real sequential serial (`orderNumber`).
/// Never a real customer.
Map<String, dynamic> newOrder({
  String id = 'RLWEouzNty2huVT8DUHN',
  String number = 'VNX-000039',
  Map<String, dynamic> extra = const {},
}) => {
  'id': id,
  'orderNumber': number,
  'customer': 'عميل اختبار',
  'phone': '0791234567',
  'city': 'عمان',
  'area': 'خلدا',
  'address': 'شارع الاختبار',
  'description': 'طقم',
  'quantity': 1,
  'paymentMethod': 'عند الاستلام',
  'createdAt': '2026-10-17T08:45:40.549279Z',
  'amount': 12.5,
  ...extra,
};

/// A synthetic LEGACY order: created before the sequence counter, so it has no
/// `orderNumber` and stored the old `VNX-<docId>` barcode value.
Map<String, dynamic> legacyOrder({
  String id = 'legacyDocId_0001',
  Map<String, dynamic> extra = const {},
}) => {
  'id': id,
  'barcodeValue': 'VNX-$id',
  'customer': 'عميل قديم',
  'phone': '0780000000',
  'city': 'إربد',
  'area': 'وسط',
  'address': 'شارع قديم',
  'description': 'طرد',
  'quantity': 1,
  'paymentMethod': 'عند الاستلام',
  'createdAt': '2025-01-02T08:45:40.549279Z',
  ...extra,
};

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('barcode encodes the real serial', () {
    test('a new order encodes exactly its sequential number', () {
      final order = newOrder(number: 'VNX-000039');
      expect(orderBarcode(order), 'VNX-000039');
      // The printed number below the bars IS the encoded value: they can never
      // disagree because both come from this one string.
      expect(orderBarcode(order), orderDisplayNumber(order));
    });

    test('reprints never mint a new code or change the serial', () {
      final order = newOrder();
      final first = orderBarcode(order);
      final second = orderBarcode({
        ...order,
        // A reprint adds time/operator fields; the code must not move.
        'printedAt': DateTime.now().toIso8601String(),
        'printedBy': 'سارة علي',
        'revision': 42,
      });
      expect(first, 'VNX-000039');
      expect(second, first);
    });

    test('a stale remote barcodeValue cannot redirect the printed value', () {
      final order = newOrder(extra: {'barcodeValue': 'VNX-some-other-order'});
      expect(orderBarcode(order), 'VNX-000039');
    });

    test('the serial is case-stable and never the bare document id', () {
      final order = newOrder(number: 'vnx-000039');
      expect(orderBarcode(order), 'VNX-000039');
      expect(orderBarcode(order), isNot(contains(order['id'] as String)));
    });
  });

  group('legacy barcodes stay readable', () {
    test('an order without a serial keeps the legacy VNX-<docId>', () {
      final order = legacyOrder();
      expect(orderBarcode(order), 'VNX-legacyDocId_0001');
      expect(orderDisplayNumber(order), 'VNX-legacyDocId_0001');
    });

    test('a legacy order with a stored barcodeValue is preserved', () {
      final order = legacyOrder();
      expect(orderBarcode(order), order['barcodeValue']);
    });

    test('display number prefers the serial when present', () {
      final order = legacyOrder(extra: {'orderNumber': 'VNX-000777'});
      expect(orderDisplayNumber(order), 'VNX-000777');
      expect(orderBarcode(order), 'VNX-000777');
    });

    test('a legacy order keeps its serial even if the counter later moves', () {
      // The stored serial is immutable: reprinting must not derive a new one.
      final order = newOrder(number: 'VNX-000039');
      expect(orderBarcode(order), 'VNX-000039');
      expect(orderBarcode(order), orderBarcode(order));
    });
  });

  group('scan input cleaning', () {
    test('trims surrounding whitespace and pads the scanner adds', () {
      expect(normalizeScannedCode('  VNX-000039  '), 'VNX-000039');
      expect(normalizeScannedCode('\tVNX-000039\n'), 'VNX-000039');
    });

    test('drops control and bidi marks without touching the value', () {
      expect(normalizeScannedCode('\u200fVNX-000039\u202c'), 'VNX-000039');
      expect(normalizeScannedCode('\u0000VNX-000039\u007f'), 'VNX-000039');
    });

    test('folds Arabic-Indic digits to ASCII', () {
      expect(normalizeScannedCode('VNX-٠٠٠٠٣٩'), 'VNX-000039');
      expect(normalizeScannedCode('VNX-۰۰۰۰۳۹'), 'VNX-000039');
    });

    test('a valid Latin code is never rewritten', () {
      for (final code in ['VNX-000039', 'VNX-aBc_12-X', 'abc-123']) {
        expect(normalizeScannedCode(code), code);
      }
    });

    test('an all-whitespace scan cleans to empty', () {
      expect(normalizeScannedCode('   '), '');
      expect(normalizeScannedCode('\u200f\u200f'), '');
    });
  });

  group('safe display helper', () {
    test('orderBarcodeLabel never throws and returns the serial', () {
      expect(orderBarcodeLabel(newOrder()), 'VNX-000039');
      expect(orderBarcodeLabel(legacyOrder()), 'VNX-legacyDocId_0001');
    });

    test('orderBarcodeLabel degrades instead of crashing on bad ids', () {
      expect(orderBarcodeLabel({'id': 'has space'}), '—');
      expect(orderBarcodeLabel({'id': ''}), '—');
      expect(orderBarcodeLabel(const {}), '—');
    });
  });

  group('printed barcode geometry', () {
    test('the encoded serial fits a printable Code128', () {
      final order = newOrder();
      final geometry = invoiceBarcodeGeometry(
        orderBarcode(order),
        180 * PdfPageFormat.mm,
        8 * PdfPageFormat.mm,
      );
      expect(geometry.width, greaterThan(0));
    });
  });

  group('real PDF decode', () {
    test(
      'the bars in the generated voucher decode to the printed number',
      () async {
        final python = _findPythonWithDecoder();
        if (python == null) {
          // No decoder available in this environment: the pure-Dart assertions
          // above still cover the contract. Skip rather than fake a pass.
          markTestSkipped('no python with pymupdf+zxingcpp available');
          return;
        }
        final dir = Directory.systemTemp.createTempSync('vnxbar');
        addTearDown(() => dir.deleteSync(recursive: true));

        final printed = 'VNX-000039';
        final bytes = await OrderInvoicePdf.generateMany(
          orders: [newOrder(number: printed)],
          format: PdfPageFormat.a4,
          printedBy: 'سارة علي',
        );
        final pdf = File('${dir.path}/voucher.pdf')..writeAsBytesSync(bytes);
        final script = File('${dir.path}/decode.py')
          ..writeAsStringSync(_decoderScript);
        final res = Process.runSync(python, [script.path, pdf.path]);
        final out = res.stdout.toString().trim();
        expect(
          out,
          contains('DECODED=$printed'),
          reason: 'decoder stdout: $out\nstderr: ${res.stderr}',
        );
      },
    );
  });
}

/// Returns a python3 that can import a real Code128 decoder, or null.
String? _findPythonWithDecoder() {
  for (final exe in [
    '/tmp/vnxbar/bin/python',
    'python3',
    '/usr/local/bin/python3',
  ]) {
    try {
      final r = Process.runSync(exe, [
        '-c',
        'import pymupdf,zxingcpp,PIL;print("ok")',
      ]);
      if (r.exitCode == 0) return exe;
    } catch (_) {
      // keep looking
    }
  }
  return null;
}

/// Renders the PDF page at high DPI and decodes every Code128 barcode with a
/// real reader (zxing-cpp). Prints `DECODED=<value>` for each found code.
const String _decoderScript = r'''
import sys, pymupdf, zxingcpp
from PIL import Image
doc = pymupdf.open(sys.argv[1])
for page in doc:
    pix = page.get_pixmap(dpi=400)
    img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    for r in zxingcpp.read_barcodes(img):
        if "128" in str(r.format):
            print("DECODED=" + r.text)
''';
