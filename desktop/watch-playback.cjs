const fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');
const {newId}=require('../storage/store.cjs');
const RATE=16000,VERSION='watch-playback-v1',integer=(n,min=0)=>Number.isSafeInteger(n)&&n>=min;
function header(samples){
 if(!integer(samples,1)||36+samples*2>0xffffffff)throw Error('整次 WAV 音频超过可保存的长度');
 const b=Buffer.alloc(44);b.write('RIFF');b.writeUInt32LE(36+samples*2,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(RATE,24);b.writeUInt32LE(RATE*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(samples*2,40);return b;
}
function writeAll(fd,bytes){for(let at=0;at<bytes.length;){const n=fs.writeSync(fd,bytes,at,bytes.length-at);if(!n)throw Error('整次音频写入失败');at+=n;}}
function consumeWav(filename,samples,sha,onPcm=()=>{}){
 const before=fs.lstatSync(filename);
 if(!before.isFile()||before.isSymbolicLink()||before.size!==44+samples*2||!/^[0-9a-f]{64}$/.test(sha||''))throw Error('原录音音频文件或校验信息无效');
 const fd=fs.openSync(filename,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0)),hash=createHash('sha256');
 try{
  const stat=fs.fstatSync(fd);if(stat.size!==before.size||stat.ino!==before.ino||stat.dev!==before.dev)throw Error('录音文件在读取时改变');
  const h=Buffer.alloc(44);let position=0;
  while(position<44){const n=fs.readSync(fd,h,position,44-position,position);if(!n)throw Error('录音 WAV 头不完整');position+=n;}
  if(!h.equals(header(samples)))throw Error('录音需要完整的 16000 Hz 单声道 16 位 PCM WAV');hash.update(h);
  const buffer=Buffer.alloc(65536);
  while(position<stat.size){const n=fs.readSync(fd,buffer,0,Math.min(buffer.length,stat.size-position),position);if(!n)throw Error('录音 PCM 不完整');const part=buffer.subarray(0,n);hash.update(part);onPcm(part);position+=n;}
  if(hash.digest('hex')!==sha)throw Error('录音 SHA-256 校验失败，无法生成整次音频');
 }finally{fs.closeSync(fd);}
}
function collect(service,session){
 const w=session.body.watch;if(!w?.device_id||!w.session_id||w.sample_rate!==RATE||w.channels!==1||w.bits_per_sample!==16)throw Error('此会话不是有效的手表录音');
 const clips=service.store.list('recording_clip').filter(c=>c.body.recording_id===session.block_id&&c.body.source==='watch'&&c.body.watch?.kind==='chunk').sort((a,b)=>a.body.watch.index-b.body.watch.index);
 if(!clips.length)throw Error('尚无已保存的手表音频');
 const gaps=(w.gaps||[]).map(g=>({...g}));
 if(gaps.some(g=>!integer(g.sample_start)||!integer(g.sample_count)||!integer(g.sample_start+g.sample_count)||typeof g.reason!=='string'))throw Error('手表录音中断记录无效');
 const parts=[];let cursor=0,silence=0,stored=0;
 for(const [index,clip] of clips.entries()){
  const c=clip.body.watch;
  if(c.device_id!==w.device_id||c.session_id!==w.session_id||c.index!==index||c.chunk_id!==`${w.session_id}_${index}`||c.sample_rate!==RATE||c.channels!==1||c.bits_per_sample!==16||!integer(c.sample_start)||!integer(c.sample_count,1)||!integer(c.sample_start+c.sample_count)||c.sample_start<cursor)throw Error('手表原始分片身份、顺序或采样范围无效');
  if(gaps.some(g=>g.sample_count>0&&g.sample_start<c.sample_start+c.sample_count&&g.sample_start+g.sample_count>c.sample_start))throw Error('手表中断记录与已保存音频重叠');
  if(gaps.some(g=>g.sample_count===0&&g.sample_start>c.sample_start&&g.sample_start<c.sample_start+c.sample_count))throw Error('未知时长中断事件不在分片边界');
  if(c.sample_start>cursor){
   const covering=gaps.filter(g=>g.sample_count>0&&g.sample_start>=cursor&&g.sample_start+g.sample_count<=c.sample_start).sort((a,b)=>a.sample_start-b.sample_start);
   let end=cursor;for(const gap of covering){if(gap.sample_start!==end)throw Error('手表音频存在未声明的采样缺口');end+=gap.sample_count;}
   if(end!==c.sample_start)throw Error('手表音频存在未声明的采样缺口');
   parts.push({silence_samples:c.sample_start-cursor});silence+=c.sample_start-cursor;
  }
  const asset=service.entity(clip.body.asset_id,'asset');
  if(asset.body.sha256!==clip.body.sha256||asset.body.byte_size!==44+c.sample_count*2)throw Error('手表分片资产元数据与原音频不符');
  parts.push({clip,filename:service.asset(clip.body.asset_id).filename});cursor=c.sample_start+c.sample_count;stored+=c.sample_count;
 }
 if(gaps.some(g=>g.sample_count===0&&g.sample_start>0&&g.sample_start<cursor))throw Error('录音中间存在未知时长中断，请按连续区域分别播放');
 header(cursor);
 const fingerprint=createHash('sha256').update(JSON.stringify({version:VERSION,device_id:w.device_id,session_id:w.session_id,chunks:clips.map(c=>({index:c.body.watch.index,sample_start:c.body.watch.sample_start,sample_count:c.body.watch.sample_count,continuity_id:c.body.watch.continuity_id??0,sha256:c.body.sha256})),gaps})).digest('hex');
 const expected=w.sealed_samples??w.durable_samples;
 if(integer(expected)&&cursor>expected)throw Error('原录音分片超过已封口范围');
 return {clips,parts,gaps,fingerprint,sample_count:cursor,stored_sample_count:stored,inserted_silence_samples:silence,is_complete:cursor===expected&&cursor===w.samples_captured&&w.status!=='recording'&&!gaps.length};
}
function result(source){const b=source.body;return {source_id:source.block_id,asset_id:b.original_asset_id,duration_ms:b.duration_ms,sample_rate:RATE,sample_count:b.sample_count,stored_sample_count:b.stored_sample_count,chunk_count:b.chunk_count,fingerprint:b.watch_playback_fingerprint,gaps:b.gaps,has_gaps:b.gaps.length>0,inserted_silence_samples:b.inserted_silence_samples,is_complete:b.is_complete,recording_status:b.recording_status};}
function ensureWatchPlayback(service,recordingId){
 const session=service.entity(recordingId,'recording');if(session.body.status!=='active')throw Error('请先恢复已归档的录音');
 const data=collect(service,session),sources=service.store.list('recording_source').filter(s=>s.body.recording_id===recordingId&&s.body.watch_playback===true&&s.body.status==='active');
 const cached=sources.find(s=>s.body.watch_playback_fingerprint===data.fingerprint);
 if(cached){
  for(const part of data.parts)if(part.clip)consumeWav(part.filename,part.clip.body.watch.sample_count,part.clip.body.sha256);
  let valid=false;
  try{const asset=service.entity(cached.body.original_asset_id,'asset');consumeWav(service.asset(asset.block_id).filename,data.sample_count,asset.body.sha256);valid=true;}catch{/* A cache can be rebuilt from the verified immutable raw audio. */}
  if(valid){
   // Live capture counters can change without changing the saved audio bytes.
   // Keep the projection immutable; return current completeness as view state.
   return {...result(cached),is_complete:data.is_complete,recording_status:session.body.watch.status};
  }
 }
 const assetId=newId(),relative=`assets/${assetId}.wav`,filename=path.join(service.directory,relative),fd=fs.openSync(filename,'wx',0o600);
 let closed=false;
 try{
  const hash=createHash('sha256'),h=header(data.sample_count);writeAll(fd,h);hash.update(h);const zero=Buffer.alloc(65536);
  for(const part of data.parts){
   if(part.clip)consumeWav(part.filename,part.clip.body.watch.sample_count,part.clip.body.sha256,pcm=>{writeAll(fd,pcm);hash.update(pcm);});
   else{let remaining=part.silence_samples*2;while(remaining){const pcm=zero.subarray(0,Math.min(zero.length,remaining));writeAll(fd,pcm);hash.update(pcm);remaining-=pcm.length;}}
  }
  fs.fsyncSync(fd);fs.closeSync(fd);closed=true;
  if(process.platform!=='win32'){const d=fs.openSync(path.dirname(filename),'r');try{fs.fsyncSync(d);}finally{fs.closeSync(d);}}
  const sha256=hash.digest('hex'),source=service.store.transaction(()=>{
   const current=service.entity(recordingId,'recording');if(current.body.revision!==session.body.revision)throw Error('录音会话已改变，请重试整次播放');
   for(const clip of data.clips)if(service.entity(clip.block_id,'recording_clip').body.revision!==clip.body.revision)throw Error('原录音分片已改变，请重试整次播放');
   service.store.put({type:'asset',profile_id:service.profileId,relative_path:relative,sha256,media_type:'audio/wav',byte_size:44+data.sample_count*2,duration_ms:data.sample_count*1000/RATE},{id:assetId});
   const sequence=service.store.list('recording_source').filter(s=>s.body.recording_id===recordingId).reduce((n,s)=>Math.max(n,s.body.sequence+1),0);
   const saved=service.store.put({type:'recording_source',profile_id:service.profileId,recording_id:recordingId,name:'整次手表录音',sequence,original_asset_id:assetId,input_assets:data.clips.map(c=>c.body.asset_id),source:'watch',watch_playback:true,watch_playback_version:VERSION,watch_playback_fingerprint:data.fingerprint,watch:{...session.body.watch,kind:'playback',sample_start:0,sample_count:data.sample_count,source_chunk_ids:data.clips.map(c=>c.body.watch.chunk_id)},original_time:session.body.original_time,source_offset_ms:0,captured_at:session.body.watch.started_at_ms,duration_ms:data.sample_count*1000/RATE,sample_rate:RATE,sample_count:data.sample_count,stored_sample_count:data.stored_sample_count,chunk_count:data.clips.length,gaps:data.gaps,inserted_silence_samples:data.inserted_silence_samples,is_complete:data.is_complete,recording_status:session.body.watch.status,segmented:false,links:[{relation:'recording',target_id:recordingId},{relation:'asset',target_id:assetId}]});
   for(const previous of sources)service.update(previous,{status:'archived',archived_at:Date.now(),watch_playback_superseded_by:saved.block_id});
   service.update(current,{watch_playback_source_id:saved.block_id});return saved;
  });
  return result(source);
 }catch(error){if(!closed){try{fs.closeSync(fd);}catch{}}fs.rmSync(filename,{force:true});throw error;}
}
module.exports={ensureWatchPlayback};
