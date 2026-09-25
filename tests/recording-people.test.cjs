const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Service}=require('../desktop/service.cjs');
function setup(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sayagain-people-')),s=new Service(dir);t.after(()=>{s.close();fs.rmSync(dir,{recursive:true,force:true});});const make=title=>{const session=s.createRecording({title});return s.update(session,{speaker_profiles:[{key:'A',name:'Alice',note:'Host'},{key:'B',name:'',note:''}]});};return{s,dir,make};}
const avatar=n=>'data:image/png;base64,'+Buffer.from(n).toString('base64');
test('explicit same-person link creates one reusable identity and works across recordings',t=>{
 const {s,make,dir}=setup(t),a=make('one'),b=make('two');
 s.linkRecordingPerson({id:a.block_id,revision:a.body.revision,key:'B',target_key:'A'});
 const person=s.state().recording_people[0];assert.equal(s.state().recording_people.length,1);
 s.linkRecordingPerson({id:b.block_id,revision:b.body.revision,key:'B',person_id:person.block_id});
 const state=s.state();for(const session of state.recordings)assert.equal(session.body.speaker_profiles.find(p=>p.key==='B').name,'Alice');
 const reopened=new Service(dir);try{assert.equal(reopened.state().recording_people.length,1);assert.equal(reopened.state().recordings.find(x=>x.block_id===b.block_id).body.speaker_profiles[1].person_id,person.block_id);}finally{reopened.close();}
});
test('local avatars accumulate in person library without changing other speaker appearances',t=>{
 const {s,make}=setup(t);let a=make('one'),b=make('two');
 a=s.linkRecordingPerson({id:a.block_id,revision:a.body.revision,key:'A',action:'create',name:'Alice',note:'Host',avatar:avatar('default')});
 const person=s.state().recording_people[0];b=s.linkRecordingPerson({id:b.block_id,revision:b.body.revision,key:'B',person_id:person.block_id});
 const save=()=>{const state=s.state(),session=state.recordings.find(x=>x.block_id===b.block_id),p=session.body.speaker_profiles.find(p=>p.key==='B');return{id:b.block_id,revision:session.body.revision,key:'B',person_revision:p.person_revision,name:'Alice updated',note:'Shared note'};};
 s.updateRecordingSpeaker({...save(),avatar:avatar('local')});
 let state=s.state();assert.equal(state.recordings.find(x=>x.block_id===a.block_id).body.speaker_profiles[0].avatar,avatar('default'));assert.equal(state.recordings.find(x=>x.block_id===b.block_id).body.speaker_profiles[1].avatar,avatar('local'));assert.equal(state.recording_people[0].body.avatars.length,2);assert.equal(state.recordings.find(x=>x.block_id===a.block_id).body.speaker_profiles[0].name,'Alice updated');
 s.updateRecordingSpeaker({...save(),avatar:''});state=s.state();assert.equal(state.recordings.find(x=>x.block_id===b.block_id).body.speaker_profiles[1].avatar,avatar('default'));assert.equal(state.recording_people[0].body.avatars.length,2);
 const current=state.recordings.find(x=>x.block_id===b.block_id);s.linkRecordingPerson({id:b.block_id,revision:current.body.revision,key:'B',action:'unlink'});const unlinked=s.state().recordings.find(x=>x.block_id===b.block_id).body.speaker_profiles[1];assert.equal(unlinked.person_id,null);assert.equal(unlinked.name,'Alice updated');assert.equal(unlinked.avatar,avatar('default'));
});
test('invalid or stale identity links roll back without creating people',t=>{
 const {s,make}=setup(t),a=make('one');
 for(const input of [{key:'missing',target_key:'A'},{key:'B',target_key:'missing'},{key:'B',action:'create',name:'',note:''},{key:'B',person_id:'00000000000000000000000000000000'}])assert.throws(()=>s.linkRecordingPerson({id:a.block_id,revision:a.body.revision,...input}));
 assert.equal(s.state().recording_people.length,0);s.linkRecordingPerson({id:a.block_id,revision:a.body.revision,key:'B',target_key:'A'});
 assert.throws(()=>s.linkRecordingPerson({id:a.block_id,revision:a.body.revision,key:'B',action:'unlink'}),/更新/);
 const current=s.state().recordings[0];assert.throws(()=>s.updateRecordingSpeaker({id:current.block_id,revision:current.body.revision,key:'B',name:'Alice',note:'',person_revision:0}),/更新/);
});

test('large legacy PNG links without exceeding entity limits, galleries dedupe and survive backup',t=>{
 const {s,make}=setup(t),{randomBytes}=require('node:crypto'),{deflateSync,crc32}=require('node:zlib');
 function png(dimension=192){const chunk=(type,data)=>{const kind=Buffer.from(type),size=Buffer.alloc(4),crc=Buffer.alloc(4);size.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([kind,data])));return Buffer.concat([size,kind,data,crc]);};const header=Buffer.alloc(13);header.writeUInt32BE(dimension,0);header.writeUInt32BE(dimension,4);header[8]=8;header[9]=6;const rows=[];for(let i=0;i<dimension;i++)rows.push(Buffer.concat([Buffer.alloc(1),randomBytes(dimension*4)]));return 'data:image/png;base64,'+Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.concat(rows))),chunk('IEND',Buffer.alloc(0))]).toString('base64');}
 const first=png(),second=png(400);assert(first.length>190000);assert(second.length>400000);
 let session=make('legacy');session=s.store.put({...session.body,speaker_profiles:[{key:'A',name:'Alice',note:'',avatar:first}]},{id:session.block_id,expectedRevision:session.body.revision});
 session=s.linkRecordingPerson({id:session.block_id,revision:session.body.revision,key:'A',action:'create',name:'Alice',note:''});
 const person=s.state().recording_people[0];assert.equal(person.body.avatar,first);assert.equal(person.body.avatars.length,1);
 const input=()=>{const session=s.state().recordings[0];return{id:session.block_id,revision:session.body.revision,key:'A',name:'Alice',note:'',person_revision:session.body.speaker_profiles[0].person_revision};};
 s.updateRecordingSpeaker({...input(),avatar:second});s.updateRecordingSpeaker({...input(),avatar:first});
 assert.equal(s.state().recording_people[0].body.avatars.length,2);assert.equal(fs.readdirSync(path.join(s.directory,'assets')).filter(n=>n.startsWith('avatar-')).length,2);
 for(const record of [...s.store.list('recording'),...s.store.list('recording_person')])assert(Buffer.byteLength(JSON.stringify(record.body))<10000);
 const backupRoot=fs.mkdtempSync(path.join(os.tmpdir(),'sayagain-avatar-backup-'));t.after(()=>fs.rmSync(backupRoot,{recursive:true,force:true}));const backup=s.backup(path.join(backupRoot,'snapshot'));const restored=new Service(backup);try{assert.equal(restored.state().recording_people[0].body.avatars.length,2);assert.equal(restored.state().recordings[0].body.speaker_profiles[0].avatar,first);}finally{restored.close();}
});
