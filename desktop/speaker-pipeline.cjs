const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process');
const {createHash}=require('node:crypto');
const {newId}=require('../storage/store.cjs');
const {parseWav}=require('./audio.cjs');
function validateOptions(input={}){
 const language=input.language??'auto',speaker_count=input.speaker_count??0;
 if(!['auto','en','zh','ja','ko','yue'].includes(language))throw Error('无效的转写语言');
 if(!Number.isInteger(speaker_count)||speaker_count<0||speaker_count>8)throw Error('说话人数应为自动或1–8人');
 return{language,speaker_count};
}
function readRuntime(directory){
 let r;try{r=JSON.parse(fs.readFileSync(path.join(directory,'recording-models/runtime.json'),'utf8'));}catch{throw Error('请先按 Skill 说明登记本地录音模型');}
 if(!r.python||!['campplus','sensevoice'].every(k=>r.models?.[k]?.path&&fs.existsSync(r.models[k].path))||!['silero','fsmn'].some(k=>r.models?.[k]?.path&&fs.existsSync(r.models[k].path)))throw Error('需要 CAMPPlus、SenseVoice 和 Silero / FSMN VAD');
 return r;
}
function validateManifest(manifest,sources,folder){
 if(manifest.version!=='speaker-clips-v1'||!Array.isArray(manifest.clips)||!manifest.clips.length||manifest.clips.length>10000)throw Error('分段结果无效或没有语音');
 const files=new Set(),last=new Map();let previousSource=-1;
 return manifest.clips.map(c=>{
  if(!Number.isInteger(c.source_index)||!sources[c.source_index]||c.source_index<previousSource||!Number.isInteger(c.start_ms)||!Number.isInteger(c.end_ms)||c.start_ms<0||c.end_ms<=c.start_ms||c.end_ms-c.start_ms>18001||c.start_ms<(last.get(c.source_index)||0))throw Error('分段时间戳无效');
  previousSource=c.source_index;last.set(c.source_index,c.end_ms);
  if(sources[c.source_index].duration_ms&&c.end_ms>sources[c.source_index].duration_ms+2)throw Error('分段超过原片段范围');
  if(!(c.speaker===null||/^[A-H]$/.test(c.speaker))||!Number.isFinite(c.similarity)||Math.abs(c.similarity)>1.001||typeof c.review!=='boolean'||typeof c.text!=='string'||c.text.length>20000)throw Error('说话人或转写结果无效');
  if(!/^\d{5}\.wav$/.test(c.file)||files.has(c.file))throw Error('分段文件名无效');files.add(c.file);
  const filename=path.join(folder,c.file),stat=fs.lstatSync(filename);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1024*1024)throw Error('分段音频无效');
  const bytes=fs.readFileSync(filename),format=parseWav(bytes);
  if(Math.abs(format.duration_ms-(c.end_ms-c.start_ms))>2)throw Error('音频长度与时间戳不符');
  return{...c,format,filename};
 });
}
function persist(service,folder,manifest,sources,title,parent){
 const rows=validateManifest(manifest,sources,folder),created=[],recordingId=newId();
 try{
  const prepared=rows.map(c=>{
   const asset_id=newId(),relative_path=`assets/${asset_id}.wav`,filename=path.join(service.directory,relative_path);
   const bytes=fs.readFileSync(c.filename),fd=fs.openSync(filename,'wx',0o600);created.push(filename);
   try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
   return{...c,asset_id,relative_path,sha256:createHash('sha256').update(bytes).digest('hex'),byte_size:bytes.length};
  });
  return service.store.transaction(()=>{
   if(parent){
    if(service.entity(parent.block_id,'recording').body.revision!==parent.body.revision)throw Error('原会话已改变，请重新处理');
    for(const source of sources)if(service.entity(source.id,'recording_clip').body.revision!==source.revision)throw Error('原片段已改变，请重新处理');
   }
   const {clips,...run}=manifest;
   const session=service.store.put({type:'recording',profile_id:service.profileId,title:String(title+' · 分人语音条').slice(0,120),clip_count:prepared.length,duration_ms:prepared.reduce((n,c)=>n+c.format.duration_ms,0),pipeline:{...run,created_at:Date.now(),review_count:prepared.filter(c=>c.review).length,status:'machine_unreviewed'},links:parent?[{relation:'source_recording',target_id:parent.block_id}]:[]},{id:recordingId});
   for(const [sequence,c] of prepared.entries()){
    const source=sources[c.source_index];
    service.store.put({type:'asset',profile_id:service.profileId,relative_path:c.relative_path,sha256:c.sha256,media_type:'audio/wav',byte_size:c.byte_size,duration_ms:c.format.duration_ms},{id:c.asset_id});
    service.store.put({type:'recording_clip',profile_id:service.profileId,recording_id:recordingId,client_id:newId(),asset_id:c.asset_id,sha256:c.sha256,sequence,source:'import',source_name:source.name,source_offset_ms:(source.offset_ms||0)+c.start_ms,captured_at:source.captured_at?source.captured_at+c.start_ms:null,imported_at:Date.now(),...c.format,transcript:c.text,transcript_status:'machine_unreviewed',transcript_segments:[{start_ms:0,end_ms:c.format.duration_ms,text:c.text,speaker:c.speaker}],speaker:c.speaker,speaker_similarity:c.similarity,needs_review:c.review,source_clip_id:source.id||null,source_clip_start_ms:c.start_ms,source_clip_end_ms:c.end_ms,pipeline_version:manifest.version,links:[{relation:'recording',target_id:recordingId},{relation:'asset',target_id:c.asset_id},...(source.id?[{relation:'source_clip',target_id:source.id}]:[])]});
   }
   return session;
  });
 }catch(error){for(const filename of created)fs.rmSync(filename,{force:true});throw error;}
}
class SpeakerPipeline{
 constructor(service,directory,onChange=()=>{}){this.service=service;this.directory=directory;this.onChange=onChange;this.job=null;this.child=null;}
 status(){return this.job?{...this.job}:{state:'idle'};}
 start(input){
  if(this.job?.state==='running')throw Error('已有分人转写任务正在运行');
  const settings=validateOptions(input.options),runtime=readRuntime(this.directory);let sources,parent,title;
  if(input.filename){
   const filename=path.resolve(input.filename),stat=fs.statSync(filename);
   if(!stat.isFile()||stat.size>2*1024**3)throw Error('请选择不超过2GB的音频文件');
   sources=[{audio:filename,name:path.basename(filename),offset_ms:0}];title=path.basename(filename,path.extname(filename));
  }else{
   parent=this.service.entity(input.id,'recording');title=parent.body.title;
   sources=this.service.store.list('recording_clip').filter(c=>c.body.recording_id===input.id).sort((a,b)=>a.body.sequence-b.body.sequence).map(c=>({id:c.block_id,revision:c.body.revision,audio:this.service.asset(c.body.asset_id).filename,name:c.body.source_name,offset_ms:c.body.source_offset_ms,duration_ms:c.body.duration_ms,captured_at:c.body.captured_at}));
   if(!sources.length||sources.length>2000)throw Error('支持1–2000个原始片段');
   if(sources.reduce((n,c)=>n+c.duration_ms,0)>14400000)throw Error('一次最多处理4小时音频');
  }
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'sayagain-speaker-'));
  this.job={id:newId(),state:'running',stage:'starting',done:0,total:0,started_at:Date.now()};
  let child;try{child=spawn(runtime.python,[path.join(__dirname,'../workers/speaker_pipeline.py')],{detached:process.platform!=='win32',windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONIOENCODING:'utf-8',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'4'}});}catch(e){fs.rmSync(folder,{recursive:true,force:true});this.job={...this.job,state:'failed',error:e.message};throw e;}
  this.child=child;let output='',stderr='',lastError='',cancelled=false,timedOut=false,settled=false;
  const finish=(error)=>{
   if(settled)return;settled=true;clearTimeout(timer);this.child=null;
   try{
    if(cancelled){this.job={...this.job,state:'cancelled',stage:'cancelled'};return;}
    if(error)throw error;
    const result=JSON.parse(output);if(result.error)throw Error(result.error);
    const manifest=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'),'utf8'));
    const session=persist(this.service,folder,manifest,sources,title,parent);
    this.job={...this.job,state:'completed',stage:'complete',recording_id:session.block_id,clip_count:session.body.clip_count,review_count:session.body.pipeline.review_count};this.onChange();
   }catch(e){this.job={...this.job,state:'failed',error:e.message};}
   finally{fs.rmSync(folder,{recursive:true,force:true});}
  };
  const timer=setTimeout(()=>{timedOut=true;this.kill();},2*60*60*1000);
  this.cancelCurrent=()=>{cancelled=true;this.kill();};
  child.stdout.on('data',chunk=>{output+=chunk;if(output.length>65536){lastError='处理输出过大';this.kill();}});
  child.stderr.on('data',chunk=>{
   stderr=(stderr+chunk).slice(-32768);let line;
   while(stderr.includes('\n')){const at=stderr.indexOf('\n');line=stderr.slice(0,at);stderr=stderr.slice(at+1);try{const p=JSON.parse(line);if(['decode','voiceprints','cluster','transcribe','complete'].includes(p.stage))this.job={...this.job,stage:p.stage,done:p.done,total:p.total};}catch{/* third-party diagnostic, not user progress */}}
  });
  child.stdin.on('error',()=>{});child.on('error',finish);
  child.on('close',code=>{let message=lastError;try{message=JSON.parse(output).error||message;}catch{}finish(code!==0?Error(message||(timedOut?'处理超时':'本地模型处理失败，请检查依赖和 FFmpeg')):null);});
  child.stdin.end(JSON.stringify({models:runtime.models,ffmpeg:runtime.ffmpeg||'ffmpeg',sources,options:settings,output_dir:folder}));
  return this.status();
 }
 kill(){if(!this.child)return;try{if(process.platform==='win32')spawn('taskkill',['/pid',String(this.child.pid),'/T','/F'],{windowsHide:true});else process.kill(-this.child.pid,'SIGKILL');}catch{this.child.kill();}}
 cancel(){if(this.job?.state==='running')this.cancelCurrent?.();return this.status();}
 close(){this.cancel();}
}
module.exports={SpeakerPipeline,validateOptions,validateManifest,persist,readRuntime};
