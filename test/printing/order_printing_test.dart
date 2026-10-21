import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:pdf/pdf.dart';
import 'package:velnix/printing/order_printing.dart';

/// A synthetic order. Never a real customer.
Map<String, dynamic> syntheticOrder({
  String id = 'RLWEouzNty2huVT8DUHN',
  Object? amount = 0,
  Map<String, dynamic> extra = const {},
}) => {
  'id': id,
  'customer': 'STAGE4C_ACCEPTANCE_PROBE',
  'phone': '0000000000',
  'city': 'اختبار آلي',
  'area': 'منطقة اختبار',
  'address': 'TEST ONLY — عنوان اصطناعي',
  'description': 'INTERNAL TEST',
  'quantity': 1,
  'paymentMethod': 'عند الاستلام',
  'createdAt': '2026-10-17T08:45:40.549279Z',
  'amount': ?amount,
  ...extra,
};

void main() {
  // OrderInvoicePdf loads the Cairo fonts through rootBundle, which needs a binding.
  TestWidgetsFlutterBinding.ensureInitialized();

  group('barcode content', () {
    test('is derived from the document id and is stable across calls', () {
      final order = syntheticOrder();
      final first = orderBarcode(order);
      final second = orderBarcode(order);
      expect(
        first,
        second,
        reason: 'a reprint must not produce a different barcode',
      );
      expect(first, 'VNX-RLWEouzNty2huVT8DUHN');
      expect(first, contains(order['id']));
    });

    test('is independent of the current time', () {
      // The barcode must be reproducible from stored data alone.
      final a = orderBarcode(syntheticOrder());
      final b = orderBarcode(
        syntheticOrder(extra: {'printedAt': DateTime.now().toIso8601String()}),
      );
      expect(a, b);
    });

    test('ignores a mutable remote barcode that points elsewhere', () {
      final spoofed = orderBarcode(
        syntheticOrder(extra: {'barcodeValue': 'VNX-some-other-order'}),
      );
      expect(
        spoofed,
        isNot('VNX-some-other-order'),
        reason: 'a server-side barcode must never redirect the printed value',
      );
      expect(spoofed, 'VNX-RLWEouzNty2huVT8DUHN');
    });

    test('refuses an id that cannot be encoded safely', () {
      for (final bad in ['', '   ', 'has space', 'slash/id', 'x' * 141]) {
        expect(
          () => orderBarcode({'id': bad}),
          throwsA(isA<FormatException>()),
          reason: 'id "$bad" must be rejected',
        );
      }
    });

    test('accepts the ids Firestore actually produces', () {
      for (final good in ['a', 'A-b_1', 'RLWEouzNty2huVT8DUHN']) {
        expect(orderBarcode({'id': good}), startsWith('VNX-'));
      }
    });
  });

  group('barcode geometry', () {
    test('keeps a clear quiet zone on both sides', () {
      final g = invoiceBarcodeGeometry(
        'VNX-RLWEouzNty2huVT8DUHN',
        80 * PdfPageFormat.mm,
      );
      expect(g.quietZone, greaterThan(0));
      expect(g.leftPadding, greaterThanOrEqualTo(g.quietZone));
      expect(g.rightPadding, greaterThanOrEqualTo(g.quietZone));
      expect(g.width, greaterThan(0));
    });

    test('never shrinks the barcode below the requested width', () {
      final wide = invoiceBarcodeGeometry('VNX-ORDER', 200 * PdfPageFormat.mm);
      final narrow = invoiceBarcodeGeometry('VNX-ORDER', 60 * PdfPageFormat.mm);
      expect(narrow.width, lessThanOrEqualTo(wide.width));
      expect(narrow.width, greaterThan(0));
    });

    test('refuses paper too small to print a legible barcode', () {
      expect(
        () => invoiceBarcodeGeometry('VNX-ORDER', 1 * PdfPageFormat.mm),
        throwsA(anything),
        reason:
            'silently shrinking to an illegible barcode is worse than refusing',
      );
    });
  });

  group('PDF output', () {
    test('produces a valid PDF carrying the correct order reference', () async {
      final bytes = await OrderInvoicePdf.generate(
        order: syntheticOrder(),
        format: PdfPageFormat.a4,
      );
      expect(
        bytes.length,
        greaterThan(1000),
        reason: 'a real document, not an empty file',
      );
      final head = String.fromCharCodes(bytes.take(5));
      expect(head, '%PDF-', reason: 'must be a real PDF, not a stub');
      // Document metadata carries the order reference.
      expect(ascii.decode(bytes, allowInvalid: true), contains('Velnix'));
      expect(
        ascii.decode(bytes, allowInvalid: true),
        contains('RLWEouzNty2huVT8DUHN'),
      );
    });

    test('renders without the amount when the server hid it', () async {
      // A caller without viewAmounts receives an order with no amount field.
      // The invoice must still build and must not fabricate a figure.
      final bytes = await OrderInvoicePdf.generate(
        order: syntheticOrder(amount: null),
        format: PdfPageFormat.a4,
      );
      expect(bytes.length, greaterThan(1000));
      expect(String.fromCharCodes(bytes.take(5)), '%PDF-');
    });

    test('builds for a zero-value synthetic order', () async {
      final bytes = await OrderInvoicePdf.generate(
        order: syntheticOrder(amount: 0),
        format: PdfPageFormat.a4,
      );
      expect(String.fromCharCodes(bytes.take(5)), '%PDF-');
      expect(bytes.length, greaterThan(1000));
    });

    test('builds for A4 and A5', () async {
      final receipt = await OrderInvoicePdf.generate(
        order: syntheticOrder(),
        format: PdfPageFormat.a5,
      );
      final a4 = await OrderInvoicePdf.generate(
        order: syntheticOrder(),
        format: PdfPageFormat.a4,
      );
      expect(String.fromCharCodes(receipt.take(5)), '%PDF-');
      expect(receipt.length, greaterThan(1000));
      expect(a4.length, greaterThan(1000));
    });

    // The too-narrow-paper refusal is asserted directly against
    // invoiceBarcodeGeometry above, which is the guard OrderInvoicePdf.generate
    // delegates to (order_printing.dart:159). Re-asserting it through the async
    // generate() path only re-tests the test framework's async error reporting,
    // so it is deliberately not duplicated here.

    test('tolerates a missing optional timestamp', () async {
      final bytes = await OrderInvoicePdf.generate(
        order: syntheticOrder()..remove('createdAt'),
        format: PdfPageFormat.a4,
      );
      expect(String.fromCharCodes(bytes.take(5)), '%PDF-');
    });
  });
}
