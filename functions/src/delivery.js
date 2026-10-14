'use strict';
const crypto=require('node:crypto');
const {KeyManagementServiceClient}=require('@google-cloud/kms');
const kms=new KeyManagementServiceClient();
const KEY = process.env.VELNIX_KMS_KEY;
function allowedUrl(input) {
  let url;
  try {url=new URL(input);}catch(_){throw new Error('invalid_delivery_url');}
  const allowed=(process.env.ALLOWED_DELIVERY_HOSTS || '').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
  if(url.protocol!=='https:' || url.username || url.password || url.port && url.port!=='443' || !allowed.includes(url.hostname.toLowerCase()) || url.pathname.includes('..')) throw new Error('delivery_host_not_allowed');
  return url.origin + url.pathname.replace(/\/$/,'');
}
async function encryptSecret(secret) {
  if(!KEY || !secret || secret.length>2000) throw new Error('kms_not_configured_or_bad_secret');
  const [resp]=await kms.encrypt({name:KEY,plaintext:Buffer.from(secret,'utf8')});
  return Buffer.from(resp.ciphertext).toString('base64');
}
async function decryptSecret(ciphertext) {
  if(!KEY || !ciphertext) throw new Error('kms_not_configured');
  const [resp]=await kms.decrypt({name:KEY,ciphertext:Buffer.from(ciphertext,'base64')});
  return Buffer.from(resp.plaintext).toString('utf8');
}
async function vendorRequest(company,token,method,route,body) {
  const base=allowedUrl(company.apiUrl);
  const target = base + route;
  const control=new AbortController();const timer=setTimeout(()=>control.abort(),12000);
  try {
    const response=await fetch(target,{method,redirect:'error',signal:control.signal,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','Accept':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const text=await response.text();
    let json={};try{json=text?JSON.parse(text):{};}catch(_){throw new Error('vendor_invalid_json');}
    if(!response.ok) throw new Error(`vendor_http_${response.status}`);
    return json;
  } finally {clearTimeout(timer);}
}
function verifyWebhook(raw, ts, signature, secret) {
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
