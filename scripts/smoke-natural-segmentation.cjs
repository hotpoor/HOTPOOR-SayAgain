const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {Service}=require('../desktop/service.cjs'),imports=require('../desktop/recording-import.cjs');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sayagain-natural-'));
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
(async()=>{
 let service;
 try{
  fs.mkdirSync(path.join(directory,'recording-models'));fs.copyFileSync(process.env.SAYAGAIN_TEST_RUNTIME,path.join(directory,'recording-models/runtime.json'));
  service=new Service(path.join(directory,'data'));const session=service.createRecording({title:'自然分段验证'}),events=[];
  await imports.importFiles(service,{id:session.block_id,paths:[process.env.SAYAGAIN_TEST_AUDIO]},p=>{events.push(p);if(p.stage==='vad'&&Math.round(p.processedMs)%10000===0)console.log('VAD',p.processedMs,p.durationMs);});
  let state=service.state(),source=state.recording_sources[0],clips=state.recording_clips.sort((a,b)=>a.body.sequence-b.body.sequence);
  assert.equal(hash(service.asset(source.body.original_asset_id).filename),hash(process.env.SAYAGAIN_TEST_AUDIO));
  assert(clips.length>0);assert(clips.some(c=>c.body.duration_ms!==30000));assert(clips.every(c=>c.body.segmentation==='fsmn-vad'&&c.body.duration_ms<=61000));
  assert(events.some(e=>e.stage==='vad'&&e.durationMs>70000));
  const first=clips[0];service.updateRecordingTranscript({id:first.block_id,revision:first.body.revision,text:'保留我的手工笔记'});
  if(clips[1])service.update(clips[1],{transcript:'机器文字',transcript_status:'machine_unreviewed',speaker_analysis:{segments:[]}});
  service.clearRecordingAnalysis({id:session.block_id});state=service.state();assert.equal(state.recording_clips.find(c=>c.block_id===first.block_id).body.transcript,'保留我的手工笔记');assert.equal(state.recording_clips.length,clips.length);
  assert(state.recording_clips.filter(c=>c.block_id!==first.block_id).every(c=>!c.body.transcript));
  await imports.resegment(service,{id:session.block_id});state=service.state();assert.equal(state.recording_clips.length,clips.length);assert(state.recording_sources[0].body.retained_notes.some(n=>n.text==='保留我的手工笔记'));
  assert.equal(hash(service.asset(source.body.original_asset_id).filename),hash(process.env.SAYAGAIN_TEST_AUDIO));
  const legacy=service.createRecording({title:'旧版跨块验证'}),wavBytes=fs.readFileSync(process.env.SAYAGAIN_TEST_AUDIO);
  const {spawnSync}=require('node:child_process'),ffmpeg=require('ffmpeg-static');
  for(let i=0;i<3;i++){
   const target=path.join(directory,`legacy-${i}.wav`);const converted=spawnSync(ffmpeg,['-v','error','-i',process.env.SAYAGAIN_TEST_AUDIO,'-ss',String(i*30),'-t','30','-ac','1','-ar','16000',target],{windowsHide:true});assert.equal(converted.status,0);
   service.addRecordingClip({recording_id:legacy.block_id,client_id:`old-${i}`,source:'import',source_name:'old-recording.wav',source_offset_ms:i*30000,bytes:fs.readFileSync(target)});
  }
  await imports.resegment(service,{id:legacy.block_id});
  const legacyClips=service.state().recording_clips.filter(c=>c.body.recording_id===legacy.block_id).sort((a,b)=>a.body.sequence-b.body.sequence);
  assert.deepEqual(legacyClips.map(c=>[c.body.source_offset_ms,c.body.duration_ms]),clips.map(c=>[c.body.source_offset_ms,c.body.duration_ms]));
  assert(legacyClips.some(c=>c.body.source_offset_ms<30000&&c.body.source_offset_ms+c.body.duration_ms>30000));
  console.log('PASS: VAD state carries across the old 30-second storage boundary.');
  const models=require('../desktop/recording-models.cjs'),progress=[];
  for(const clip of service.state().recording_clips.filter(c=>c.body.recording_id===session.block_id)){service.confirmRecordingTurns({id:clip.block_id,revision:clip.body.revision,segments:[{start_ms:0,end_ms:clip.body.duration_ms,speaker:'测试说话人'}]});}
  await models.transcribeAll(service,directory,{id:session.block_id},p=>progress.push(p));
  assert(service.state().recording_clips.some(c=>c.body.transcript.length>0));assert.equal(progress.at(-1).completed,clips.length);
  await models.analyze(service,directory,{id:session.block_id,mode:'speakers'});
  assert(service.state().recording_clips.some(c=>c.body.speaker_analysis?.segments.some(s=>s.speaker)));
  fs.writeFileSync(path.join(directory,'recording-models/runtime.json'),'{}');await assert.rejects(imports.resegment(service,{id:session.block_id}),/FSMN/);assert.equal(service.state().recording_clips.filter(c=>c.body.recording_id===session.block_id).length,clips.length);
  console.log('PASS: original byte preservation, natural VAD segments, clear without audio loss, preserved manual notes and failure-safe resegmentation.',clips.map(c=>[c.body.source_offset_ms,c.body.duration_ms]));
 }finally{service?.close();const resolved=path.resolve(directory);if(resolved.startsWith(path.resolve(os.tmpdir())+path.sep))fs.rmSync(resolved,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
