import { readFileSync,writeFileSync } from 'node:fs';
const lock=JSON.parse(readFileSync('package-lock.json','utf8'));
const inventory=Object.entries(lock.packages).filter(([path])=>path).map(([path,item])=>{
  const manifest=JSON.parse(readFileSync(`${path}/package.json`,'utf8'));
  return {name:manifest.name,version:manifest.version,license:manifest.license,integrity:item.integrity,installScripts:['preinstall','install','postinstall'].filter(key=>manifest.scripts?.[key]).map(key=>`${key}: ${manifest.scripts[key]}`)};
});
writeFileSync('evidence/wdk/dependencies.json',JSON.stringify(inventory,null,2));
if(inventory.some(item=>!item.integrity))throw new Error('Integrity missing');
console.log(JSON.stringify({installed:inventory.length,installScripts:inventory.filter(item=>item.installScripts.length).length,integrity:'PASS'}));
