const fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');
const SCHEMA='sayagain-watch-v1',RATE=16000,MAX_FILE=25*1024*1024;
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const integer=(value,min=0)=>Number.isSafeInteger(value)&&value>=min;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function elapsed(value){
 if(integer(value))return String(value);
 if(typeof value==='string'&&/^(0|[1-9][0-9]{0,23})$/.test(value))return value;
 throw Error('手表单调时钟格式无效');
}
function inspectWatchWav(bytes,sampleCount){
 if(!Buffer.isBuffer(bytes))bytes=Buffer.from(bytes);
 if(bytes.length<46||bytes.length>MAX_FILE||bytes.toString('ascii',0,4)!=='RIFF'||bytes.readUInt32LE(4)!==bytes.length-8||bytes.toString('ascii',8,16)!=='WAVEfmt '||bytes.readUInt32LE(16)!==16||bytes.readUInt16LE(20)!==1||bytes.readUInt16LE(22)!==1||bytes.readUInt32LE(24)!==RATE||bytes.readUInt32LE(28)!==RATE*2||bytes.readUInt16LE(32)!==2||bytes.readUInt16LE(34)!==16||bytes.toString('ascii',36,40)!=='data'||bytes.readUInt32LE(40)!==bytes.length-44||(bytes.length-44)%2)throw Error('手表音频需要完整的 16000 Hz 单声道 16 位 PCM WAV');
 const count=(bytes.length-44)/2;
 if(sampleCount!==undefined&&count!==sampleCount)throw Error('手表音频采样数与清单不符');
 if(count>RATE*600)throw Error('手表单片音频不能超过10分钟');
 return count;
}
function validateWatchClip(input,bytes){
 const w=input.watch;
 if(!w||w.schema!==SCHEMA||!uuid(w.device_id)||!uuid(w.session_id)||!integer(w.index)||w.chunk_id!==`${w.session_id}_${w.index}`||input.client_id!==w.chunk_id||!integer(w.sample_start)||!integer(w.sample_count,1)||!integer(w.sample_start+w.sample_count)||!integer(w.started_at_ms)||w.started_at_ms+w.sample_start/RATE*1000>8640000000000000||typeof w.recovered!=='boolean'||!integer(w.continuity_id??0))throw Error('手表片段元数据无效');
 inspectWatchWav(bytes,w.sample_count);
 return {schema:SCHEMA,kind:'chunk',device_id:w.device_id,session_id:w.session_id,chunk_id:w.chunk_id,index:w.index,sample_start:w.sample_start,sample_count:w.sample_count,sample_rate:RATE,channels:1,bits_per_sample:16,started_at_ms:w.started_at_ms,started_elapsed_ns:elapsed(w.started_elapsed_ns),recovered:w.recovered,continuity_id:w.continuity_id??0};
}
function readRegular(filename,max){
 const stat=fs.lstatSync(filename);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>max)throw Error('手表导入文件无效、过大或为符号链接');
 const fd=fs.openSync(filename,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
 try{
  const opened=fs.fstatSync(fd);
  if(!opened.isFile()||opened.size!==stat.size||opened.ino!==stat.ino||opened.dev!==stat.dev)throw Error('手表导入文件在读取时改变');
  const bytes=fs.readFileSync(fd);
  if(bytes.length!==stat.size)throw Error('手表导入文件在读取时改变');
  return bytes;
 }finally{fs.closeSync(fd);}
}
function validateManifest(value){
 if(!value||value.schema!==SCHEMA||!uuid(value.device_id)||!uuid(value.session_id)||value.sample_rate!==RATE||value.channels!==1||value.bits_per_sample!==16||!integer(value.started_at_ms)||value.started_at_ms>8640000000000000||!integer(value.samples_captured)||!integer(value.durable_samples)||value.durable_samples>value.samples_captured||!['recording','completed','interrupted','error'].includes(value.status)||!Array.isArray(value.chunks)||value.chunks.length>10000||!Array.isArray(value.gaps)||value.gaps.length>1000)throw Error('手表录音清单无效');
 const sealed_samples=value.sealed_samples??value.durable_samples,chunk_seconds=value.chunk_seconds??60;
 if(!integer(sealed_samples)||sealed_samples>value.durable_samples||!integer(chunk_seconds,1)||chunk_seconds>600||value.durable_samples-sealed_samples>chunk_seconds*RATE||(!['recording','error'].includes(value.status)&&value.durable_samples!==sealed_samples)||(value.sealed_samples!==undefined&&value.status==='completed'&&value.samples_captured!==sealed_samples))throw Error('手表清单已封口、已落盘或采集计数无效');
 const started_elapsed_ns=elapsed(value.started_elapsed_ns),seen=new Set();
 const chunks=value.chunks.map((c,index)=>{
  if(!c||c.index!==index||c.id!==`${value.session_id}_${index}`||c.file!==`${String(index).padStart(6,'0')}.wav`||seen.has(c.file)||!integer(c.sample_start)||!integer(c.sample_count,1)||!integer(c.sample_start+c.sample_count)||c.sample_start+c.sample_count>sealed_samples||c.byte_size!==44+c.sample_count*2||c.byte_size>MAX_FILE||c.sample_count>RATE*chunk_seconds||typeof c.sha256!=='string'||!/^[0-9a-f]{64}$/.test(c.sha256)||c.status!=='sealed'||typeof c.recovered!=='boolean')throw Error('手表分片清单、路径或采样范围无效');
  seen.add(c.file);return {id:c.id,index,file:c.file,sample_start:c.sample_start,sample_count:c.sample_count,byte_size:c.byte_size,sha256:c.sha256,status:'sealed',recovered:c.recovered};
 });
 let previousEnd=0;
 const gaps=value.gaps.map(g=>{
  if(!g||!integer(g.sample_start)||!integer(g.sample_count)||!integer(g.sample_start+g.sample_count)||g.sample_start<previousEnd||g.sample_start+g.sample_count>value.samples_captured||typeof g.reason!=='string'||!g.reason.trim()||g.reason.length>200)throw Error('手表录音中断范围无效');
  previousEnd=g.sample_start+g.sample_count;return {sample_start:g.sample_start,sample_count:g.sample_count,reason:g.reason};
 });
 if(gaps.some(g=>g.sample_count===0&&chunks.some(c=>c.sample_start<g.sample_start&&c.sample_start+c.sample_count>g.sample_start)))throw Error('未知时长的中断事件必须位于分片边界');
 const ranges=[...chunks.map(c=>({start:c.sample_start,end:c.sample_start+c.sample_count})),...gaps.filter(g=>g.sample_count>0&&g.sample_start<sealed_samples).map(g=>({start:g.sample_start,end:Math.min(g.sample_start+g.sample_count,sealed_samples)}))].sort((a,b)=>a.start-b.start);
 let cursor=0;
 for(const range of ranges){if(range.start!==cursor)throw Error('手表清单有未声明的缺口、重叠或乱序');cursor=range.end;}
 if(cursor!==sealed_samples||chunks.some((c,i)=>i>0&&c.sample_start<chunks[i-1].sample_start+chunks[i-1].sample_count)||(value.sealed_samples!==undefined&&chunks.reduce((n,c)=>n+c.sample_count,0)!==sealed_samples))throw Error('手表分片未完整覆盖已封口采样或存在重叠');
 return {schema:SCHEMA,device_id:value.device_id,session_id:value.session_id,sample_rate:RATE,channels:1,bits_per_sample:16,chunk_seconds,started_at_ms:value.started_at_ms,started_elapsed_ns,samples_captured:value.samples_captured,durable_samples:value.durable_samples,sealed_samples,status:value.status,chunks,gaps};
}
function snapshot(manifest){const {chunks,...rest}=manifest;return {...rest,chunk_count:chunks.length,clock_source:'device_clock',time_reliability:'unverified'};}
function checkPrevious(previous,manifest,raw){
 if(!previous)return;
 for(const key of ['schema','device_id','session_id','sample_rate','channels','bits_per_sample','started_at_ms','started_elapsed_ns'])if(previous[key]!==manifest[key])throw Error('同一手表会话的原始元数据改变');
 const previousSealed=previous.sealed_samples??previous.durable_samples;
 const recoveredTail=previous.status==='error'&&manifest.sealed_samples>previousSealed&&['error','interrupted'].includes(manifest.status)&&manifest.chunks.length>previous.chunk_count&&manifest.chunks.slice(previous.chunk_count).every(c=>c.recovered);
 const previousGaps=recoveredTail?previous.gaps.filter(g=>g.sample_start<previousSealed):previous.gaps;
 if(manifest.chunk_seconds!==(previous.chunk_seconds??60))throw Error('同一手表会话的分片长度改变');
 if(manifest.samples_captured<previous.samples_captured||manifest.durable_samples<previous.durable_samples||manifest.sealed_samples<previousSealed||manifest.chunks.length<previous.chunk_count||JSON.stringify(manifest.gaps.slice(0,previousGaps.length))!==JSON.stringify(previousGaps))throw Error('同一手表会话的清单回退或中断记录改变');
 if(previous.status!=='recording'&&!recoveredTail&&(manifest.status!==previous.status||manifest.samples_captured!==previous.samples_captured||manifest.durable_samples!==previous.durable_samples||manifest.sealed_samples!==previousSealed||manifest.chunks.length!==previous.chunk_count||JSON.stringify(manifest.gaps)!==JSON.stringify(previous.gaps)))throw Error('已结束的手表会话清单改变');
 for(const clip of raw){
  const w=clip.body.watch,c=manifest.chunks[w.index];
  if(!c||c.id!==w.chunk_id||c.sample_start!==w.sample_start||c.sample_count!==w.sample_count||c.sha256!==clip.body.sha256||c.recovered!==w.recovered||watchFor(manifest,c).continuity_id!==(w.continuity_id??0))throw Error('同一手表片段的清单或内容改变');
 }
}
function watchFor(manifest,chunk){return {schema:SCHEMA,device_id:manifest.device_id,session_id:manifest.session_id,chunk_id:chunk.id,index:chunk.index,sample_start:chunk.sample_start,sample_count:chunk.sample_count,started_at_ms:manifest.started_at_ms,started_elapsed_ns:manifest.started_elapsed_ns,recovered:chunk.recovered,continuity_id:manifest.gaps.filter(g=>g.sample_count===0&&g.sample_start<=chunk.sample_start).length};}
function importWatchSession(service,manifestPath,{recording_id,title}={}){
 const filename=path.resolve(manifestPath),folder=path.dirname(filename),directory=fs.lstatSync(folder);
 if(!directory.isDirectory()||directory.isSymbolicLink())throw Error('手表会话目录不能为符号链接');
 if(path.basename(filename)!=='manifest.json')throw Error('请选择手表会话的 manifest.json');
 const manifest=validateManifest(JSON.parse(readRegular(filename,4*1024*1024).toString('utf8')));
 const sessions=service.store.list('recording').filter(r=>r.body.watch?.device_id===manifest.device_id&&r.body.watch?.session_id===manifest.session_id);
 if(sessions.length>1)throw Error('本地有重复的手表会话，请检查数据');
 let session=sessions[0];
 if(recording_id&&session&&session.block_id!==recording_id)throw Error('此手表会话已导入另一份录音');
 if(recording_id&&!session){const target=service.entity(recording_id,'recording');if(target.body.watch)throw Error('此录音已有另一份手表会话');session=target;}
 if(session&&session.body.status!=='active')throw Error('请先恢复已归档的手表会话');
 if(session&&(require('./recording-import.cjs').isBusy(session.block_id)||require('./recording-models.cjs').isBusy(service,session.block_id)))throw Error('此会话有任务正在处理');
 const raw=session?service.store.list('recording_clip').filter(c=>c.body.recording_id===session.block_id&&c.body.watch?.kind==='chunk'):[];
 checkPrevious(session?.body.watch,manifest,raw);
 const existing=new Map(raw.map(c=>[c.body.watch.index,c]));
 let staging;
 try{
  // Validate the entire snapshot and stage new bytes before creating any entities.
  // Later disk/DB failures may leave acknowledged chunks, which a retry reuses.
  staging=fs.mkdtempSync(path.join(service.directory,'.watch-import-'));
  const root=fs.realpathSync(folder);
  for(const chunk of manifest.chunks){
   const source=path.join(folder,chunk.file);
   if(path.dirname(fs.realpathSync(source))!==root)throw Error('手表分片路径越出会话目录');
   const bytes=readRegular(source,MAX_FILE);
   if(bytes.length!==chunk.byte_size||digest(bytes)!==chunk.sha256)throw Error(`手表分片 ${chunk.file} 长度或 SHA-256 校验失败`);
   inspectWatchWav(bytes,chunk.sample_count);
   const previous=existing.get(chunk.index);
   if(previous){
    const saved=readRegular(service.asset(previous.body.asset_id).filename,MAX_FILE);
    if(saved.length!==chunk.byte_size||digest(saved)!==chunk.sha256)throw Error('本地已保存的手表音频损坏，不能返回保存确认');
   }else{
    const fd=fs.openSync(path.join(staging,chunk.file),'wx',0o600);
    try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
   }
  }
  session=service.store.transaction(()=>{
   const current=session?service.entity(session.block_id,'recording'):service.createRecording({title:title||`手表录音 ${manifest.session_id.slice(0,8)}`});
   return service.update(current,{watch:snapshot(manifest),original_time:{value_ms:manifest.started_at_ms,source:'device_clock',reliability:'unverified'},watch_import_status:'importing'});
  });
  const acknowledgements=[];let imported_count=0;
  for(const chunk of manifest.chunks){
   let clip=existing.get(chunk.index);
   if(!clip){
    const bytes=readRegular(path.join(staging,chunk.file),MAX_FILE);
    if(digest(bytes)!==chunk.sha256)throw Error('暂存的手表分片校验失败');
    clip=service.addRecordingClip({recording_id:session.block_id,client_id:chunk.id,source:'watch',source_name:`手表 ${manifest.session_id.slice(0,8)}`,bytes,watch:watchFor(manifest,chunk)});imported_count++;
   }
   acknowledgements.push({id:chunk.id,index:chunk.index,sha256:chunk.sha256,status:'STORED',clip_id:clip.block_id});
  }
  session=service.update(service.entity(session.block_id,'recording'),{watch_import_status:'stored',watch_imported_chunks:manifest.chunks.length,watch_imported_at:Date.now()});
  return {recording_id:session.block_id,session,watch_status:manifest.status,imported_count,stored_count:acknowledgements.length,chunks:acknowledgements,pending_capture_samples:manifest.samples_captured-manifest.sealed_samples,durable_unsealed_samples:manifest.durable_samples-manifest.sealed_samples,gaps:manifest.gaps};
 }finally{if(staging)fs.rmSync(staging,{recursive:true,force:true});}
}
module.exports={importWatchSession,validateManifest,inspectWatchWav,validateWatchClip,SCHEMA};
