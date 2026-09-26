module.exports=Service=>{
 Service.prototype.managePerson=function(input){return this.store.transaction(()=>{
  const person=this.entity(input.id,'recording_person');if(person.body.revision!==input.revision)throw Error('人物已更新，请刷新');
  if(input.action==='archive')return this.update(person,{status:'archived',archived_at:Date.now()});
  if(input.action!=='merge')throw Error('未知人物操作');
  const target=this.entity(input.target_id,'recording_person');if(target.block_id===person.block_id||target.body.status!=='active'||target.body.revision!==input.target_revision)throw Error('目标人物已更新或不可用');
  const avatars=[...new Set([target.body.avatar,...(target.body.avatars||[]),person.body.avatar,...(person.body.avatars||[])].filter(Boolean))];if(avatars.length>100)throw Error('合并后头像超过100张，请先整理头像');
  this.update(target,{avatars});
  for(const session of this.store.list('recording'))if(session.body.speaker_profiles?.some(p=>p.person_id===person.block_id))this.update(session,{speaker_profiles:session.body.speaker_profiles.map(p=>p.person_id===person.block_id?{...p,person_id:target.block_id}:p)});
  return this.update(person,{status:'archived',archived_at:Date.now(),merged_into:target.block_id});
 });};
};
