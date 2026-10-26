'use strict';
const crypto=require('node:crypto');
const hash=text=>crypto.createHash('sha256').update(text).digest('hex');
// Hash original bytes before redaction. Never render arbitrary ruleset metadata.
function publishedRules(files,expectedSha256){
 if(!files.length||files.some(f=>typeof f.content!=='string'||(f.name!==undefined&&typeof f.name!=='string')))throw Error('invalid_ruleset');
 const matchesSource=files.length===1&&hash(files[0].content)===expectedSha256;
 const result={matchesSource,expectedSha256,publishedFileCount:files.length,publishedSha256:files.length===1?hash(files[0].content):null};
 if(!matchesSource){
  let remaining=256*1024;
  result.files=files.map((file,index)=>{
   // Rules normally contain authorization logic, not secrets. Withhold a whole line
   // if it resembles credentials; report the redaction instead of claiming an exact diff.
   let privateKey=false;
   const safe=file.content.split('\n').map(line=>{
    const start=/-----BEGIN .*PRIVATE KEY-----/.test(line),end=/-----END .*PRIVATE KEY-----/.test(line);
    if(start)privateKey=true;
    const sensitive=privateKey||/\bBearer\s+\S+|\bya29\.[\w.-]+|\bAIza[\w-]{20,}|\beyJ[\w-]+\.[\w-]+\.[\w-]+|(?:api[_-]?key|password|secret|token|credentials|authorization|client[_-]?secret|access[_-]?token|refresh[_-]?token|private[_-]?key)\s*["']?\s*[:=]/i.test(line);
    if(end)privateKey=false;
    return sensitive?'// [credential-like line withheld]':line;
   }).join('\n');
   const content=safe.slice(0,remaining);remaining-=content.length;
   return {fileIndex:index,name:typeof file.name==='string'&&/^[\w./-]{1,200}$/.test(file.name)?file.name:null,sha256:hash(file.content),content,redacted:safe!==file.content,truncated:content.length!==safe.length};
  });
  result.comparison='Compare each original SHA-256 and displayed source; redacted or truncated content is not an exact diff. Multi-file rulesets have per-file hashes, no single-source hash.';
 }
 return result;
}
module.exports={publishedRules};
