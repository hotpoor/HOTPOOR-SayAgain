const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const {Service}=require('../desktop/service.cjs');
const {importWatchSession,SCHEMA}=require('../desktop/watch-import.cjs');
const {ensureWatchPlayback}=require('../desktop/watch-playback.cjs');
function wav(samples=16000,seed=0){
 const b=Buffer.alloc(44+samples*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);b.writeUInt32LE(32000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(samples*2,40);for(let i=0;i<samples;i++)b.writeInt16LE((i+seed)%32000,44+i*2);return b;
}
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function fixture(t,count=2,samples=16000){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'sayagain-watch-playback-')),folder=path.join(root,'session');fs.mkdirSync(folder);const service=new Service(path.join(root,'data'));
 t.after(()=>{service.close();fs.rmSync(root,{recursive:true,force:true});});
 const manifest={schema:SCHEMA,device_id:randomUUID(),session_id:randomUUID(),sample_rate:16000,channels:1,bits_per_sample:16,started_at_ms:1773100800000,started_elapsed_ns:'9000000000000000',samples_captured:count*samples,durable_samples:count*samples,status:'completed',chunks:[],gaps:[]};
 const add=(n=samples)=>{const index=manifest.chunks.length,bytes=wav(n,index*131),file=`${String(index).padStart(6,'0')}.wav`,sample_start=manifest.chunks.reduce((sum,c)=>sum+c.sample_count,0);manifest.chunks.push({id:`${manifest.session_id}_${index}`,index,file,sample_start,sample_count:n,byte_size:bytes.length,sha256:sha(bytes),status:'sealed',recovered:false});fs.writeFileSync(path.join(folder,file),bytes);};
 for(let i=0;i<count;i++)add();const filename=path.join(folder,'manifest.json'),save=()=>fs.writeFileSync(filename,JSON.stringify(manifest));save();const imported=importWatchSession(service,filename);
 return{root,service,folder,manifest,filename,save,add,recordingId:imported.recording_id};
}
test('whole playback contains exact original PCM across all save boundaries and survives reopening',t=>{
 const {root,service,folder,manifest,recordingId}=fixture(t,2,16001),before=service.store.list('recording_clip').map(c=>c.block_id);
 const result=ensureWatchPlayback(service,recordingId),bytes=fs.readFileSync(service.asset(result.asset_id).filename);
 const expected=Buffer.concat(manifest.chunks.map(c=>fs.readFileSync(path.join(folder,c.file)).subarray(44)));
 assert.deepEqual(bytes.subarray(44),expected);assert.equal(bytes.readUInt32LE(40),expected.length);assert.equal(result.sample_count,32002);assert.equal(result.duration_ms,2000.125);assert.equal(result.is_complete,true);assert.equal(result.chunk_count,2);
 assert.deepEqual(service.store.list('recording_clip').map(c=>c.block_id),before);assert.equal(service.store.list('recording_source').length,1);assert.equal(service.store.list('asset').length,3);
 const source=service.entity(result.source_id,'recording_source');assert.equal(source.body.watch_playback,true);assert.deepEqual(source.body.watch.source_chunk_ids,manifest.chunks.map(c=>c.id));
 const again=ensureWatchPlayback(service,recordingId);assert.deepEqual(again,result);assert.equal(service.store.list('asset').length,3);
 const reopened=new Service(path.join(root,'data'));try{assert.deepEqual(ensureWatchPlayback(reopened,recordingId),result);}finally{reopened.close();}
});
test('archived original chunks remain the playback source after speech extraction',t=>{
 const {service,recordingId}=fixture(t);for(const clip of service.store.list('recording_clip'))service.update(clip,{status:'archived',pipeline_version:'replaced'});
 const playback=ensureWatchPlayback(service,recordingId);assert.equal(playback.sample_count,32000);assert.equal(playback.chunk_count,2);assert.equal(service.state().recording_clips.length,0);
 const before=service.store.list('recording_source').length;ensureWatchPlayback(service,recordingId);assert.equal(service.store.list('recording_source').length,before);
});
test('new prefixes create a fresh projection without overwriting old audio or capture metadata',t=>{
 const {service,recordingId,manifest,filename,save,add}=fixture(t,1);manifest.status='recording';save();
 // This fixture already imported completed audio, so use a second session for a genuine live prefix.
 manifest.session_id=randomUUID();manifest.chunks[0].id=`${manifest.session_id}_0`;save();const live=importWatchSession(service,filename),first=ensureWatchPlayback(service,live.recording_id),old=service.entity(first.source_id,'recording_source'),oldBytes=fs.readFileSync(service.asset(first.asset_id).filename);
 add();manifest.samples_captured=32000;manifest.durable_samples=32000;save();importWatchSession(service,filename);const next=ensureWatchPlayback(service,live.recording_id);
 assert.notEqual(next.source_id,first.source_id);assert.notEqual(next.asset_id,first.asset_id);assert.equal(next.sample_count,32000);
 const previous=service.entity(first.source_id,'recording_source');assert.equal(previous.body.status,'archived');assert.equal(previous.body.watch_playback_fingerprint,old.body.watch_playback_fingerprint);assert.deepEqual(previous.body.watch,old.body.watch);assert.equal(previous.body.original_asset_id,first.asset_id);assert.deepEqual(fs.readFileSync(service.asset(first.asset_id).filename),oldBytes);
 ensureWatchPlayback(service,live.recording_id);assert.equal(service.store.list('recording_source').filter(s=>s.body.recording_id===live.recording_id&&s.body.watch_playback).length,2);
 assert.equal(service.entity(recordingId,'recording').body.watch.status,'completed');
});
test('known internal gaps get explicit silence placeholders and lost tails do not become invented audio',t=>{
 const {service,recordingId,manifest,filename,save}=fixture(t);const original=service.entity(recordingId,'recording');
 // Use a separate identity because already stored manifest metadata is immutable.
 manifest.session_id=randomUUID();manifest.chunks.forEach((c,i)=>c.id=`${manifest.session_id}_${i}`);manifest.chunks[1].sample_start=20000;manifest.durable_samples=36000;manifest.samples_captured=37000;manifest.gaps=[{sample_start:16000,sample_count:4000,reason:'known_microphone_gap'},{sample_start:36000,sample_count:1000,reason:'captured_samples_not_saved'}];manifest.status='error';save();const imported=importWatchSession(service,filename);
 const result=ensureWatchPlayback(service,imported.recording_id),bytes=fs.readFileSync(service.asset(result.asset_id).filename);
 assert.equal(result.sample_count,36000);assert.equal(result.stored_sample_count,32000);assert.equal(result.inserted_silence_samples,4000);assert.equal(result.has_gaps,true);assert.equal(result.is_complete,false);assert.deepEqual(result.gaps,manifest.gaps);assert.deepEqual(bytes.subarray(44+32000,44+40000),Buffer.alloc(8000));assert.equal(bytes.length,44+36000*2);assert.equal(service.entity(original.block_id,'recording').body.watch.gaps.length,0);
});
test('unknown internal elapsed-time interruptions reject seamless caching while tail events remain explicit',t=>{
 const {service,recordingId}=fixture(t);const original=service.entity(recordingId,'recording');service.update(original,{watch:{...original.body.watch,gaps:[{sample_start:16000,sample_count:0,reason:'process_interrupted_unmeasured_tail'}]}});
 assert.throws(()=>ensureWatchPlayback(service,recordingId),/连续区域/);assert.equal(service.store.list('asset').length,2);assert.equal(service.store.list('recording_source').length,0);
 const current=service.entity(recordingId,'recording');service.update(current,{watch:{...current.body.watch,gaps:[{sample_start:32000,sample_count:0,reason:'process_interrupted_unmeasured_tail'}]}});
 const result=ensureWatchPlayback(service,recordingId);assert.equal(result.sample_count,32000);assert.equal(result.has_gaps,true);assert.equal(result.inserted_silence_samples,0);assert.equal(result.is_complete,false);
});
test('raw hash failures, malformed ranges and duplicate indexes create no cache assets',t=>{
 const {service,recordingId}=fixture(t),clips=service.store.list('recording_clip').sort((a,b)=>a.body.watch.index-b.body.watch.index),filename=service.asset(clips[1].body.asset_id).filename;
 const bytes=fs.readFileSync(filename),bad=Buffer.from(bytes);bad[50]^=1;fs.writeFileSync(filename,bad);assert.throws(()=>ensureWatchPlayback(service,recordingId),/SHA-256/);assert.equal(service.store.list('asset').length,2);assert.equal(fs.readdirSync(path.join(service.directory,'assets')).length,2);
 fs.writeFileSync(filename,bytes);service.update(clips[1],{watch:{...clips[1].body.watch,index:0}});assert.throws(()=>ensureWatchPlayback(service,recordingId),/顺序/);assert.equal(service.store.list('recording_source').length,0);
});
test('a corrupted existing whole-audio cache is rebuilt from raw without changing old metadata',t=>{
 const {service,recordingId}=fixture(t),result=ensureWatchPlayback(service,recordingId),filename=service.asset(result.asset_id).filename,bytes=fs.readFileSync(filename);bytes[50]^=1;fs.writeFileSync(filename,bytes);
 const repaired=ensureWatchPlayback(service,recordingId);assert.notEqual(repaired.asset_id,result.asset_id);assert.equal(repaired.fingerprint,result.fingerprint);assert.equal(service.entity(result.source_id,'recording_source').body.status,'archived');assert.equal(service.store.list('recording_source').length,2);assert.equal(service.store.list('asset').length,4);
 assert.deepEqual(ensureWatchPlayback(service,recordingId),repaired);assert.equal(service.store.list('asset').length,4);assert.equal(service.store.list('recording_clip').length,2);
});
test('failed cache transaction removes new files and leaves the previously playable prefix intact',t=>{
 const {service,manifest,filename,save,add}=fixture(t,1);manifest.session_id=randomUUID();manifest.chunks[0].id=`${manifest.session_id}_0`;manifest.status='recording';save();const imported=importWatchSession(service,filename),first=ensureWatchPlayback(service,imported.recording_id);
 add();manifest.samples_captured=32000;manifest.durable_samples=32000;save();importWatchSession(service,filename);const assets=fs.readdirSync(path.join(service.directory,'assets')),put=service.store.put.bind(service.store);
 service.store.put=(body,...args)=>{if(body.type==='recording_source'&&body.watch_playback)throw Error('simulated cache DB failure');return put(body,...args);};
 assert.throws(()=>ensureWatchPlayback(service,imported.recording_id),/DB failure/);service.store.put=put;assert.deepEqual(fs.readdirSync(path.join(service.directory,'assets')),assets);assert.equal(service.entity(first.source_id,'recording_source').body.status,'active');assert.equal(service.entity(imported.recording_id,'recording').body.watch_playback_source_id,first.source_id);
 const retry=ensureWatchPlayback(service,imported.recording_id);assert.equal(retry.sample_count,32000);assert.equal(service.entity(first.source_id,'recording_source').body.status,'archived');
});
test('playback failure cannot swallow STORED import receipts and cache preparation is retryable',t=>{
 const {service,manifest,filename,save}=fixture(t,1);manifest.session_id=randomUUID();manifest.chunks[0].id=`${manifest.session_id}_0`;save();const put=service.store.put.bind(service.store);
 service.store.put=(body,...args)=>{if(body.type==='recording_source'&&body.watch_playback)throw Error('cache unavailable');return put(body,...args);};
 const result=importWatchSession(service,filename,{prepare_playback:true});service.store.put=put;
 assert.equal(result.stored_count,1);assert.equal(result.chunks[0].status,'STORED');assert.match(result.playback_error,/cache unavailable/);assert.equal(result.playback,undefined);assert.equal(service.entity(result.recording_id,'recording').body.watch_import_status,'stored');
 const retry=importWatchSession(service,filename,{prepare_playback:true});assert.equal(retry.imported_count,0);assert.equal(retry.playback.sample_count,16000);assert.equal(retry.playback_error,undefined);
});
test('whole recordings longer than ten minutes retain a valid WAV instead of the per-clip duration limit',t=>{
 const {service,recordingId}=fixture(t,11,960000),result=ensureWatchPlayback(service,recordingId),filename=service.asset(result.asset_id).filename,fd=fs.openSync(filename,'r'),h=Buffer.alloc(44);
 try{fs.readSync(fd,h,0,44,0);}finally{fs.closeSync(fd);}
 assert.equal(result.duration_ms,660000);assert.equal(result.sample_count,10560000);assert.equal(result.chunk_count,11);assert.equal(fs.statSync(filename).size,44+10560000*2);assert.equal(h.readUInt32LE(40),10560000*2);
});
test('failed playback fsync removes the unregistered cache and a retry can save it',t=>{
 const {service,recordingId}=fixture(t),old=fs.fsyncSync,files=fs.readdirSync(path.join(service.directory,'assets'));
 fs.fsyncSync=()=>{throw Error('simulated playback fsync failure');};
 try{assert.throws(()=>ensureWatchPlayback(service,recordingId),/fsync failure/);}finally{fs.fsyncSync=old;}
 assert.deepEqual(fs.readdirSync(path.join(service.directory,'assets')),files);assert.equal(service.store.list('recording_source').length,0);assert.equal(service.store.list('asset').length,2);assert.equal(ensureWatchPlayback(service,recordingId).sample_count,32000);
});
