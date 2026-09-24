const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const names={silero:'Silero VAD',fsmn:'FSMN VAD',sensevoice:'SenseVoice INT8',campplus:'CAMPPlus',zipformer:'Zipformer 关键词'};
function runtime(directory){try{return JSON.parse(fs.readFileSync(path.join(directory,'recording-models/runtime.json'),'utf8'));}catch{return null;}}
function status(directory){const data=runtime(directory);return Object.entries(names).filter(([key])=>['silero','campplus','sensevoice'].includes(key)||(key==='fsmn'&&!data?.models?.silero)).map(([key,name])=>{const m=data?.models?.[key];return{name,key,device:data?.device||'cpu',status:!m||!fs.existsSync(m.path)?'未登记或文件缺失':m.verified?'本机推理验证通过':'已下载登记 · 待推理验证'};});}
const running=new Set();
async function transcribe(service,directory,input){
 const clip=service.entity(input.id,'recording_clip'),r=runtime(directory);
 if(require('./recording-import.cjs').isBusy(clip.body.recording_id)||clip.body.status==='archived')throw Error('会话正在重新分段或片段已替换');
 const turns=require('./confirmed-turns.cjs').transcribable(clip);
 if(module.exports.isBusy(service,clip.body.recording_id))throw Error('此会话正在处理，请等待完成');
 if(!r?.python||!['sensevoice'].every(k=>r.models?.[k]&&fs.existsSync(r.models[k].path)))throw Error('请先让 Skill 安装并登记 SenseVoice');
 running.add(input.id);
 try{
  const result=await new Promise((resolve,reject)=>{
   const child=spawn(r.python,[path.join(__dirname,'../workers/transcribe_recording.py')],{windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONIOENCODING:'utf-8'}});let output='';
   const timer=setTimeout(()=>child.kill(),180000);
   child.stdout.on('data',chunk=>{output+=chunk;if(output.length>200000)child.kill();});child.stderr.on('data',()=>{});child.stdin.on('error',()=>{});
   child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',code=>{clearTimeout(timer);try{const value=JSON.parse(output);if(code||value.error)reject(Error(value.error||'转写失败'));else resolve(value);}catch{reject(Error('本地转写超时或输出无效'));}});
   child.stdin.end(JSON.stringify({models:r.models,language:clip.body.transcription_language||'auto',turns,audio:service.asset(clip.body.asset_id).filename}));
  });
  const current=service.entity(input.id,'recording_clip');if(current.body.revision!==clip.body.revision)throw Error('文字已被修改，未覆盖；请重新转写');
  if(typeof result.text!=='string'||result.text.length>20000||!Array.isArray(result.segments))throw Error('转写结果无效');
  return service.update(current,{transcript:result.text,transcript_segments:result.segments,transcript_status:'machine_unreviewed',transcript_turns_stale:false});
 }finally{running.delete(input.id);}
}
module.exports={status,transcribe};

const analyzing=new Set();
async function analyze(service,directory,input,onProgress=()=>{}){
 if(require('./recording-import.cjs').isBusy(input.id))throw Error('此会话正在导入或重新分段');
 const session=service.entity(input.id,'recording'),r=runtime(directory),mode=input.mode;
 if(!['speakers','keywords'].includes(mode))throw Error('无效分析模式');
 const keywords=mode==='keywords'?String(input.keywords||'').split(/[\n,，]/).map(x=>x.trim()).filter(Boolean):[];
 if(mode==='keywords'&&(!keywords.length||keywords.length>20||keywords.some(x=>x.length>60||! /^[\p{L}\p{N} '\-]+$/u.test(x))))throw Error('请输入1–20个中英文关键词，每个不超过60字');
 const required=mode==='speakers'?['fsmn','campplus']:['zipformer'];
 if(!r?.python||!required.every(k=>r.models?.[k]&&fs.existsSync(r.models[k].path)))throw Error('请先让 Skill 登记所需模型');
 if(analyzing.has(input.id))throw Error('此会话正在分析');
 const clips=service.store.list('recording_clip').filter(c=>c.body.recording_id===input.id&&c.body.status!=='archived').sort((a,b)=>a.body.sequence-b.body.sequence);
 if(!clips.length)throw Error('请先录音或导入音频，再开始分析');
 analyzing.add(input.id);
 try{
  onProgress({completed:0,total:clips.length});
  const result=await require('./analysis-worker.cjs').runAnalysisWorker(r.python,path.join(__dirname,'../workers/analyze_recording.py'),{
   mode,keywords,models:r.models,clips:clips.map(c=>({id:c.block_id,audio:service.asset(c.body.asset_id).filename}))
  },onProgress);
  if(!Array.isArray(result.clips)||result.clips.length!==clips.length||result.clips.some((c,i)=>c.id!==clips[i].block_id||!Array.isArray(c.segments)))throw Error('无效分析结果');
  return service.store.transaction(()=>{
   if(service.entity(input.id,'recording').body.revision!==session.body.revision)throw Error('会话已改变，请重新分析');
   const field=mode==='speakers'?'speaker_analysis':'keyword_analysis';
   if(mode==='speakers'&&clips.some(c=>service.entity(c.block_id,'recording_clip').body.revision!==c.body.revision))throw Error('确认内容已改变，请重试');
   for(const item of result.clips){const clip=service.entity(item.id,'recording_clip');service.update(clip,{...(mode==='speakers'?{transcript_turns_stale:!!clip.body.transcript}:{}),[field]:{segments:item.segments,created_at:Date.now(),status:'machine_unreviewed'}});}
   return service.update(session,{[field]:{created_at:Date.now(),keywords,clip_count:clips.length,status:'machine_unreviewed'}});
  });
 }finally{analyzing.delete(input.id);}
}
module.exports.analyze=analyze;

module.exports.isBusy=(service,id)=>analyzing.has(id)||service.store.list('recording_clip').some(c=>c.body.recording_id===id&&running.has(c.block_id));

async function transcribeAll(service,directory,input,onProgress=()=>{}){
 if(module.exports.isBusy(service,input.id)||require('./recording-import.cjs').isBusy(input.id))throw Error('此会话有任务正在处理');
 const r=runtime(directory),session=service.entity(input.id,'recording');
 if(!r?.python||!['sensevoice'].every(k=>r.models?.[k]&&fs.existsSync(r.models[k].path)))throw Error('请先登记 SenseVoice');
 const clips=service.store.list('recording_clip').filter(c=>c.body.recording_id===input.id&&c.body.status!=='archived'&&c.body.transcript_status!=='user_reviewed').sort((a,b)=>a.body.sequence-b.body.sequence);
 if(!clips.length)return;
 for(const clip of clips)require('./confirmed-turns.cjs').transcribable(clip);
 analyzing.add(input.id);
 try{
  onProgress({completed:0,total:clips.length});
  await require('./analysis-worker.cjs').runAnalysisWorker(r.python,path.join(__dirname,'../workers/transcribe_recording_batch.py'),{models:r.models,clips:clips.map(c=>({id:c.block_id,language:c.body.transcription_language||'auto',turns:require('./confirmed-turns.cjs').transcribable(c),audio:service.asset(c.body.asset_id).filename}))},onProgress,{onClip:item=>{
   const current=service.entity(item.id,'recording_clip'),original=clips.find(c=>c.block_id===item.id);
   if(current.body.revision!==original.body.revision||service.entity(input.id,'recording').body.revision!==session.body.revision)throw Error('录音或文字已改变，已停止覆盖');
   if(typeof item.text!=='string'||item.text.length>20000)throw Error('转写结果无效');
   service.update(current,{transcript:item.text,transcript_segments:item.segments,transcript_status:'machine_unreviewed',transcript_turns_stale:false});
  }});
 }finally{analyzing.delete(input.id);}
}
module.exports.transcribeAll=transcribeAll;
