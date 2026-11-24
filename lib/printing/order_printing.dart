import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../core/dates.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

/// The barcode is a stable representation of the Firestore document ID.
/// Never use the current time to generate a new barcode when reprinting.
String orderBarcode(Map<String, dynamic> order) {
  final id = order['id']?.toString().trim() ?? '';
  if (id.isEmpty ||
      id.length > 140 ||
      !RegExp(r'^[a-zA-Z0-9_-]+$').hasMatch(id)) {
    throw const FormatException('معرّف الطلب غير صالح لإنشاء الباركود');
  }
  final value = order['barcodeValue']?.toString() ?? '';
  // Do not trust a mutable remote barcode that points to a different order.
  return value == 'VNX-$id' ? value : 'VNX-$id';
}

/// The QR payload is the SAME stable internal reference as the barcode
/// (`VNX-<docId>`). It carries no customer data, no token and no access grant;
/// the scanner resolves it server-side through `resolveBarcodes`, which enforces
/// the caller's permissions. It stays valid across reprints.
String orderQrPayload(Map<String, dynamic> order) => orderBarcode(order);

/// Arabic label for the order business type (kept in sync with the app).
String orderTypeLabel(dynamic value) => switch (value?.toString()) {
  'return' => 'إرجاع',
  'exchange' => 'تبديل',
  'partial_receipt' => 'استلام جزئي',
  _ => 'عادي',
};

/// Keep at least ten modules of clear space on either side and one 203-DPI
/// dot per narrow module. Refuse too-small paper instead of silently shrinking.
({double width, double quietZone, double leftPadding, double rightPadding})
invoiceBarcodeGeometry(
  String value,
  double availableWidth, [
  double pageMargin = 0,
]) {
  final elements = pw.Barcode.code128().make(
    value,
    width: 1,
    height: 1,
    drawText: false,
  );
  final module = elements
      .whereType<pw.BarcodeBar>()
      .map((bar) => bar.width)
      .reduce((a, b) => a < b ? a : b);
  final modules = (1 / module).round();
  const dot = 72 / 203;
  final preferred = modules * .2 * PdfPageFormat.mm + 4 * PdfPageFormat.mm;
  final desired = preferred > 90 * PdfPageFormat.mm
      ? preferred
      : 90 * PdfPageFormat.mm;
  final total = availableWidth < desired ? availableWidth : desired;
  var dots = (total / (modules + 20) / dot).floor();
  double quiet(int count) => 10 * count * dot > 2 * PdfPageFormat.mm
      ? 10 * count * dot
      : 2 * PdfPageFormat.mm;
  while (dots > 0 && modules * dots * dot + 2 * quiet(dots) + dot > total) {
    dots--;
  }
  if (dots < 1) {
    throw const FormatException(
      'الورق ضيق لباركود قابل للقراءة؛ اختر ورقاً أعرض لهذا الطلب',
    );
  }
  final width = modules * dots * dot;
  // Align the first bar and every module to the 203-DPI printer grid.
  final left =
      (((availableWidth - width) / 2 + pageMargin) / dot).round() * dot -
      pageMargin;
  return (
    width: width,
    quietZone: quiet(dots),
    leftPadding: left,
    rightPadding: availableWidth - left - width,
  );
}

/// Common paper formats, thermal rolls, and user-specified label paper.
enum OrderPaper { a3, a4, a5, a6, letter, legal, thermal80, thermal58, custom }

extension OrderPaperFormat on OrderPaper {
  String get label => switch (this) {
    OrderPaper.a3 => 'A3',
    OrderPaper.a4 => 'A4',
    OrderPaper.a5 => 'A5',
    OrderPaper.a6 => 'A6',
    OrderPaper.letter => 'Letter',
    OrderPaper.legal => 'Legal',
    OrderPaper.thermal80 => 'حراري 80 مم',
    OrderPaper.thermal58 => 'حراري 58 مم',
    OrderPaper.custom => 'مقاس مخصص',
  };

  bool get isThermal =>
      this == OrderPaper.thermal80 || this == OrderPaper.thermal58;

  PdfPageFormat format({double widthMm = 100, double heightMm = 180}) =>
      switch (this) {
        OrderPaper.a3 => PdfPageFormat.a3,
        OrderPaper.a4 => PdfPageFormat.a4,
        OrderPaper.a5 => PdfPageFormat.a5,
        OrderPaper.a6 => PdfPageFormat.a6,
        OrderPaper.letter => PdfPageFormat.letter,
        OrderPaper.legal => PdfPageFormat.legal,
        OrderPaper.thermal80 => PdfPageFormat(
          80 * PdfPageFormat.mm,
          260 * PdfPageFormat.mm,
        ),
        OrderPaper.thermal58 => PdfPageFormat(
          58 * PdfPageFormat.mm,
          260 * PdfPageFormat.mm,
        ),
        OrderPaper.custom => PdfPageFormat(
          widthMm * PdfPageFormat.mm,
          heightMm * PdfPageFormat.mm,
        ),
      };
}

/// Visual template of the slip. `professional` is the colored branded voucher;
/// `plain` is the same information order in a white/black layout; `thermal` is
/// the compact layout for 58/80mm rolls.
enum OrderTemplate { professional, plain, thermal }

extension OrderTemplateFormat on OrderTemplate {
  String get label => switch (this) {
    OrderTemplate.professional => 'بوليصة ملونة',
    OrderTemplate.plain => 'بوليصة بيضاء',
    OrderTemplate.thermal => 'بوليصة حرارية مختصرة',
  };
}

/// One label/value pair printed on a voucher. Building the voucher from an
/// ordered list of these keeps portrait and landscape copies identical — the
/// root cause of missing fields when the page was laid out differently per
/// orientation.
@immutable
class InvoiceField {
  const InvoiceField(
    this.label,
    this.value, {
    this.flow = false,
    this.thermalMax = 0,
    this.normalMax = 0,
  });

  final String label;
  final String value;

  /// Free text: bounded (with an explicit ellipsis) rather than dropped, so a
  /// very long value can never push the layout past the page edge.
  final bool flow;
  final int thermalMax;
  final int normalMax;
}

class OrderInvoicePdf {
  OrderInvoicePdf._();

  static Future<Uint8List> generate({
    required Map<String, dynamic> order,
    required PdfPageFormat format,
    OrderTemplate template = OrderTemplate.professional,
    String printedBy = '',
  }) async {
    final font = pw.Font.ttf(
      await rootBundle.load('assets/fonts/Cairo-Regular.ttf'),
    );
    final bold = pw.Font.ttf(
      await rootBundle.load('assets/fonts/Cairo-Bold.ttf'),
    );
    final pdf = pw.Document(
      title: 'Velnix - ${order['orderNumber'] ?? order['id']}',
      author: 'Velnix Smart Order Management',
      theme: pw.ThemeData.withFont(base: font, bold: bold),
    );
    pdf.addPage(_orderPage(order, font, bold, format, template, printedBy));
    return pdf.save();
  }

  /// Builds one multi-order PDF, one independent voucher per order, in the given
  /// order. Used by the bulk "طباعة الطلبات المحددة" action. Amounts are only
  /// present when the server included them for this user, so a print can never
  /// leak a hidden amount.
  static Future<Uint8List> generateMany({
    required List<Map<String, dynamic>> orders,
    required PdfPageFormat format,
    OrderTemplate template = OrderTemplate.professional,
    int maxOrders = 100,
    String printedBy = '',
  }) async {
    if (orders.isEmpty) throw const FormatException('لا توجد طلبات للطباعة');
    final limited = orders.take(maxOrders).toList();
    final font = pw.Font.ttf(
      await rootBundle.load('assets/fonts/Cairo-Regular.ttf'),
    );
    final bold = pw.Font.ttf(
      await rootBundle.load('assets/fonts/Cairo-Bold.ttf'),
    );
    final pdf = pw.Document(
      title: 'Velnix - ${limited.length} طلب',
      author: 'Velnix Smart Order Management',
      theme: pw.ThemeData.withFont(base: font, bold: bold),
    );
    for (final order in limited) {
      pdf.addPage(_orderPage(order, font, bold, format, template, printedBy));
    }
    return pdf.save();
  }

  /// Decodes a page logo data URI into a PDF image, or null when absent/invalid.
  static pw.MemoryImage? _pageLogo(dynamic dataUri) {
    final value = dataUri?.toString() ?? '';
    final comma = value.indexOf(',');
    if (comma < 0) return null;
    try {
      final bytes = base64Decode(value.substring(comma + 1));
      if (bytes.isEmpty) return null;
      return pw.MemoryImage(bytes);
    } catch (_) {
      return null;
    }
  }

  /// The label/value pairs printed on a voucher, in the exact order they appear.
  /// This is the single source of truth for the voucher content, so a portrait
  /// and a landscape copy always carry EXACTLY the same fields — switching the
  /// orientation can never drop, reorder or clip information.
  @visibleForTesting
  static List<InvoiceField> recipientFields(Map<String, dynamic> order) => [
    InvoiceField('المستلم', _text(order['customer'])),
    InvoiceField('الهاتف', _text(order['phone'])),
    if (_text(order['extraPhone']).isNotEmpty)
      InvoiceField('هاتف إضافي', _text(order['extraPhone'])),
    InvoiceField('المحافظة', _text(order['city'])),
    InvoiceField('المنطقة', _text(order['area'])),
    if (_text(order['address']).isNotEmpty)
      InvoiceField(
        'العنوان',
        _text(order['address']),
        flow: true,
        thermalMax: 160,
        normalMax: 320,
      ),
  ];

  /// The contents / financial block. The amount is present only when the server
  /// already released it for this user, so a print can never leak a hidden one.
  @visibleForTesting
  static List<InvoiceField> contentFields(Map<String, dynamic> order) {
    final amount = order['amount'];
    return [
      InvoiceField(
        'وصف المحتويات',
        _text(order['description']),
        flow: true,
        thermalMax: 320,
        normalMax: 900,
      ),
      InvoiceField('الكمية', _text(order['quantity'])),
      InvoiceField('طريقة الدفع', _text(order['paymentMethod'])),
      if (_text(order['companyName']).isNotEmpty)
        InvoiceField('شركة التوصيل', _text(order['companyName'])),
      if (amount is num)
        InvoiceField('المبلغ', '${amount.toStringAsFixed(3)} د.أ'),
      if (_text(order['trackingNumber']).isNotEmpty)
        InvoiceField('رقم تتبع الشحنة', _text(order['trackingNumber'])),
      if (_text(order['clickOrderRef']).isNotEmpty)
        InvoiceField('مرجع الشحنة', _text(order['clickOrderRef'])),
      if (_text(order['note']).isNotEmpty)
        InvoiceField(
          'ملاحظات',
          _text(order['note']),
          flow: true,
          thermalMax: 220,
          normalMax: 600,
        ),
    ];
  }

  /// Creator and the operator who printed THIS copy — official voucher data,
  /// always printed (never only shown in the UI).
  @visibleForTesting
  static List<InvoiceField> metaFields(
    Map<String, dynamic> order, {
    String printedBy = '',
  }) {
    final creator = _text(order['createdByName']).isNotEmpty
        ? _text(order['createdByName'])
        : _text(order['createdBy']);
    return [
      InvoiceField('المنشئ', creator),
      InvoiceField('تمت الطباعة بواسطة', printedBy),
    ];
  }

  static String _text(dynamic value) => value?.toString().trim() ?? '';

  /// Builds the single voucher page object for [order]. Exposed so tests can
  /// measure that the content really fits the printable box in both
  /// orientations, without going through the platform `Printing` channel.
  @visibleForTesting
  static Future<pw.Page> buildPage({
    required Map<String, dynamic> order,
    required PdfPageFormat format,
    OrderTemplate template = OrderTemplate.professional,
    String printedBy = '',
  }) async {
    final font = pw.Font.ttf(
      await rootBundle.load('assets/fonts/Cairo-Regular.ttf'),
    );
    final bold = pw.Font.ttf(
      await rootBundle.load('assets/fonts/Cairo-Bold.ttf'),
    );
    return _orderPage(order, font, bold, format, template, printedBy);
  }

  /// Loads the Cairo fonts and returns the raw [voucherBody], so a test can lay
  /// it out under the printable constraints and measure its height.
  @visibleForTesting
  static Future<pw.Widget> buildBody({
    required Map<String, dynamic> order,
    required PdfPageFormat format,
    OrderTemplate template = OrderTemplate.professional,
    String printedBy = '',
  }) async {
    final font = pw.Font.ttf(
      await rootBundle.load('assets/fonts/Cairo-Regular.ttf'),
    );
    final bold = pw.Font.ttf(
      await rootBundle.load('assets/fonts/Cairo-Bold.ttf'),
    );
    return voucherBody(
      order: order,
      font: font,
      bold: bold,
      format: format,
      template: template,
      printedBy: printedBy,
    );
  }

  /// Printer margins for [format] under [template] (also used by tests).
  @visibleForTesting
  static ({double horizontal, double vertical}) marginsFor(
    PdfPageFormat format,
    OrderTemplate template,
  ) => _marginsFor(format, template);

  /// The voucher content for ONE order, without the page frame.
  ///
  /// Portrait and landscape both build from the same ordered field lists
  /// ([recipientFields], [contentFields], [metaFields]), so switching the
  /// orientation can never drop, reorder or duplicate a field. Exposed so a
  /// test can lay it out and prove it fits the printable box in both
  /// orientations, which is exactly what used to fail.
  @visibleForTesting
  static pw.Widget voucherBody({
    required Map<String, dynamic> order,
    required pw.Font font,
    required pw.Font bold,
    required PdfPageFormat format,
    OrderTemplate template = OrderTemplate.professional,
    String printedBy = '',
  }) {
    final narrow = format.width < 100 * PdfPageFormat.mm;
    final thermal = template == OrderTemplate.thermal || narrow;
    final horizontalMargin = _marginsFor(format, template).horizontal;
    final id = order['id']?.toString() ?? '';
    final barcode = orderBarcode(order);
    final timestamp = DateTime.tryParse(order['createdAt']?.toString() ?? '');
    final created = timestamp == null ? null : businessTime(timestamp);
    final date = created == null
        ? '—'
        : '${created.year}-${created.month.toString().padLeft(2, '0')}-${created.day.toString().padLeft(2, '0')}';
    final time = created == null
        ? null
        : '${created.hour.toString().padLeft(2, '0')}:${created.minute.toString().padLeft(2, '0')}';
    final pageName = order['pageName']?.toString() ?? '';
    final pageLogo = _pageLogo(order['logoDataUri']);
    final orderType = orderTypeLabel(order['orderType']);
    final pagePhone = order['pagePhone']?.toString().trim() ?? '';
    final pageWhatsapp = order['pageWhatsapp']?.toString().trim() ?? '';
    final colored = template == OrderTemplate.professional && !thermal;
    final brandColor = colored ? PdfColors.indigo800 : PdfColors.black;

    pw.Widget row(String name, dynamic value) => pw.RichText(
      overflow: pw.TextOverflow.span,
      text: pw.TextSpan(
        children: [
          pw.TextSpan(
            text: '$name: ',
            style: pw.TextStyle(font: bold, fontSize: thermal ? 7.5 : 10),
          ),
          pw.TextSpan(
            text:
                '${value?.toString().isNotEmpty == true ? value.toString() : '—'}\n',
            style: pw.TextStyle(font: font, fontSize: thermal ? 7.5 : 10),
          ),
        ],
      ),
    );
    // A single very long paragraph cannot be split by MultiPage and can overflow
    // a small page. Long free-text values are emitted as bounded chunks so the
    // page flow keeps every character visible and the symbols land intact.
    pw.Widget flowRow(String name, dynamic value) {
      final text = value?.toString().trim() ?? '';
      if (text.isEmpty) return row(name, value);
      const chunk = 220;
      if (text.length <= chunk) return row(name, text);
      final parts = <String>[];
      var start = 0;
      while (start < text.length) {
        var end = (start + chunk).clamp(0, text.length);
        if (end < text.length) {
          final space = text.lastIndexOf(' ', end);
          if (space > start + 40) end = space;
        }
        parts.add(text.substring(start, end).trim());
        start = end;
      }
      return pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.stretch,
        children: [
          for (var i = 0; i < parts.length; i++)
            pw.RichText(
              overflow: pw.TextOverflow.span,
              text: pw.TextSpan(
                children: [
                  if (i == 0)
                    pw.TextSpan(
                      text: '$name: ',
                      style: pw.TextStyle(
                        font: bold,
                        fontSize: thermal ? 7.5 : 10,
                      ),
                    ),
                  pw.TextSpan(
                    text: '${parts[i]}\n',
                    style: pw.TextStyle(
                      font: font,
                      fontSize: thermal ? 7.5 : 10,
                    ),
                  ),
                ],
              ),
            ),
        ],
      );
    }

    final border = pw.Border(
      bottom: pw.BorderSide(color: PdfColors.grey400, width: .7),
    );

    // ---- Symbol widget: a single, compact Code128 barcode ----
    // No QR and no machine-readable text is printed: the scannable payload is
    // unchanged (still the stable internal reference) but only the bars appear,
    // at a smaller height that stays reliably scannable with clear quiet zones.
    final printableWidth = format.width - horizontalMargin * 2;
    final barcodeGeometry = invoiceBarcodeGeometry(
      barcode,
      printableWidth,
      horizontalMargin,
    );
    final symbols = pw.Column(
      crossAxisAlignment: pw.CrossAxisAlignment.center,
      children: [
        pw.Padding(
          padding: pw.EdgeInsets.only(
            left: barcodeGeometry.leftPadding,
            right: barcodeGeometry.rightPadding,
          ),
          child: pw.BarcodeWidget(
            barcode: pw.Barcode.code128(),
            data: barcode,
            drawText: false,
            height: thermal ? 22 : 34,
            width: barcodeGeometry.width,
          ),
        ),
      ],
    );

    // ---- Header: sales page identity + barcode above the order number + type ----
    final orderNumber = order['orderNumber'] ?? id;
    final header = pw.Container(
      padding: pw.EdgeInsets.only(
        bottom: thermal ? 6 : 10,
        top: colored ? 8 : 0,
        left: colored ? 8 : 0,
        right: colored ? 8 : 0,
      ),
      decoration: pw.BoxDecoration(
        border: border,
        color: colored ? const PdfColor.fromInt(0xFFEEF2FF) : null,
      ),
      child: pw.Row(
        crossAxisAlignment: pw.CrossAxisAlignment.start,
        children: [
          // The page's own logo/name is the identity here; Velnix is not shown.
          if (pageLogo != null)
            pw.Container(
              width: thermal ? 34 : 52,
              height: thermal ? 34 : 52,
              margin: const pw.EdgeInsets.only(left: 8),
              child: pw.Image(pageLogo, fit: pw.BoxFit.contain),
            ),
          pw.Expanded(
            child: pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.start,
              children: [
                pw.Text(
                  pageName.isNotEmpty ? pageName : 'بوليصة شحن',
                  style: pw.TextStyle(
                    font: bold,
                    fontSize: thermal ? 12 : 16,
                    color: brandColor,
                  ),
                ),
                if (pagePhone.isNotEmpty || pageWhatsapp.isNotEmpty)
                  pw.Padding(
                    padding: const pw.EdgeInsets.only(top: 1),
                    child: pw.Text(
                      [
                        if (pagePhone.isNotEmpty) 'هاتف الصفحة: $pagePhone',
                        if (pageWhatsapp.isNotEmpty) 'واتساب: $pageWhatsapp',
                      ].join('  •  '),
                      textDirection: pw.TextDirection.rtl,
                      style: pw.TextStyle(
                        font: font,
                        fontSize: thermal ? 6.5 : 8,
                        color: colored
                            ? PdfColors.indigo700
                            : PdfColors.grey800,
                      ),
                    ),
                  ),
                pw.SizedBox(height: thermal ? 4 : 6),
                // Barcode sits ABOVE the order number.
                symbols,
                pw.SizedBox(height: thermal ? 3 : 5),
                // Only the order number is shown; the label «رقم الطلب» is removed.
                pw.Text(
                  '$orderNumber',
                  textDirection: pw.TextDirection.ltr,
                  style: pw.TextStyle(font: bold, fontSize: thermal ? 12 : 16),
                ),
                pw.SizedBox(height: 3),
                // The order type is emphasised: bold, dark and large.
                pw.Text(
                  orderType,
                  style: pw.TextStyle(
                    font: bold,
                    fontSize: thermal ? 12 : 16,
                    color: PdfColors.black,
                  ),
                ),
                if (created != null)
                  pw.Text(
                    '$date${time != null ? '  $time' : ''}',
                    style: pw.TextStyle(
                      font: font,
                      fontSize: thermal ? 7 : 9,
                      color: PdfColors.grey700,
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );

    // ---- Field widgets, driven by the shared field list ----
    // `field` renders one label/value pair; the exact same ordered fields are
    // used in every orientation, so portrait <-> landscape can never drop or
    // reorder information.
    pw.Widget field(InvoiceField f) => f.flow
        ? flowRow(
            f.label,
            _bounded(f.value, thermal ? f.thermalMax : f.normalMax),
          )
        : row(f.label, f.value);
    final recipientBlock = recipientFields(order).map(field).toList();
    final contentBlock = contentFields(order).map(field).toList();
    final metaBlock = metaFields(order, printedBy: printedBy).map(field).toList();

    // Landscape pages are SHORTER but wider, so the same single column would run
    // past the bottom edge. Using the extra width for two columns keeps every
    // field at full size instead of being clipped.
    final twoColumn = !thermal && format.width > format.height;
    final fields = twoColumn
        ? pw.Row(
            crossAxisAlignment: pw.CrossAxisAlignment.start,
            children: [
              pw.Expanded(
                child: pw.Column(
                  crossAxisAlignment: pw.CrossAxisAlignment.stretch,
                  mainAxisSize: pw.MainAxisSize.min,
                  children: recipientBlock,
                ),
              ),
              pw.SizedBox(width: 12),
              pw.Expanded(
                child: pw.Column(
                  crossAxisAlignment: pw.CrossAxisAlignment.stretch,
                  mainAxisSize: pw.MainAxisSize.min,
                  children: contentBlock,
                ),
              ),
            ],
          )
        : pw.Column(
            crossAxisAlignment: pw.CrossAxisAlignment.stretch,
            mainAxisSize: pw.MainAxisSize.min,
            children: [
              ...recipientBlock,
              pw.SizedBox(height: thermal ? 4 : 8),
              pw.Divider(color: PdfColors.grey400),
              ...contentBlock,
            ],
          );

    final body = pw.Column(
      crossAxisAlignment: pw.CrossAxisAlignment.stretch,
      mainAxisSize: pw.MainAxisSize.min,
      children: [
        header,
        pw.SizedBox(height: thermal ? 5 : 9),
        fields,
        pw.SizedBox(height: thermal ? 6 : 10),
        // ---- Creator / operator: official voucher data, always printed ----
        ...metaBlock,
        pw.SizedBox(height: thermal ? 6 : 10),
        // ---- Footer ----
        if ((order['receiptFooter']?.toString() ?? '').isNotEmpty)
          flowRow(
            'معلومات المؤسسة',
            _bounded(order['receiptFooter'], thermal ? 160 : 400),
          ),
        pw.Text(
          'هذا المستند سجل طلب ولا يُعد فاتورة ضريبية ما لم تُستوفَ متطلبات الفوترة المعمول بها.',
          style: pw.TextStyle(
            font: font,
            fontSize: thermal ? 5.5 : 7,
            color: PdfColors.grey700,
          ),
          textAlign: pw.TextAlign.center,
        ),
      ],
    );

    return body;
  }

  /// Printer margins for [format] under [template]: thermal (or narrow) paper
  /// uses a tight margin, full-size paper a comfortable one.
  static ({double horizontal, double vertical}) _marginsFor(
    PdfPageFormat format,
    OrderTemplate template,
  ) {
    final narrow = format.width < 100 * PdfPageFormat.mm;
    final thermal = template == OrderTemplate.thermal || narrow;
    return (
      horizontal: (thermal ? 3 : 12) * PdfPageFormat.mm,
      vertical: (thermal ? 3 : 11) * PdfPageFormat.mm,
    );
  }

  /// Wraps [voucherBody] in the single physical page. Exactly ONE page per
  /// order — and never a clipped one: the voucher is uniformly scaled down by
  /// the smallest amount needed to fit the printable box (a no-op when it
  /// already fits), so no field can fall outside the page edge in either
  /// orientation. A batch of N orders still yields N pages.
  static pw.Page _orderPage(
    Map<String, dynamic> order,
    pw.Font font,
    pw.Font bold,
    PdfPageFormat format,
    OrderTemplate template,
    String printedBy,
  ) {
    final margins = _marginsFor(format, template);
    final printedWidth = format.width - margins.horizontal * 2;
    return pw.Page(
      pageFormat: format,
      margin: pw.EdgeInsets.fromLTRB(
        margins.horizontal,
        margins.vertical,
        margins.horizontal,
        margins.vertical,
      ),
      textDirection: pw.TextDirection.rtl,
      build: (_) => pw.FittedBox(
        fit: pw.BoxFit.scaleDown,
        child: pw.SizedBox(
          width: printedWidth,
          child: voucherBody(
            order: order,
            font: font,
            bold: bold,
            format: format,
            template: template,
            printedBy: printedBy,
          ),
        ),
      ),
    );
  }

  /// Bounds a free-text value to [max] characters so a single voucher always
  /// fits one page at full font size. Truncation is explicit (ellipsis) and only
  /// ever affects over-long free text, never a critical field or the barcode.
  static String _bounded(dynamic value, int max) {
    final text = value?.toString().trim() ?? '';
    if (text.length <= max) return text;
    return '${text.substring(0, max).trimRight()}…';
  }
}

/// Works in Android, iOS, web and desktop printing supported by `printing`.
/// A preview remains available even if a printer is not installed.
class OrderPrintScreen extends StatefulWidget {
  const OrderPrintScreen({
    super.key,
    required this.order,
    this.printedBy = '',
  });
  final Map<String, dynamic> order;

  /// Name of the signed-in operator, printed as «تمت الطباعة بواسطة».
  final String printedBy;

  @override
  State<OrderPrintScreen> createState() => _OrderPrintScreenState();
}

class _OrderPrintScreenState extends State<OrderPrintScreen> {
  OrderPaper paper = OrderPaper.a4;
  OrderTemplate template = OrderTemplate.professional;
  bool landscape = false;
  final width = TextEditingController(text: '100');
  final height = TextEditingController(text: '180');
  bool busy = false;
  @override
  void dispose() {
    width.dispose();
    height.dispose();
    super.dispose();
  }

  PdfPageFormat get currentFormat {
    final w = double.tryParse(width.text) ?? 0,
        h = double.tryParse(height.text) ?? 0;
    if (paper == OrderPaper.custom &&
        (w < 50 || w > 420 || h < 80 || h > 600)) {
      throw const FormatException(
        'المقاس المخصص: العرض 50–420 مم والطول 80–600 مم',
      );
    }
    final base = paper.format(widthMm: w, heightMm: h);
    if (!landscape) return base;
    return PdfPageFormat(base.height, base.width, marginAll: base.marginLeft);
  }

  Future<void> run(Future<void> Function() action) async {
    if (busy) return;
    setState(() => busy = true);
    try {
      await action();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('تعذرت العملية: $e')));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final id = widget.order['id']?.toString() ?? '';
    final order = widget.order;
    return Scaffold(
      appBar: AppBar(title: const Text('طباعة الطلب والفاتورة')),
      body: LayoutBuilder(
        builder: (context, box) {
          final wide = box.maxWidth >= 900;
          final controls = Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    'إعدادات الطباعة',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'طلب: ${order['orderNumber'] ?? id}',
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 9),
                  DropdownButtonFormField<OrderPaper>(
                    isExpanded: true,
                    key: ValueKey(paper),
                    initialValue: paper,
                    decoration: const InputDecoration(labelText: 'حجم الورق'),
                    items: OrderPaper.values
                        .map(
                          (p) =>
                              DropdownMenuItem(value: p, child: Text(p.label)),
                        )
                        .toList(),
                    onChanged: busy
                        ? null
                        : (v) => setState(() => paper = v ?? OrderPaper.a4),
                  ),
                  const SizedBox(height: 9),
                  DropdownButtonFormField<OrderTemplate>(
                    isExpanded: true,
                    key: ValueKey(template),
                    initialValue: template,
                    decoration: const InputDecoration(labelText: 'القالب'),
                    items: OrderTemplate.values
                        .map(
                          (t) =>
                              DropdownMenuItem(value: t, child: Text(t.label)),
                        )
                        .toList(),
                    onChanged: busy
                        ? null
                        : (v) => setState(
                            () => template = v ?? OrderTemplate.professional,
                          ),
                  ),
                  const SizedBox(height: 9),
                  DropdownButtonFormField<bool>(
                    isExpanded: true,
                    key: ValueKey('orientation-$landscape'),
                    initialValue: landscape,
                    decoration: const InputDecoration(labelText: 'الاتجاه'),
                    items: const [
                      DropdownMenuItem(value: false, child: Text('عمودي')),
                      DropdownMenuItem(value: true, child: Text('أفقي')),
                    ],
                    onChanged: busy
                        ? null
                        : (v) => setState(() => landscape = v ?? false),
                  ),
                  if (paper == OrderPaper.custom) ...[
                    const SizedBox(height: 12),
                    TextField(
                      controller: width,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        labelText: 'العرض بالملليمتر',
                      ),
                      onChanged: (_) => setState(() {}),
                    ),
                    const SizedBox(height: 9),
                    TextField(
                      controller: height,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        labelText: 'الطول بالملليمتر',
                      ),
                      onChanged: (_) => setState(() {}),
                    ),
                  ],
                  const SizedBox(height: 10),
                  const Text(
                    'الباركود ثابت لهذا الطلب في كل إعادة طباعة. لا تُظهر البوليصة المبلغ إذا لم يمنحه الخادم للمستخدم.',
                    style: TextStyle(fontSize: 12),
                  ),
                  const SizedBox(height: 14),
                  FilledButton.icon(
                    onPressed: busy
                        ? null
                        : () => run(() async {
                            final format = currentFormat;
                            await Printing.layoutPdf(
                              name: 'Velnix-$id',
                              onLayout: (_) => OrderInvoicePdf.generate(
                                order: order,
                                format: format,
                                template: template,
                                printedBy: widget.printedBy,
                              ),
                            );
                          }),
                    icon: const Icon(Icons.print),
                    label: const Text('طباعة'),
                  ),
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                    onPressed: busy
                        ? null
                        : () => run(() async {
                            final bytes = await OrderInvoicePdf.generate(
                              order: order,
                              format: currentFormat,
                              template: template,
                              printedBy: widget.printedBy,
                            );
                            await Printing.sharePdf(
                              bytes: bytes,
                              filename: 'Velnix-$id.pdf',
                            );
                          }),
                    icon: const Icon(Icons.picture_as_pdf_outlined),
                    label: const Text('حفظ / مشاركة PDF'),
                  ),
                ],
              ),
            ),
          );
          Widget preview;
          try {
            final format = currentFormat;
            preview = PdfPreview(
              key: ValueKey(
                '${paper.name}-${template.name}-${landscape ? 'l' : 'p'}-${width.text}-${height.text}-$id',
              ),
              initialPageFormat: format,
              canChangePageFormat: false,
              canChangeOrientation: false,
              build: (_) => OrderInvoicePdf.generate(
                order: order,
                format: format,
                template: template,
                printedBy: widget.printedBy,
              ),
              pdfFileName: 'Velnix-$id.pdf',
              onError: (context, error) => Center(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Text(
                    'تعذرت المعاينة: $error',
                    textAlign: TextAlign.center,
                  ),
                ),
              ),
            );
          } catch (e) {
            preview = Center(child: Text('$e'));
          }
          if (wide) {
            return Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(
                    width: 320,
                    child: SingleChildScrollView(child: controls),
                  ),
                  const SizedBox(width: 16),
                  Expanded(child: preview),
                ],
              ),
            );
          }
          return Column(
            children: [
              SizedBox(
                height: box.maxHeight * .48,
                child: SingleChildScrollView(
                  child: Padding(
                    padding: const EdgeInsets.all(10),
                    child: controls,
                  ),
                ),
              ),
              Expanded(child: preview),
            ],
          );
        },
      ),
    );
  }
}
