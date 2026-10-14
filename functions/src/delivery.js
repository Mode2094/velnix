'use strict';
const crypto=require('node:crypto');
const {KeyManagementServiceClient}=require('@google-cloud/kms');
let kms;
const kmsClient=()=>kms??=new KeyManagementServiceClient();
const KEY = process.env.VELNIX_KMS_KEY;
function allowedUrl(input) {
  let url;
  try {url=new URL(input);}catch(_){throw new Error('invalid_delivery_url');}
  const allowed=(process.env.ALLOWED_DELIVERY_HOSTS || '').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
  if(url.protocol!=='https:' || url.username || url.password || url.search || url.hash || url.port && url.port!=='443' || !allowed.includes(url.hostname.toLowerCase()) || url.pathname.includes('..')) throw new Error('delivery_host_not_allowed');
  return url.origin + url.pathname.replace(/\/$/,'');
}
async function encryptSecret(secret) {
  if(!KEY || !secret || secret.length>2000) throw new Error('kms_not_configured_or_bad_secret');
  const [resp]=await kmsClient().encrypt({name:KEY,plaintext:Buffer.from(secret,'utf8')},{timeout:10000});
  return Buffer.from(resp.ciphertext).toString('base64');
}
async function decryptSecret(ciphertext) {
  if(!KEY || !ciphertext) throw new Error('kms_not_configured');
  const [resp]=await kmsClient().decrypt({name:KEY,ciphertext:Buffer.from(ciphertext,'base64')},{timeout:10000});
  return Buffer.from(resp.plaintext).toString('utf8');
}
async function vendorRequest(company,token,method,route,body,transport=fetch) {
  if(!/^\/(?:health|orders(?:\/[A-Za-z0-9%_.-]+)?)$/.test(route)||!['GET','POST'].includes(method))throw Error('invalid_vendor_route');
  const base=allowedUrl(company.apiUrl);
  const target = base + route;
  const control=new AbortController();const timer=setTimeout(()=>control.abort(),12000);
  try {
    const response=await transport(target,{method,redirect:'error',signal:control.signal,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','Accept':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
    if(Number(response.headers.get('content-length'))>1024*1024)throw Error('vendor_response_too_large');
    const chunks=[];let length=0;
    for await(const chunk of response.body||[]){
      length+=chunk.length;
      if(length>1024*1024){control.abort();throw Error('vendor_response_too_large');}
      chunks.push(Buffer.from(chunk));
    }
    const text=Buffer.concat(chunks).toString('utf8');
    let json={};try{json=text?JSON.parse(text):{};}catch(_){throw new Error('vendor_invalid_json');}
    if(!response.ok) throw new Error(`vendor_http_${response.status}`);
    if(!json||typeof json!=='object'||Array.isArray(json))throw Error('vendor_invalid_payload');
    return json;
  } finally {clearTimeout(timer);}
}
function verifyWebhook(raw, ts, signature, secret) {
  if(!Buffer.isBuffer(raw)||raw.length>256*1024||typeof ts!=='string'||!/^\d{10}$/.test(ts)||typeof secret!=='string'||!secret)return false;
  const timestamp=Number(ts);
  if(!Number.isFinite(timestamp)||Math.abs(Date.now()/1000-timestamp)>300) return false;
  if(!/^sha256=[0-9a-f]{64}$/.test(signature || '')) return false;
  const wanted=crypto.createHmac('sha256',secret).update(`${ts}.`).update(raw).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(wanted,'hex'),Buffer.from(signature.slice(7),'hex'));
}
function remoteCanAdvance(current,target) {
  if(current===target) return true;
  if(['delivered','returned','cancelled'].includes(current)) return false;
  if(['delivered','returned','cancelled'].includes(target)) return ['dispatched','inTransit'].includes(current);
  return target==='inTransit' && current==='dispatched';
}
module.exports={allowedUrl,encryptSecret,decryptSecret,vendorRequest,verifyWebhook,remoteCanAdvance};
