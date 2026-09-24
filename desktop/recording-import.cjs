const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),{createHash}=require('node:crypto');
const active=new Map();
function ffmpegPath(){
 const configured=process.env.SAYAGAIN_FFMPEG||require('ffmpeg-static');
 const executable=configured?.replace(/app\.asar([\\/])/,'app.asar.unpacked$1');
 if(!executable||!fs.existsSync(executable))throw Error('音频组件缺失，请运行 npm install 安装配套 FFmpeg');
 return executable;
}
function cancel(id){const job=active.get(id);if(job){job.cancelled=true;job.child?.kill();}return !!job;}
function close(){for(const id of active.keys())cancel(id);}
function discardUncommitted(service,job){for(const item of job.staged||[]){if(service.store.get(item.id))continue;const file=path.resolve(service.directory,item.relative);if(file.startsWith(path.resolve(service.directory,'assets')+path.sep)&&fs.existsSync(file))fs.unlinkSync(file);}}
function migrateLegacy(service,id){
 const clips=service.store.list('recording_clip').filter(c=>c.body.recording_id===id&&c.body.status!=='archived'&&!c.body.recording_source_id).sort((a,b)=>a.body.sequence-b.body.sequence);
 const groups=[];for(const clip of clips){let group=groups.at(-1);if(!group||group.name!==clip.body.source_name||clip.body.source_offset_ms<=group.last){group={name:clip.body.source_name,clips:[],last:-1};groups.push(group);}group.clips.push(clip);group.last=clip.body.source_offset_ms;}
 service.store.transaction(()=>{let sequence=service.store.list('recording_source').filter(s=>s.body.recording_id===id).length;for(const group of groups){const source=service.store.put({type:'recording_source',profile_id:service.profileId,recording_id:id,name:group.name,sequence:sequence++,input_assets:group.clips.map(c=>c.body.asset_id),legacy:true,duration_ms:group.clips.reduce((n,c)=>n+c.body.duration_ms,0)});for(const clip of group.clips)service.update(clip,{recording_source_id:source.block_id});}});
}
function ensureIdle(service,id){if(active.has(id)||require('./recording-models.cjs').isBusy(service,id))throw Error('此会话有任务正在处理，请稍后再试');}
async function importFiles(service,input,onProgress=()=>{},options={}){
 service.entity(input.id,'recording');
 if(!Array.isArray(input.paths)||!input.paths.length||input.paths.some(p=>typeof p!=='string'||!path.isAbsolute(p)))throw Error('请选择本机音频文件');
 ensureIdle(service,input.id);
 const executable=ffmpegPath(),job={cancelled:false,child:null};active.set(input.id,job);
 let saved=0;
 try{
  migrateLegacy(service,input.id);
  for(let fileIndex=0;fileIndex<input.paths.length;fileIndex++){
   if(job.cancelled)break;
   const filename=input.paths[fileIndex],name=path.basename(filename),stat=await fs.promises.stat(filename);
   if(!stat.isFile())throw Error('请选择音频文件');
   const key=createHash('sha256').update(JSON.stringify([path.resolve(filename),stat.size,stat.mtimeMs])).digest('hex');
   const progress=value=>onProgress({id:input.id,file:name,fileIndex:fileIndex+1,fileCount:input.paths.length,saved,...value});
   progress({stage:'preserving',processedMs:0});
   let source=service.store.list('recording_source').find(s=>s.body.recording_id===input.id&&s.body.import_key===key);
   if(!source){
    const {newId}=require('../storage/store.cjs'),id=newId(),ext=path.extname(name).toLowerCase(),relative=`assets/${id}${/^[.][a-z0-9]{1,8}$/.test(ext)?ext:'.audio'}`;
    await fs.promises.copyFile(filename,path.join(service.directory,relative),fs.constants.COPYFILE_EXCL);
    source=service.store.transaction(()=>{service.store.put({type:'asset',profile_id:service.profileId,relative_path:relative,media_type:ext==='.mp3'?'audio/mpeg':ext==='.wav'?'audio/wav':ext==='.m4a'?'audio/mp4':'application/octet-stream',byte_size:stat.size},{id});return service.store.put({type:'recording_source',profile_id:service.profileId,recording_id:input.id,import_key:key,name,original_asset_id:id,input_assets:[id],sequence:service.store.list('recording_source').filter(s=>s.body.recording_id===input.id).length,segmented:false,duration_ms:0});});
   }
   if(source.body.segmented){progress({stage:'file-complete',processedMs:source.body.duration_ms,durationMs:source.body.duration_ms});continue;}
   if(job.cancelled)break;
   const revision=service.entity(input.id,'recording').body.revision;
   const result=await (options.segmenter||require('./recording-segments.cjs').segment)(service,source,executable,progress,job);
   if(job.cancelled)break;
   require('./recording-segments.cjs').activate(service,input.id,[{source,...result}],revision);
   saved+=result.staged.length;progress({stage:'file-complete',processedMs:result.duration_ms,durationMs:result.duration_ms,saved});
  }
  return {saved,cancelled:job.cancelled};
 }catch(error){if(job.cancelled)return{saved,cancelled:true};throw Error(`${error.message}。原音频已保存的部分会保留，可重新分析。`);}
 finally{discardUncommitted(service,job);active.delete(input.id);}
}
async function resegment(service,input,onProgress=()=>{}){
 service.entity(input.id,'recording');ensureIdle(service,input.id);migrateLegacy(service,input.id);
 const sources=service.store.list('recording_source').filter(s=>s.body.recording_id===input.id).sort((a,b)=>a.body.sequence-b.body.sequence);
 if(!sources.length)throw Error('请先添加音频文件或录音');
 const job={cancelled:false,child:null};active.set(input.id,job);
 try{
  const results=[],revision=service.entity(input.id,'recording').body.revision;
  for(let i=0;i<sources.length;i++){
   const source=sources[i];const result=await require('./recording-segments.cjs').segment(service,source,ffmpegPath(),p=>onProgress({id:input.id,file:source.body.name,fileIndex:i+1,fileCount:sources.length,saved:results.reduce((n,r)=>n+r.staged.length,0),...p}),job);
   if(job.cancelled)throw Error('已停止，原分段已保留');results.push({source,...result});
  }
  require('./recording-segments.cjs').activate(service,input.id,results,revision);
  return {saved:results.reduce((n,r)=>n+r.staged.length,0)};
 }finally{discardUncommitted(service,job);active.delete(input.id);}
}
module.exports={importFiles,resegment,cancel,close,isBusy:id=>active.has(id),migrateLegacy};
