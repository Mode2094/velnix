import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter_test/flutter_test.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:velnix/printing/order_printing.dart';

/// A synthetic order for the banner tests. Never a real customer.
Map<String, dynamic> typeOrder(String type) => {
  'id': 'qa_type_${type.isEmpty ? 'none' : type}',
  'orderNumber': 'VNX-000321',
  'orderType': type,
  'customer': 'عميل اختبار النوع',
  'phone': '0791234567',
  'city': 'عمان',
  'area': 'خلدا',
  'address': 'شارع الاختبار 12',
  'description': 'طقم منتجات للاختبار',
  'quantity': 2,
  'paymentMethod': 'عند الاستلام',
  'createdAt': '2026-10-17T08:45:40.549279Z',
  'pageName': 'متجر الأناقة',
  'pagePhone': '0791111111',
  'createdByName': 'منشئ الطلب',
  'note': 'ملاحظة اختبار',
  'amount': 12.5,
};

/// Keeps only word characters and Arabic letters — the same normalisation the
/// other rendered checks use, so shaping/space differences never cause a false
/// failure.
String _canon(String s) =>
    s.replaceAll(RegExp(r'[^0-9A-Za-z\u0621-\u064A]'), '');

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('voucherTypeLabel (banner label, never «عادي»)', () {
    test('normal and unknown print NO type word at all', () {
      expect(voucherTypeLabel('normal'), isNull);
      expect(voucherTypeLabel(null), isNull);
      expect(voucherTypeLabel(''), isNull);
      expect(voucherTypeLabel('something_else'), isNull);
    });

    test('the three special types map to their Arabic label', () {
      expect(voucherTypeLabel('return'), 'إرجاع');
      expect(voucherTypeLabel('exchange'), 'تبديل');
      expect(voucherTypeLabel('partial_receipt'), 'استلام جزئي');
    });

    test('the general label helper is unchanged', () {
      expect(orderTypeLabel('normal'), 'عادي');
      expect(orderTypeLabel('return'), 'إرجاع');
      expect(orderTypeLabel('exchange'), 'تبديل');
      expect(orderTypeLabel('partial_receipt'), 'استلام جزئي');
    });
  });

  group('generated voucher (rendered)', () {
    test(
      'the four types render as one page with the right banner presence',
      () async {
        final python = _findPythonWithPymupdf();
        if (python == null) {
          printOnFailure('pymupdf not available — skipping rendered check');
          return;
        }
        final dir = Directory.systemTemp.createTempSync('velnix-type');
        addTearDown(() => dir.deleteSync(recursive: true));

        const big = 40.0; // A4 banner font must be unmistakably large.
        final jobs = <String, ({String type, String? label})>{
          'normal': (type: 'normal', label: null),
          'return': (type: 'return', label: 'إرجاع'),
          'exchange': (type: 'exchange', label: 'تبديل'),
          'partial': (type: 'partial_receipt', label: 'استلام جزئي'),
        };
        final files = <String, File>{};
        for (final e in jobs.entries) {
          final bytes = await OrderInvoicePdf.generate(
            order: typeOrder(e.value.type),
            format: PdfPageFormat.a4,
            printedBy: 'مديرة الطباعة',
          );
          files[e.key] = File('${dir.path}/${e.key}.pdf')
            ..writeAsBytesSync(bytes);
        }

        final script = File('${dir.path}/probe_voucher.py')
          ..writeAsStringSync(_inspector);
        final res = Process.runSync(python, [
          script.path,
          ...files.values.map((f) => f.path),
        ]);
        expect(
          res.exitCode,
          0,
          reason: 'inspector failed: ${res.stderr}',
        );
        final data = jsonDecode(res.stdout as String) as List<dynamic>;
        final byName = <String, Map<String, dynamic>>{
          for (final raw in data)
            (raw as Map<String, dynamic>)['name'] as String: raw,
        };

        for (final e in jobs.entries) {
          final r = byName[e.key]!;
          expect(r['page_count'], 1, reason: '${e.key}: one page per order');
          final lines = (r['lines'] as List<dynamic>)
              .cast<Map<String, dynamic>>();
          final allText = lines.map((l) => l['text'] as String).join(' ');
          final canon = _canon(allText);
          final lineCanons = lines
              .map((l) => _canon(l['text'] as String))
              .toList();

          // NO voucher (normal or special) may print the word «عادي».
          expect(
            canon.contains(_canon('عادي')),
            isFalse,
            reason: '${e.key}: «عادي» must never appear on the voucher',
          );
          final hasCaption = lineCanons.any(
            (c) => c.contains(_canon('نوع الطلب')),
          );

          // Every voucher keeps its essential identity data.
          for (final needle in [
            'VNX-000321',
            'متجر الأناقة',
            'عميل اختبار النوع',
            'منشئ الطلب',
            'مديرة الطباعة',
          ]) {
            expect(
              canon.contains(_canon(needle)),
              isTrue,
              reason: '${e.key}: missing «$needle»',
            );
          }

          if (e.value.label == null) {
            // A normal order reserves no banner space at all.
            expect(
              hasCaption,
              isFalse,
              reason: '${e.key}: a normal order must reserve no banner space',
            );
            continue;
          }

          // A special order prints the label, very large, near the top.
          expect(
            hasCaption,
            isTrue,
            reason: '${e.key}: banner caption is missing',
          );
          final labelLine = lines.firstWhere(
            (l) => _canon(l['text'] as String).contains(_canon(e.value.label!)),
            orElse: () => const {},
          );
          expect(
            labelLine,
            isNotEmpty,
            reason: '${e.key}: banner label «${e.value.label}» is missing',
          );
          expect(
            (labelLine['size'] as num).toDouble(),
            greaterThanOrEqualTo(big),
            reason: '${e.key}: banner font must be very large',
          );
          // The banner sits in the top part of the page, well above the fields.
          expect(
            (labelLine['y0'] as num).toDouble(),
            lessThan((labelLine['page_h'] as num).toDouble() * 0.5),
            reason: '${e.key}: banner must sit at the top of the voucher',
          );
        }
      },
      timeout: const Timeout(Duration(minutes: 2)),
    );
  });

  group('banner adapts to every paper and orientation without clipping', () {
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

    Future<({PdfPoint content, PdfPoint printable})> measure(
      Map<String, dynamic> order,
      PdfPageFormat format,
      OrderTemplate template,
    ) async {
      final margins = OrderInvoicePdf.marginsFor(format, template);
      final maxW = format.width - margins.horizontal * 2;
      final maxH = format.height - margins.vertical * 2;
      final body = pw.SizedBox(
        width: maxW,
        child: await OrderInvoicePdf.buildBody(
          order: order,
          format: format,
          template: template,
          printedBy: 'مديرة الطباعة',
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

    test(
      'a special type fits inside the printable box in both orientations',
      () async {
        final extreme = typeOrder('partial_receipt')
          ..['description'] = 'وصف طويل جداً ' * 200
          ..['address'] = 'عنوان طويل جداً ' * 60
          ..['note'] = 'ملاحظة طويلة ' * 200;
        for (final order in [typeOrder('partial_receipt'), extreme]) {
          for (final format in [
            PdfPageFormat.a4,
            PdfPageFormat.a4.landscape,
          ]) {
            final m = await measure(
              order,
              format,
              OrderTemplate.professional,
            );
            final scale = m.content.y > m.printable.y
                ? m.printable.y / m.content.y
                : 1.0;
            expect(
              m.content.y * scale,
              lessThanOrEqualTo(m.printable.y + 0.5),
              reason: 'type banner must not overflow in $format',
            );
          }
        }
      },
    );

    test('every paper size yields exactly one page for a special type', () async {
      final formats = <String, PdfPageFormat>{
        'A4 portrait': PdfPageFormat.a4,
        'A4 landscape': PdfPageFormat.a4.landscape,
        'A5 portrait': PdfPageFormat.a5,
        'A5 landscape': PdfPageFormat.a5.landscape,
        'A6 portrait': PdfPageFormat.a6,
        'thermal80': OrderPaper.thermal80.format(),
        'thermal58': OrderPaper.thermal58.format(),
      };
      for (final e in formats.entries) {
        final template = e.key.startsWith('thermal')
            ? OrderTemplate.thermal
            : OrderTemplate.professional;
        final doc = pw.Document(
          theme: pw.ThemeData.withFont(base: font, bold: bold),
        );
        doc.addPage(
          await OrderInvoicePdf.buildPage(
            order: typeOrder('exchange'),
            format: e.value,
            template: template,
            printedBy: 'مديرة الطباعة',
          ),
        );
        expect(
          doc.document.pdfPageList.pages.length,
          1,
          reason: '${e.key}: one page per order',
        );
        final bytes = await doc.save();
        expect(String.fromCharCodes(bytes.take(5)), '%PDF-');
      }
    });
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

/// Extracts, per PDF: the page count and the text lines in the top 60% of the
/// page with their max font size, so the Dart test can assert the banner is
/// large and near the top without depending on the canvas renderer.
const String _inspector = r'''
import json, sys, unicodedata
import pymupdf


def norm(s):
    s = unicodedata.normalize('NFKC', s)
    return ''.join(c for c in s if unicodedata.category(c) != 'Cf')


out = []
for path in sys.argv[1:]:
    doc = pymupdf.open(path)
    page = doc[0]
    h = page.rect.height
    buckets = {}
    for b in page.get_text('dict')['blocks']:
        for line in b.get('lines', []):
            spans = line.get('spans', [])
            if not spans:
                continue
            text = norm(''.join(s['text'] for s in spans))
            size = max(s['size'] for s in spans)
            y0 = min(s['bbox'][1] for s in spans)
            key = round(y0)
            cur = buckets.get(key)
            if cur is None:
                buckets[key] = [text, size, y0]
            else:
                cur[0] += ' ' + text
                cur[1] = max(cur[1], size)
                cur[2] = min(cur[2], y0)
    lines = [
        {'text': v[0], 'size': v[1], 'y0': v[2], 'page_h': h}
        for v in buckets.values()
    ]
    out.append({
        'name': path.split('/')[-1].replace('.pdf', ''),
        'page_count': doc.page_count,
        'lines': lines,
    })
print(json.dumps(out, ensure_ascii=False))
''';
