const fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');
const {newId}=require('../storage/store.cjs');
const {parseWav}=require('./audio.cjs');
module.exports=Service=>{
 Service.prototype.createRecording=function(input){
  const title=String(input.title||'新录音').trim();if(!title||title.length>120)throw Error('录音标题需为1–120字');
  return this.store.put({type:'recording',profile_id:this.profileId,title,clip_count:0,duration_ms:0});
 };
 Service.prototype.addRecordingClip=function(input){
  this.entity(input.recording_id,'recording');
  if(!/^[a-zA-Z0-9_-]{1,100}$/.test(input.client_id||''))throw Error('无效的录音片段标识');
  if(!['microphone','import'].includes(input.source))throw Error('无效的音频来源');
  if(!(input.bytes instanceof Uint8Array)||input.bytes.length>25*1024*1024)throw Error('单段音频不能超过25MB');
  const bytes=Buffer.from(input.bytes),format=parseWav(bytes),sha=createHash('sha256').update(bytes).digest('hex');
  const existing=this.store.list('recording_clip').find(r=>r.body.recording_id===input.recording_id&&r.body.client_id===input.client_id);
  if(existing){if(existing.body.sha256!==sha)throw Error('同一片段标识的内容不同');return existing;}
  const sourceName=String(input.source_name||'麦克风');if(sourceName.length>500)throw Error('文件名过长');
  const offset=Number(input.source_offset_ms||0);if(!Number.isFinite(offset)||offset<0)throw Error('无效的片段起点');
  const captured=input.source==='microphone'?Number(input.captured_at):null;
  if(captured!==null&&(!Number.isFinite(captured)||captured<=0||captured>Date.now()+60000))throw Error('无效的录音时间');
  const assetId=newId(),relative=`assets/${assetId}.wav`,filename=path.join(this.directory,relative);
  const fd=fs.openSync(filename,'wx',0o600);try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  try{return this.store.transaction(()=>{
   const session=this.entity(input.recording_id,'recording');
   this.store.put({type:'asset',profile_id:this.profileId,relative_path:relative,sha256:sha,media_type:'audio/wav',byte_size:bytes.length,duration_ms:format.duration_ms},{id:assetId});
   const clip=this.store.put({type:'recording_clip',profile_id:this.profileId,recording_id:session.block_id,client_id:input.client_id,asset_id:assetId,sha256:sha,sequence:session.body.clip_count,source:input.source,source_name:sourceName,source_offset_ms:offset,captured_at:captured,imported_at:Date.now(),...format,transcript:'',transcript_status:'not_started',links:[{relation:'recording',target_id:session.block_id},{relation:'asset',target_id:assetId}]});
   this.update(session,{clip_count:session.body.clip_count+1,duration_ms:session.body.duration_ms+format.duration_ms});return clip;
  });}catch(error){fs.unlinkSync(filename);throw error;}
 };
 Service.prototype.updateRecordingTranscript=function(input){
  const clip=this.entity(input.id,'recording_clip');
  if(clip.body.revision!==input.revision)throw Error('录音已更新，请刷新');
  if(typeof input.text!=='string'||input.text.length>20000)throw Error('转写内容过长');
  return this.update(clip,{transcript:input.text,transcript_status:'user_reviewed'});
 };
};
