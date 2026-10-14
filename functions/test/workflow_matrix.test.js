'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {ROLES,STATUSES,canSeeOrder,canEditOrder,allowedTransition}=require('../src/policy');
const base={createdBy:'creator',salesSupervisorId:'sales1',visibleTo:['creator','sales1']};
const users={
 generalManager:{id:'gm',role:'generalManager',active:true,permissions:[]},
 manager:{id:'manager',role:'manager',active:true,permissions:['viewAllOrders','editAllOrders','updateOrderStatus']},
 warehouse:{id:'warehouse',role:'warehouse',active:true,permissions:[]},
 sales:{id:'sales1',role:'sales',active:true,permissions:[]},
 dataEntry:{id:'creator',role:'dataEntry',active:true,permissions:[]},
};
test('five role permissions remain distinct across every state',()=>{
 assert.equal(ROLES.length,5);
 assert.equal(STATUSES.length,9);
 for(const status of STATUSES){
   const order={...base,status};
   for(const role of ROLES){
     assert.equal(canSeeOrder(users[role],order),true,`${role} should see assigned order ${status}`);
     if(['delivered','returned','cancelled'].includes(status))assert.equal(canEditOrder(users[role],order),false);
   }
   const unrelated={...order,createdBy:'someone',salesSupervisorId:'someone',visibleTo:[]};
   assert.equal(canSeeOrder(users.sales,unrelated),false);
   assert.equal(canSeeOrder(users.dataEntry,unrelated),false);
   assert.equal(canSeeOrder(users.generalManager,unrelated),true);
   assert.equal(canSeeOrder(users.warehouse,unrelated),true);
 }
});
test('only operational staff/admin can move orders, never forge remote final states',()=>{
 for(const role of ROLES){
   for(const state of STATUSES){
     const order={...base,status:state};
     for(const target of ['dispatched','inTransit','delivered','returned']){
       assert.equal(allowedTransition(users[role],order,target),false,`${role}: ${state} -> ${target}`);
     }
   }
 }
 assert.equal(allowedTransition(users.warehouse,{...base,status:'preparing'},'ready'),true);
 assert.equal(allowedTransition(users.dataEntry,{...base,status:'preparing'},'ready'),false);
});
test('inactive accounts cannot view or modify orders across all roles',()=>{
 for(const role of ROLES){
   const user={...users[role],active:false};
   assert.equal(canSeeOrder(user,{...base,status:'created'}),false);
   assert.equal(canEditOrder(user,{...base,status:'created'}),false);
   assert.equal(allowedTransition(user,{...base,status:'created'},'review'),false);
 }
});
