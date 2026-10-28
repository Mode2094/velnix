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

class OrderInvoicePdf {
  OrderInvoicePdf._();

  static Future<Uint8List> generate({
    required Map<String, dynamic> order,
    required PdfPageFormat format,
    OrderTemplate template = OrderTemplate.professional,
  }) async {
    final font = pw.Font.ttf(
      await rootBundle.load('assets/fonts/Cairo-Regular.ttf'),
    );
    final bold = pw.Font.ttf(
      await rootBundle.load('assets/fonts/Cairo-Bold.ttf'),
    );
    final logo = await _loadVelnixLogo();
    final pdf = pw.Document(
      title: 'Velnix - ${order['orderNumber'] ?? order['id']}',
      author: 'Velnix Smart Order Management',
      theme: pw.ThemeData.withFont(base: font, bold: bold),
    );
    pdf.addPage(_orderPage(order, font, bold, format, template, logo));
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
  }) async {
    if (orders.isEmpty) throw const FormatException('لا توجد طلبات للطباعة');
    final limited = orders.take(maxOrders).toList();
    final font = pw.Font.ttf(
      await rootBundle.load('assets/fonts/Cairo-Regular.ttf'),
    );
    final bold = pw.Font.ttf(
      await rootBundle.load('assets/fonts/Cairo-Bold.ttf'),
    );
    final logo = await _loadVelnixLogo();
    final pdf = pw.Document(
      title: 'Velnix - ${limited.length} طلب',
      author: 'Velnix Smart Order Management',
      theme: pw.ThemeData.withFont(base: font, bold: bold),
    );
    for (final order in limited) {
      pdf.addPage(_orderPage(order, font, bold, format, template, logo));
    }
    return pdf.save();
  }

  /// The Velnix wordmark used in the header. Missing asset must not break a
  /// print, so it returns null and the header falls back to the text mark.
  static Future<pw.MemoryImage?> _loadVelnixLogo() async {
    try {
      final data = await rootBundle.load('assets/images/logo.png');
      return pw.MemoryImage(data.buffer.asUint8List());
    } catch (_) {
      return null;
    }
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

  static pw.Page _orderPage(
    Map<String, dynamic> order,
    pw.Font font,
    pw.Font bold,
    PdfPageFormat format,
    OrderTemplate template,
    pw.MemoryImage? velnixLogo,
  ) {
    final narrow = format.width < 100 * PdfPageFormat.mm;
    final thermal = template == OrderTemplate.thermal || narrow;
    final horizontalMargin = (thermal ? 3 : 12) * PdfPageFormat.mm;
    final verticalMargin = (thermal ? 3 : 11) * PdfPageFormat.mm;
    final id = order['id']?.toString() ?? '';
    final barcode = orderBarcode(order);
    final qr = orderQrPayload(order);
    final amount = order['amount']; // absent/null means server hid this field.
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

    // ---- Symbols widget (computed from the printable width) ----
    // The barcode always takes the full printable width (203-DPI grid geometry)
    // and the QR is centered beneath it, so every paper size yields scannable
    // symbols with clear quiet zones.
    final printableWidth = format.width - horizontalMargin * 2;
    final barcodeGeometry = invoiceBarcodeGeometry(
      barcode,
      printableWidth,
      horizontalMargin,
    );
    final qrSize = (printableWidth * 0.42).clamp(
      thermal ? 34.0 : 48.0,
      thermal ? 46.0 : 70.0,
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
            height: thermal ? 34 : 54,
            width: barcodeGeometry.width,
          ),
        ),
        pw.SizedBox(height: 3),
        pw.Text(
          barcode,
          textDirection: pw.TextDirection.ltr,
          style: pw.TextStyle(font: font, fontSize: thermal ? 6.5 : 9),
        ),
        pw.SizedBox(height: thermal ? 6 : 10),
        pw.SizedBox(
          width: qrSize,
          height: qrSize,
          child: pw.BarcodeWidget(
            barcode: pw.Barcode.qrCode(),
            data: qr,
            drawText: false,
          ),
        ),
      ],
    );

    // ---- Header: Velnix + page identity + order number + type ----
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
          if (velnixLogo != null)
            pw.Container(
              width: thermal ? 34 : 52,
              height: thermal ? 34 : 52,
              margin: const pw.EdgeInsets.only(left: 8),
              child: pw.Image(velnixLogo, fit: pw.BoxFit.contain),
            ),
          pw.Expanded(
            child: pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.start,
              children: [
                pw.Text(
                  'Velnix',
                  textDirection: pw.TextDirection.ltr,
                  style: pw.TextStyle(
                    font: bold,
                    fontSize: thermal ? 15 : 20,
                    color: brandColor,
                  ),
                ),
                pw.Text(
                  pageName.isNotEmpty ? pageName : 'بوليصة شحن',
                  style: pw.TextStyle(font: bold, fontSize: thermal ? 10 : 13),
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
                pw.SizedBox(height: 2),
                // No forced LTR: the line mixes Arabic and Latin, and forcing a
                // paragraph direction corrupts the bidi of following rich-text
                // rows in the PDF engine.
                pw.Text(
                  'رقم الطلب: ${order['orderNumber'] ?? id}',
                  style: pw.TextStyle(font: bold, fontSize: thermal ? 9 : 12),
                ),
                pw.Text(
                  'النوع: $orderType${created != null ? '  •  $date${time != null ? ' $time' : ''}' : ''}',
                  style: pw.TextStyle(
                    font: font,
                    fontSize: thermal ? 7 : 9,
                    color: PdfColors.grey700,
                  ),
                ),
              ],
            ),
          ),
          if (pageLogo != null)
            pw.Container(
              width: thermal ? 34 : 48,
              height: thermal ? 34 : 48,
              child: pw.Image(pageLogo, fit: pw.BoxFit.contain),
            ),
        ],
      ),
    );

    return pw.MultiPage(
      pageFormat: format,
      margin: pw.EdgeInsets.fromLTRB(
        horizontalMargin,
        verticalMargin,
        horizontalMargin,
        verticalMargin,
      ),
      textDirection: pw.TextDirection.rtl,
      // MultiPage may continue a very long slip; symbols are emitted as complete
      // widgets, so they are never split. maxPages is only a runaway guard and
      // never truncates a real order.
      maxPages: 50,
      build: (_) => [
        header,
        pw.SizedBox(height: thermal ? 5 : 9),
        // ---- Recipient / destination ----
        row('المستلم', order['customer']),
        row('الهاتف', order['phone']),
        if ((order['extraPhone']?.toString() ?? '').isNotEmpty)
          row('هاتف إضافي', order['extraPhone']),
        row('المحافظة', order['city']),
        row('المنطقة', order['area']),
        if ((order['address']?.toString() ?? '').isNotEmpty)
          flowRow('العنوان', order['address']),
        pw.SizedBox(height: thermal ? 4 : 8),
        pw.Divider(color: PdfColors.grey400),
        // ---- Contents / financial ----
        flowRow('وصف المحتويات', order['description']),
        row('الكمية', order['quantity']),
        row('طريقة الدفع', order['paymentMethod']),
        if ((order['companyName']?.toString() ?? '').isNotEmpty)
          row('شركة التوصيل', order['companyName']),
        if (amount is num) row('المبلغ', '${amount.toStringAsFixed(3)} د.أ'),
        if ((order['trackingNumber']?.toString() ?? '').isNotEmpty)
          row('رقم تتبع الشحنة', order['trackingNumber']),
        if ((order['clickOrderRef']?.toString() ?? '').isNotEmpty)
          row('مرجع الشحنة', order['clickOrderRef']),
        if ((order['note']?.toString() ?? '').isNotEmpty)
          flowRow('ملاحظات', order['note']),
        pw.SizedBox(height: thermal ? 8 : 14),
        // ---- Symbols: Code128 + QR ----
        // Sizes derive from the printable width: side-by-side when it fits,
        // otherwise stacked (A6 / 58mm / narrow custom) so both symbols stay
        // scannable. The Code128 keeps the 203-DPI grid geometry.
        symbols,
        pw.SizedBox(height: thermal ? 6 : 10),
        // ---- Footer ----
        if ((order['receiptFooter']?.toString() ?? '').isNotEmpty)
          flowRow('معلومات المؤسسة', order['receiptFooter']),
        pw.Text(
          'امسح الباركود أو رمز QR للعثور على الطلب بالمعرّف الداخلي. لا يحتوي الرمز على بيانات العميل.',
          style: pw.TextStyle(
            font: font,
            fontSize: thermal ? 6 : 8,
            color: PdfColors.grey700,
          ),
          textAlign: pw.TextAlign.center,
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
  }
}

/// Works in Android, iOS, web and desktop printing supported by `printing`.
/// A preview remains available even if a printer is not installed.
class OrderPrintScreen extends StatefulWidget {
  const OrderPrintScreen({super.key, required this.order});
  final Map<String, dynamic> order;
  @override
  State<OrderPrintScreen> createState() => _OrderPrintScreenState();
}

class _OrderPrintScreenState extends State<OrderPrintScreen> {
  OrderPaper paper = OrderPaper.a4;
  OrderTemplate template = OrderTemplate.professional;
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
    return paper.format(widthMm: w, heightMm: h);
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
                    'الباركود ورمز QR ثابتان لهذا الطلب في كل إعادة طباعة. لا تُظهر البوليصة المبلغ إذا لم يمنحه الخادم للمستخدم.',
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
                '${paper.name}-${template.name}-${width.text}-${height.text}-$id',
              ),
              initialPageFormat: format,
              canChangePageFormat: false,
              canChangeOrientation: false,
              build: (_) => OrderInvoicePdf.generate(
                order: order,
                format: format,
                template: template,
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
