import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
const files=[];
function walk(folder){for(const entry of readdirSync(folder,{withFileTypes:true})){const file=join(folder,entry.name);if(entry.isDirectory())walk(file);else files.push(file);}}
for(const dir of ['src','public','scripts','tests'])walk(dir);
for(const file of files){const text=readFileSync(file,'utf8');if(file.endsWith('.mjs')){const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(result.status!==0)throw new Error(`Syntax failed: ${file}`);}if(/\beval\s*\(|\.innerHTML\s*=|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|gh[pousr]_[A-Za-z0-9]{20,}/.test(text))throw new Error(`Unsafe source pattern: ${file}`);}
console.log(`PASS: ${files.length} source files; JS syntax and bounded unsafe/secret-pattern scan. Not a formal audit.`);
