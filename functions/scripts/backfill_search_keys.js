'use strict';
// DRY RUN by default. Run only after backup and emulator testing.
// Explicit --apply writes missing derived search fields (phoneDigits,
// customerKey, searchText, searchTokens). It NEVER changes order ownership,
// status, orderNumber or barcodeValue, and never recreates orders.
//
// Resumable: processes orders in document-id order with an optional
// --start-after cursor so a run can be resumed. Idempotent: only writes when a
// derived field is missing or changed.
const {initializeApp,getApp}=require('firebase-admin/app');
const {getFirestore,FieldPath}=require('firebase-admin/firestore');
const {normalizeCustomer:normalize,searchDigits}=require('../src/query');
const {buildSearchFields}=require('../src/search');
initializeApp();
const db=getFirestore();
const apply=process.argv.includes('--apply');
const arg=(name,fallback=null)=>{const i=process.argv.indexOf('--'+name);return i>=0&&process.argv[i+1]?process.argv[i+1]:fallback;};
const batchSize=Math.max(1,Math.min(500,Number(arg('batch','200'))));
async function main(){
  let cursorId=arg('start-after'),seen=0,changed=0,failed=0;
  while(true){
    let query=db.collection('orders').orderBy(FieldPath.documentId()).limit(batchSize);
    if(cursorId)query=query.startAfter(db.doc('orders/'+cursorId));
    const snap=await query.get();if(snap.empty)break;
    const batch=db.batch();let writes=0;
    for(const doc of snap.docs){
      cursorId=doc.id;seen++;
      const data=doc.data();
      const phoneDigits=searchDigits(data.phone);
      const customerKey=normalize(data.customer);
      const derived=buildSearchFields(data);
      const patch={};
      if(data.phoneDigits!==phoneDigits)patch.phoneDigits=phoneDigits;
      if(data.customerKey!==customerKey)patch.customerKey=customerKey;
      if(JSON.stringify(data.searchText||null)!==JSON.stringify(derived.searchText))patch.searchText=derived.searchText;
      if(JSON.stringify(data.searchTokens||null)!==JSON.stringify(derived.searchTokens))patch.searchTokens=derived.searchTokens;
      if(Object.keys(patch).length===0)continue;
      changed++;
      if(apply){batch.update(doc.ref,patch);writes++;}
    }
    if(apply&&writes)await batch.commit();
    console.log(JSON.stringify({apply,seen,changed,failed,cursor:cursorId}));
    if(snap.size<batchSize)break;
  }
  console.log(JSON.stringify({done:true,apply,seen,changed,failed,summary:apply?'updated':'dry run; no writes'},null,2));
}
if(require.main===module)main().catch(e=>{console.error(e.code||'migration_failed');process.exitCode=1;});
module.exports={main};
