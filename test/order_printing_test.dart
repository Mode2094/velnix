import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:pdf/pdf.dart';
import 'package:velnix/printing/order_printing.dart';

/// Counts physical PDF pages: every page object is `/Type/Page`, and the single
/// page-tree node is `/Type/Pages`. The pdf package writes these without a space.
int pdfPageCount(Uint8List bytes) {
  final text = latin1.decode(bytes);
  return '/Type/Page'.allMatches(text).length -
      '/Type/Pages'.allMatches(text).length;
}

Map<String, dynamic> voucher(int i) => {
  'id': 'order_$i',
  'orderNumber': 'VNX-000$i',
  'customer': 'عميل $i',
  'phone': '079000000$i',
  'city': 'عمان',
  'area': 'وسط',
  'address': 'شارع',
  'description': 'طرد',
  'quantity': 1,
  'paymentMethod': 'عند الاستلام',
  'amount': 12.345,
  'createdAt': '2026-10-14T00:00:00Z',
};

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('same order generates a stable and unique barcode', () {
    final o = {'id': 'aBc_12-X'};
    expect(orderBarcode(o), 'VNX-aBc_12-X');
    expect(orderBarcode(o), orderBarcode({...o}));
    expect(orderBarcode({'id': 'other'}), isNot(orderBarcode(o)));
  });
  test('rejects invalid or missing barcode identity', () {
    expect(() => orderBarcode({}), throwsFormatException);
    expect(() => orderBarcode({'id': 'x/../../oops'}), throwsFormatException);
  });
  test('cannot override the code derived from an immutable order ID', () {
    expect(orderBarcode({'id': 'A1', 'barcodeValue': 'VNX-other'}), 'VNX-A1');
  });
  test('barcode keeps quiet zones and rejects unreadably narrow paper', () {
    final geometry = invoiceBarcodeGeometry(
      'VNX-Order_1234567890',
      52 * PdfPageFormat.mm,
    );
    expect(geometry.quietZone / PdfPageFormat.mm, greaterThanOrEqualTo(2));
    expect(
      (geometry.width + geometry.leftPadding + geometry.rightPadding) /
          PdfPageFormat.mm,
      closeTo(52, .01),
    );
    expect(
      () => invoiceBarcodeGeometry('VNX-${'A' * 140}', 52 * PdfPageFormat.mm),
      throwsFormatException,
    );
  });
  test('paper sizes cover common printers', () {
    expect(OrderPaper.values.length, 9);
    expect(
      OrderPaper.thermal80.format().width / PdfPageFormat.mm,
      closeTo(80, .01),
    );
    expect(
      OrderPaper.thermal58.format().width / PdfPageFormat.mm,
      closeTo(58, .01),
    );
    expect(
      OrderPaper.custom.format(widthMm: 100, heightMm: 220).width /
          PdfPageFormat.mm,
      closeTo(100, .01),
    );
  });

  test('exactly one PDF page per order, single and bulk', () async {
    final single = await OrderInvoicePdf.generate(
      order: voucher(1),
      format: PdfPageFormat.a4,
    );
    expect(pdfPageCount(single), 1, reason: 'a single order is one page');

    for (final n in [1, 3, 5]) {
      final bulk = await OrderInvoicePdf.generateMany(
        orders: [for (var i = 1; i <= n; i++) voucher(i)],
        format: PdfPageFormat.a4,
      );
      expect(
        pdfPageCount(bulk),
        n,
        reason: '$n orders must produce exactly $n pages',
      );
    }
  });

  test('a very long order still renders exactly one page', () async {
    final long = {
      ...voucher(9),
      'description': List.filled(120, 'منتج طويل جداً للاختبار').join(' '),
      'note': List.filled(120, 'ملاحظة طويلة جداً للاختبار').join(' '),
      'address': List.filled(60, 'عنوان طويل').join(' '),
    };
    final bytes = await OrderInvoicePdf.generate(
      order: long,
      format: PdfPageFormat.a6,
    );
    expect(pdfPageCount(bytes), 1, reason: 'long content stays on one page');
  });

  test('portrait and landscape render one page each', () async {
    final portrait = await OrderInvoicePdf.generateMany(
      orders: [voucher(1), voucher(2)],
      format: PdfPageFormat.a4,
    );
    final landscape = await OrderInvoicePdf.generateMany(
      orders: [voucher(1), voucher(2)],
      format: PdfPageFormat.a4.landscape,
    );
    expect(pdfPageCount(portrait), 2);
    expect(pdfPageCount(landscape), 2);
  });

  test('the voucher no longer prints a QR code', () async {
    final bytes = await OrderInvoicePdf.generate(
      order: voucher(1),
      format: PdfPageFormat.a4,
    );
    // A QR would embed an /Image XObject; the redesign prints only a Code128
    // (drawn as vector bars), so no image object is present.
    expect(latin1.decode(bytes).contains('/Subtype/Image'), false);
  });
}
