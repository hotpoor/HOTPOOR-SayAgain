const fs=require('node:fs'),path=require('node:path');
const types=['recording_person','expression','voice','voice_sample','recording','recording_clip'];
module.exports=Service=>{
 Service.prototype.archivedItems=function(){
  return types.flatMap(type=>this.store.list(type)).filter(r=>r.body.status==='archived'&&(r.body.type!=='recording_clip'||r.body.user_archived));
 };
 Service.prototype.archiveItem=function(input){
  const record=this.store.get(input.id);
  if(!record||!types.includes(record.body.type)||record.body.status!=='archived')throw Error('请先归档，再从归档列表操作');
  if(record.body.revision!==input.revision)throw Error('记录已更新，请刷新后重试');
  if(record.body.type==='recording_clip'&&!record.body.user_archived)throw Error('此片段由解析流程管理');
  if(!['restore','delete'].includes(input.action))throw Error('未知操作');
  const all=this.store.all(),ids=new Set([record.block_id]);
  // Session ownership includes archived analysis clips; preserve shared people and audio assets.
  if(record.body.type==='recording')for(const r of all)if(r.body.recording_id===record.block_id)ids.add(r.block_id);
  if(record.body.type==='voice')for(const r of all)if(r.body.type==='voice_sample'&&r.body.voice_id===record.block_id)ids.add(r.block_id);
  if(input.action==='delete')for(const r of all)if(r.body.type==='synthesis'&&(ids.has(r.body.expression_id)||ids.has(r.body.voice_id)))ids.add(r.block_id);
  if(input.action==='delete')for(const r of all)if(r.body.type==='practice'&&ids.has(r.body.expression_id))ids.add(r.block_id);
  if(input.action==='delete')for(const r of all)if(r.body.type==='job'&&ids.has(r.body.target_id))ids.add(r.block_id);
  for(const r of all)if(r.body.type==='synthesis'&&['queued','running'].includes(r.body.status)&&[r.block_id,r.body.expression_id,r.body.voice_id,r.body.sample_id].some(id=>ids.has(id)))throw Error('请先完成或取消相关语音生成任务');
  const sessionId=record.body.type==='recording'?record.block_id:record.body.recording_id;
  if(sessionId&&(require('./recording-import.cjs').isBusy(sessionId)||require('./recording-models.cjs').isBusy(this,sessionId)))throw Error('此会话有任务正在处理');
  const files=[];
  const result=this.store.transaction(()=>{
   if(input.action==='restore'){
    if(record.body.recording_id&&this.entity(record.body.recording_id,'recording').body.status!=='active')throw Error('请先恢复所属录音会话');
    if(record.body.voice_id&&this.entity(record.body.voice_id,'voice').body.status!=='active')throw Error('请先恢复所属音色');
    const saved=this.update(record,{status:'active',archived_at:null,user_archived:false});
    if(record.body.type==='voice_sample'){
     const voice=this.entity(record.body.voice_id,'voice');this.update(voice,{default_sample_id:voice.body.default_sample_id||record.block_id,voice_revision:voice.body.voice_revision+1,links:[...voice.body.links.filter(l=>l.target_id!==record.block_id),{relation:'sample',target_id:record.block_id}]});
    }
    if(record.body.type==='recording_clip'){
     const session=this.entity(record.body.recording_id,'recording'),clips=this.store.list('recording_clip').filter(c=>c.body.recording_id===session.block_id&&c.body.status==='active');this.update(session,{clip_count:clips.length,duration_ms:clips.reduce((n,c)=>n+c.body.duration_ms,0),speaker_analysis:null,keyword_analysis:null});
    }
    return saved;
   }
   for(const evaluation of all.filter(r=>r.body.type==='evaluation')){
    const missing=evaluation.body.expression_ids.filter(id=>ids.has(id));
    if(missing.length)this.update(evaluation,{expression_ids:evaluation.body.expression_ids.filter(id=>!ids.has(id)),deleted_expression_count:(evaluation.body.deleted_expression_count||0)+missing.length});
   }
   if(record.body.type==='recording_person')for(const session of all.filter(r=>r.body.type==='recording'))if(session.body.speaker_profiles?.some(p=>p.person_id===record.block_id))this.update(session,{speaker_profiles:session.body.speaker_profiles.map(p=>p.person_id===record.block_id?{...p,person_id:null,name:record.body.name,note:record.body.note,avatar:p.avatar_override||record.body.avatar||'',color:p.color_override||record.body.color||null}:p)});
   const removed=all.filter(r=>ids.has(r.block_id));
   for(const id of ids)this.store.remove(id);
   // Drop stale links without changing surviving recordings or generated audio snapshots.
   for(const r of this.store.all())if(r.body.links.some(l=>ids.has(l.target_id)))this.update(r,{links:r.body.links.filter(l=>!ids.has(l.target_id))});
   const remaining=this.store.all();
   for(const asset of remaining.filter(r=>r.body.type==='asset')){
    if(!removed.some(r=>JSON.stringify(r.body).includes(asset.block_id)))continue;
    if(remaining.some(r=>r.block_id!==asset.block_id&&JSON.stringify(r.body).includes(asset.block_id)))continue;
    const filename=path.resolve(this.directory,asset.body.relative_path);
    if(filename.startsWith(path.resolve(this.directory,'assets')+path.sep))files.push(filename);
    this.store.remove(asset.block_id);
   }
   return {deleted:true};
  });
  // A failed file cleanup is reported; the database deletion has already committed.
  for(const filename of files)fs.rmSync(filename,{force:true});
  return result;
 };
};
