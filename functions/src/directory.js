'use strict';
const {FieldPath}=require('firebase-admin/firestore');
const {documentId}=require('./policy');
async function directoryPage(collection,query,data={}){
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error('invalid_search');
  const size=data.pageSize??30;
  if(!Number.isSafeInteger(size)||size<1||size>100)throw Error('invalid_page_size');
  if(data.query!=null&&(typeof data.query!=='string'||data.query.trim().length>80))throw Error('invalid_search');
  const term=(data.query||'').trim();
  if(term)query=query.where('name','>=',term).where('name','<',term+'\uf8ff');
  query=query.orderBy('name').orderBy(FieldPath.documentId());
  if(data.afterId){const id=documentId(data.afterId);const cursor=await collection.doc(id).get();if(!cursor.exists)throw Error('invalid_cursor');query=query.startAfter(cursor);}
  const result=await query.limit(size+1).get();
  const docs=result.docs.slice(0,size);
  return {docs,more:result.size>size,afterId:docs.at(-1)?.id||null};
}
module.exports={directoryPage};
