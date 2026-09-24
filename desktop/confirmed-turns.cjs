function validateTurns(segments,duration){
 if(!Array.isArray(segments)||!segments.length||segments.length>1000)throw Error('请保留至少一个发言时间段');
 let last=0;
 return segments.map(s=>{const start=s.start_ms,end=s.end_ms,speaker=typeof s.speaker==='string'?s.speaker.trim():'';
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<last||start<0||end<=start||end>duration)throw Error('时间段必须按顺序排列、不重叠，并位于音频范围内');
  if(s.speakers!==undefined){
   if(!Array.isArray(s.speakers)||!s.speakers.length||s.speakers.length>20||s.speakers.some(n=>typeof n!=='string'||!n.trim()||n.trim().length>60))throw Error('请选择说话人，或新增一位说话人');
   const speakers=s.speakers.map(n=>n.trim());
   if(new Set(speakers).size!==speakers.length||speakers.length>1&&speakers.includes('不确定'))throw Error('不确定不能与其他说话人同时选择');
   last=end;return{start_ms:start,end_ms:end,speaker:speakers.join(' / '),speakers};
  }
  if(!speaker||speaker.length>60)throw Error('请填写说话人，无法确定可填“不确定”');last=end;return{start_ms:start,end_ms:end,speaker};
 });
}
function confirmed(clip){if(clip.body.speaker_analysis?.status!=='user_confirmed')throw Error('请先确认说话人和时间段，再转写');return validateTurns(clip.body.speaker_analysis.segments,clip.body.duration_ms);}
function transcribable(clip){return validateTurns(clip.body.speaker_analysis?.segments?.length?clip.body.speaker_analysis.segments:[{start_ms:0,end_ms:clip.body.duration_ms,speaker:clip.body.speaker||'不确定'}],clip.body.duration_ms);}
function install(Service){Service.prototype.confirmRecordingTurns=function(input){
 const clip=this.entity(input.id,'recording_clip');
 if(clip.body.status==='archived'||clip.body.revision!==input.revision)throw Error('片段已改变，请刷新');
 if(require('./recording-import.cjs').isBusy(clip.body.recording_id)||require('./recording-models.cjs').isBusy(this,clip.body.recording_id))throw Error('请等待当前处理完成');
 const segments=validateTurns(input.segments,clip.body.duration_ms);
 // Preserve existing text while making any earlier attribution visibly stale.
 return this.store.transaction(()=>{
  const session=this.entity(clip.body.recording_id,'recording'),view=require('../renderer/recording-view.js');
  const clips=this.store.list('recording_clip').filter(c=>c.body.recording_id===clip.body.recording_id&&c.body.status!=='archived');
  const profiles=[...(session.body.speaker_profiles||[])];
  for(const key of [...clips.flatMap(view.keys),...segments.flatMap(view.turnSpeakers)])if(key!=='不确定'&&!profiles.some(p=>p.key===key))profiles.push({key,name:'',note:''});
  this.update(session,{speaker_profiles:profiles});
  return this.update(clip,{speaker_analysis:{segments,status:'user_confirmed',created_at:Date.now()},needs_review:false,transcript_turns_stale:!!clip.body.transcript});
 });
};}
module.exports={validateTurns,confirmed,transcribable,install};
