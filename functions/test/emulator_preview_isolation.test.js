'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {spawnSync}=require('node:child_process');const root=path.resolve(__dirname,'../..');
test('emulator seeding refuses missing or non-loopback hosts before loading any Admin SDK',()=>{
 for(const hosts of [{},{FIRESTORE_EMULATOR_HOST:'firestore.googleapis.com:443',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099'},{FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080',FIREBASE_AUTH_EMULATOR_HOST:'identitytoolkit.googleapis.com:443'}]){
  const r=spawnSync(process.execPath,[path.join(root,'scripts/emulator-preview/seed.cjs')],{encoding:'utf8',env:{PATH:process.env.PATH,...hosts}});assert.notEqual(r.status,0);assert.match(r.stderr,/AssertionError/);
 }
});
test('synthetic Auth and App Check refuse non-loopback origins before changing browser defaults',()=>{
 const code=fs.readFileSync(path.join(root,'scripts/emulator-preview/appcheck.js'),'utf8');let writes=0;
 for(const hostname of ['velnix-6c1a2.firebaseapp.com','production.example','127.0.0.1.evil.example',''])assert.throws(()=>vm.runInNewContext(code,{location:{hostname},window:new Proxy({},{set(){writes++;return true;}})}),/refuses non-loopback origins/);
 assert.equal(writes,0);
});
test('standard Live artifact check rejects synthetic preview bytes and missing output',()=>{
 const {assertProductionBuild}=require('../../scripts/emulator-preview/assert-production.cjs'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'velnix-live-isolation-'));
 try{const file=path.join(dir,'main.dart.js');assert.throws(()=>assertProductionBuild(file));fs.writeFileSync(file,'const project="demo-velnix-preview";');assert.throws(()=>assertProductionBuild(file),/Synthetic emulator/);fs.writeFileSync(file,'const mode="live";');assert.equal(assertProductionBuild(file),true);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
