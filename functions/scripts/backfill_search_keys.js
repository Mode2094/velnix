'use strict';
// DRY RUN by default. Run only after backup and emulator testing.
// Explicit --apply writes missing search fields, never changes order ownership/status.
const {initializeApp,getApp}=require('firebase-admin/app');
const {getFirestore,FieldValue,FieldPath}=require('firebase-admin/firestore');
const {getAuth}=require('firebase-admin/auth');
initializeApp();
const db=getFirestore();
const apply=process.argv.includes('--apply');
const {normalizeCustomer:normalize,searchDigits}=require('../src/query');
async function main(){
  let cursor=null,seen=0,changed=0;
  while(true){
    let query=db.collection('orders').orderBy(FieldPath.documentId()).limit(200);
    if(cursor)query=query.startAfter(cursor);
    const snap=await query.get();if(snap.empty)break;
    const batch=db.batch();let writes=0;
    for(const doc of snap.docs){
      const data=doc.data();const phoneDigits=searchDigits(data.phone);
      const customerKey=normalize(data.customer);
      if(data.phoneDigits===phoneDigits && data.customerKey===customerKey)continue;
      changed++;if(apply){batch.update(doc.ref,{phoneDigits,customerKey});writes++;}
    }
    if(apply&&writes)await batch.commit();
    seen+=snap.size;cursor=snap.docs.at(-1);if(snap.size<200)break;
  }
  console.log(JSON.stringify({apply,seen,changed,summary:apply?'updated':'dry run; no writes'},null,2));
}
main().catch(e=>{console.error(e.code||'migration_failed');process.exitCode=1;});
