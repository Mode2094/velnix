'use strict';
// DRY RUN by default. Run only after backup and emulator testing.
// Explicit --apply writes the durable `deliveryAccepted` boolean for LEGACY
// orders that predate it, so the queues and counters agree for old records.
//
// It NEVER changes status, internalStatus, companyId, hasDelivery, dispatchState,
// shipment references, amounts or any other field, and never recreates orders.
// It sets deliveryAccepted to EXACTLY what `legacyDeliveryAccepted` computes:
//   accepted (true): dispatchState 'sent', or a genuine carrier marker
//     (shippingStatusSource 'click_api', a providerOrderId policy id, or a
//     carrier trackingNumber). A bare clickOrderRef is NOT acceptance.
//   not accepted (false): every other order (sending/needs_review/idle/absent).
//
// Resumable (--start-after cursor) and idempotent (only writes a changed value).
const {initializeApp,getApp}=require('firebase-admin/app');
const {getFirestore,FieldPath}=require('firebase-admin/firestore');
const {legacyDeliveryAccepted}=require('../src/query');
initializeApp();
const db=getFirestore();
const apply=process.argv.includes('--apply');
const arg=(name,fallback=null)=>{const i=process.argv.indexOf('--'+name);return i>=0&&process.argv[i+1]?process.argv[i+1]:fallback;};
const batchSize=Math.max(1,Math.min(500,Number(arg('batch','200'))));
async function main(){
  let cursorId=arg('start-after'),seen=0,changed=0,failed=0,accepted=0;
  for(;;){
    let query=db.collection('orders').orderBy(FieldPath.documentId()).limit(batchSize);
    if(cursorId)query=query.startAfter(cursorId);
    const snap=await query.get();
    if(snap.empty)break;
    let batch=db.batch(),pending=0;
    for(const doc of snap.docs){
      seen++;cursorId=doc.id;
      const data=doc.data();
      if(typeof data.deliveryAccepted==='boolean')continue; // already migrated
      const wanted=legacyDeliveryAccepted(data)===true;
      if(wanted)accepted++;
      changed++;
      if(apply){batch.set(doc.ref,{deliveryAccepted:wanted},{merge:true});if(++pending===400){await batch.commit();batch=db.batch();pending=0;}}
    }
    if(apply&&pending){await batch.commit();}
    if(!apply)break; // dry run scans one page for a bounded preview
    if(snap.size<batchSize)break;
  }
  console.log(JSON.stringify({mode:apply?'apply':'dry-run',scanned:seen,wouldAccept:accepted,changed,failed,nextStartAfter:cursorId},null,2));
}
main().catch(e=>{console.error(e);process.exit(1);});
