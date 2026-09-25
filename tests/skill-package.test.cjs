const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
const {exportSkill,copyableSkill}=require('../desktop/skill-package.cjs');const{Service}=require('../desktop/service.cjs'),{startBridge}=require('../desktop/bridge.cjs');
function run(file,args,env){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,[file,...args],{env:{...process.env,...env}});let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);child.on('error',reject);child.on('close',code=>code?reject(Error(err)):resolve(out));});}
test('exported Skill connects and submits outside repository; copy text contains complete portable files',async t=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'sayagain-package-')),data=path.join(tmp,'app');const service=new Service(path.join(data,'data'));service.setIntegration({enabled:true});service.saveSettings({revision:service.config().body.revision,native_language:'zh-CN',target_language:'en-US'});const bridge=await startBridge(service,data,()=>{});t.after(()=>{bridge.close();service.close();fs.rmSync(tmp,{recursive:true,force:true});});
 const folder=await exportSkill(tmp),client=path.join(folder,'scripts/client.cjs');const env={SAYAGAIN_DATA_DIR:data};const context=JSON.parse(await run(client,['context'],env));assert.equal(context.enabled,true);
 const review={client:'portable-test',conversation_id:'test',turn_id:'test',message_revision:1,config_id:context.config.id,config_revision:context.config.revision,policy_version:1,source_text:'Hello.',decision:'no_change',reason:'Natural greeting.',evaluator:'test',expressions:[]};const file=path.join(tmp,'review.json');fs.writeFileSync(file,JSON.stringify(review));const receipt=JSON.parse(await run(client,['submit',file],env));assert(receipt);assert.equal(service.store.list('evaluation').length,1);
 const status=JSON.parse((await run(path.join(folder,'scripts/setup-tts.cjs'),[],env)));assert.equal(status.installed,false);assert(fs.existsSync(path.join(folder,'scripts/requirements.txt')));
 const text=await copyableSkill();assert(text.includes('## sayagain/SKILL.md'));assert(text.includes('## sayagain/scripts/client.cjs'));assert(text.includes('## sayagain/references/review-protocol.md'));assert(!text.includes(JSON.parse(fs.readFileSync(bridge.descriptor)).token));
 // Pasted packages must reconstruct every exported resource, including nested code fences.
 const pasted=path.join(tmp,'pasted');fs.mkdirSync(pasted);
 const blocks=[...text.matchAll(/^## sayagain\/([^\r\n]+)\r?\n\r?\n(`{3,})\r?\n([\s\S]*?)^\2\r?$/gm)];
 const exported=fs.readdirSync(folder,{recursive:true}).filter(name=>fs.statSync(path.join(folder,name)).isFile());
 assert.equal(blocks.length,exported.length);
 for(const [,relative,,body] of blocks){const target=path.join(pasted,relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,body);assert.equal(body.trimEnd(),fs.readFileSync(path.join(folder,relative),'utf8').trimEnd());}
 // All local Markdown reference links remain navigable after export and paste.
 for(const name of exported.filter(name=>name.endsWith('.md'))){const body=fs.readFileSync(path.join(pasted,name),'utf8');for(const [,link] of body.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)){if(/^[a-z]+:/i.test(link)||link.startsWith('#'))continue;assert(fs.existsSync(path.resolve(pasted,path.dirname(name),link.split('#')[0])),`Missing portable reference: ${name} -> ${link}`);}}
 const pastedContext=JSON.parse(await run(path.join(pasted,'scripts/client.cjs'),['context'],env));assert.equal(pastedContext.config.id,context.config.id);
});
