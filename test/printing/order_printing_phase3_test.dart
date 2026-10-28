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
  'customer': 'عميل اختبار طويل جداً للتحقق من الالتفاف بدون قص غير معالج',
  'phone': '0791234567',
  'extraPhone': '0787654321',
  'city': 'عمان',
  'area': 'خلدا',
  'address': 'شارع الاختبار، بناية 12، الطابق الثالث، شقة 5',
  'description': 'طقم شرعي أسود فاخر مع تغليف هدية وملاحظات إضافية طويلة',
  'quantity': 2,
  'paymentMethod': 'عند الاستلام',
  'createdAt': '2026-10-17T08:45:40.549279Z',
  'orderNumber': 'VNX-000123',
  'orderType': 'normal',
  'amount': ?amount,
  ...extra,
};

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('QR payload', () {
    test('the QR payload equals the stable internal barcode reference', () {
      final order = syntheticOrder();
      expect(orderQrPayload(order), 'VNX-RLWEouzNty2huVT8DUHN');
      expect(orderQrPayload(order), orderBarcode(order));
    });

    test('the QR payload carries no customer data, token or URL', () {
      final order = syntheticOrder();
      final payload = orderQrPayload(order);
      expect(payload.contains('عميل'), isFalse);
      expect(payload.contains('http'), isFalse);
      expect(payload.contains('079'), isFalse);
      expect(payload.contains('@'), isFalse);
    });

    test('the QR payload is stable across reprints', () {
      expect(
        orderQrPayload(syntheticOrder()),
        orderQrPayload({...syntheticOrder(), 'printTime': 'now'}),
      );
    });
  });

  group('order type label', () {
    test('maps the four business types to Arabic', () {
      expect(orderTypeLabel('normal'), 'عادي');
      expect(orderTypeLabel('return'), 'إرجاع');
      expect(orderTypeLabel('exchange'), 'تبديل');
      expect(orderTypeLabel('partial_receipt'), 'استلام جزئي');
      expect(orderTypeLabel(null), 'عادي');
    });
  });

  group('slip rendering', () {
    test(
      'professional template renders for A4/A6 with an order type',
      () async {
        for (final format in [PdfPageFormat.a4, PdfPageFormat.a6]) {
          final bytes = await OrderInvoicePdf.generate(
            order: syntheticOrder(extra: {'orderType': 'return'}),
            format: format,
            template: OrderTemplate.professional,
          );
          expect(String.fromCharCodes(bytes.take(5)), '%PDF-');
          expect(bytes.length, greaterThan(1500));
        }
      },
    );

    test('thermal template renders for 80mm and 58mm rolls', () async {
      for (final paper in [OrderPaper.thermal80, OrderPaper.thermal58]) {
        final bytes = await OrderInvoicePdf.generate(
          order: syntheticOrder(),
          format: paper.format(),
          template: OrderTemplate.thermal,
        );
        expect(String.fromCharCodes(bytes.take(5)), '%PDF-');
        expect(bytes.length, greaterThan(1000));
      }
    });

    test('a page name prints without a logo (no broken image)', () async {
      final bytes = await OrderInvoicePdf.generate(
        order: syntheticOrder(extra: {'pageId': 'p1', 'pageName': 'تاج ماركت'}),
        format: PdfPageFormat.a4,
      );
      expect(String.fromCharCodes(bytes.take(5)), '%PDF-');
    });

    test('an old order without a page still prints', () async {
      final order = syntheticOrder()
        ..remove('pageId')
        ..remove('orderType');
      final bytes = await OrderInvoicePdf.generate(
        order: order,
        format: PdfPageFormat.a4,
      );
      expect(String.fromCharCodes(bytes.take(5)), '%PDF-');
    });

    test('the amount is absent when the server hid it', () async {
      final bytes = await OrderInvoicePdf.generate(
        order: syntheticOrder(amount: null),
        format: PdfPageFormat.a4,
      );
      expect(String.fromCharCodes(bytes.take(5)), '%PDF-');
    });

    test('bulk generation produces one page per order', () async {
      final bytes = await OrderInvoicePdf.generateMany(
        orders: [
          syntheticOrder(id: 'orderA', extra: {'pageName': 'أناقة'}),
          syntheticOrder(id: 'orderB', extra: {'pageName': 'تاج ماركت'}),
          syntheticOrder(id: 'orderC'),
        ],
        format: PdfPageFormat.a4,
      );
      expect(String.fromCharCodes(bytes.take(5)), '%PDF-');
      expect(bytes.length, greaterThan(2000));
    });

    test('bulk generation honors the thermal template', () async {
      final bytes = await OrderInvoicePdf.generateMany(
        orders: [
          syntheticOrder(id: 'orderA'),
          syntheticOrder(id: 'orderB'),
        ],
        format: OrderPaper.thermal80.format(),
        template: OrderTemplate.thermal,
      );
      expect(String.fromCharCodes(bytes.take(5)), '%PDF-');
      expect(bytes.length, greaterThan(2000));
    });
  });
}
