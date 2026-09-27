'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const forbidden = ['backend/admin-server.js', 'backend/index.js', 'prisma/schema.prisma', '.env', 'logs/', 'handoff/'];
const files = [];
function walk(dir) { for (const entry of fs.readdirSync(dir,{withFileTypes:true})) { if (['.git','node_modules','artifacts','cache'].includes(entry.name)) continue; const absolute=path.join(dir,entry.name); if(entry.isDirectory()) walk(absolute); else files.push(path.relative(root,absolute).replaceAll('\\','/')); } }
walk(root);
for (const pattern of forbidden) { if (files.some((file) => file === pattern || (pattern.endsWith('/') && file.startsWith(pattern)))) throw new Error(`Forbidden private path in export: ${pattern}`); }
if (!files.includes('SOURCE_PROVENANCE.md') || !files.includes('LICENSE_SCOPE.md')) throw new Error('Required publication boundary documents are missing.');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'EXPORT_MANIFEST.json'),'utf8'));
const crypto=require('node:crypto');
for(const entry of manifest.files){ const absolute=path.join(root,entry.path); if(!fs.existsSync(absolute)) throw new Error(`Manifest file missing: ${entry.path}`); const digest=crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex'); if(digest!==entry.sha256) throw new Error(`Manifest digest mismatch: ${entry.path}`); }
console.log(`PASS export boundary: ${files.length} files, no forbidden private paths.`);
