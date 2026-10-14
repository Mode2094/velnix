import 'package:flutter_test/flutter_test.dart';
import 'package:pdf/pdf.dart';
import 'package:velnix/printing/order_printing.dart';

void main() {
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
}
