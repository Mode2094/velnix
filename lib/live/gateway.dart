import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';

/// All privileged reads and writes go through authenticated callable functions.
/// Firestore client rules reject orders/companies/audit access by design.
class VelnixGateway {
  VelnixGateway._();
  static final instance=VelnixGateway._();
  final FirebaseFunctions functions=FirebaseFunctions.instanceFor(region:'europe-west1');
  final FirebaseAuth auth=FirebaseAuth.instance;

  Future<Map<String,dynamic>> call(String name,[Map<String,dynamic> data=const {}]) async {
    try {
      final result=await functions.httpsCallable(name).call(data);
      return Map<String,dynamic>.from(result.data as Map);
    } on FirebaseFunctionsException catch(e) {
      throw VelnixException(e.message??'حدث خطأ أثناء الاتصال بالخادم');
    } on FirebaseAuthException catch(e) {
      throw VelnixException(e.message??'تعذر التحقق من الحساب');
    }
  }
  Future<Map<String,dynamic>> me()=>call('me');
  Future<Map<String,dynamic>> orders({String? afterId,int pageSize=30,String? status,String bucket='all',String? companyId})=>call('listOrders',{
    'pageSize':pageSize,'bucket':bucket,if(status!=null)'status':status,if(afterId!=null)'afterId':afterId,if(companyId!=null)'companyId':companyId,
  });
  Future<Map<String,dynamic>> searchOrders(String query,{String? status,String bucket='all',String? companyId})=>call('searchOrders',{
    'query':query,'bucket':bucket,if(status!=null)'status':status,if(companyId!=null)'companyId':companyId,
  });
  Future<Map<String,dynamic>> dashboard()=>call('dashboardStats');
  Future<Map<String,dynamic>> order(String id)=>call('getOrder',{'id':id});
  Future<Map<String,dynamic>> createOrder(Map<String,dynamic> order)=>call('createOrder',order);
  Future<void> updateOrder(String id,Map<String,dynamic> fields) async {await call('updateOrder',{'id':id,...fields});}
  Future<void> updateStatus(String id,String status) async {await call('changeOrderStatus',{'id':id,'status':status});}
  Future<void> assignCompany(String id,String? companyId) async {await call('assignCompany',{'id':id,'companyId':companyId});}
  Future<void> dispatch(String id) async {await call('sendOrderToDelivery',{'id':id});}
  Future<void> resolveDispatchException(String id,{required String outcome,required String reason,String? trackingNumber})async{
    await call('resolveDispatchException',{'id':id,'outcome':outcome,'reason':reason,if(trackingNumber!=null)'trackingNumber':trackingNumber});
  }
  Future<Map<String,dynamic>> companyStats(String id)=>call('companyStats',{'id':id});
  Future<List<Map<String,dynamic>>> companies() async =>listResult(await call('listCompanies'));
  Future<void> saveCompany(Map<String,dynamic> company) async {await call('saveCompany',company);}
  Future<void> archiveCompany(String id) async {await call('archiveCompany',{'id':id});}
  Future<void> restoreCompany(String id) async {await call('restoreCompany',{'id':id});}
  Future<Map<String,dynamic>> testCompany(String id)=>call('testCompanyConnection',{'id':id});
  Future<List<Map<String,dynamic>>> members() async =>listResult(await call('listMembers'));
  Future<void> saveMember(Map<String,dynamic> member) async {await call('saveMember',member);}
  Future<List<Map<String,dynamic>>> notices() async =>listResult(await call('listNotices'));
  Future<void> markNoticeRead(String id)async{await call('markNoticeRead',{'id':id});}
  Future<List<Map<String,dynamic>>> syncEvents()async=>listResult(await call('listSyncEvents'));
  Future<List<Map<String,dynamic>>> audit() async =>listResult(await call('listAudit'));

  List<Map<String,dynamic>> listResult(Map<String,dynamic> result)=>(result['items'] as List? ??[])
      .map((e)=>Map<String,dynamic>.from(e as Map)).toList();
}
class VelnixException implements Exception {
  VelnixException(this.message);
  final String message;
  @override String toString()=>message;
}

class SessionPolicy {
  SessionPolicy(this.data);
  final Map<String,dynamic> data;
  String get id=>data['id']?.toString()??'';
  String get name=>data['name']?.toString()??'';
  String get role=>data['role']?.toString()??'';
  bool get active=>data['active']!=false;
  bool can(String perm)=>active&&(role=='generalManager'||(data['permissions'] as List? ??[]).contains(perm));
  bool get canChangeStatus=>active&&(role=='generalManager'||role=='warehouse'||can('updateOrderStatus'));
  bool get viewAmounts=>can('viewAmounts');
  String get roleLabel=>{
    'generalManager':'مدير عام','manager':'مدير','warehouse':'موظف مستودع',
    'sales':'مبيعات','dataEntry':'مدخل بيانات',
  }[role]??'مستخدم';
}
