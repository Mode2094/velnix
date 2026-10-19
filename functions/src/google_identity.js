'use strict';
const {HttpsError}=require('firebase-functions/v2/https');
function requireGoogleSession(req){
  if(!req.auth?.uid)throw new HttpsError('unauthenticated','يرجى تسجيل الدخول باستخدام Google');
  if(req.auth.token?.firebase?.sign_in_provider!=='google.com'||req.auth.token?.email_verified!==true)
    throw new HttpsError('permission-denied','استخدم حساب Google موثقاً للدخول');
  return req.auth.uid;
}
// Runtime session guard for the client apps. Email/password is accepted only
// with a verified email; Google remains a supported provider.
function requireSession(req){
  if(!req.auth?.uid)throw new HttpsError('unauthenticated','يرجى تسجيل الدخول');
  const provider=req.auth.token?.firebase?.sign_in_provider;
  if(!['google.com','password'].includes(provider)||req.auth.token?.email_verified!==true)
    throw new HttpsError('permission-denied','استخدم حساباً موثقاً بالبريد أو Google');
  return req.auth.uid;
}
function googleProfile(record){
  const provider=record.providerData.find(p=>p.providerId==='google.com');
  if(record.disabled||!record.emailVerified||!provider?.email||provider.email.toLowerCase()!==record.email?.toLowerCase())
    throw new HttpsError('failed-precondition','يلزم حساب Google موثق وفعال؛ راجع المسؤول');
  return {email:provider.email.toLowerCase(),name:(record.displayName||provider.displayName||provider.email).trim().slice(0,120)};
}
function sessionProfile(record){
  const provider=record.providerData.find(p=>p.providerId==='google.com'||p.providerId==='password');
  if(record.disabled||!record.emailVerified||!record.email||!provider?.email||provider.email.toLowerCase()!==record.email.toLowerCase())
    throw new HttpsError('failed-precondition','يلزم حساب موثق وفعال بالبريد أو Google؛ راجع المسؤول');
  return {email:record.email.toLowerCase(),name:(record.displayName||provider.displayName||record.email).trim().slice(0,120)};
}
module.exports={requireGoogleSession,googleProfile,requireSession,sessionProfile};
