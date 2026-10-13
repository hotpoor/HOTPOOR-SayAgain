const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {randomUUID,createHash}=require('node:crypto');
const {Service}=require('../desktop/service.cjs');
const {importWatchSession}=require('../desktop/watch-import.cjs');
const {ensureWatchPlayback}=require('../desktop/watch-playback.cjs');
const {validateManifest,persist,groupSources}=require('../desktop/speaker-pipeline.cjs');
function wav(){const b=Buffer.alloc(32044);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);b.writeUInt32LE(32000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(32000,40);return b;}
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'sayagain-watch-recognition-')),folder=path.join(root,'input');fs.mkdirSync(folder);
 const service=new Service(path.join(root,'data'));t.after(()=>{service.close();fs.rmSync(root,{recursive:true,force:true});});
 const bytes=wav(),id=randomUUID(),device=randomUUID();fs.writeFileSync(path.join(folder,'000000.wav'),bytes);
 const manifest={schema:'sayagain-watch-v1',device_id:device,session_id:id,sample_rate:16000,channels:1,bits_per_sample:16,chunk_seconds:60,started_at_ms:1,started_elapsed_ns:'10000000000000000',samples_captured:16000,durable_samples:16000,sealed_samples:16000,status:'completed',gaps:[],chunks:[{id:id+'_0',index:0,file:'000000.wav',sample_start:0,sample_count:16000,byte_size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),status:'sealed',recovered:false}]};
 fs.writeFileSync(path.join(folder,'manifest.json'),JSON.stringify(manifest));
 const imported=importWatchSession(service,path.join(folder,'manifest.json'));
 const clip=service.store.list('recording_clip')[0];
 const sources=groupSources([{id:clip.block_id,revision:clip.body.revision,asset_id:clip.body.asset_id,source:'watch',watch:clip.body.watch,audio:service.asset(clip.body.asset_id).filename,name:clip.body.source_name,offset_ms:0,duration_ms:1000,captured_at:clip.body.captured_at,original_time:clip.body.original_time}]);
 return{root,service,imported,clip,sources};
}
test('an explicit no-speech result is completed while keeping the entire original available',t=>{
 const {root,service,imported,clip,sources}=fixture(t);
 const playback=ensureWatchPlayback(service,imported.recording_id),original=fs.readFileSync(service.asset(playback.asset_id).filename);
 const result=persist(service,root,{version:'speaker-clips-v1',no_speech:true,vad:'fsmn',duration_ms:1000,clustering:{speakers:0,reason:'no_speech'},clips:[],options:{language:'auto'}},sources,'',service.entity(imported.recording_id,'recording'));
 assert.equal(result.body.watch_recognition.state,'no_speech');assert.equal(result.body.watch_recognition.sample_count,16000);assert.deepEqual(result.body.watch_recognition.checked_chunk_ids,[clip.body.watch.chunk_id]);
 assert.equal(service.entity(clip.block_id,'recording_clip').body.status,'archived');assert.equal(result.body.clip_count,0);
 assert.deepEqual(fs.readFileSync(service.asset(ensureWatchPlayback(service,imported.recording_id).asset_id).filename),original);
 assert.equal(service.store.list('recording_source').filter(s=>s.body.watch_playback&&s.body.status==='active').length,1);
});
test('empty or contradictory worker output cannot silently mark an original as recognized',t=>{
 const {root,service,imported,sources}=fixture(t),parent=service.entity(imported.recording_id,'recording');
 assert.throws(()=>validateManifest({version:'speaker-clips-v1',clips:[]},sources,root),/空语音/);
 assert.throws(()=>persist(service,root,{version:'speaker-clips-v1',no_speech:true,vad:'unknown',duration_ms:1000,clustering:{reason:'no_speech'},clips:[]},sources,'',parent),/空语音/);
 assert.equal(service.entity(imported.recording_id,'recording').body.watch_recognition,undefined);
 assert.equal(service.state().recording_clips.length,1);
});
test('comparison preserves capture identity, full source offsets and all original chunk IDs',t=>{
 const {root,service,imported,sources}=fixture(t),source=sources[0];
 source.offset_ms=60000;source.watch.sample_start=960000;source.watch.source_chunk_ids=['first','second'];
 fs.writeFileSync(path.join(root,'00001.wav'),wav());
 const output={version:'speaker-clips-v1',clips:[{file:'00001.wav',source_index:0,start_ms:0,end_ms:1000,speaker:'A',similarity:.7,review:false,text:'test'}],duration_ms:1000,vad:'fsmn',options:{language:'auto'}};
 const compareSource={...source,id:undefined,members:undefined};
 persist(service,root,output,[compareSource],'',service.entity(imported.recording_id,'recording'));
 const saved=service.store.list('recording_source').find(s=>!s.body.watch_playback);
 assert.equal(saved.body.source,'watch');assert.equal(saved.body.source_offset_ms,60000);assert.equal(saved.body.watch.sample_start,960000);
 const derived=service.state().recording_clips.find(c=>c.body.watch?.kind==='speech');
 assert.deepEqual(derived.body.watch.source_chunk_ids,['first','second']);assert.equal(derived.body.source_offset_ms,60000);
});
