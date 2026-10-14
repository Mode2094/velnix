part of 'live_app.dart';

/// Server-side summary of the most recent 1,000 records in the current role scope.
/// Labels explicitly warn when dataset is larger until scalable counters are built.
class LiveDashboard extends StatefulWidget {
  const LiveDashboard({super.key,required this.policy,required this.onNavigate});
  final SessionPolicy policy;final void Function(String,String?) onNavigate;
  @override State<LiveDashboard>createState()=>_LiveDashboardState();
}
class _LiveDashboardState extends State<LiveDashboard>{
  late Future<Map<String,dynamic>> request;
  @override void initState(){super.initState();reload();}
  void reload()=>request=VelnixGateway.instance.dashboard();
  void refresh(){setState(reload);}
  @override Widget build(BuildContext context)=>AsyncPanel<Map<String,dynamic>>(future:request,onRetry:refresh,builder:(data){
    final counters=Map<String,dynamic>.from(data['counters'] as Map);
    final partial=data['partial']==true;
    return RefreshIndicator(onRefresh:()async{refresh();await request;},child:SingleChildScrollView(
      physics:const AlwaysScrollableScrollPhysics(),child:LiveContent(child:Column(
        crossAxisAlignment:CrossAxisAlignment.stretch,children:[
          Wrap(alignment:WrapAlignment.spaceBetween,crossAxisAlignment:WrapCrossAlignment.center,spacing:12,runSpacing:10,children:[
            Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
              Text('أهلاً، ${widget.policy.name}',style:Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height:5),Text('لوحة متابعة ${widget.policy.roleLabel}',style:const TextStyle(color:VColors.muted)),
            ]),OutlinedButton.icon(onPressed:refresh,icon:const Icon(Icons.refresh),label:const Text('تحديث البيانات')),
          ]),
          if(widget.policy.role=='warehouse')Padding(padding:const EdgeInsets.only(top:14),child:VLivePanel(
            child:Row(children:[const Icon(Icons.inventory_2_outlined,color:VColors.brand),const SizedBox(width:10),
              const Expanded(child:Text('عمل المستودع: راجع الطلبات قيد التجهيز وحدّث حالتها. لا يوجد نظام مخزون ضمن هذه المرحلة.')),
              TextButton(onPressed:()=>widget.onNavigate('all','preparing'),child:const Text('فتح'))]))),
          if(widget.policy.role=='dataEntry'||widget.policy.role=='sales')Padding(padding:const EdgeInsets.only(top:14),child:VLivePanel(
            child:Row(children:[const Icon(Icons.assignment_outlined,color:VColors.brand),const SizedBox(width:10),
              Expanded(child:Text(widget.policy.role=='dataEntry'?'تظهر لك طلباتك التي أدخلتها فقط.':'يمكنك متابعة طلباتك وطلبات فريق إدخال البيانات المرتبط بك.')),
              TextButton(onPressed:()=>widget.onNavigate('all',null),child:const Text('متابعة'))]))),
          if(partial)const Padding(padding:EdgeInsets.only(top:12),child:VLivePanel(child:Text(
            'الأرقام المعروضة تغطي أحدث 1000 طلب فقط. تفعيل العدّادات الدائمة مطلوب قبل الاستخدام واسع النطاق.',style:TextStyle(color:VColors.danger)))),
          const SizedBox(height:22),_scopeSection(context,'كل الطلبات','all',counters['all']),
          const SizedBox(height:20),_scopeSection(context,'طلبات شركات التوصيل','delivery',counters['delivery']),
          const SizedBox(height:20),_scopeSection(context,'الطلبات غير المسندة لشركة','internal',counters['internal']),
          const SizedBox(height:20),VLivePanel(child:Row(children:[
            const Icon(Icons.security_outlined,color:VColors.brand),const SizedBox(width:10),
            Expanded(child:Text('تُطبّق صلاحيات ${widget.policy.roleLabel} من Firebase على البيانات والإجراءات.')),
          ])),
        ])),
    ));
  });
  Widget _scopeSection(BuildContext context,String title,String scope,dynamic source){
    final map=Map<String,dynamic>.from(source as Map);
    final count=map.values.fold<int>(0,(n,item)=>n+(Map<String,dynamic>.from(item as Map)['count'] as int? ?? 0));
    final sum=map.values.fold<int>(0,(n,item)=>n+(Map<String,dynamic>.from(item as Map)['amountMinor'] as int? ?? 0));
    return VLivePanel(child:Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
      Wrap(crossAxisAlignment:WrapCrossAlignment.center,alignment:WrapAlignment.spaceBetween,runSpacing:8,children:[
        Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          Text(title,style:const TextStyle(fontSize:19,fontWeight:FontWeight.w900)),
          const SizedBox(height:4),Text('$count طلب${widget.policy.viewAmounts?' • ${displayAmount(sum/1000)}':''}',style:const TextStyle(color:VColors.muted,fontSize:13)),
        ]),TextButton.icon(onPressed:()=>widget.onNavigate(scope,null),icon:const Icon(Icons.arrow_back),label:const Text('عرض الطلبات')),
      ]),const SizedBox(height:12),LayoutBuilder(builder:(context,box){
        final cols=box.maxWidth>=960?5:box.maxWidth>=590?3:2;
        final width=(box.maxWidth-((cols-1)*10))/cols;
        return Wrap(spacing:10,runSpacing:10,children:[
          for(final status in statusLabels.keys)SizedBox(width:width,child:_tile(status,
            Map<String,dynamic>.from(map[status] as Map),scope)),
        ]);
      }),
    ]));
  }
  Widget _tile(String status,Map<String,dynamic> info,String bucket){
    final color=statusColors[status]??VColors.brand;
    return Semantics(button:true,label:'${statusLabels[status]}, ${info['count']} طلب',child:Material(
      color:color.withValues(alpha:.065),borderRadius:BorderRadius.circular(15),child:InkWell(
        borderRadius:BorderRadius.circular(15),onTap:()=>widget.onNavigate(bucket,status),
        child:Container(constraints:const BoxConstraints(minHeight:119),padding:const EdgeInsets.all(13),
          decoration:BoxDecoration(borderRadius:BorderRadius.circular(15),border:Border.all(color:color.withValues(alpha:.16))),
          child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
            Row(children:[Container(width:8,height:8,decoration:BoxDecoration(color:color,shape:BoxShape.circle)),
              const SizedBox(width:6),Expanded(child:Text(statusLabels[status]!,maxLines:2,overflow:TextOverflow.ellipsis,
                style:const TextStyle(fontWeight:FontWeight.w700,fontSize:12)))]),
            const Spacer(),Text('${info['count']??0}',style:TextStyle(fontSize:27,fontWeight:FontWeight.w900,color:color)),
            if(widget.policy.viewAmounts)Text(displayAmount((info['amountMinor'] as num? ??0)/1000),
              maxLines:1,overflow:TextOverflow.ellipsis,style:const TextStyle(fontSize:11,color:VColors.muted)),
          ]))),
      ));
  }
}
