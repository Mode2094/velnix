import 'package:flutter/material.dart';
import 'package:pdf/pdf.dart';
import 'package:printing/printing.dart';

import '../core/theme.dart';
import '../core/widgets.dart';
import 'order_printing.dart';

/// Preview and print several selected orders as one PDF. Each order keeps its
/// own independent voucher page and barcode. Amounts are only shown when the
/// server already included them for the signed-in user, so a bulk print can
/// never leak a hidden amount.
class BulkPrintScreen extends StatefulWidget {
  const BulkPrintScreen({super.key, required this.orders, this.title});
  final List<Map<String, dynamic>> orders;
  final String? title;

  /// Hard cap so a very large selection cannot exhaust memory. The caller warns
  /// the user when the selection exceeds this.
  static const int maxOrders = 100;

  @override
  State<BulkPrintScreen> createState() => _BulkPrintScreenState();
}

class _BulkPrintScreenState extends State<BulkPrintScreen> {
  OrderPaper paper = OrderPaper.a4;
  bool busy = false;

  PdfPageFormat get format => paper.format();

  List<Map<String, dynamic>> get orders =>
      widget.orders.take(BulkPrintScreen.maxOrders).toList();

  Future<void> run(Future<void> Function() action) async {
    if (busy) return;
    setState(() => busy = true);
    try {
      await action();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('تعذرت العملية: $e'),
            backgroundColor: VColors.danger,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final name = 'Velnix-orders-${orders.length}.pdf';
    if (widget.orders.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: Text(widget.title ?? 'طباعة الطلبات')),
        body: const Center(child: Text('لا توجد طلبات للطباعة')),
      );
    }
    final controls = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        VPanel(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'إعدادات الطباعة',
                style: TextStyle(fontSize: 17, fontWeight: FontWeight.w900),
              ),
              const SizedBox(height: 8),
              Text('عدد الطلبات: ${orders.length}'),
              if (widget.orders.length > BulkPrintScreen.maxOrders)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(
                    'سيُطبع أول ${BulkPrintScreen.maxOrders} طلب فقط من ${widget.orders.length}.',
                    style: const TextStyle(
                      color: VColors.warning,
                      fontSize: 12,
                    ),
                  ),
                ),
              const SizedBox(height: 10),
              DropdownButtonFormField<OrderPaper>(
                initialValue: paper,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'حجم الورق'),
                items: [
                  for (final p in OrderPaper.values)
                    DropdownMenuItem(value: p, child: Text(p.label)),
                ],
                onChanged: (v) => setState(() => paper = v ?? OrderPaper.a4),
              ),
              const SizedBox(height: 12),
              FilledButton.icon(
                onPressed: busy
                    ? null
                    : () => run(() async {
                        await Printing.layoutPdf(
                          name: name,
                          onLayout: (_) => OrderInvoicePdf.generateMany(
                            orders: orders,
                            format: format,
                          ),
                        );
                      }),
                icon: const Icon(Icons.print),
                label: const Text('طباعة الكل'),
              ),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                onPressed: busy
                    ? null
                    : () => run(() async {
                        final bytes = await OrderInvoicePdf.generateMany(
                          orders: orders,
                          format: format,
                        );
                        await Printing.sharePdf(bytes: bytes, filename: name);
                      }),
                icon: const Icon(Icons.picture_as_pdf_outlined),
                label: const Text('حفظ / مشاركة PDF'),
              ),
            ],
          ),
        ),
      ],
    );
    final preview = PdfPreview(
      key: ValueKey('bulk-${paper.name}-${orders.length}'),
      initialPageFormat: format,
      canChangePageFormat: false,
      canChangeOrientation: false,
      build: (_) =>
          OrderInvoicePdf.generateMany(orders: orders, format: format),
      pdfFileName: name,
      onError: (context, error) => Center(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Text('تعذرت المعاينة: $error', textAlign: TextAlign.center),
        ),
      ),
    );
    return Scaffold(
      appBar: AppBar(title: Text(widget.title ?? 'طباعة الطلبات المحددة')),
      body: LayoutBuilder(
        builder: (context, box) {
          final wide = box.maxWidth >= 900;
          if (wide) {
            return Row(
              children: [
                SizedBox(
                  width: 320,
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.all(12),
                    child: controls,
                  ),
                ),
                const VerticalDivider(width: 1),
                Expanded(child: preview),
              ],
            );
          }
          return Column(
            children: [
              SingleChildScrollView(
                padding: const EdgeInsets.all(12),
                child: controls,
              ),
              Expanded(child: preview),
            ],
          );
        },
      ),
    );
  }
}
