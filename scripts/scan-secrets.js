'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const rules = [
  ['private-key-block', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['github-token', /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/],
  ['aws-access-key', /\bAKIA[0-9A-Z]{16}\b/],
  ['slack-token', /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
  ['telegram-token', /\b\d{8,10}:[A-Za-z0-9_-]{30,}\b/],
  ['assigned-secret', /\b(?:password|passwd|api[_-]?key|private[_-]?key|secret|token)\s*[=:]\s*["'][^"'\s]{8,}["']/i],
  ['credential-url', /(?:mysql|postgres(?:ql)?|mongodb(?:\+srv)?):\/\/[^\s:@]+:[^\s@]+@/i]
];
const findings=[];
function walk(dir){ for(const entry of fs.readdirSync(dir,{withFileTypes:true})){ if(['.git','node_modules','artifacts','cache'].includes(entry.name)) continue; const file=path.join(dir,entry.name); if(entry.isDirectory()) walk(file); else { const data=fs.readFileSync(file); if(data.includes(0)) continue; const text=data.toString('utf8'); for(const [name,re] of rules){ if(re.test(text)) findings.push(`${path.relative(root,file)}: ${name}`); } } } }
walk(root);
if(findings.length){ console.error(findings.join('\n')); process.exit(1); }
console.log('PASS secret scan: no credential patterns found in publication tree.');
