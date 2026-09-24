const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Service}=require('../desktop/service.cjs'),importer=require('../desktop/recording-import.cjs');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'sayagain-import-')),service=new Service(path.join(root,'data')),session=service.createRecording({title:'导入测试'});
 t.after(()=>{service.close();fs.rmSync(root,{recursive:true,force:true});});
 const audio=Buffer.alloc(44+16000*2*65);audio.write('RIFF');audio.writeUInt32LE(audio.length-8,4);audio.write('WAVEfmt ',8);audio.writeUInt32LE(16,16);audio.writeUInt16LE(1,20);audio.writeUInt16LE(1,22);audio.writeUInt32LE(16000,24);audio.writeUInt32LE(32000,28);audio.writeUInt16LE(2,32);audio.writeUInt16LE(16,34);audio.write('data',36);audio.writeUInt32LE(audio.length-44,40);
 const file=path.join(root,'中文 音频.wav');fs.writeFileSync(file,audio);return {root,service,id:session.block_id,file};
}
async function segmenter(service,source){
 const data=fs.readFileSync(service.asset(source.body.original_asset_id).filename),staged=[];
 const {newId}=require('../storage/store.cjs'),{parseWav}=require('../desktop/audio.cjs');
 for(const [offset,duration] of [[0,12000],[12000,40000],[52000,13000]]){
  const bytes=Buffer.concat([data.subarray(0,44),data.subarray(44+offset*32,44+(offset+duration)*32)]);bytes.writeUInt32LE(bytes.length-8,4);bytes.writeUInt32LE(bytes.length-44,40);
  const id=newId(),relative=`assets/${id}.wav`;fs.writeFileSync(path.join(service.directory,relative),bytes);staged.push({id,relative,format:parseWav(bytes),bytes:bytes.length,offset});
 }
 return {staged,duration_ms:65000};
}
test('originals preserved byte-for-byte and natural segment boundaries are stored; reimport deduplicates',async t=>{
 const {service,id,file}=fixture(t);
 const result=await importer.importFiles(service,{id,paths:[file]},()=>{},{segmenter});assert.equal(result.saved,3);
 const state=service.state(),clips=state.recording_clips.sort((a,b)=>a.body.sequence-b.body.sequence);
 assert.deepEqual(clips.map(c=>c.body.duration_ms),[12000,40000,13000]);assert.deepEqual(clips.map(c=>c.body.source_offset_ms),[0,12000,52000]);
 assert.deepEqual(fs.readFileSync(service.asset(state.recording_sources[0].body.original_asset_id).filename),fs.readFileSync(file));
 await importer.importFiles(service,{id,paths:[file]},()=>{},{segmenter});assert.equal(service.state().recording_clips.length,3);
});
test('stop preserves original; retry creates natural segments without duplication',async t=>{
 const {service,id,file}=fixture(t);
 const result=await importer.importFiles(service,{id,paths:[file]},p=>{if(p.stage==='preserving')importer.cancel(id);},{segmenter});
 assert(result.cancelled);assert.equal(service.state().recording_sources.length,1);assert.equal(service.state().recording_clips.length,0);
 await importer.importFiles(service,{id,paths:[file]},()=>{},{segmenter});assert.equal(service.state().recording_clips.length,3);
});
test('model failure retains original and releases lock for retry',async t=>{
 const {service,id,file}=fixture(t);
 await assert.rejects(importer.importFiles(service,{id,paths:[file]},()=>{},{segmenter:async()=>{throw Error('模型失败');}}),/模型失败/);
 assert.equal(service.state().recording_sources.length,1);assert.equal(service.state().recording_clips.length,0);
 await importer.importFiles(service,{id,paths:[file]},()=>{},{segmenter});assert.equal(service.state().recording_clips.length,3);
});
test('clear removes only machine results and retains clips, assets and manual text',async t=>{
 const {service,id,file}=fixture(t);await importer.importFiles(service,{id,paths:[file]},()=>{},{segmenter});
 const clips=service.state().recording_clips;
 service.update(clips[0],{transcript:'manual',transcript_status:'user_reviewed',speaker_analysis:{segments:[]}});
 service.update(clips[1],{transcript:'machine',transcript_status:'machine_unreviewed',keyword_analysis:{segments:[]}});
 service.clearRecordingAnalysis({id});const state=service.state();assert.equal(state.recording_clips.length,3);assert.equal(state.recording_sources.length,1);
 assert.equal(service.entity(clips[0].block_id,'recording_clip').body.transcript,'manual');assert.equal(service.entity(clips[1].block_id,'recording_clip').body.transcript,'');assert(state.recording_clips.every(c=>!c.body.speaker_analysis&&!c.body.keyword_analysis));
});
