if(!['localhost','127.0.0.1'].includes(location.hostname))throw Error('Emulator setup refuses non-loopback origins');
window.__FIREBASE_DEFAULTS__={emulatorHosts:{auth:'127.0.0.1:9099'}};
window.initializeLocalEmulatorAppCheck = async () => {
 if(window.localAppCheckReady)return;
 if (!['localhost','127.0.0.1'].includes(location.hostname)) throw Error('Local only');
 const {getApp}=await import('/firebase-sdk/12.19.0/firebase-app.js');
 const {initializeAppCheck,CustomProvider}=await import('/firebase-sdk/12.19.0/firebase-app-check.js');
 if(getApp().options.projectId!=='demo-velnix-preview') throw Error('Wrong local project');
 const encode=value=>btoa(JSON.stringify(value)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
 initializeAppCheck(getApp(),{provider:new CustomProvider({getToken:async()=>{
  const now=Math.floor(Date.now()/1000);
  return {token:encode({alg:'none',typ:'JWT'})+'.'+encode({sub:'local-preview-app',iat:now,exp:now+3600})+'.local-emulator-only',expireTimeMillis:(now+3600)*1000};
 }}),isTokenAutoRefreshEnabled:false});
 window.localAppCheckReady=true;
};
window.initializeLocalEmulatorAuth = async () => {
 if(!['localhost','127.0.0.1'].includes(location.hostname))throw Error('Local only');
 const {initializeApp,getApps}=await import('/firebase-sdk/12.19.0/firebase-app.js');
 const {initializeAuth,connectAuthEmulator,indexedDBLocalPersistence,browserLocalPersistence,browserSessionPersistence,browserPopupRedirectResolver,debugErrorMap,setPersistence,inMemoryPersistence}=await import('/firebase-sdk/12.19.0/firebase-auth.js');
 if(getApps().length)throw Error('Local Auth must initialize before FlutterFire');
 const app=initializeApp({apiKey:'local-emulator-only',appId:'1:123456789:web:localpreview',messagingSenderId:'123456789',projectId:'demo-velnix-preview',authDomain:'demo-velnix-preview.firebaseapp.com'});
 await window.initializeLocalEmulatorAppCheck();
 // Match FlutterFire's documented web persistence and resolver configuration.
 const auth=initializeAuth(app,{persistence:[indexedDBLocalPersistence,browserLocalPersistence,browserSessionPersistence],popupRedirectResolver:browserPopupRedirectResolver,errorMap:debugErrorMap});
 connectAuthEmulator(auth,'http://127.0.0.1:9099');
 await setPersistence(auth,inMemoryPersistence);
 if(auth.emulatorConfig?.host!=='127.0.0.1')throw Error('Local Auth emulator not connected');
};
