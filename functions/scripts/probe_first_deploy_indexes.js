'use strict';
// Owner-run READ-ONLY request comparison. No fallback mutates operational readiness.
const {createGcloudSession,PROJECT}=require('./gcloud_session');
const {indexKey}=require('./operational_readiness');
const expected=require('../../config/firestore.first-acceptance.indexes.json').indexes;
const root=`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/collectionGroups/`;
async function probe({get}){
 const results=[],snapshots={};
 for(const group of ['-','orders','notices','members']){
  const label=group==='-'?'wildcard_without_pageSize':group;
  try{
   const indexes=[],seen=new Set();let token;
   do{
    const u=new URL(root+group+'/indexes');
    if(group!=='-')u.searchParams.set('pageSize','100');
    if(token)u.searchParams.set('pageToken',token);
    const page=await get(u.href);
    if(!page||typeof page!=='object'||Array.isArray(page)||Object.keys(page).some(k=>!['indexes','nextPageToken'].includes(k))||(page.indexes!==undefined&&!Array.isArray(page.indexes))||(page.nextPageToken!==undefined&&typeof page.nextPageToken!=='string')||(page.nextPageToken&&seen.has(page.nextPageToken)))throw Error('invalid_index_page');
    for(const i of page.indexes||[]){
     if(typeof i.name!=='string'||!i.name.startsWith(root.replace('https://firestore.googleapis.com/v1/',''))||!/^([^/]+)\/indexes\/[^/]+$/.test(i.name.split('/collectionGroups/')[1]||'')||(group!=='-'&&!i.name.includes('/collectionGroups/'+group+'/indexes/'))||!Array.isArray(i.fields))throw Error('invalid_index_resource');
     indexes.push(i);
    }
    token=page.nextPageToken;if(token)seen.add(token);if(seen.size>30)throw Error('index_page_limit');
   }while(token);
   snapshots[group]=indexes;
   results.push({request:label,status:'read',complete:true,count:indexes.length,ready:indexes.filter(i=>i.state==='READY').length});
  }catch(e){results.push({request:label,status:'unverified',complete:false,httpStatus:Number.isInteger(e.status)?e.status:null,...(e.diagnostic?{diagnostic:e.diagnostic}:{})});}
 }
 const full=!!snapshots['-'],covered=full||['orders','notices'].every(g=>snapshots[g]);
 const indexes=full?snapshots['-']:['orders','notices'].flatMap(g=>snapshots[g]||[]);
 const ready=new Set(indexes.filter(i=>i.state==='READY').map(i=>indexKey({...i,collectionGroup:i.name.split('/collectionGroups/')[1].split('/')[0]})));
 return {projectId:PROJECT,readOnly:true,resourcesChanged:false,requests:results,fullProjectInventoryVerified:full,coverage:full?'all_collection_groups':covered?'orders_and_notices_only':'unverified',firstAcceptanceIndexesReady:covered?expected.every(i=>ready.has(indexKey(i))):null,expectedFirstAcceptanceIndexes:expected.length,diagnosis:'Compare these authorized request outcomes. A successful alternative does not prove the original 400 cause; no cloud configuration was changed.'};
}
if(require.main===module){try{const {get}=createGcloudSession({expectedAccount:'moderohe8@gmail.com'});probe({get}).then(r=>console.log(JSON.stringify(r,null,2))).catch(()=>{console.error('Read-only probe failed; no raw response or credential printed.');process.exitCode=1;});}catch(_){console.error('An authorized human gcloud session is required. No ADC or service-account key requested.');process.exitCode=1;}}
module.exports={probe};
