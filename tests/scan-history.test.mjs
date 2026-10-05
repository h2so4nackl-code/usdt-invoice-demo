import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

const scanner=fileURLToPath(new URL('../scripts/scan-history.mjs',import.meta.url));
const email=(user,domain)=>[user,domain].join('@');
const privateEmail=email('person','example.test');
const safeEmail=email('12345+demo-user','users.noreply.github.com');
function scan({author=safeEmail,committer=safeEmail,authorName='Demo',message='Synthetic fixture',content='Public demo',oldContent}={}){
  const cwd=mkdtempSync(join(tmpdir(),'invoice-history-'));
  const env={...process.env,GIT_AUTHOR_NAME:authorName,GIT_AUTHOR_EMAIL:author,GIT_COMMITTER_NAME:'Demo',GIT_COMMITTER_EMAIL:committer};
  const git=(...args)=>execFileSync('git',['-c',`safe.directory=${cwd}`,...args],{cwd,env,stdio:'pipe'});
  try{
    git('init');
    if(oldContent!==undefined){writeFileSync(join(cwd,'fixture.txt'),oldContent);git('add','fixture.txt');git('commit','-m','Historical fixture');}
    writeFileSync(join(cwd,'fixture.txt'),content);git('add','fixture.txt');git('commit','-m',message);
    const result=spawnSync(process.execPath,[scanner],{cwd,encoding:'utf8'});
    assert.ok(result.status===0||result.status===1,result.stderr);
    return {code:result.status,...JSON.parse(result.stdout)};
  }finally{rmSync(cwd,{recursive:true,force:true});}
}
test('history scan accepts GitHub privacy identities and merge bot',()=>{
  assert.equal(scan({committer:email('noreply','github.com')}).code,0);
  assert.equal(scan({author:email('demo-user','users.noreply.github.com')}).code,0);
});
test('history scan rejects personal author and committer emails',()=>{
  for(const options of [{author:privateEmail},{committer:privateEmail}])assert.ok(scan(options).findings.some(f=>f.rule==='email-review-required'));
});
test('history scan rejects a lookalike privacy domain',()=>{
  assert.equal(scan({author:email('12345+demo-user','users.noreply.github.com.example.test')}).code,1);
});
test('history scan still reviews emails in messages, names and files',()=>{
  for(const options of [{authorName:privateEmail},{authorName:safeEmail},{message:privateEmail},{message:safeEmail},{content:privateEmail},{content:safeEmail}])assert.equal(scan(options).code,1);
});
test('history scan detects private keys despite privacy identities',()=>{
  const result=scan({content:['-----BEGIN ','PRIVATE KEY-----'].join('')});
  assert.ok(result.findings.some(f=>f.rule==='private-key'));
});
test('history scan inspects old blobs after sensitive content is removed',()=>{
  assert.ok(scan({oldContent:privateEmail}).findings.some(f=>f.rule==='email-review-required'));
});
