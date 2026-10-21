'use strict';
const fs=require('node:fs'),path=require('node:path');
function assertProductionBuild(file){
 const code=fs.readFileSync(file,'utf8');if(!code.length)throw Error('Live build is empty');
 for(const marker of ['demo-velnix-preview','local-emulator-only','initializeLocalEmulatorAuth','local-preview-app'])if(code.includes(marker))throw Error('Synthetic emulator configuration found in standard Live build');
 return true;
}
if(require.main===module){assertProductionBuild(path.resolve(__dirname,'../../build/web/main.dart.js'));console.log('Standard Live artifact contains no emulator-preview markers');}
module.exports={assertProductionBuild};
