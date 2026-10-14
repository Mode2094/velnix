import 'package:flutter/material.dart';
import '../core/theme.dart';
import '../core/widgets.dart';
import '../data/demo_store.dart';
import '../models/entities.dart';
import 'orders_screen.dart';

class DeliveryCompaniesScreen extends StatelessWidget {
  const DeliveryCompaniesScreen({super.key});
  @override Widget build(BuildContext context) {
    final store = StoreScope.of(context);
    return Scaffold(appBar: AppBar(title: const Text('شركات التوصيل')),
      body: SingleChildScrollView(child: VScreen(child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        VPageTitle(title: 'مركز شركات التوصيل', subtitle: 'الشركات، حالات الشحن، وإعدادات الربط',
          action: store.can(AppPermission.manageCompanies)
            ? IconButton.filled(onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const DeliveryCompanyForm())),
                icon: const Icon(Icons.add_rounded), tooltip: 'إضافة شركة') : null),
        const VDemoBanner(compact: true), const SizedBox(height: 14),
        Container(padding: const EdgeInsets.all(17), decoration: BoxDecoration(
          gradient: const LinearGradient(colors: [VColors.navy, Color(0xFF3D4CAE)]), borderRadius: BorderRadius.circular(20)),
          child: Row(children: [
            Container(width: 49, height: 49, decoration: BoxDecoration(color: Colors.white.withValues(alpha: .15), borderRadius: BorderRadius.circular(13)),
              child: const Icon(Icons.hub_outlined, color: Colors.white, size: 26)),
            const SizedBox(width: 13), Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('لوحة التوصيل', style: TextStyle(fontWeight: FontWeight.w900, color: Colors.white, fontSize: 17)),
              Text('${store.companies.where((c) => !c.archived).length} شركة مسجلة • ${store.bucketCount(OrderBucket.delivery)} طلب مرتبط', style: const TextStyle(fontSize: 12, color: Color(0xFFD5DAFF))),
            ])),
          ])),
        const VSection(title: 'الشركات المسجلة'),
        if (store.companies.where((c) => !c.archived).isEmpty) const VPanel(child: VEmpty(title: 'لم تضف أي شركة توصيل بعد')),
        ...store.companies.where((c) => !c.archived).map((company) => Padding(padding: const EdgeInsets.only(bottom: 14), child: _companyCard(context, store, company))),
        if (store.can(AppPermission.manageCompanies)) VPanel(child: const Row(children: [
          Icon(Icons.security_outlined, color: VColors.brand), SizedBox(width: 9),
          Expanded(child: Text('مفاتيح الربط تُحفظ على الخادم فقط عند تفعيل Firebase/Cloud Functions. واجهة المعاينة لا تحفظ أي مفاتيح.',
            style: TextStyle(fontSize: 12, color: VColors.muted))),
        ])),
      ]))));
  }

  void _confirmArchive(BuildContext context, DemoStore store, DeliveryCompany company) {
    showDialog<void>(context: context, builder: (d) => AlertDialog(
      title: const Text('إزالة الشركة من القائمة؟'),
      content: const Text('سيتم تعطيل الشركة وإخفاؤها من خيارات الشحن الجديدة، مع إبقاء سجل الطلبات القديمة كما هو.'),
      actions: [
        TextButton(onPressed: () => Navigator.pop(d), child: const Text('تراجع')),
        FilledButton(onPressed: () { store.archiveCompany(company); Navigator.pop(d); }, child: const Text('تأكيد الأرشفة')),
      ],
    ));
  }

  Widget _companyCard(BuildContext context, DemoStore store, DeliveryCompany company) {
    final companyOrders = store.visibleOrders.where((o) => o.companyId == company.id).toList();
    final total = companyOrders.fold(0.0, (double n, OrderRecord o) => n + o.amount);
    final statuses = OrderStatus.values;
    return VPanel(padding: EdgeInsets.zero, child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Padding(padding: const EdgeInsets.all(17), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(width: 46, height: 46, decoration: BoxDecoration(color: VColors.softBlue, borderRadius: BorderRadius.circular(14)),
            child: const Icon(Icons.local_shipping_rounded, color: VColors.brand, size: 24)),
          const SizedBox(width: 11), Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(company.name, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: VColors.ink)),
            Text(company.enabled ? 'مفعّلة • ${company.connectionLabel}' : 'معطّلة',
              style: TextStyle(color: company.enabled ? VColors.aqua : VColors.danger, fontSize: 11)),
          ])),
          if (store.can(AppPermission.manageCompanies)) ...[
            IconButton(onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => DeliveryCompanyForm(company: company))),
              tooltip: 'تعديل إعدادات الشركة', icon: const Icon(Icons.tune_rounded, color: VColors.brand)),
            IconButton(onPressed: () => _confirmArchive(context, store, company), tooltip: 'أرشفة الشركة', icon: const Icon(Icons.archive_outlined, color: VColors.muted)),
          ],
        ]),
        const SizedBox(height: 15),
        Row(children: [
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('الطلبات المرتبطة', style: TextStyle(color: VColors.muted, fontSize: 11)),
            Text('${companyOrders.length}', style: const TextStyle(fontSize: 29, fontWeight: FontWeight.w900, color: VColors.ink)),
          ]),
          if (store.canSeeAmounts) ...[
            const Spacer(),
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              const Text('إجمالي المبالغ', style: TextStyle(fontSize: 12, color: VColors.muted)),
              Text(jod(total), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: VColors.brand)),
            ]),
          ],
        ]),
      ])),
      Container(padding: const EdgeInsets.fromLTRB(12, 12, 12, 15), decoration: const BoxDecoration(color: Color(0xFFFAFBFF),
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(22))), child: LayoutBuilder(builder: (context, c) {
          final cross = c.maxWidth >= 720 ? 3 : 2;
          final tileWidth = (c.maxWidth - 8 * (cross - 1)) / cross;
          return Wrap(spacing: 8, runSpacing: 8, children: [
            for (final s in statuses) SizedBox(width: tileWidth, child: Material(color: Colors.white, borderRadius: BorderRadius.circular(12),
              child: InkWell(onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => CompanyOrderListScreen(company: company, status: s))),
                borderRadius: BorderRadius.circular(12), child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 12), decoration: BoxDecoration(
                  border: Border.all(color: VColors.line), borderRadius: BorderRadius.circular(12)),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [Container(width: 7, height: 7, decoration: BoxDecoration(shape: BoxShape.circle, color: s.color)),
                    const SizedBox(width: 7), Expanded(child: Text(s.label, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11.5, color: VColors.ink))),
                    Text('${companyOrders.where((o) => o.status == s).length}', style: TextStyle(fontWeight: FontWeight.w900, color: s.color, fontSize: 16))]),
                  if (store.canSeeAmounts) ...[
                    const SizedBox(height: 6), Text(jod(companyOrders.where((o) => o.status == s).fold(0.0, (double n, OrderRecord o) => n + o.amount)),
                      style: const TextStyle(fontSize: 11.5, color: VColors.muted)),
                  ],
                ]),
              )))),
          ]);
        })),
      if (store.can(AppPermission.manageCompanies)) Padding(padding: const EdgeInsets.fromLTRB(14, 2, 14, 13), child: OutlinedButton.icon(
        onPressed: () => showDialog<void>(context: context, builder: (d) => AlertDialog(
          title: const Text('اختبار الاتصال'), content: const Text('لا يمكن اختبار API حقيقي في نسخة الواجهات. التحقق الفعلي سيكون عبر خادم آمن بعد ربط الشركة.'),
          actions: [TextButton(onPressed: () => Navigator.pop(d), child: const Text('مفهوم'))])),
        icon: const Icon(Icons.network_check_rounded), label: const Text('فحص الربط (معاينة فقط)'))),
    ]));
  }
}

/// A company-specific list; totals and navigation must not mix companies.
class CompanyOrderListScreen extends StatelessWidget {
  const CompanyOrderListScreen({super.key, required this.company, required this.status});
  final DeliveryCompany company;
  final OrderStatus status;
  @override Widget build(BuildContext context) {
    final orders = StoreScope.of(context).visibleOrders.where((o) => o.companyId == company.id && o.status == status).toList();
    return Scaffold(appBar: AppBar(title: Text(company.name)), body: SingleChildScrollView(child: VScreen(child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        VPageTitle(title: status.label, subtitle: '${orders.length} طلب لدى ${company.name}'),
        if (orders.isEmpty) const VPanel(child: VEmpty(title: 'لا توجد طلبات لهذه الحالة')),
        ...orders.map((o) => Padding(padding: const EdgeInsets.only(bottom: 11), child: OrderTile(order: o))),
      ]))));
  }
}

class DeliveryCompanyForm extends StatefulWidget {
  const DeliveryCompanyForm({super.key,this.company});
  final DeliveryCompany? company;
  @override State<DeliveryCompanyForm> createState()=>_DeliveryCompanyFormState();
}
class _DeliveryCompanyFormState extends State<DeliveryCompanyForm> {
  final form=GlobalKey<FormState>();
  late final name=TextEditingController(text:widget.company?.name??'');
  late final url=TextEditingController(text:widget.company?.apiUrl??'');
  late bool enabled=widget.company?.enabled??true;
  late final Map<String,OrderStatus> mapping=Map.of(widget.company?.mappings??{});
  final keyController=TextEditingController();
  final rawStatusController=TextEditingController();
  OrderStatus chosen=OrderStatus.delivered;
  @override void dispose(){name.dispose();url.dispose();keyController.dispose();rawStatusController.dispose();super.dispose();}
  @override Widget build(BuildContext context){
    final store=StoreScope.of(context);
    if (!store.can(AppPermission.manageCompanies)) {
      return const Scaffold(body: Center(child: Text('غير مصرح بإدارة الشركات')));
    }
    return Scaffold(appBar:AppBar(title:Text(widget.company==null?'إضافة شركة':'إعدادات الشركة')),
      body:SingleChildScrollView(child:VScreen(maxWidth: 880, child:Form(key:form,child:Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
        const VDemoBanner(),const VSection(title:'التعريف والاتصال'),
        VCard(child:Column(children:[
          VField(label:'اسم شركة التوصيل',controller:name,requiredField:true),const SizedBox(height:13),
          VField(label:'رابط API (بدون كلمات مرور)',controller:url,requiredField:true,keyboardType:TextInputType.url),
          const SizedBox(height:10),SwitchListTile(contentPadding:EdgeInsets.zero,title:const Text('الشركة مفعّلة'),value:enabled,onChanged:(v)=>setState(()=>enabled=v)),
        ])),const VSection(title:'بيانات الاتصال السرية'),
        VCard(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          const Text('API Key / Bearer Token',style:TextStyle(fontWeight:FontWeight.bold)),const SizedBox(height:8),
          TextField(controller:keyController,obscureText:true,decoration:const InputDecoration(hintText:'حقل مرئي لتصميم الواجهة فقط',prefixIcon:Icon(Icons.key_outlined))),
          const SizedBox(height:9),const Text('حماية مهمة: هذا الحقل لا يخزّن ولا يرسل أي رمز في النسخة التجريبية. التطبيق النهائي يحتاج Cloud Functions + Secret Manager. لا تُدخل مفاتيح حقيقية الآن.',style:TextStyle(fontSize:12,color:VColors.danger)),
          const SizedBox(height:8),OutlinedButton.icon(onPressed:()=>vToast(context,'لا يوجد اتصال حقيقي في نسخة التصميم'),icon:const Icon(Icons.wifi_tethering),label:const Text('تجربة الاتصال (لاحقاً)')),
        ])),const VSection(title:'خريطة حالات الشحن (Status Mapping)'),
        VCard(child:Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
          const Text('كل شركة قد تُرجع أسماء حالات مختلفة. اربط حالة الشركة بالحالة الداخلية الصحيحة.',style:TextStyle(fontSize:12,color:VColors.muted)),
          const SizedBox(height:12),...mapping.entries.map((e)=>ListTile(contentPadding:EdgeInsets.zero,dense:true,title:Text(e.key,textDirection:TextDirection.ltr),subtitle:Text(e.value.label),trailing:IconButton(icon:const Icon(Icons.close,color:VColors.danger),onPressed:()=>setState(()=>mapping.remove(e.key))))),
          VField(label:'حالة الشركة الخام (مثال: delivered)',controller:rawStatusController),const SizedBox(height:8),
          DropdownButtonFormField<OrderStatus>(initialValue:chosen,decoration:const InputDecoration(labelText:'الحالة الداخلية'),
            items:OrderStatus.values.map((s)=>DropdownMenuItem(value:s,child:Text(s.label))).toList(),onChanged:(v)=>setState(()=>chosen=v??chosen)),
          const SizedBox(height:8),OutlinedButton.icon(onPressed:(){if(rawStatusController.text.trim().isEmpty)return;setState(()=>mapping[rawStatusController.text.trim()]=chosen);rawStatusController.clear();},icon:const Icon(Icons.add),label:const Text('إضافة ربط حالة')),
        ])),const SizedBox(height:16),FilledButton.icon(onPressed:(){
          if(!form.currentState!.validate())return;
          final u=Uri.tryParse(url.text.trim());if(u==null||u.scheme!='https'||u.host.isEmpty){vToast(context,'استخدم رابط API آمن يبدأ بـ https://');return;}
          final saved = widget.company == null
            ? store.addCompany(DeliveryCompany(id:'c${DateTime.now().microsecondsSinceEpoch}',name:name.text.trim(),apiUrl:url.text.trim(),enabled:enabled,mappings:Map.of(mapping)))
            : store.updateCompany(widget.company!,name:name.text.trim(),apiUrl:url.text.trim(),enabled:enabled,mappings:Map.of(mapping));
          keyController.clear();
          if (!saved) {vToast(context,'تعذر الحفظ؛ تحقق من الصلاحيات وبيانات الشركة');return;}
          vToast(context,'تم حفظ الإعدادات التجريبية دون حفظ أي مفتاح API');Navigator.pop(context);
        },icon:const Icon(Icons.save_outlined),label:const Text('حفظ إعدادات الشركة')),
        const SizedBox(height:10),const Text('لإلغاء شركة استخدم التعطيل؛ لا نحذف علاقاتها بطلبات سابقة.',textAlign:TextAlign.center,style:TextStyle(color:VColors.muted,fontSize:11)),
        const SizedBox(height:24),
      ])))));
  }
}

class SyncCenterScreen extends StatelessWidget {
  const SyncCenterScreen({super.key});
  @override Widget build(BuildContext context){
    final store=StoreScope.of(context);
    if (!store.can(AppPermission.viewSync)) {
      return const Scaffold(body: Center(child: Text('غير مصرح بمشاهدة المزامنة')));
    }
    return Scaffold(appBar:AppBar(title:const Text('مركز المزامنة')),
      body:SingleChildScrollView(child:VScreen(child:Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
        const VPageTitle(title:'مزامنة حالات الشحن',subtitle:'التحديثات العكسية من API شركة التوصيل'),
        const VDemoBanner(),const SizedBox(height:16),
        VCard(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          const Icon(Icons.sync_problem_outlined,size:35,color:VColors.warning),const SizedBox(height:8),
          const Text('الربط الحقيقي لم يُفعّل بعد',style:TextStyle(fontWeight:FontWeight.w900,fontSize:18)),const SizedBox(height:7),
          const Text('ستُعرض هنا آخر Webhooks، نتائج الاستعلام الدوري، حالات الخطأ، وعدد محاولات إعادة الإرسال بعد تنفيذ Cloud Functions.',style:TextStyle(color:VColors.muted,fontSize:12)),
          const SizedBox(height:12),OutlinedButton.icon(onPressed:()=>vToast(context,'لا توجد مهمة مزامنة مثبتة حالياً'),icon:const Icon(Icons.refresh),label:const Text('التحقق من التحديثات (لاحقاً)')),
        ])),const VSection(title:'الشركات المسجلة'),
        ...store.companies.map((c)=>Padding(padding:const EdgeInsets.only(bottom:9),child:VCard(child:ListTile(contentPadding:EdgeInsets.zero,leading:const Icon(Icons.local_shipping_outlined,color:VColors.brand),title:Text(c.name),subtitle:Text('حالة الاتصال: ${c.connectionLabel}'),trailing:const Icon(Icons.shield_outlined))))),
        const VSection(title:'نمط تدفق الأحداث في النسخة النهائية'),
        const VCard(child:Column(children:[
          ListTile(leading:Icon(Icons.cloud_download_outlined),title:Text('استقبال Webhook أو Polling'),subtitle:Text('مع التحقق من التوقيع والهوية')),
          Divider(),ListTile(leading:Icon(Icons.transform_outlined),title:Text('ترجمة حالة شركة التوصيل'),subtitle:Text('Status Mapping خاص بكل شركة')),
          Divider(),ListTile(leading:Icon(Icons.verified_user_outlined),title:Text('تحديث الحالة بسجل تدقيق'),subtitle:Text('منع التكرار والانتقالات غير المسموحة')),
        ])),
      ]))));
  }
}
