const fs=require('node:fs'),path=require('node:path');
const {spawn}=require('node:child_process');
const {createHash}=require('node:crypto');
const {newId}=require('../storage/store.cjs');
const {modelStatus,MODEL,REVISION}=require('./local-model.cjs');
const {parseWav,normalizeCloudWav}=require('./audio.cjs');
const {normalizeAudioUrl}=require('./audio-url.cjs');
const {CLOUD_MODEL,CLOUD_MODELS,cloudModel}=require('./cloud-models.cjs');
const {uploadReference}=require('./cloud-upload.cjs');
const BASE='https://maas.qianwenaiapi.com/api/v1';
const LANGUAGES={zh:'Chinese',en:'English',ja:'Japanese',ko:'Korean',de:'German',fr:'French',ru:'Russian',pt:'Portuguese',es:'Spanish',it:'Italian'};
const hash=value=>createHash('sha256').update(value).digest('hex');
class Speech {
 constructor(service,userDirectory,{secrets,fetch:fetcher=global.fetch,onChange=()=>{},localStatus=modelStatus,localRunner}={}){
  this.service=service;this.userDirectory=userDirectory;this.secrets=secrets;this.fetch=fetcher;this.onChange=onChange;this.localStatus=localStatus;this.localRunner=localRunner;this.busy=false;this.closed=false;this.active=null;
  if(!this.config())service.store.put({type:'speech_config',profile_id:service.profileId,mode:'local',cloud_enabled:false,cloud_model:CLOUD_MODEL});
  service.store.transaction(()=>{for(const job of service.store.list('job'))if(job.body.kind==='synthesis'&&['queued','running'].includes(job.body.status)){service.update(job,{status:'failed',error:'上次运行中断，请手动重试。云端请求可能已计费。'});const synthesis=service.store.get(job.body.target_id);if(synthesis)service.update(synthesis,{status:'failed',error:'上次运行中断，请手动重试。'});}});
 }
 config(){return this.service.store.list('speech_config')[0];}
 status(){const local=this.localStatus(this.userDirectory),key=this.secrets?.status?.()||{present:!!this.secrets?.has(),usable:!!this.secrets?.has(),error:null};return{config:this.config(),has_api_key:key.usable,api_key_present:key.present,api_key_error:key.error,local:{...local,runtime:undefined},cloud_platform:'https://platform.qianwenai.com/',cloud_model:this.config().body.cloud_model||CLOUD_MODEL,cloud_models:CLOUD_MODELS};}
 configure(input){
  if(!['local','cloud'].includes(input.mode)||typeof input.cloud_enabled!=='boolean')throw new Error('语音设置无效');
  const selectedModel=cloudModel(input.cloud_model??this.config().body.cloud_model??CLOUD_MODEL).id;
  if(input.keys?.length===0){input={...input,mode:'local',cloud_enabled:false};}
  if(input.mode==='cloud'&&!input.cloud_enabled)throw new Error('请主动启用云端');
  if(input.keys)this.secrets.save({keys:input.keys,active_id:input.active_key_id});
  else if(input.api_key)this.secrets.set(input.api_key.trim());
  if(input.mode==='cloud'&&!this.secrets?.has())throw new Error(this.secrets?.status?.().error||'请填写 API Key 并主动启用云端');
  if(!input.cloud_enabled)this.cancelCloud();
  return this.service.store.transaction(()=>this.service.update(this.config(),{mode:input.mode,cloud_enabled:input.cloud_enabled,cloud_model:selectedModel}));
 }
 cancelCloud(){for(const record of this.service.store.list('synthesis'))if(record.body.provider==='cloud'&&['queued','running'].includes(record.body.status))this.cancel({id:record.block_id});}
 clearKey(){this.cancelCloud();this.secrets.clear();return this.service.store.transaction(()=>this.service.update(this.config(),{mode:'local',cloud_enabled:false}));}
 request(input){
  const s=this.service,expression=s.entity(input.expression_id,'expression'),voice=s.entity(input.voice_id,'voice');
  if(voice.body.status!=='active'||!voice.body.default_sample_id)throw new Error('请先选择有录音样本的未归档音色');
  if(expression.body.status!=='active')throw new Error('请先恢复这条表达');
  const sample=s.entity(voice.body.default_sample_id,'voice_sample'),asset=s.entity(sample.body.asset_id,'asset');
  const language=LANGUAGES[expression.body.language_pair.target_language.split('-')[0]];
  if(!language)throw new Error('当前语音模型不支持这个目标语言，仍可练习文本');
  if(Array.from(expression.body.improved).length>600)throw new Error('单次合成最多 600 个字符，请拆分表达');
  if(asset.body.media_type!=='audio/wav')throw new Error('此旧录音尚未转为 WAV，请在音色库重新导入或录制一次');
  const format=parseWav(fs.readFileSync(s.asset(asset.block_id).filename));
  const config=this.config().body;const selectedModel=config.mode==='cloud'?cloudModel(input.model_id??config.cloud_model??CLOUD_MODEL).id:MODEL;let runtime=null,keyFingerprint='local';
  if(config.mode==='local'){
   const local=this.localStatus(this.userDirectory);if(!local.space_ok)throw new Error(`${local.reason}。请释放空间或在设置中配置千问AI平台云端接入。`);if(!local.installed)throw new Error('请先安装本地 Qwen3-TTS，或主动配置云端接入');runtime=local.runtime;
  }else{
   if(!config.cloud_enabled)throw new Error('云端尚未启用');
   if(!this.secrets?.has())throw new Error(this.secrets?.status?.().error||'请先填写 Qwen AK');
   if(input.cloud_consent!==true)throw new Error('请确认将选定录音和本句文字发送到千问AI平台');
   if(format.sample_rate<24000||format.channels!==1)throw new Error('云端克隆需要 24 kHz 及以上的单声道录音，请在音色库重新导入或录制');
   if(format.duration_ms<10000||format.duration_ms>60000||asset.body.byte_size>10*1024*1024)throw new Error('云端克隆需要 10–60 秒、10 MB 以内的参考录音，建议 10–20 秒');
   keyFingerprint=hash(this.secrets.get());
  }
  const cache=hash(JSON.stringify({text:expression.body.improved,language,provider:config.mode,model:config.mode==='local'?MODEL:selectedModel,revision:config.mode==='local'?REVISION:selectedModel,device:runtime?.device||null,voice:voice.block_id,voice_revision:voice.body.voice_revision,sample_hash:asset.body.sha256,transcript:sample.body.transcript,keyFingerprint}));
  const found=s.store.db.prepare('SELECT block_id FROM dedupe_index WHERE scope=? AND dedupe_key=?').get('synthesis',cache);
  let synthesis=found?s.entity(found.block_id,'synthesis'):null;
  if(synthesis?.body.status==='succeeded'){try{s.asset(synthesis.body.asset_id);return{...synthesis,cached:true};}catch{}}
  if(synthesis&&['queued','running'].includes(synthesis.body.status))return synthesis;
  synthesis=s.store.transaction(()=>{
   const body={type:'synthesis',profile_id:s.profileId,expression_id:expression.block_id,content_revision:expression.body.content_revision,text_snapshot:expression.body.improved,voice_id:voice.block_id,voice_revision:voice.body.voice_revision,sample_id:sample.block_id,sample_hash:asset.body.sha256,reference_text:sample.body.transcript,provider:config.mode,model_id:config.mode==='local'?MODEL:selectedModel,model_revision:config.mode==='local'?REVISION:selectedModel,language,status:'queued',error:null,cache_key:cache,key_fingerprint:keyFingerprint,links:[{relation:'expression',target_id:expression.block_id},{relation:'voice',target_id:voice.block_id},{relation:'sample',target_id:sample.block_id}],dedupe_keys:[{scope:'synthesis',key:cache}]};
   const record=synthesis?s.update(synthesis,body):s.store.put(body);
   s.store.put({type:'job',profile_id:s.profileId,kind:'synthesis',target_id:record.block_id,status:'queued',attempts:1,links:[{relation:'synthesis',target_id:record.block_id}]});return record;
  });
  this.onChange();queueMicrotask(()=>this.drain());return synthesis;
 }
 cancel(input){const s=this.service,record=s.entity(input.id,'synthesis');if(!['queued','running'].includes(record.body.status))return;this.active?.id===input.id&&this.active.controller.abort();s.store.transaction(()=>{s.update(record,{status:'cancelled',error:null});for(const job of s.store.list('job'))if(job.body.target_id===input.id&&['queued','running'].includes(job.body.status))s.update(job,{status:'cancelled'});});this.onChange();}
 async drain(){
  if(this.busy||this.closed)return;this.busy=true;
  try{while(!this.closed){const job=this.service.store.list('job').reverse().find(j=>j.body.kind==='synthesis'&&j.body.status==='queued');if(!job)break;await this.run(job);}}finally{this.busy=false;this.resolveClose?.();}
 }
 async run(job){
  const s=this.service,id=job.body.target_id,controller=new AbortController();this.active={id,controller};
  const temporary=path.join(s.directory,'assets',`${newId()}.pending.wav`);
  const downloadDirectory=path.join(this.userDirectory,'tts-downloads'),downloadFile=path.join(downloadDirectory,`${id}.wav`);
  try{
   const record=s.entity(id,'synthesis'),voice=s.entity(record.body.voice_id,'voice'),sample=s.entity(record.body.sample_id,'voice_sample');
   if(voice.body.status!=='active')throw new Error('音色已归档，任务未执行');
   s.store.transaction(()=>{s.update(record,{status:'running'});s.update(job,{status:'running',started_at:Date.now()});});this.onChange();
   const reference=s.asset(sample.body.asset_id).filename;
   let bytes;
   if(record.body.provider==='local'){
    const local=this.localStatus(this.userDirectory);if(!local.space_ok||!local.installed)throw new Error(local.reason);
    const request={model_path:local.runtime.model_path,device:local.runtime.device||'cpu',reference_path:reference,reference_text:record.body.reference_text,text:record.body.text_snapshot,language:record.body.language,output_path:temporary};
    if(this.localRunner)await this.localRunner(request,controller.signal);else await this.runLocal(local.runtime.python,request,controller.signal);
    bytes=fs.readFileSync(temporary);
   }else{
    if(fs.existsSync(downloadFile)){bytes=fs.readFileSync(downloadFile);}else{
    if(!this.config().body.cloud_enabled)throw new Error('云端已关闭，任务未执行');
    const key=this.secrets.get();if(hash(key)!==record.body.key_fingerprint)throw new Error('API Key 已更换，请重新生成');
    const model=cloudModel(record.body.model_id);
    const promptKey=hash(JSON.stringify([record.body.sample_hash,model.id,record.body.key_fingerprint]));
    const found=s.store.db.prepare('SELECT block_id FROM dedupe_index WHERE scope=? AND dedupe_key=?').get('cloud_voice',promptKey);
    let remoteVoice=found?s.entity(found.block_id,'voice_prompt').body.remote_voice:null;
    if(!remoteVoice){
     let result;
     if(model.family==='qwen-audio'){
      const url=await uploadReference(this,reference,key,controller.signal);
      result=await this.post('/services/audio/tts/customization',{model:'voice-enrollment',input:{action:'create_voice',target_model:model.id,prefix:'sayagain',url}},key,controller.signal,{'X-DashScope-OssResourceResolve':'enable'});
      remoteVoice=result.output?.voice_id;
     }else{
      result=await this.post('/services/audio/tts/customization',{model:'qwen-voice-enrollment',input:{action:'create',target_model:model.id,preferred_name:'sayagain',audio:{data:`data:audio/wav;base64,${fs.readFileSync(reference).toString('base64')}`}}},key,controller.signal);
      remoteVoice=result.output?.voice;
     }
     if(typeof remoteVoice!=='string'||!remoteVoice)throw new Error('云端未返回有效音色');
     s.store.put({type:'voice_prompt',profile_id:s.profileId,provider:'qianwen',voice_id:voice.block_id,sample_id:sample.block_id,remote_voice:remoteVoice,model_id:model.id,status:'ready',links:[{relation:'voice',target_id:voice.block_id},{relation:'sample',target_id:sample.block_id}],dedupe_keys:[{scope:'cloud_voice',key:promptKey}]});
    }
    const result=model.family==='qwen-audio'
     ?await this.post('/services/audio/tts/SpeechSynthesizer',{model:model.id,input:{text:record.body.text_snapshot,voice:remoteVoice,format:'wav',sample_rate:24000}},key,controller.signal)
     :await this.post('/services/aigc/multimodal-generation/generation',{model:model.id,input:{text:record.body.text_snapshot,voice:remoteVoice,language_type:record.body.language}},key,controller.signal);
    const url=normalizeAudioUrl(result.output?.audio?.url);
    const response=await this.fetch(url,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(120000)]),redirect:'error'});
    if(!response.ok)throw new Error(`下载云端音频失败 (${response.status})`);bytes=await this.readLimited(response,30*1024*1024);
    const length=response.headers.get('content-length');if(length&&(!response.headers.get('content-encoding')||response.headers.get('content-encoding')==='identity')&&Number(length)!==bytes.length)throw new Error('音频下载不完整，请稍后重试');
    fs.mkdirSync(downloadDirectory,{recursive:true,mode:0o700});const staging=downloadFile+'.tmp';try{fs.writeFileSync(staging,bytes,{mode:0o600});fs.renameSync(staging,downloadFile);}finally{if(fs.existsSync(staging))fs.unlinkSync(staging);}
    }
    bytes=normalizeCloudWav(bytes);
   }
   if(controller.signal.aborted)throw new Error('任务已取消');
   const metadata=parseWav(bytes),assetId=newId(),relative=`assets/${assetId}.wav`,filename=path.join(s.directory,relative);
   fs.writeFileSync(temporary,bytes,{mode:0o600});const fd=fs.openSync(temporary,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temporary,filename);
   try{s.store.transaction(()=>{
    s.store.put({type:'asset',profile_id:s.profileId,relative_path:relative,sha256:hash(bytes),media_type:'audio/wav',byte_size:bytes.length,...metadata},{id:assetId});
    const current=s.entity(id,'synthesis');s.update(current,{status:'succeeded',asset_id:assetId,...metadata,completed_at:Date.now(),links:[...current.body.links,{relation:'asset',target_id:assetId}]});
    s.update(s.entity(job.block_id,'job'),{status:'succeeded',completed_at:Date.now()});
   });}catch(error){fs.unlinkSync(filename);throw error;}
   if(fs.existsSync(downloadFile))fs.unlinkSync(downloadFile);
  }catch(error){
   const status=controller.signal.aborted?'cancelled':'failed';
   // Provider response bodies and API keys never enter job logs.
   const message=String(error.message||'合成失败').replace(/sk-[A-Za-z0-9_-]+/g,'[redacted]').slice(0,1000);
   s.store.transaction(()=>{s.update(s.entity(id,'synthesis'),{status,error:message});s.update(s.entity(job.block_id,'job'),{status,error:message});});
  }finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);this.active=null;this.onChange();}
 }
 async readLimited(response,max){const chunks=[];let total=0;for await(const chunk of response.body){total+=chunk.length;if(total>max)throw new Error('云端响应超过大小限制');chunks.push(Buffer.from(chunk));}return Buffer.concat(chunks);}
 async post(endpoint,payload,key,signal,extraHeaders={}){
  const response=await this.fetch(BASE+endpoint,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json',...extraHeaders},body:JSON.stringify(payload),redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(120000)])});
  if(!response.ok)throw new Error(`千问AI平台请求失败 (${response.status})，请检查密钥、余额或平台控制台。`);
  const result=JSON.parse((await this.readLimited(response,1024*1024)).toString('utf8'));
  if(result.code)throw new Error('千问AI平台返回业务错误，请在平台控制台检查请求。');return result;
 }
 runLocal(python,request,signal){return new Promise((resolve,reject)=>{
  const child=spawn(python,[path.join(__dirname,'../workers/qwen_tts_worker.py')],{stdio:['pipe','pipe','pipe'],env:{...process.env,HF_HUB_OFFLINE:'1',TRANSFORMERS_OFFLINE:'1'}});
  let output='';const timer=setTimeout(()=>child.kill('SIGTERM'),20*60*1000);const abort=()=>child.kill('SIGTERM');signal.addEventListener('abort',abort,{once:true});
  child.stdout.on('data',chunk=>{output+=chunk;if(output.length>64000)child.kill('SIGTERM');});child.stderr.on('data',()=>{});
  child.once('error',reject);child.stdin.on('error',()=>{});
  child.once('close',code=>{clearTimeout(timer);signal.removeEventListener('abort',abort);try{const result=JSON.parse(output.trim());if(code!==0||!result.ok)reject(new Error(result.error||'本地合成失败'));else resolve(result);}catch{reject(new Error(signal.aborted?'任务已取消':'本地 worker 运行失败或超时，请检查模型环境'));}});
  child.stdin.end(JSON.stringify(request));
 });}
 close(){this.closed=true;this.active?.controller.abort();return this.busy?new Promise(resolve=>{this.resolveClose=resolve;}):Promise.resolve();}
}
module.exports={Speech,CLOUD_MODEL,BASE,LANGUAGES};
