const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Service}=require('../desktop/service.cjs');
const {validateOptions,validateManifest,persist,SpeakerPipeline}=require('../desktop/speaker-pipeline.cjs');
function wav(){const b=Buffer.alloc(32044);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);b.writeUInt32LE(32000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(32000,40);return b;}
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'sayagain-pipeline-test-'));const s=new Service(path.join(root,'data'));t.after(()=>{s.close();fs.rmSync(root,{recursive:true,force:true});});fs.writeFileSync(path.join(root,'00001.wav'),wav());const row={file:'00001.wav',source_index:0,start_ms:0,end_ms:1000,speaker:'A',similarity:.7,review:false,text:'Hello there.'};return{root,s,row,manifest:{version:'speaker-clips-v1',clips:[row],options:{language:'en'},clustering:{speakers:1}},sources:[{name:'input.wav',offset_ms:30000,duration_ms:1000}]};}
test('pipeline validates options and rejects untrusted worker paths/times before writes',t=>{
 const {root,row,manifest,sources}=fixture(t);
 for(const value of [{speaker_count:-1},{speaker_count:2.1},{language:'bogus'}])assert.throws(()=>validateOptions(value));
 for(const changed of [{file:'../00001.wav'},{end_ms:18002},{end_ms:1001.5},{speaker:'<script>'},{similarity:NaN},{source_index:8}])assert.throws(()=>validateManifest({...manifest,clips:[{...row,...changed}]},sources,root));
 assert.equal(validateManifest(manifest,sources,root).length,1);
});
test('pipeline saves derived clips atomically with original timeline and persists after reopen',t=>{
 const {root,s,manifest,sources}=fixture(t),parent=s.createRecording({title:'Original'});
 const clip=s.addRecordingClip({recording_id:parent.block_id,client_id:'original',source:'import',source_name:'input.wav',source_offset_ms:30000,bytes:wav()});
 const original=s.updateRecordingTranscript({id:clip.block_id,revision:clip.body.revision,text:'User correction'});
 const before=s.entity(parent.block_id,'recording');sources[0]={...sources[0],id:original.block_id,revision:original.body.revision};
 const result=persist(s,root,manifest,sources,'Result',before);
 const derived=s.store.list('recording_clip').find(c=>c.body.recording_id===result.block_id);
 assert.equal(derived.body.speaker,'A');assert.equal(derived.body.source_offset_ms,30000);assert.equal(derived.body.source_clip_id,clip.block_id);assert.equal(derived.body.transcript_status,'machine_unreviewed');assert.equal(s.entity(clip.block_id,'recording_clip').body.transcript,'User correction');
 const reopened=new Service(path.join(root,'data'));try{assert.equal(reopened.entity(derived.block_id,'recording_clip').body.transcript,'Hello there.');assert.deepEqual(fs.readFileSync(reopened.asset(derived.body.asset_id).filename),wav());}finally{reopened.close();}
});
test('stale source or transaction failure removes newly staged audio and leaves no partial session',t=>{
 const {root,s,manifest,sources}=fixture(t),parent=s.createRecording({title:'Original'});
 const clip=s.addRecordingClip({recording_id:parent.block_id,client_id:'original',source:'import',bytes:wav()});
 sources[0]={...sources[0],id:clip.block_id,revision:clip.body.revision};const current=s.entity(parent.block_id,'recording');
 s.updateRecordingTranscript({id:clip.block_id,revision:clip.body.revision,text:'Changed during inference'});
 const assets=fs.readdirSync(path.join(s.directory,'assets'));assert.throws(()=>persist(s,root,manifest,sources,'Result',current),/已改变/);
 assert.deepEqual(fs.readdirSync(path.join(s.directory,'assets')),assets);assert.equal(s.store.list('recording').length,1);
 const originalPut=s.store.put.bind(s.store);s.store.put=(body,...args)=>{if(body.type==='recording_clip')throw Error('simulated disk error');return originalPut(body,...args);};
 assert.throws(()=>persist(s,root,manifest,[{name:'external.wav'}],'Result'),/disk error/);
 assert.equal(s.store.list('recording').length,1);assert.deepEqual(fs.readdirSync(path.join(s.directory,'assets')),assets);
});
test('pipeline requires explicit model registration without downloading or creating a session',t=>{
 const {root,s}=fixture(t),pipeline=new SpeakerPipeline(s,root);
 assert.throws(()=>pipeline.start({filename:path.join(root,'00001.wav')}),/登记/);assert.equal(pipeline.status().state,'idle');assert.equal(s.store.list('recording').length,0);
});

test('candidate import preserves original and permits transcription without confirming identity',t=>{
 const {root,s,manifest,sources}=fixture(t);manifest.clips[0].text='';sources[0].audio=path.join(root,'00001.wav');
 const result=persist(s,root,manifest,sources,'Candidate');
 const clip=s.store.list('recording_clip').find(c=>c.body.recording_id===result.block_id);
 assert.equal(clip.body.transcript,'');assert.equal(clip.body.transcription_language,'en');
 assert.equal(require('../desktop/confirmed-turns.cjs').transcribable(clip)[0].speaker,'A');assert.equal(clip.body.speaker_analysis.status,'machine_unreviewed');
 const source=s.store.list('recording_source').find(r=>r.body.recording_id===result.block_id);
 assert.deepEqual(fs.readFileSync(s.asset(source.body.original_asset_id).filename),wav());
 s.confirmRecordingTurns({id:clip.block_id,revision:clip.body.revision,segments:clip.body.speaker_analysis.segments});
 assert.equal(require('../desktop/confirmed-turns.cjs').confirmed(s.entity(clip.block_id,'recording_clip'))[0].speaker,'A');
});

test('microphone checkpoints join only within a contiguous take',()=>{
 const {groupSources}=require('../desktop/speaker-pipeline.cjs');
 const first={id:'a',source:'microphone',audio:'a.wav',offset_ms:0,captured_at:100000,duration_ms:30000};
 const second={...first,id:'b',audio:'b.wav',offset_ms:30000,captured_at:130000};
 const later={...first,id:'c',audio:'c.wav',captured_at:200000};
 const result=groupSources([first,second,later,{...second,source:'import'}]);
 assert.equal(result.length,3);assert.deepEqual(result[0].audio_parts,['a.wav','b.wav']);assert.equal(result[0].duration_ms,60000);assert.equal(result[0].members.length,2);assert.equal(first.duration_ms,30000);
 assert.equal(groupSources([first,{...second,offset_ms:31000}]).length,2);
});
