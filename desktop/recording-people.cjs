// Reusable identities are explicitly linked; model labels never imply a person.
module.exports=Service=>{
 Service.prototype.putRecordingPerson=function(body){return this.store.put(require('./recording-avatars.cjs').normalize(this.directory,body));};
 Service.prototype.saveRecordingPerson=function(input){
  if(typeof input.name!=='string'||!input.name.trim()||input.name.length>60||typeof input.note!=='string'||input.note.length>500)throw Error('人物名称需1–60字，备注最多500字');
  const color=require('./recording-colors.cjs')(input.color);
  return this.store.transaction(()=>{
   const previous=input.id?this.entity(input.id,'recording_person'):null;
   if(previous&&(previous.body.profile_id!==this.profileId||previous.body.revision!==input.revision))throw Error('人物资料已更新，请刷新后重试');
   const avatar=require('./recording-avatars.cjs').save(this.directory,input.avatar===undefined?previous?.body.avatar||'':input.avatar);
   const avatars=[...new Set([...(previous?.body.avatars||[]),previous?.body.avatar,avatar].filter(Boolean))];if(avatars.length>100)throw Error('每个人物最多保存100张头像');
   const body={name:input.name.trim(),note:input.note.trim(),color,avatar,avatars};
   return previous?this.update(previous,body):this.putRecordingPerson({type:'recording_person',profile_id:this.profileId,...body});
  });
 };
 Service.prototype.linkRecordingPerson=function(input){
  return this.store.transaction(()=>{
   const session=this.entity(input.id,'recording');
   if(session.body.revision!==input.revision)throw Error('会话已更新，请刷新后重试');
   const clips=this.store.list('recording_clip').filter(c=>c.body.recording_id===input.id&&c.body.status!=='archived');
   const view=require('../renderer/recording-view.js'),profiles=[...(session.body.speaker_profiles||[])];
   const exists=key=>key!=='不确定'&&(profiles.some(p=>p.key===key)||clips.some(c=>view.keys(c).includes(key)));
   if(!exists(input.key))throw Error('请选择明确的声音标签；不确定片段请先指定说话人');
   const previous=profiles.find(p=>p.key===input.key)||{key:input.key,name:'',note:''};
   const assign=(key,person)=>{const i=profiles.findIndex(p=>p.key===key),old=i<0?{key,name:'',note:''}:profiles[i];const value={...old,person_id:person?.block_id||null,avatar_override:person?(old.avatar_override||old.avatar||null):null,color_override:person?(old.color_override||old.color||null):null};if(i<0)profiles.push(value);else profiles[i]=value;};
   let person;
   if(input.action==='unlink'){
    const oldPerson=previous.person_id?this.entity(previous.person_id,'recording_person'):null;
    assign(input.key,null);
    if(oldPerson){const i=profiles.findIndex(p=>p.key===input.key);profiles[i]={...profiles[i],name:oldPerson.body.name,note:oldPerson.body.note,avatar:previous.avatar_override||oldPerson.body.avatar||'',color:previous.color_override||oldPerson.body.color||null};}
   }
   else {
    if(input.person_id){person=this.entity(input.person_id,'recording_person');if(person.body.profile_id!==this.profileId||person.body.status!=='active')throw Error('人物不可用');}
    else if(input.target_key){
     if(!exists(input.target_key)||input.target_key===input.key)throw Error('请选择另一个说话人');
     const target=profiles.find(p=>p.key===input.target_key)||{key:input.target_key};
     person=target.person_id?this.entity(target.person_id,'recording_person'):this.putRecordingPerson({type:'recording_person',profile_id:this.profileId,name:target.name||view.name(session,input.target_key),note:target.note||'',avatar:target.avatar||'',color:target.color_override||target.color||null});
     assign(input.target_key,person);
    }else if(input.action==='create'){
     if(typeof input.name!=='string'||!input.name.trim()||input.name.length>60||typeof input.note!=='string'||input.note.length>500)throw Error('人物名称需1–60字，备注最多500字');
     const color=require('./recording-colors.cjs')(input.color===undefined?previous.color_override||previous.color:input.color);
     const avatar=input.avatar??previous.avatar??'';
     require('./recording-avatars.cjs').save(this.directory,avatar);
     person=this.putRecordingPerson({type:'recording_person',profile_id:this.profileId,name:input.name.trim(),note:input.note.trim(),avatar,color});
    }else throw Error('请选择人物或新建人物');
    const localAvatar=require('./recording-avatars.cjs').save(this.directory,previous.avatar_override||previous.avatar);
    const avatars=[...new Set([person.body.avatar,...(person.body.avatars||[]),localAvatar].filter(Boolean))];
    if(avatars.length>100)throw Error('每个人物最多保存100张头像');
    if(avatars.length!==(person.body.avatars||[]).length)person=this.update(person,{avatars});
    assign(input.key,person);
   }
   return this.update(session,{speaker_profiles:profiles});
  });
 };
};
