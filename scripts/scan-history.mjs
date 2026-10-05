// Publication guard: inspect every reachable Git blob/path and commit metadata.
// Findings report object/path/rule only; never echo potentially secret content.
import { execFileSync } from 'node:child_process';
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
function inspect(text,object,path,{commitIdentity=false}={}){
  // The one deliberately public synthetic RPC-failure fixture is not a credential.
  text=text.replaceAll('?apiKey=SYNTHETIC_RPC_SECRET','?synthetic-fixture');
  for(const [rule,pattern] of rules)if(pattern.test(text))findings.push({object,path,rule});
  const emails=text.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi)??[];
  // GitHub privacy aliases are allowed only in author/committer identity fields.
  // Commit messages and file contents still require review for every other email.
  const privacyAlias=email=>email===['noreply','github.com'].join('@')||/^(?:\d+\+)?[a-z\d](?:[a-z\d-]*[a-z\d])?@users\.noreply\.github\.com$/i.test(email);
  if(emails.some(email=>email!=='local-preparation@invalid.example'&&!(commitIdentity&&privacyAlias(email))))findings.push({object,path,rule:'email-review-required'});
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
  const [authorName,authorEmail,committerName,committerEmail,...message]=git('show','-s','--format=%an%x00%ae%x00%cn%x00%ce%x00%B',commit).toString().split('\0');
  inspect(`${authorName}\n${committerName}\n${message.join('\0')}`,commit,'commit-metadata');
  inspect(`${authorEmail}\n${committerEmail}`,commit,'commit-metadata',{commitIdentity:true});
}
console.log(JSON.stringify({status:findings.length?'FAIL':'PASS',commits:commits.length,blobs,imagesRequiringVisualReview:images,findings,boundedPatternScan:true,formalAudit:false},null,2));
if(findings.length)process.exitCode=1;
