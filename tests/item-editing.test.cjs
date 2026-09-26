const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Service}=require('../desktop/service.cjs');
function setup(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sayagain-edit-'));const s=new Service(dir);t.after(()=>{s.close();fs.rmSync(dir,{recursive:true,force:true});});return s;}
function wav(){const b=Buffer.alloc(32044);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);b.writeUInt32LE(32000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(32000,40);return b;}
test('expression edits preserve identity and language, stale edits fail, deletion stays hidden after index rebuild',t=>{
 const s=setup(t);s.saveSettings({revision:s.config().body.revision,native_language:'zh-CN',target_language:'en-US'});
 const e=s.addExpression({original:'a',improved:'b'}),input={id:e.block_id,revision:e.body.revision,action:'save',original:'new',improved:'better',category:'语法'};
 const updated=s.editExpression(input);assert.equal(updated.createtime,e.createtime);assert.deepEqual(updated.body.language_pair,e.body.language_pair);assert.equal(updated.body.content_revision,2);assert.throws(()=>s.editExpression(input),/更新/);
 s.store.put({type:'synthesis',expression_id:e.block_id,status:'running'});assert.throws(()=>s.editExpression({id:e.block_id,revision:updated.body.revision,action:'delete'}),/归档/);
 const synth=s.store.list('synthesis')[0];s.update(synth,{status:'succeeded'});s.editExpression({id:e.block_id,revision:updated.body.revision,action:'archive'});const archived=s.entity(e.block_id,'expression');s.archiveItem({id:e.block_id,revision:archived.body.revision,action:'delete'});s.store.rebuild();assert.equal(s.state().expressions.length,0);assert.throws(()=>s.entity(e.block_id,'expression'),/不存在/);
});
test('clip deletion adjusts totals; session deletion hides child clips and sources, retains audio assets',t=>{
 const s=setup(t),r=s.createRecording({title:'会话'});const clip=s.addRecordingClip({recording_id:r.block_id,client_id:'one',source:'import',bytes:wav()});
 const second=s.addRecordingClip({recording_id:r.block_id,client_id:'two',source:'import',bytes:wav()});
 s.editRecording({id:clip.block_id,revision:clip.body.revision,kind:'clip',action:'archive'});const current=s.entity(r.block_id,'recording');assert.equal(current.body.clip_count,1);assert.equal(current.body.duration_ms,1000);
 const renamed=s.editRecording({id:r.block_id,revision:current.body.revision,action:'save',title:'新标题'});assert.equal(renamed.body.title,'新标题');assert.throws(()=>s.editRecording({id:r.block_id,revision:current.body.revision,action:'delete'}),/更新/);
 s.store.put({type:'recording_source',recording_id:r.block_id,name:'original'});
 s.editRecording({id:r.block_id,revision:renamed.body.revision,action:'archive'});const archived=s.entity(r.block_id,'recording');s.archiveItem({id:r.block_id,revision:archived.body.revision,action:'delete'});assert.equal(s.state().recordings.length,0);assert.equal(s.state().recording_clips.length,0);assert.equal(s.state().recording_sources.length,0);assert.equal(s.store.get(second.body.asset_id),null);assert(!fs.existsSync(path.join(s.directory,'assets',second.body.asset_id+'.wav')));
});
test('reference sample edits change voice revision; deleting defaults selects remaining sample and clears empty voice',t=>{
 const s=setup(t),v=s.saveVoice({name:'音色'});const add=()=>s.addSample({voice_id:v.block_id,language:'zh-CN',transcript:'原文',source:'import',bytes:wav(),duration_ms:1000,media_type:'audio/wav',waveform:Array(64).fill(0)});
 const a=add(),b=add();s.defaultVoice({id:v.block_id});const before=s.entity(v.block_id,'voice').body.voice_revision;
 const edited=s.editSample({id:a.block_id,revision:a.body.revision,action:'save',language:'en-US',transcript:'hello'});assert.equal(edited.body.asset_id,a.body.asset_id);assert(s.entity(v.block_id,'voice').body.voice_revision>before);
 s.editSample({id:a.block_id,revision:edited.body.revision,action:'archive'});assert.equal(s.entity(v.block_id,'voice').body.default_sample_id,b.block_id);
 s.editSample({id:b.block_id,revision:b.body.revision,action:'archive'});assert.equal(s.entity(v.block_id,'voice').body.default_sample_id,null);assert.deepEqual(s.config().body.default_voice_ids,[]);assert.equal(s.state().samples.length,0);
});
test('archive is reversible and only archived records can be permanently removed',t=>{
 const s=setup(t),r=s.createRecording({title:'restore me'}),clip=s.addRecordingClip({recording_id:r.block_id,client_id:'one',source:'import',bytes:wav()});
 assert.throws(()=>s.archiveItem({id:clip.block_id,revision:clip.body.revision,action:'delete'}),/归档/);
 const archived=s.editRecording({id:clip.block_id,revision:clip.body.revision,kind:'clip',action:'archive'});
 assert(s.state().archived_items.some(r=>r.block_id===clip.block_id));assert.equal(s.state().recording_clips.length,0);
 const restored=s.archiveItem({id:clip.block_id,revision:archived.body.revision,action:'restore'});assert.equal(s.state().recording_clips.length,1);assert.equal(s.entity(r.block_id,'recording').body.duration_ms,1000);
 const session=s.entity(r.block_id,'recording'),sessionArchived=s.editRecording({id:r.block_id,revision:session.body.revision,action:'archive'});assert.equal(s.state().recordings.length,0);
 s.archiveItem({id:r.block_id,revision:sessionArchived.body.revision,action:'restore'});assert.equal(s.state().recordings.length,1);assert.equal(s.entity(clip.block_id,'recording_clip').body.status,'active');
 const again=s.editRecording({id:clip.block_id,revision:restored.body.revision,kind:'clip',action:'archive'});
 s.store.put({type:'synthesis',status:'succeeded',asset_id:clip.body.asset_id});s.archiveItem({id:clip.block_id,revision:again.body.revision,action:'delete'});assert.equal(s.store.get(clip.block_id),null);assert(fs.existsSync(s.asset(clip.body.asset_id).filename));s.store.rebuild();assert.equal(s.store.get(clip.block_id),null);
});
test('restoring an archived sample restores usability and archived pipeline clips stay out of the user archive',t=>{
 const s=setup(t),v=s.saveVoice({name:'voice'}),sample=s.addSample({voice_id:v.block_id,language:'en-US',transcript:'text',source:'import',bytes:wav(),duration_ms:1000,media_type:'audio/wav',waveform:Array(64).fill(0)});
 const archived=s.editSample({id:sample.block_id,revision:sample.body.revision,action:'archive'});assert.equal(s.state().samples.length,0);
 s.archiveItem({id:sample.block_id,revision:archived.body.revision,action:'restore'});assert.equal(s.state().samples.length,1);assert.equal(s.entity(v.block_id,'voice').body.default_sample_id,sample.block_id);
 const internal=s.store.put({type:'recording_clip',status:'archived'});assert(!s.state().archived_items.some(r=>r.block_id===internal.block_id));assert.throws(()=>s.archiveItem({id:internal.block_id,revision:internal.body.revision,action:'delete'}),/解析/);
});
