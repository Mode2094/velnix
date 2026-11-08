'use strict';
// Backfill the durable `deliveryAccepted` boolean for LEGACY orders that predate
// it, so the queues and counters agree for historical records.
//
// SAFETY MODEL
//  - DRY RUN by default: scans the WHOLE collection with a resumable cursor and
//    reports exact counts, writing nothing.
//  - --apply writes ONLY where the field is still MISSING, using a per-document
//    transaction that RE-READS the document and refuses to touch it if a
//    deliveryAccepted boolean already exists. A concurrent dispatch that sets a
//    newer acceptance state can therefore never be overwritten by the backfill.
//  - It NEVER changes status, internalStatus, companyId, hasDelivery,
//    dispatchState, shipment references, amounts, timestamps or any other field,
//    and never recreates orders.
//
// CLASSIFICATION (identical to legacyDeliveryAccepted in src/query.js)
//  - accepted (true): dispatchState 'sent', or a genuine carrier marker:
//    shippingStatusSource 'click_api', a providerOrderId policy id, or a carrier
//    trackingNumber.
//  - not accepted (false): every other order (sending/needs_review/idle/absent).
//  - A bare clickOrderRef is NEVER acceptance: it is persisted before the vendor
//    call and may accompany an unconfirmed attempt.
//
// USAGE
//   node scripts/backfill_delivery_accepted.js                 # full dry-run
//   node scripts/backfill_delivery_accepted.js --start-after=<id>   # resume scan
//   node scripts/backfill_delivery_accepted.js --apply         # write (approved)
//   node scripts/backfill_delivery_accepted.js --apply --start-after=<id>
const {initializeApp}=require('firebase-admin/app');
const {getFirestore,FieldPath}=require('firebase-admin/firestore');
const {legacyDeliveryAccepted}=require('../src/query');
initializeApp();
const db=getFirestore();
const apply=process.argv.includes('--apply');
const arg=(name,fallback=null)=>{const i=process.argv.indexOf('--'+name);return i>=0&&process.argv[i+1]?process.argv[i+1]:fallback;};
const batchSize=Math.max(1,Math.min(500,Number(arg('batch','200'))));
async function main(){
  let cursorId=arg('start-after'),scanned=0,missing=0,wouldAccept=0,applied=0,skippedRace=0,failed=0;
  const review=[]; // ids needing manual review (a bare clickOrderRef with no proof)
  for(;;){
    let query=db.collection('orders').orderBy(FieldPath.documentId()).limit(batchSize);
    if(cursorId)query=query.startAfter(cursorId);
    const snap=await query.get();
    if(snap.empty)break;
    for(const doc of snap.docs){
      scanned++;cursorId=doc.id;
      const data=doc.data();
      if(typeof data.deliveryAccepted==='boolean')continue; // already migrated
      missing++;
      const wanted=legacyDeliveryAccepted(data)===true;
      if(wanted)wouldAccept++;
      // A record that carries only a bare clickOrderRef (no proven acceptance) is
      // flagged for manual review, but still classified as not-accepted.
      const bareRef=!wanted&&typeof data.clickOrderRef==='string'&&data.clickOrderRef.length>0;
      if(bareRef&&review.length<1000)review.push(doc.id);
      if(!apply)continue;
      try{
        const result=await db.runTransaction(async tx=>{
          const fresh=await tx.get(doc.ref);
          if(!fresh.exists)return 'gone';
          const cur=fresh.data();
          // Never overwrite a newer acceptance state written after our scan read.
          if(typeof cur.deliveryAccepted==='boolean')return 'race';
          tx.set(doc.ref,{deliveryAccepted:legacyDeliveryAccepted(cur)===true},{merge:true});
          return 'applied';
        });
        if(result==='applied')applied++;else if(result==='race')skippedRace++;
      }catch(e){failed++;console.error('failed',doc.id,e&&e.message);}
    }
    if(snap.size<batchSize)break;
  }
  console.log(JSON.stringify({mode:apply?'apply':'dry-run',scanned,missingDeliveryAccepted:missing,
    wouldAccept,wouldReject:missing-wouldAccept,applied,skippedRace,failed,
    needsManualReview:review.length,reviewSample:review.slice(0,25),nextStartAfter:cursorId},null,2));
}
main().catch(e=>{console.error(e);process.exit(1);});
