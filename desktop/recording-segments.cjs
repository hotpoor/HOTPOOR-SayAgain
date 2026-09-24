const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const {newId}=require('../storage/store.cjs'),{parseWav}=require('./audio.cjs');
function runtime(service){
 let r;try{r=JSON.parse(fs.readFileSync(path.join(service.directory,'../recording-models/runtime.json'),'utf8'));}catch{}
 if(!r?.python||!r.models?.fsmn||!fs.existsSync(r.models.fsmn.path))throw Error('请先安装并登记 FSMN VAD，才能按自然停顿分段');
 return r;
}
async function segment(service,source,ffmpeg,onProgress,job){
 const r=runtime(service),work=fs.mkdtempSync(path.join(service.directory,'vad-work-'));
 try{
  await new Promise((resolve,reject)=>{
   const child=spawn(r.python,[path.join(__dirname,'../workers/segment_recording.py')],{windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONIOENCODING:'utf-8'}});job.child=child;
   let buffer='',done=false,failure,timer;
   const arm=()=>{clearTimeout(timer);timer=setTimeout(()=>{failure=Error('自然分段长时间没有进展，请重试');child.kill();},600000);};arm();
   child.stdout.setEncoding('utf8');child.stdout.on('data',data=>{
    buffer+=data;try{let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!line.trim())continue;const value=JSON.parse(line);if(value.error)throw Error(value.error);arm();if(value.type==='done')done=true;else if(value.type==='progress')onProgress(value);}if(buffer.length>64000)throw Error('分段输出无效');}catch(error){failure=error;child.kill();}
   });
   child.stderr.on('data',()=>{});child.stdin.on('error',error=>{failure=error;});child.on('error',error=>{failure=error;});
   child.on('close',code=>{clearTimeout(timer);job.child=null;if(job.cancelled)reject(Error('已停止，原文件和原分段已保留'));else if(failure||code||!done)reject(failure||Error('自然分段失败，原文件和原分段已保留'));else resolve();});
   child.stdin.end(JSON.stringify({model:r.models.fsmn.path,ffmpeg,inputs:source.body.input_assets.map(id=>service.asset(id).filename),output:work}));
  });
  const result=JSON.parse(fs.readFileSync(path.join(work,'manifest.json'),'utf8'));
  if(!Array.isArray(result.clips)||!Number.isFinite(result.duration_ms))throw Error('分段结果无效');
  // Stage all assets before atomically switching which clips are visible.
  const staged=[];
  for(const item of result.clips){
   if(!/^clip_\d+\.wav$/.test(item.file)||!Number.isFinite(item.start_ms)||item.start_ms<0)throw Error('分段结果无效');
   const bytes=fs.readFileSync(path.join(work,item.file)),format=parseWav(bytes),id=newId(),relative=`assets/${id}.wav`;
   fs.writeFileSync(path.join(service.directory,relative),bytes,{flag:'wx'});
   const itemAsset={id,relative,format,bytes:bytes.length,offset:item.start_ms};staged.push(itemAsset);(job.staged??=[]).push(itemAsset);
  }
  return {staged,duration_ms:result.duration_ms};
 }finally{const resolved=path.resolve(work);if(resolved.startsWith(path.resolve(service.directory)+path.sep)&&path.basename(resolved).startsWith('vad-work-'))fs.rmSync(resolved,{recursive:true,force:true});}
}
function activate(service,sessionId,results,expectedRevision){
 return service.store.transaction(()=>{
  if(expectedRevision!==undefined&&service.entity(sessionId,'recording').body.revision!==expectedRevision)throw Error('会话已改变，未替换原分段，请重试');
  let sequence=0;const replaced=new Set(results.map(r=>r.source.block_id));
  const old=service.store.list('recording_clip').filter(c=>c.body.recording_id===sessionId&&c.body.status!=='archived');
  for(const clip of old){if(replaced.has(clip.body.recording_source_id))service.update(clip,{status:'archived',archived_at:Date.now()});}
  // Keep original order of files, then chronological order inside each source.
  const sources=service.store.list('recording_source').filter(s=>s.body.recording_id===sessionId).sort((a,b)=>a.body.sequence-b.body.sequence);
  for(const source of sources){
   const result=results.find(r=>r.source.block_id===source.block_id);
   if(!result){for(const clip of old.filter(c=>c.body.recording_source_id===source.block_id).sort((a,b)=>a.body.sequence-b.body.sequence))service.update(clip,{sequence:sequence++});continue;}
   const notes=old.filter(c=>c.body.recording_source_id===source.block_id&&c.body.transcript_status==='user_reviewed'&&c.body.transcript).map(c=>({offset_ms:c.body.source_offset_ms,text:c.body.transcript}));
   for(const item of result.staged){
    service.store.put({type:'asset',profile_id:service.profileId,relative_path:item.relative,media_type:'audio/wav',byte_size:item.bytes,duration_ms:item.format.duration_ms},{id:item.id});
    service.store.put({type:'recording_clip',profile_id:service.profileId,recording_id:sessionId,recording_source_id:source.block_id,client_id:`vad-${item.id}`,asset_id:item.id,sequence:sequence++,source:'import',source_name:source.body.name,source_offset_ms:item.offset,imported_at:Date.now(),...item.format,segmentation:'fsmn-vad',transcript:'',transcript_status:'not_started',links:[{relation:'recording',target_id:sessionId},{relation:'asset',target_id:item.id}]});
   }
   service.update(service.entity(source.block_id,'recording_source'),{duration_ms:result.duration_ms,segmented:true,retained_notes:[...(source.body.retained_notes||[]),...notes]});
  }
  const session=service.entity(sessionId,'recording');
  return service.update(session,{clip_count:sequence,duration_ms:sources.reduce((sum,s)=>sum+(results.find(r=>r.source.block_id===s.block_id)?.duration_ms||s.body.duration_ms||0),0),speaker_analysis:null,keyword_analysis:null});
 });
}
module.exports={segment,activate,runtime};
