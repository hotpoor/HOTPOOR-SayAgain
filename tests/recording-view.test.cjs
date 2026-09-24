const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const view=require('../renderer/recording-view.js'),{Service}=require('../desktop/service.cjs');
test('conversation keeps precise source times, aliases all turns and prefers corrected text',()=>{
 const session={body:{speaker_profiles:[{key:'A',name:'主持人',note:'介绍'},{key:'B',name:'嘉宾',note:''}]}},clip={body:{duration_ms:2000,source_offset_ms:3600123,source_name:'talk.wav',speaker_analysis:{segments:[{speaker:'A'},{speaker:'B'}]},transcript:'Corrected',transcript_status:'machine_unreviewed',transcript_segments:[{start_ms:0,end_ms:1000,speaker:'A',text:'Hello'},{start_ms:1000,end_ms:2000,speaker:'B',text:'Hi'}]}};
 assert.equal(view.time(3600123),'01:00:00.123');assert.deepEqual(view.keys(clip),['A','B']);assert.equal(view.roster(session,[clip])[1].count,1);
 assert.match(view.transcript(session,[clip]),/01:00:01.123 – 01:00:02.123\] 嘉宾/);
 clip.body.transcript_status='user_reviewed';const text=view.transcript(session,[clip]);assert.match(text,/主持人 \/ 嘉宾/);assert.match(text,/Corrected/);assert(!text.includes('Hello'));
 assert.equal(view.updated({createtime:1,updatetime:5},[{updatetime:9}],[{updatetime:12}]),12);
});
test('speaker notes persist per session without changing transcript or confirmation, reject stale writes',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sayagain-speaker-notes-'));let service=new Service(dir);t.after(()=>{service.close();fs.rmSync(dir,{recursive:true,force:true});});
 const a=service.createRecording({title:'a'}),b=service.createRecording({title:'b'});
 const clip=service.store.put({type:'recording_clip',profile_id:service.profileId,recording_id:a.block_id,speaker:'A',duration_ms:1000,transcript:'Hello',speaker_analysis:{status:'user_confirmed',segments:[{speaker:'A',start_ms:0,end_ms:1000}]}});
 const saved=service.updateRecordingSpeaker({id:a.block_id,revision:a.body.revision,key:'A',name:'主持人',note:'负责提问'});
 assert.equal(saved.createtime,a.createtime);assert.equal(service.entity(clip.block_id,'recording_clip').body.revision,clip.body.revision);assert.equal(view.name(b,'A'),'Speaker A');
 assert.throws(()=>service.updateRecordingSpeaker({id:a.block_id,revision:a.body.revision,key:'A',name:'x',note:''}),/更新/);
 assert.throws(()=>service.updateRecordingSpeaker({id:a.block_id,revision:saved.body.revision,key:'B',name:'x',note:''}),/没有/);
 service.close();service=new Service(dir);assert.equal(view.name(service.entity(a.block_id,'recording'),'A'),'主持人');
 const cleared=service.updateRecordingSpeaker({id:a.block_id,revision:saved.body.revision,key:'A',name:'',note:''});assert.equal(view.name(cleared,'A'),'Speaker A');
});
test('wave envelope preserves mean, source gaps and only reveals stored detail on zoom',()=>{
 const body={source_offset_ms:1000,duration_ms:1000,waveform:[0,.2,.4,1]};
 const small=view.waveBars(body,2000,6),large=view.waveBars(body,2000,60);
 assert.equal(small.length,1);assert.equal(small[0].x,4.5);assert(Math.abs(small[0].height-7.6)<.001);
 assert.equal(large.length,4);assert(large.every(p=>p.x>30&&p.x<60));assert(large[0].height<large[3].height);
 assert.deepEqual(view.waveBars({waveform:[]},0,0),[]);
});
test('speaker avatar persists through note updates and can be removed',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sayagain-avatar-')),s=new Service(dir);t.after(()=>{s.close();fs.rmSync(dir,{recursive:true,force:true});});
 let session=s.createRecording({title:'avatar'});s.store.put({type:'recording_clip',profile_id:s.profileId,recording_id:session.block_id,speaker:'A'});
 const save=extra=>session=s.updateRecordingSpeaker({id:session.block_id,revision:session.body.revision,key:'A',name:'A',note:'',...extra});
 const avatar='data:image/png;base64,iVBORw0KGgo=';save({avatar});assert.equal(session.body.speaker_profiles[0].avatar,avatar);
 save({note:'note'});assert.equal(session.body.speaker_profiles[0].avatar,avatar);
 assert.throws(()=>save({avatar:'https://example.com/a.png'}),/头像/);save({avatar:''});assert.equal(session.body.speaker_profiles[0].avatar,undefined);
});
