const {newId,validId}=require('../storage/store.cjs');

// A sync batch groups sessions without changing their audio, source clocks or receipts.
function createWatchSyncCollection(service,{recording_ids,title,id=newId()}){
 if(!validId(id)||typeof title!=='string'||!title.trim()||title.trim().length>120)throw Error('同步合集名称或标识无效');
 if(!Array.isArray(recording_ids)||!recording_ids.length||recording_ids.length>1000||new Set(recording_ids).size!==recording_ids.length)throw Error('同步合集需要不重复的录音');
 return service.store.transaction(()=>{
  const sessions=recording_ids.map(key=>service.entity(key,'recording'));
  if(sessions.some(s=>s.body.status!=='active'||!s.body.watch||s.body.sync_collection&&s.body.sync_collection.id!==id))throw Error('录音不可用或已经属于另一个同步合集');
  const previous=service.store.get(id);
  if(previous){
   if(previous.body.type!=='recording_collection'||previous.body.title!==title.trim()||JSON.stringify(previous.body.recording_ids)!==JSON.stringify(recording_ids))throw Error('同步合集标识已被使用');
   return previous;
  }
  const collection=service.store.put({type:'recording_collection',profile_id:service.profileId,title:title.trim(),source:'watch_sync',recording_ids,links:recording_ids.map(target_id=>({relation:'recording',target_id}))},{id});
  for(const session of sessions)service.update(session,{sync_collection:{id,title:collection.body.title,created_at:collection.createtime}});
  return collection;
 });
}
module.exports={createWatchSyncCollection};
