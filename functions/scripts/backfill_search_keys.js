'use strict';
// DRY RUN by default. Run only after backup and emulator testing.
// Explicit --apply writes missing search fields, never changes order ownership/status.
const admin=require('firebase-admin');
admin.initializeApp();
const db=admin.firestore();
const apply=process.argv.includes('--apply');
const normalize=(v)=>String(v||'').normalize('NFKC').toLocaleLowerCase('ar').trim()
  .replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/\s+/g,' ');
async function main(){
  let cursor=null,seen=0,changed=0;
  while(true){
    let query=db.collection('orders').orderBy(admin.firestore.FieldPath.documentId()).limit(200);
    if(cursor)query=query.startAfter(cursor);
    const snap=await query.get();if(snap.empty)break;
    const batch=db.batch();let writes=0;
    for(const doc of snap.docs){
      const data=doc.data();const phoneDigits=String(data.phone||'').replace(/\D/g,'');
      const customerKey=normalize(data.customer);
      if(data.phoneDigits===phoneDigits && data.customerKey===customerKey)continue;
      changed++;if(apply){batch.update(doc.ref,{phoneDigits,customerKey});writes++;}
    }
    if(apply&&writes)await batch.commit();
    seen+=snap.size;cursor=snap.docs.at(-1);if(snap.size<200)break;
  }
  console.log(JSON.stringify({apply,seen,changed,summary:apply?'updated':'dry run; no writes'},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
