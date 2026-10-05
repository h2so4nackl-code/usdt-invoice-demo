// Publication guard: inspect every reachable Git blob/path and commit metadata.
// Findings report object/path/rule only; never echo potentially secret content.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
// Reviewed repository-owner identity from GitHub commit metadata. Keep the address
// out of source; this exception applies only to author/committer email fields.
const reviewedOwnerEmailSha256='009a446d643f21cb15cb77e1dd0a470c03c3d07f00f0ba4b2e2d25c930e66a74';
const ownerNoReplyEmailSha256='b58151594578d303ebdbdfbab884b83e7d1c03cbc6db621f0dda189fb89309a5';
// GitHub web-flow uses this public service identity for generated merge commits.
const githubCommitterEmailSha256='3c205d8fc749f72977b9331e3179773c315bb1f4860c366de2abe9ec9337730b';
const args=['-c',`safe.directory=${process.cwd()}`];
const git=(...input)=>execFileSync('git',[...args,...input],{maxBuffer:32*1024*1024});
const commits=git('rev-list','--all').toString().trim().split('\n').filter(Boolean);
const objects=git('rev-list','--objects','--all').toString().trim().split('\n');
const findings=[];let blobs=0,images=0;
const rules=[
  ['private-key',/-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/],
  ['github-token',/gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/],
  ['aws-key',/AKIA[0-9A-Z]{16}/],
  ['local-path',/[A-Z]:[\\/]Users[\\/]|\/Users\/[^/\s]+\/|\/home\/[^/\s]+\//i],
  ['credential-url',/https?:\/\/[^\s/]+:[^\s/]+@/],
  ['rpc-query-key',/[?&](?:api[_-]?key|token|secret|access_token)=[^\s'"&]+/i],
  ['assigned-secret',/(?:privateKey|mnemonic|seedPhrase|rpcKey|apiKey|accessToken)\s*[:=]\s*['"][^'"\n]{12,}['"]/i]
];
function inspect(text,object,path){
  // The one deliberately public synthetic RPC-failure fixture is not a credential.
  text=text.replaceAll('?apiKey=SYNTHETIC_RPC_SECRET','?synthetic-fixture');
  for(const [rule,pattern] of rules)if(pattern.test(text))findings.push({object,path,rule});
  const emails=text.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi)??[];
  if(emails.some(email=>email!=='local-preparation@invalid.example'))findings.push({object,path,rule:'email-review-required'});
}
for(const line of objects){
  const split=line.indexOf(' '),object=split<0?line:line.slice(0,split),path=split<0?'':line.slice(split+1);
  if(/(^|\/)(?:\.env(?:\.[^/]+)?|node_modules|data|\.npm-cache)(?:\/|$)|\.(?:zip|bundle|sqlite|db|log)$/i.test(path)&&!/(^|\/)\.env\.example$/.test(path))findings.push({object,path,rule:'excluded-material'});
  if(git('cat-file','-t',object).toString().trim()!=='blob')continue;
  blobs++;const buffer=git('cat-file','blob',object);
  if(/\.(?:jpg|jpeg|png)$/i.test(path)){images++;continue;} // actual captures manually reviewed separately
  inspect(buffer.toString('utf8'),object,path);
}
for(const commit of commits){
  const metadata=git('show','-s','--format=%an%n%ae%n%cn%n%ce%n%B',commit).toString().split('\n');
  for(const index of [1,3]){
    const email=metadata[index];
    const digest=createHash('sha256').update(email).digest('hex');
    if(digest===reviewedOwnerEmailSha256||digest===ownerNoReplyEmailSha256||
      (index===3&&metadata[2]==='GitHub'&&digest===githubCommitterEmailSha256))metadata[index]='reviewed-identity-email';
  }
  inspect(metadata.join('\n'),commit,'commit-metadata');
}
console.log(JSON.stringify({status:findings.length?'FAIL':'PASS',commits:commits.length,blobs,imagesRequiringVisualReview:images,findings,boundedPatternScan:true,formalAudit:false},null,2));
if(findings.length)process.exitCode=1;
