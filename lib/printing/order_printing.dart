import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

/// The barcode is a stable representation of the Firestore document ID.
/// Never use the current time to generate a new barcode when reprinting.
String orderBarcode(Map<String, dynamic> order) {
  final id = order['id']?.toString().trim() ?? '';
  if (id.isEmpty || id.length > 140 || !RegExp(r'^[a-zA-Z0-9_-]+$').hasMatch(id)) {
    throw const FormatException('معرّف الطلب غير صالح لإنشاء الباركود');
  }
  final value = order['barcodeValue']?.toString() ?? '';
  // Do not trust a mutable remote barcode that points to a different order.
  return value == 'VNX-$id' ? value : 'VNX-$id';
}

/// Common paper formats, thermal rolls, and user-specified label paper.
enum OrderPaper {a3,a4,a5,a6,letter,legal,thermal80,thermal58,custom}

extension OrderPaperFormat on OrderPaper {
  String get label => switch (this) {
    OrderPaper.a3 => 'A3', OrderPaper.a4 => 'A4', OrderPaper.a5 => 'A5',
    OrderPaper.a6 => 'A6', OrderPaper.letter => 'Letter', OrderPaper.legal => 'Legal',
    OrderPaper.thermal80 => 'حراري 80 مم', OrderPaper.thermal58 => 'حراري 58 مم',
    OrderPaper.custom => 'مقاس مخصص',
  };

  PdfPageFormat format({double widthMm=100,double heightMm=180}) => switch (this) {
    OrderPaper.a3 => PdfPageFormat.a3, OrderPaper.a4 => PdfPageFormat.a4,
    OrderPaper.a5 => PdfPageFormat.a5, OrderPaper.a6 => PdfPageFormat.a6,
    OrderPaper.letter => PdfPageFormat.letter, OrderPaper.legal => PdfPageFormat.legal,
    OrderPaper.thermal80 => PdfPageFormat(80*PdfPageFormat.mm,260*PdfPageFormat.mm),
    OrderPaper.thermal58 => PdfPageFormat(58*PdfPageFormat.mm,260*PdfPageFormat.mm),
    OrderPaper.custom => PdfPageFormat(widthMm*PdfPageFormat.mm,heightMm*PdfPageFormat.mm),
  };
}

class OrderInvoicePdf {
  OrderInvoicePdf._();

  static Future<Uint8List> generate({
    required Map<String,dynamic> order,
    required PdfPageFormat format,
  }) async {
    // Arabic shaping and embedding rely on Cairo fonts downloaded by the
    // printing package. On first use an internet connection may be required.
    final font = await PdfGoogleFonts.cairoRegular();
    final bold = await PdfGoogleFonts.cairoBold();
    final pdf = pw.Document(
      title: 'Velnix - ${order['id']}',
      author: 'Velnix Smart Order Management',
      theme: pw.ThemeData.withFont(base:font,bold:bold),
    );
    final narrow = format.width < 100*PdfPageFormat.mm;
    final horizontalMargin=(narrow ? 3 : 12)*PdfPageFormat.mm;
    final verticalMargin=(narrow ? 3 : 11)*PdfPageFormat.mm;
    final id=order['id']?.toString()??'';
    final amount=order['amount']; // absent/null means server hid this field.
    final created=DateTime.tryParse(order['createdAt']?.toString()??'');
    final date=created == null ? '—' :
      '${created.year}-${created.month.toString().padLeft(2,'0')}-${created.day.toString().padLeft(2,'0')}';
    pw.Widget item(String name,dynamic value) => pw.Padding(
      padding: pw.EdgeInsets.symmetric(vertical:narrow?2:4),
      child:pw.Row(crossAxisAlignment:pw.CrossAxisAlignment.start,children:[
        pw.SizedBox(width:narrow?52:92,child:pw.Text('$name:',style:pw.TextStyle(font:bold,fontSize:narrow?7.5:10))),
        pw.Expanded(child:pw.Text(value?.toString().isNotEmpty==true?value.toString():'—',
          style:pw.TextStyle(font:font,fontSize:narrow?7.5:10))),
      ]),
    );
    final border=pw.Border(bottom:pw.BorderSide(color:PdfColors.grey300,width:.6));
    final barcode=orderBarcode(order);
    pdf.addPage(pw.MultiPage(
      pageFormat:format,
      margin:pw.EdgeInsets.fromLTRB(horizontalMargin,verticalMargin,horizontalMargin,verticalMargin),
      textDirection:pw.TextDirection.rtl,
      maxPages:20,
      build:(_)=>[
        pw.Container(padding:pw.EdgeInsets.only(bottom:narrow?7:13),decoration:pw.BoxDecoration(border:border),
          child:pw.Column(crossAxisAlignment:pw.CrossAxisAlignment.center,children:[
            pw.Text('VELNIX',textDirection:pw.TextDirection.ltr,
              style:pw.TextStyle(font:bold,fontSize:narrow?17:24,color:PdfColors.indigo800)),
            pw.Text('فاتورة طلب / سند توصيل',style:pw.TextStyle(font:bold,fontSize:narrow?10:16)),
            pw.Text('رقم الطلب: $id',style:pw.TextStyle(font:font,fontSize:narrow?7:10)),
            pw.Text('تاريخ الإنشاء: $date',style:pw.TextStyle(font:font,fontSize:narrow?7:9)),
          ])),
        pw.SizedBox(height:narrow?6:12),
        item('المستلم',order['customer']),
        item('الهاتف',order['phone']),
        if((order['extraPhone']?.toString()??'').isNotEmpty)item('هاتف إضافي',order['extraPhone']),
        item('المحافظة',order['city']),
        item('المنطقة',order['area']),
        item('العنوان',order['address']),
        pw.SizedBox(height:narrow?5:10),
        pw.Divider(color:PdfColors.grey300),
        item('وصف المحتويات',order['description']),
        item('الكمية',order['quantity']),
        item('طريقة الدفع',order['paymentMethod']),
        if(amount is num)item('المبلغ', '${amount.toStringAsFixed(3)} د.أ'),
        if((order['trackingNumber']?.toString()??'').isNotEmpty)item('رقم تتبع الشحنة',order['trackingNumber']),
        if((order['note']?.toString()??'').isNotEmpty)item('ملاحظات',order['note']),
        pw.SizedBox(height:narrow?10:18),
        pw.Center(child:pw.BarcodeWidget(
          barcode:pw.Barcode.code128(),data:barcode,
          drawText:true,height:narrow?39:66,
          width:format.width-horizontalMargin*2-(narrow?5:35),
          textStyle:pw.TextStyle(fontSize:narrow?7:10),
        )),
        pw.SizedBox(height:9),
        pw.Text('امسح الباركود للعثور على الطلب بواسطة المعرّف الداخلي. لا يحتوي الباركود على بيانات العميل.',
          style:pw.TextStyle(font:font,fontSize:narrow?7:9,color:PdfColors.grey700),textAlign:pw.TextAlign.center),
        pw.Text('هذا المستند سجل طلب ولا يُعد فاتورة ضريبية ما لم تُستوفَ متطلبات الفوترة المعمول بها.',
          style:pw.TextStyle(font:font,fontSize:narrow?6:8,color:PdfColors.grey700),textAlign:pw.TextAlign.center),
      ],
    ));
    return pdf.save();
  }
}

/// Works in Android, iOS, web and desktop printing supported by `printing`.
/// A preview remains available even if a printer is not installed.
class OrderPrintScreen extends StatefulWidget {
  const OrderPrintScreen({super.key,required this.order});
  final Map<String,dynamic> order;
  @override State<OrderPrintScreen> createState()=>_OrderPrintScreenState();
}
class _OrderPrintScreenState extends State<OrderPrintScreen> {
  OrderPaper paper=OrderPaper.a4;
  final width=TextEditingController(text:'100');
  final height=TextEditingController(text:'180');
  bool busy=false;
  @override void dispose(){width.dispose();height.dispose();super.dispose();}

  PdfPageFormat get currentFormat {
    final w=double.tryParse(width.text)??0,h=double.tryParse(height.text)??0;
    if(paper==OrderPaper.custom && (w<50||w>420||h<80||h>600)) {
      throw const FormatException('المقاس المخصص: العرض 50–420 مم والطول 80–600 مم');
    }
    return paper.format(widthMm:w,heightMm:h);
  }

  Future<void> run(Future<void> Function() action) async {
    if(busy)return;
    setState(()=>busy=true);
    try{await action();}
    catch(e){if(mounted)ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content:Text('تعذرت العملية: $e')));}
    finally{if(mounted)setState(()=>busy=false);}
  }
  @override Widget build(BuildContext context) {
    final id=widget.order['id']?.toString()??'';
    return Scaffold(appBar:AppBar(title:const Text('طباعة الطلب والفاتورة')),
      body:LayoutBuilder(builder:(context,box){
        final wide=box.maxWidth>=900;
        final controls=Card(child:Padding(padding:const EdgeInsets.all(16),child:Column(
          mainAxisSize:MainAxisSize.min,crossAxisAlignment:CrossAxisAlignment.stretch,children:[
          const Text('إعدادات الفاتورة',style:TextStyle(fontSize:18,fontWeight:FontWeight.bold)),
          const SizedBox(height:8),
          Text('طلب: $id',maxLines:2,overflow:TextOverflow.ellipsis),
          const SizedBox(height:9),
          DropdownButtonFormField<OrderPaper>(
            key:ValueKey(paper),initialValue:paper,decoration:const InputDecoration(labelText:'حجم الورق'),
            items:OrderPaper.values.map((p)=>DropdownMenuItem(value:p,child:Text(p.label))).toList(),
            onChanged:busy?null:(v)=>setState(()=>paper=v??OrderPaper.a4)),
          if(paper==OrderPaper.custom)...[
            const SizedBox(height:12),TextField(controller:width,keyboardType:TextInputType.number,
              decoration:const InputDecoration(labelText:'العرض بالملليمتر'),onChanged:(_)=>setState((){})),
            const SizedBox(height:9),TextField(controller:height,keyboardType:TextInputType.number,
              decoration:const InputDecoration(labelText:'الطول بالملليمتر'),onChanged:(_)=>setState((){})),
          ],
          const SizedBox(height:10),
          const Text('الباركود ثابت لهذا الطلب في كل إعادة طباعة. فاتورة الطلب لا تُظهر المبلغ إذا لم يمنحه الخادم للمستخدم.',
            style:TextStyle(fontSize:12)),
          const SizedBox(height:14),
          FilledButton.icon(onPressed:busy?null:()=>run(() async {
            final format=currentFormat;
            await Printing.layoutPdf(name:'Velnix-$id',
              onLayout:(_)=>OrderInvoicePdf.generate(order:widget.order,format:format));
          }),icon:const Icon(Icons.print),label:const Text('طباعة')),
          const SizedBox(height:8),
          OutlinedButton.icon(onPressed:busy?null:()=>run(() async {
            final bytes=await OrderInvoicePdf.generate(order:widget.order,format:currentFormat);
            await Printing.sharePdf(bytes:bytes,filename:'Velnix-$id.pdf');
          }),icon:const Icon(Icons.picture_as_pdf_outlined),label:const Text('حفظ / مشاركة PDF')),
        ])));
        Widget preview;
        try{
          final format=currentFormat;
          preview=PdfPreview(
            key:ValueKey('${paper.name}-${width.text}-${height.text}-$id'),
            initialPageFormat:format,canChangePageFormat:false,canChangeOrientation:false,
            build:(_)=>OrderInvoicePdf.generate(order:widget.order,format:format),
            pdfFileName:'Velnix-$id.pdf',
            onError:(context,error)=>Center(child:Padding(padding:const EdgeInsets.all(16),
              child:Text('تعذرت المعاينة: $error',textAlign:TextAlign.center))),
          );
        }catch(e){preview=Center(child:Text('$e'));}
        if(wide)return Padding(padding:const EdgeInsets.all(16),child:Row(
          crossAxisAlignment:CrossAxisAlignment.start,children:[
            SizedBox(width:320,child:SingleChildScrollView(child:controls)),
            const SizedBox(width:16),Expanded(child:preview),
          ]));
        return Column(children:[SizedBox(height:box.maxHeight*.48,
          child:SingleChildScrollView(child:Padding(padding:const EdgeInsets.all(10),child:controls))),
          Expanded(child:preview)]);
      }),
    );
  }
}
