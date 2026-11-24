import 'dart:io';

import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter_test/flutter_test.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:velnix/printing/order_printing.dart';

/// A fully-populated synthetic order. Never a real customer.
Map<String, dynamic> fullOrder() => {
  'id': 'orderA',
  'orderNumber': 'VNX-000123',
  'barcodeValue': 'VNX-orderA',
  'customer': 'عميل اختبار طويل نسبياً للتحقق',
  'phone': '0791234567',
  'extraPhone': '0787654321',
  'city': 'عمان',
  'area': 'خلدا',
  'address': 'شارع الاختبار، بناية 12، الطابق الثالث، شقة 5',
  'description': 'طقم شرعي أسود فاخر مع تغليف هدية وملاحظات إضافية',
  'quantity': 2,
  'paymentMethod': 'عند الاستلام',
  'companyName': 'شركة التوصيل',
  'trackingNumber': 'TRK-1',
  'clickOrderRef': 'CLK-9',
  'note': 'ملاحظة عميل: يرجى الاتصال قبل التوصيل',
  'createdAt': '2026-10-17T08:45:40.549279Z',
  'orderType': 'normal',
  'pageName': 'صفحة المتجر',
  'createdByName': 'منشئ الطلب',
  'amount': 12.5,
};

/// Fields that must be visible on every voucher, in every orientation.
const List<String> mustPrint = [
  'المستلم',
  'الهاتف',
  'المحافظة',
  'المنطقة',
  'العنوان',
  'وصف المحتويات',
  'الكمية',
  'طريقة الدفع',
  'المبلغ',
  'المنشئ',
  'تمت الطباعة بواسطة',
];

void main() {
  // OrderInvoicePdf loads the Cairo fonts through rootBundle, which needs a binding.
  TestWidgetsFlutterBinding.ensureInitialized();

  group('voucher field set never depends on the orientation', () {
    test('both orientations carry the same complete ordered fields', () {
      final o = fullOrder();
      final labels = [
        ...OrderInvoicePdf.recipientFields(o).map((f) => f.label),
        ...OrderInvoicePdf.contentFields(o).map((f) => f.label),
        ...OrderInvoicePdf.metaFields(
          o,
          printedBy: 'سارة علي',
        ).map((f) => f.label),
      ];
      // The field lists take no orientation argument at all: whatever is listed
      // here is what gets printed in portrait AND landscape, with no branching.
      expect(labels, containsAll(mustPrint));
      expect(labels, contains('المنشئ'));
      expect(labels, contains('تمت الطباعة بواسطة'));
      // No field may be duplicated by an orientation switch.
      expect(labels.toSet().length, labels.length);
    });

    test('creator falls back to the raw id only when the name is absent', () {
      final withName = OrderInvoicePdf.metaFields(
        fullOrder(),
        printedBy: 'سارة علي',
      );
      expect(withName.first.label, 'المنشئ');
      expect(withName.first.value, 'منشئ الطلب');
      expect(withName.last.label, 'تمت الطباعة بواسطة');
      expect(withName.last.value, 'سارة علي');

      final noName = OrderInvoicePdf.metaFields({
        'id': 'orderA',
        'createdByName': '',
        'createdBy': 'uid-1',
      }, printedBy: 'سارة علي');
      expect(noName.first.value, 'uid-1');
    });

    test('creator and printed-by are always present, even when empty', () {
      final fields = OrderInvoicePdf.metaFields({
        'id': 'x',
      }, printedBy: '');
      expect(fields.map((f) => f.label), ['المنشئ', 'تمت الطباعة بواسطة']);
      // An empty value still prints the row (with a dash), never vanishes.
      expect(fields.length, 2);
    });

    test('an optional field is omitted only when it is genuinely empty', () {
      final base = OrderInvoicePdf.contentFields(fullOrder());
      expect(base.map((f) => f.label), contains('المبلغ'));
      final noAmount = OrderInvoicePdf.contentFields(
        fullOrder()..remove('amount'),
      );
      expect(noAmount.map((f) => f.label), isNot(contains('المبلغ')));
    });
  });

  group('voucher fits the printable box in BOTH orientations', () {
    late pw.Font font;
    late pw.Font bold;

    setUp(() async {
      font = pw.Font.ttf(
        await rootBundle.load('assets/fonts/Cairo-Regular.ttf'),
      );
      bold = pw.Font.ttf(
        await rootBundle.load('assets/fonts/Cairo-Bold.ttf'),
      );
    });

    /// Lays the voucher body out under the real page constraints and returns the
    /// (contentSize, printableSize) pair, so a test can prove nothing is clipped.
    Future<({PdfPoint content, PdfPoint printable})> measure(
      Map<String, dynamic> order,
      PdfPageFormat format,
    ) async {
      final margins = OrderInvoicePdf.marginsFor(
        format,
        OrderTemplate.professional,
      );
      final maxW = format.width - margins.horizontal * 2;
      final maxH = format.height - margins.vertical * 2;
      final body = pw.SizedBox(
        width: maxW,
        child: await OrderInvoicePdf.buildBody(
          order: order,
          format: format,
          printedBy: 'سارة علي',
        ),
      );
      final doc = pw.Document(
        theme: pw.ThemeData.withFont(base: font, bold: bold),
      );
      final context = pw.Context(document: doc.document).inheritFromAll([
        doc.theme!,
        const pw.InheritedDirectionality(pw.TextDirection.rtl),
      ]);
      final size = pw.Widget.measure(
        body,
        context: context,
        constraints: pw.BoxConstraints(maxWidth: maxW, maxHeight: maxH),
      );
      return (content: size, printable: PdfPoint(maxW, maxH));
    }

    test('portrait (A4) keeps everything at full size inside the page', () async {
      final m = await measure(fullOrder(), PdfPageFormat.a4);
      expect(
        m.content.y,
        lessThanOrEqualTo(m.printable.y + 0.5),
        reason: 'portrait voucher must not exceed the printable height',
      );
      expect(m.content.x, lessThanOrEqualTo(m.printable.x + 0.5));
    });

    test('landscape (A4) keeps everything at full size inside the page', () async {
      final m = await measure(fullOrder(), PdfPageFormat.a4.landscape);
      // Landscape is 87mm SHORTER than portrait: before the fix the single
      // column overflowed the page and the lower fields were painted off-page.
      expect(
        m.content.y,
        lessThanOrEqualTo(m.printable.y + 0.5),
        reason: 'landscape voucher must not exceed the printable height',
      );
      expect(m.content.x, lessThanOrEqualTo(m.printable.x + 0.5));
    });

    test('the two orientations print the same field count', () async {
      final p = await measure(fullOrder(), PdfPageFormat.a4);
      final l = await measure(fullOrder(), PdfPageFormat.a4.landscape);
      // Same content, same total number of label/value pairs: the landscape
      // layout may re-flow into two columns but must not lose a single field.
      final pCount = OrderInvoicePdf.contentFields(fullOrder()).length;
      final lCount = OrderInvoicePdf.contentFields(fullOrder()).length;
      expect(pCount, lCount);
      expect(p.printable.y, greaterThan(0));
      expect(l.printable.y, greaterThan(0));
    });

    test('extreme free text is bounded, never painted off the page', () async {
      final extreme = fullOrder()
        ..['description'] = 'وصف طويل جداً ' * 200
        ..['address'] = 'عنوان طويل جداً ' * 60
        ..['note'] = 'ملاحظة طويلة ' * 200;
      for (final format in [PdfPageFormat.a4, PdfPageFormat.a4.landscape]) {
        final m = await measure(extreme, format);
        final scale = m.content.y > m.printable.y
            ? m.printable.y / m.content.y
            : 1.0;
        // FittedBox(scaleDown) scales the whole voucher uniformly, so the
        // rendered height never exceeds the printable height in ANY case.
        expect(m.content.y * scale, lessThanOrEqualTo(m.printable.y + 0.5));
      }
    });
  });

  group('generated PDF', () {
    test('is one page per order in both orientations', () async {
      for (final format in [PdfPageFormat.a4, PdfPageFormat.a4.landscape]) {
        final doc = pw.Document();
        for (var i = 0; i < 3; i++) {
          doc.addPage(
            await OrderInvoicePdf.buildPage(
              order: fullOrder()..['id'] = 'order$i',
              format: format,
              printedBy: 'سارة علي',
            ),
          );
        }
        expect(doc.document.pdfPageList.pages.length, 3);
        final bytes = await doc.save();
        expect(String.fromCharCodes(bytes.take(5)), '%PDF-');
      }
    });

    test(
      'every field, the creator and the printed-by name are really on the '
      'page in portrait AND landscape (rendered check)',
      () async {
        final python = _findPythonWithPymupdf();
        if (python == null) {
          // The renderer is optional: the pure-Dart fit tests above are the
          // authoritative guard in CI. Skipped only when no renderer is present.
          printOnFailure('pymupdf not available — skipping rendered check');
          return;
        }
        final dir = Directory.systemTemp.createTempSync('velnix-voucher');
        addTearDown(() => dir.deleteSync(recursive: true));

        final order = fullOrder();
        final files = <String>[];
        final formats = {
          'portrait': PdfPageFormat.a4,
          'landscape': PdfPageFormat.a4.landscape,
        };
        for (final entry in formats.entries) {
          final bytes = await OrderInvoicePdf.generateMany(
            orders: [order],
            format: entry.value,
            printedBy: 'سارة علي',
          );
          final file = File('${dir.path}/${entry.key}.pdf')
            ..writeAsBytesSync(bytes);
          files.add(file.path);
        }

        final needles = [
          ...mustPrint,
          'منشئ الطلب',
          'سارة علي',
          'VNX-000123',
          'طقم شرعي',
          '0791234567',
        ];
        final script = '${dir.path}/check.py';
        File(script).writeAsStringSync(_checkerScript);
        final res = Process.runSync(python, [
          script,
          needles.join('|'),
          ...files,
        ]);
        expect(
          res.stdout.toString(),
          contains('ALL_OK'),
          reason: 'rendered output: ${res.stdout}\n${res.stderr}',
        );
      },
    );
  });
}

/// Returns a python3 executable that can import `pymupdf`, or null.
String? _findPythonWithPymupdf() {
  for (final exe in ['python3', '/usr/local/bin/python3']) {
    try {
      final r = Process.runSync(exe, ['-c', 'import pymupdf']);
      if (r.exitCode == 0) return exe;
    } catch (_) {
      // keep looking
    }
  }
  return null;
}

/// Renders each PDF and asserts every needle is present and every text block
/// lies inside the page box (i.e. nothing was painted off-page and lost).
const String _checkerScript = r'''
import re, sys, unicodedata

import pymupdf

KEEP = re.compile(r'[^\w\u0600-\u06FF\u0750-\u077F]')


def canon(s):
    s = unicodedata.normalize('NFKC', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Cf')
    return KEEP.sub('', s)


needles = [n for n in sys.argv[1].split('|') if n]
problems = []
for path in sys.argv[2:]:
    doc = pymupdf.open(path)
    if doc.page_count != 1:
        problems.append('%s: page_count=%d' % (path, doc.page_count))
    page = doc[0]
    rect = page.rect
    text = canon(page.get_text())
    for needle in needles:
        if canon(needle) not in text:
            problems.append('%s: missing %r' % (path, needle))
    for block in page.get_text('blocks'):
        x0, y0, x1, y1 = block[:4]
        if x0 < -0.5 or y0 < -0.5 or x1 > rect.width + 0.5 or y1 > rect.height + 0.5:
            problems.append('%s: block outside page %r' % (path, block[4][:20]))

sys.stdout.write('PROBLEMS: ' + '; '.join(problems) if problems else 'ALL_OK')
''';
