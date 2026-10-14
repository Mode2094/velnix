'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createPortal,assertInventory}=require('../scripts/owner_google_setup');
const candidate='owner@example.test',uid='verified_uid';
const snapshot=()=>({authentication:{status:'read',totalUsers:1,candidate:{uidFromAuthRecordOnly:uid,googleProviderLinked:true}},firestore:{members:{count:0},joinRequests:{count:0},generalManagersIncludingInactive:0,bootstrapState:{exists:false}}});
test('owner preparation rejects unreadable inventory, old memberships, locks and a different UID',()=>{
 assert.doesNotThrow(()=>assertInventory(snapshot(),uid));
 for(const change of [s=>s.authentication.status='unverified',s=>s.authentication.totalUsers=2,s=>s.firestore.members.count=1,s=>s.firestore.joinRequests.count=1,s=>s.firestore.bootstrapState.exists=true,s=>s.firestore.generalManagersIncludingInactive=1]){const s=snapshot();change(s);assert.throws(()=>assertInventory(s,uid));}
 assert.throws(()=>assertInventory(snapshot(),'other_uid'));
});
async function setup(t,{domains=['8080-owner.cloudshell.dev'],tokenChange={},dryRunFails=false}={}){
 let dryRuns=0,verified=0;const now=Date.UTC(2026,9,14,19);
 const token={uid,email:candidate,email_verified:true,auth_time:now/1000,firebase:{sign_in_provider:'google.com'},...tokenChange};
 const server=createPortal({candidateEmail:candidate,publicConfig:{projectId:'velnix-6c1a2'},authorizedDomains:domains,now:()=>now,auth:{verifyIdToken:async(value,revoked)=>{verified++;assert.equal(revoked,true);assert.equal(value,'signed-fixture');return token;},getUser:async()=>({email:candidate,emailVerified:true,disabled:false,providerData:[{providerId:'google.com',email:candidate}]})},checkInventory:async()=>snapshot(),runDryRun:async actual=>{dryRuns++;assert.equal(actual,uid);if(dryRunFails)throw Error('refused');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
 const address='http://127.0.0.1:'+server.address().port,origin='https://8080-owner.cloudshell.dev';
 const page=await fetch(address,{headers:{'x-forwarded-host':'8080-owner.cloudshell.dev'}});
 const cookie=page.headers.get('set-cookie')?.split(';')[0],csrf=cookie?.split('=')[1];
 const headers={'x-forwarded-host':'8080-owner.cloudshell.dev',origin,cookie,'x-owner-csrf':csrf,'content-type':'application/json'};
 return {page,send:(overrides={},body={idToken:'signed-fixture'})=>fetch(address+'/verify',{method:'POST',headers:{...headers,...overrides},body:JSON.stringify(body)}),dryRuns:()=>dryRuns,verified:()=>verified};
}
test('an unauthorized preview domain stops before Google login or domain modifications',async t=>{
 const p=await setup(t,{domains:[]});assert.equal(p.page.status,409);assert.match(await p.page.text(),/Authorized domains/);assert.equal(p.verified(),0);assert.equal(p.dryRuns(),0);
});
test('cross-origin requests, missing cookie, malformed payload and claimed UID cannot run bootstrap',async t=>{
 const p=await setup(t);assert.equal(p.page.status,200);assert.match(p.page.headers.get('set-cookie'),/HttpOnly/);
 for(const [headers,body]of [[{origin:'https://evil.example'},undefined],[{cookie:''},undefined],[{'x-owner-csrf':'wrong'},undefined],[{}, {idToken:'signed-fixture',uid:'forged'}]]){
  const response=await p.send(headers,body);assert.ok(response.status>=400);
 }
 assert.equal(p.dryRuns(),0);assert.equal(p.verified(),0);
});
for(const [label,change]of [['wrong account',{email:'other@example.test'}],['non-Google session',{firebase:{sign_in_provider:'password'}}],['old session',{auth_time:1}]])test(label+' is refused before dry-run',async t=>{
 const p=await setup(t,{tokenChange:change});assert.equal((await p.send()).status,403);assert.equal(p.dryRuns(),0);
});
test('a verified matching session runs one dry-run, returns UID without tokens and never applies membership',async t=>{
 const p=await setup(t);const response=await p.send();assert.equal(response.status,200);
 const result=await response.json();assert.equal(result.uid,uid);assert.equal(result.googleSessionVerified,true);assert.equal(result.bootstrapDryRun,'passed');assert.equal(result.membershipCreated,false);assert.equal(result.deployed,false);assert.equal(JSON.stringify(result).includes('signed-fixture'),false);
 assert.equal((await p.send()).status,200);assert.equal(p.dryRuns(),1);
});
test('a refused dry-run remains a failure rather than a ready administrator',async t=>{
 const p=await setup(t,{dryRunFails:true});const response=await p.send();assert.equal(response.status,403);assert.equal((await response.json()).membershipCreated,false);
});
