'use strict';
const fs=require('node:fs'); const path=require('node:path'); const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'); const files=[];
function walk(dir){ for(const entry of fs.readdirSync(dir,{withFileTypes:true})){ if(['.git','node_modules','artifacts','cache'].includes(entry.name)) continue; const absolute=path.join(dir,entry.name); const relative=path.relative(root,absolute).replaceAll('\\','/'); if(relative==='EXPORT_MANIFEST.json') continue; if(entry.isDirectory()) walk(absolute); else { const data=fs.readFileSync(absolute); files.push({path:relative,bytes:data.length,sha256:crypto.createHash('sha256').update(data).digest('hex')}); } } }
walk(root); files.sort((a,b)=>a.path.localeCompare(b.path));
const manifest={schemaVersion:1,sourceCommit:'3ded629d66f47f951b79cd3ab5cde36471440f63',generatedAt:'2026-09-27',hashAlgorithm:'SHA-256',scope:'All publication files except this self-referential manifest.',files};
fs.writeFileSync(path.join(root,'EXPORT_MANIFEST.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(`Wrote EXPORT_MANIFEST.json for ${files.length} files.`);
