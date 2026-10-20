import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PYTORCH_NODES } from '../src/pytorch-data.js';

const rootArg=process.argv.indexOf('--root');
if(rootArg<0||!process.argv[rootArg+1])throw new Error('Pass --root with a local PyTorch checkout.');
const root=path.resolve(process.argv[rootArg+1]);
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024}).trim();
const tracked=git('ls-files','-z').split('\0').filter(Boolean);
const extensions=new Set(['.py','.pyi','.cpp','.cc','.c','.h','.hpp','.cu','.cuh','.yaml','.yml','.cmake']);
const sourceFiles=tracked.filter(p=>!p.startsWith('third_party/')&&(extensions.has(path.extname(p))||path.basename(p)==='CMakeLists.txt'));
const nodes={};
const invalid=[];
for(const node of Object.values(PYTORCH_NODES)){
  const source=node.paths.map(p=>{
    const file=path.resolve(root,p);
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){invalid.push(p);return null;}
    const isDirectory=fs.statSync(file).isDirectory();
    return {path:p,directory:isDirectory,...!isDirectory?{sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}:{}};
  }).filter(Boolean);
  const matches=p=>node.kind==='root'||source.some(s=>s.directory?p.startsWith(s.path+'/'):p===s.path);
  const scoped=sourceFiles.filter(matches);
  nodes[node.id]={sourceFiles:scoped.length,pythonFiles:scoped.filter(p=>/\.pyi?$/.test(p)).length,cppFiles:scoped.filter(p=>/\.(?:c|cc|cpp|h|hpp|cu|cuh)$/.test(p)).length,paths:source};
}
if(invalid.length)throw new Error(`Missing source paths: ${[...new Set(invalid)].join(', ')}`);
const index={version:fs.readFileSync(path.join(root,'version.txt'),'utf8').trim(),commit:git('rev-parse','HEAD'),commitDate:git('show','-s','--format=%cs','HEAD'),repository:'https://github.com/pytorch/pytorch',indexedAt:new Date().toISOString().slice(0,10),trackedPaths:tracked.length,sourceFiles:sourceFiles.length,hasSubmoduleChanges:git('status','--short').length>0,method:'Tracked files, excluding third_party; .py/.pyi/C/C++/CUDA headers and sources/YAML/CMake. Curated functional grouping; overlapping scopes are not additive.',nodes};
const destination=fileURLToPath(new URL('../src/pytorch-source-index.json',import.meta.url));
fs.writeFileSync(destination,JSON.stringify(index,null,2)+'\n');
console.log(`Indexed ${Object.keys(nodes).length} functional nodes, ${sourceFiles.length} source/schema files at ${index.commit.slice(0,7)}.`);
