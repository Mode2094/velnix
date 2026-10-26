'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
test('Cloud Shell launcher rejects Node 24 before npm or cloud calls, and accepts Node 22',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'velnix-launcher-'));
 try{
  const dir=path.join(root,'scripts/phase1-readiness'),bin=path.join(root,'bin'),log=path.join(root,'calls');fs.mkdirSync(dir,{recursive:true});fs.mkdirSync(bin);fs.mkdirSync(path.join(root,'functions'));
  fs.copyFileSync(path.resolve(__dirname,'../../scripts/phase1-readiness/start.sh'),path.join(dir,'start.sh'));
  const write=(name,body)=>fs.writeFileSync(path.join(bin,name),'#!/bin/bash\n'+body,{mode:0o755});
  write('git','if [[ "$1" == branch ]]; then echo audit/production-readiness; elif [[ "$1" == rev-parse ]]; then echo test-source; fi\n');
  write('gcloud','echo unexpected-cloud-call >> "$TEST_LOG"; exit 9\n');
  write('npm','echo npm >> "$TEST_LOG"\n');
  write('node','if [[ "$1" == -p ]]; then echo "$TEST_NODE_MAJOR"; else echo inventory >> "$TEST_LOG"; fi\n');
  const run=major=>spawnSync('/bin/bash',[path.join(dir,'start.sh')],{encoding:'utf8',env:{PATH:bin+':'+process.env.PATH,TEST_NODE_MAJOR:major,TEST_LOG:log}});
  const rejected=run('24');assert.equal(rejected.status,1);assert.match(rejected.stderr,/Node.js 22 is required/);assert.equal(fs.existsSync(log),false);
  const accepted=run('22');assert.equal(accepted.status,0);assert.equal(fs.readFileSync(log,'utf8'),'npm\ninventory\n');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
