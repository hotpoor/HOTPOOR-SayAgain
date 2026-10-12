const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const {Service}=require('../desktop/service.cjs');
const {importWatchSession,validateManifest,SCHEMA}=require('../desktop/watch-import.cjs');
const {groupSources,persist}=require('../desktop/speaker-pipeline.cjs');
function wav(samples=16000){
 const b=Buffer.alloc(44+samples*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);b.writeUInt32LE(32000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(samples*2,40);for(let i=0;i<samples;i++)b.writeInt16LE(i%16000,44+i*2);return b;
}
const sha=b=>createHash('sha256').update(b).digest('hex');
function fixture(t,count=2,samples=16000){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'sayagain-watch-test-')),folder=path.join(root,'session');fs.mkdirSync(folder);
 const s=new Service(path.join(root,'data'));t.after(()=>{s.close();fs.rmSync(root,{recursive:true,force:true});});
 const manifest={schema:SCHEMA,device_id:randomUUID(),session_id:randomUUID(),sample_rate:16000,channels:1,bits_per_sample:16,started_at_ms:1773100800000,started_elapsed_ns:'999999999999999999',samples_captured:count*samples,durable_samples:count*samples,status:'completed',chunks:[],gaps:[]};
 const add=(n=samples)=>{
  const index=manifest.chunks.length,bytes=wav(n),chunk={id:`${manifest.session_id}_${index}`,index,file:`${String(index).padStart(6,'0')}.wav`,sample_start:manifest.chunks.reduce((sum,c)=>sum+c.sample_count,0),sample_count:n,byte_size:bytes.length,sha256:sha(bytes),status:'sealed',recovered:false};
  manifest.chunks.push(chunk);fs.writeFileSync(path.join(folder,chunk.file),bytes);return chunk;
 };
 for(let i=0;i<count;i++)add();
 const filename=path.join(folder,'manifest.json'),save=()=>fs.writeFileSync(filename,JSON.stringify(manifest));save();
 return{root,folder,s,manifest,filename,save,add};
}
test('watch import persists exact samples and unverified device time, fsyncs audio, and survives reopening',t=>{
 const {root,s,manifest,filename}=fixture(t,2,16001),oldFsync=fs.fsyncSync;let syncs=0;
 fs.fsyncSync=(...args)=>{syncs++;return oldFsync(...args);};let result;
 try{result=importWatchSession(s,filename);}finally{fs.fsyncSync=oldFsync;}
 assert(syncs>=4);assert.equal(result.imported_count,2);assert.equal(result.stored_count,2);assert(result.chunks.every(c=>c.status==='STORED'));
 const clips=s.store.list('recording_clip').sort((a,b)=>a.body.sequence-b.body.sequence);
 assert.equal(clips[1].body.sample_start,16001);assert.equal(clips[1].body.sample_count,16001);assert.equal(clips[1].body.source_offset_ms,1000.0625);assert.equal(clips[1].body.captured_at,manifest.started_at_ms+1000.0625);assert.equal(clips[1].body.original_time.reliability,'unverified');assert.equal(clips[0].body.watch.started_elapsed_ns,manifest.started_elapsed_ns);
 const reopened=new Service(path.join(root,'data'));
 try{const again=importWatchSession(reopened,filename);assert.equal(again.recording_id,result.recording_id);assert.equal(again.imported_count,0);assert.equal(reopened.store.list('recording_clip').length,2);assert.deepEqual(fs.readFileSync(reopened.asset(clips[0].body.asset_id).filename),wav(16001));}finally{reopened.close();}
});
test('all chunks validate before entity writes, including hash and PCM format',t=>{
 const {s,manifest,filename,folder,save}=fixture(t);
 fs.writeFileSync(path.join(folder,manifest.chunks[1].file),Buffer.alloc(manifest.chunks[1].byte_size));
 assert.throws(()=>importWatchSession(s,filename),/SHA-256/);assert.equal(s.store.list('recording').length,0);assert.equal(s.store.list('asset').length,0);assert.equal(fs.readdirSync(path.join(s.directory,'assets')).length,0);
 const broken=wav();broken.writeUInt32LE(8000,24);fs.writeFileSync(path.join(folder,manifest.chunks[1].file),broken);manifest.chunks[1].sha256=sha(broken);save();
 assert.throws(()=>importWatchSession(s,filename),/16000/);assert.equal(s.store.list('recording').length,0);assert(!fs.readdirSync(s.directory).some(f=>f.startsWith('.watch-import-')));
});
test('manifest rejects traversal, overlap, gaps, duplicate IDs, unsafe clocks and incomplete coverage',t=>{
 const {manifest}=fixture(t);const clone=()=>JSON.parse(JSON.stringify(manifest));
 const mutations=[m=>m.chunks[0].file='../000000.wav',m=>m.chunks[1].sample_start=15999,m=>m.chunks[1].sample_start=16001,m=>m.chunks[1].id=m.chunks[0].id,m=>m.chunks.pop(),m=>m.chunks[1].index=0,m=>m.started_elapsed_ns=Number.MAX_SAFE_INTEGER+1,m=>m.durable_samples++,m=>m.gaps=[{sample_start:100,sample_count:10,reason:'test'}],m=>m.chunks[0].byte_size++];
 for(const mutate of mutations){const m=clone();mutate(m);assert.throws(()=>validateManifest(m));}
});
test('symbolic links for a chunk, manifest or session directory are rejected',t=>{
 const {root,folder,s,manifest,filename}=fixture(t,1),audio=path.join(folder,manifest.chunks[0].file),target=path.join(root,'outside.wav');fs.renameSync(audio,target);
 try{fs.symlinkSync(target,audio);}catch(e){if(['EPERM','EACCES'].includes(e.code)){t.skip('This Windows account cannot create file symlinks');return;}throw e;}
 assert.throws(()=>importWatchSession(s,filename),/路径|符号链接/);assert.equal(s.store.list('recording').length,0);
 fs.unlinkSync(audio);fs.copyFileSync(target,audio);const outsideManifest=path.join(root,'outside.json');fs.renameSync(filename,outsideManifest);fs.symlinkSync(outsideManifest,filename);
 assert.throws(()=>importWatchSession(s,filename),/符号链接/);
 fs.unlinkSync(filename);fs.copyFileSync(outsideManifest,filename);const link=path.join(root,'linked-session');fs.symlinkSync(folder,link,'junction');assert.throws(()=>importWatchSession(s,path.join(link,'manifest.json')),/符号链接/);
});
test('live sealed prefixes append to one session and an ended or changed manifest cannot overwrite it',t=>{
 const {s,manifest,filename,save,add}=fixture(t,1);manifest.status='recording';manifest.samples_captured=17000;save();
 const first=importWatchSession(s,filename);assert.equal(first.pending_capture_samples,1000);
 add();manifest.durable_samples=32000;manifest.samples_captured=33000;save();const next=importWatchSession(s,filename);assert.equal(next.recording_id,first.recording_id);assert.equal(next.imported_count,1);
 const original=manifest.started_at_ms;manifest.started_at_ms++;save();assert.throws(()=>importWatchSession(s,filename),/元数据改变/);manifest.started_at_ms=original;
 manifest.status='completed';manifest.samples_captured=32000;save();assert.throws(()=>importWatchSession(s,filename),/回退/);
 manifest.samples_captured=33000;manifest.gaps=[{sample_start:32000,sample_count:1000,reason:'unwritten_tail'}];save();importWatchSession(s,filename);
 manifest.status='recording';save();assert.throws(()=>importWatchSession(s,filename),/已结束/);
});
test('same chunk identity with changed content or sample metadata is rejected',t=>{
 const {s,manifest,filename,folder,save}=fixture(t);importWatchSession(s,filename);
 const bytes=wav();bytes.writeInt16LE(1234,44);fs.writeFileSync(path.join(folder,manifest.chunks[0].file),bytes);manifest.chunks[0].sha256=sha(bytes);save();assert.throws(()=>importWatchSession(s,filename),/内容改变/);assert.equal(s.store.list('recording_clip').length,2);
 fs.writeFileSync(path.join(folder,manifest.chunks[0].file),wav());manifest.chunks[0].sha256=sha(wav());manifest.chunks[0].recovered=true;save();assert.throws(()=>importWatchSession(s,filename),/内容改变/);
});
test('disk/DB failure resumes acknowledged prefix without duplicate assets or clips',t=>{
 const {s,filename}=fixture(t,3),put=s.store.put.bind(s.store);let failed=false;
 s.store.put=(body,...args)=>{if(body.type==='recording_clip'&&body.watch.index===1&&!failed){failed=true;throw Error('simulated DB failure');}return put(body,...args);};
 assert.throws(()=>importWatchSession(s,filename),/simulated DB failure/);assert.equal(s.store.list('recording_clip').length,1);assert.equal(s.store.list('asset').length,1);assert.equal(fs.readdirSync(path.join(s.directory,'assets')).length,1);
 s.store.put=put;const retry=importWatchSession(s,filename);assert.equal(retry.imported_count,2);assert.equal(retry.stored_count,3);assert.equal(s.store.list('recording').length,1);assert.equal(s.store.list('recording_clip').length,3);assert.equal(fs.readdirSync(path.join(s.directory,'assets')).length,3);
});
test('failed asset fsync removes the uncommitted file and permits a clean retry',t=>{
 const {s,filename}=fixture(t,1),oldFsync=fs.fsyncSync;let calls=0;
 fs.fsyncSync=(...args)=>{calls++;if(calls===2)throw Error('simulated fsync failure');return oldFsync(...args);};
 try{assert.throws(()=>importWatchSession(s,filename),/fsync failure/);}finally{fs.fsyncSync=oldFsync;}
 assert.equal(s.store.list('recording_clip').length,0);assert.equal(s.store.list('asset').length,0);assert.equal(fs.readdirSync(path.join(s.directory,'assets')).length,0);
 const retry=importWatchSession(s,filename);assert.equal(retry.imported_count,1);assert.equal(retry.stored_count,1);assert.equal(s.store.list('recording').length,1);
});
test('local asset corruption never returns a STORED acknowledgement',t=>{
 const {s,filename}=fixture(t,1);const result=importWatchSession(s,filename),clip=s.entity(result.chunks[0].clip_id,'recording_clip');fs.writeFileSync(s.asset(clip.body.asset_id).filename,wav(15999));
 assert.throws(()=>importWatchSession(s,filename),/音频损坏/);
});
test('watch joining uses exact positions and capture identity instead of rounded duration or wall time',()=>{
 const base={source:'watch',audio:'a.wav',offset_ms:0,captured_at:0,duration_ms:1000,watch:{schema:SCHEMA,device_id:randomUUID(),session_id:randomUUID(),index:0,sample_rate:16000,sample_start:0,sample_count:16001}};
 const next={...base,audio:'b.wav',offset_ms:1000.0625,watch:{...base.watch,index:1,sample_start:16001}};
 const third={...next,audio:'c.wav',watch:{...next.watch,index:2,sample_start:32002}};
 const joined=groupSources([base,next,third]);assert.equal(joined.length,1);assert.equal(joined[0].watch.sample_count,48003);assert.equal(joined[0].duration_ms,3000.1875);assert.equal(base.watch.sample_count,16001);
 for(const changes of [{device_id:randomUUID()},{session_id:randomUUID()},{sample_start:16000},{sample_start:16002},{index:2},{continuity_id:1}])assert.equal(groupSources([base,{...next,watch:{...next.watch,...changes}}]).length,2);
 assert.equal(groupSources([base,{...next,source:'microphone'}]).length,2);
});
test('declared interruptions and an unwritten tail preserve absolute sample timeline',t=>{
 const {s,manifest,filename,save}=fixture(t);manifest.chunks[1].sample_start=20000;manifest.durable_samples=36000;manifest.samples_captured=37000;manifest.gaps=[{sample_start:16000,sample_count:4000,reason:'microphone_lost'},{sample_start:36000,sample_count:1000,reason:'unwritten_tail'}];save();
 const result=importWatchSession(s,filename);assert.equal(result.pending_capture_samples,1000);assert.deepEqual(result.gaps,manifest.gaps);
 const sources=s.store.list('recording_clip').sort((a,b)=>a.body.sequence-b.body.sequence).map(c=>({source:c.body.source,audio:s.asset(c.body.asset_id).filename,offset_ms:c.body.source_offset_ms,duration_ms:c.body.duration_ms,watch:c.body.watch}));
 assert.equal(groupSources(sources).length,2);assert.equal(sources[1].offset_ms,1250);
});
test('speech extraction crosses a save boundary and retains watch identity without breaking import retries',t=>{
 const {s,root,manifest,filename}=fixture(t);const imported=importWatchSession(s,filename);
 const sources=s.store.list('recording_clip').sort((a,b)=>a.body.sequence-b.body.sequence).map(c=>({id:c.block_id,revision:c.body.revision,asset_id:c.body.asset_id,source:c.body.source,audio:s.asset(c.body.asset_id).filename,name:c.body.source_name,offset_ms:c.body.source_offset_ms,duration_ms:c.body.duration_ms,captured_at:c.body.captured_at,watch:c.body.watch,original_time:c.body.original_time}));
 const grouped=groupSources(sources);fs.writeFileSync(path.join(root,'input-0000.wav'),wav(32000));fs.writeFileSync(path.join(root,'00001.wav'),wav(16001));
 persist(s,root,{version:'speaker-clips-v1',clips:[{file:'00001.wav',source_index:0,start_ms:500,end_ms:1500,speaker:'A',similarity:.7,review:false,text:'Across the boundary.'}]},grouped,'ignored',s.entity(imported.recording_id,'recording'));
 const active=s.state().recording_clips[0];assert.equal(active.body.watch.kind,'speech');assert.equal(active.body.sample_start,8000);assert.equal(active.body.sample_count,16001);assert.equal(active.body.original_time.value_ms,manifest.started_at_ms+500);assert.deepEqual(active.body.watch.source_chunk_ids,manifest.chunks.map(c=>c.id));
 const again=importWatchSession(s,filename);assert.equal(again.imported_count,0);assert.equal(again.stored_count,2);assert.equal(s.state().recording_clips.length,1);assert.equal(s.store.list('recording_clip').length,3);assert.equal(s.state().recording_sources[0].body.watch.session_id,manifest.session_id);
});
test('an import cannot silently move its session to another document',t=>{
 const {s,filename}=fixture(t);const original=importWatchSession(s,filename),other=s.createRecording({title:'Other'});assert.throws(()=>importWatchSession(s,filename,{recording_id:other.block_id}),/另一份/);assert.equal(s.entity(original.recording_id,'recording').body.watch_imported_chunks,2);
});
test('zero-length interruption events remain explicit and prevent joining across unknown elapsed time',t=>{
 const {s,manifest,filename,save}=fixture(t);manifest.gaps=[{sample_start:16000,sample_count:0,reason:'process_interrupted_unmeasured_tail'},{sample_start:32000,sample_count:0,reason:'process_interrupted_unmeasured_tail'}];save();
 const result=importWatchSession(s,filename);assert.deepEqual(result.gaps,manifest.gaps);assert.equal(result.pending_capture_samples,0);
 const sources=s.store.list('recording_clip').sort((a,b)=>a.body.sequence-b.body.sequence).map(c=>({source:c.body.source,audio:s.asset(c.body.asset_id).filename,offset_ms:c.body.source_offset_ms,duration_ms:c.body.duration_ms,watch:c.body.watch}));
 assert.equal(sources[0].watch.continuity_id,0);assert.equal(sources[1].watch.continuity_id,1);assert.equal(groupSources(sources).length,2);
 manifest.gaps=[{sample_start:8000,sample_count:0,reason:'process_interrupted_unmeasured_tail'}];assert.throws(()=>validateManifest(manifest),/分片边界/);
});
test('real watch live checkpoint imports only sealed files while preserving physical durable partial counters',t=>{
 const {s,manifest,filename,folder,save,add}=fixture(t,1,960000);
 manifest.chunk_seconds=60;manifest.sealed_samples=960000;manifest.durable_samples=1040000;manifest.samples_captured=1043200;manifest.status='recording';
 fs.writeFileSync(path.join(folder,'000001.wav.partial'),wav(80000));save();
 const first=importWatchSession(s,filename);assert.equal(first.stored_count,1);assert.equal(first.pending_capture_samples,83200);assert.equal(first.durable_unsealed_samples,80000);assert.equal(first.session.body.watch.sealed_samples,960000);assert.equal(s.store.list('recording_clip').length,1);
 manifest.durable_samples=1060000;manifest.samples_captured=1063200;save();const checkpoint=importWatchSession(s,filename);assert.equal(checkpoint.imported_count,0);assert.equal(checkpoint.pending_capture_samples,103200);
 for(const [field,value] of [['sealed_samples',959999],['durable_samples',1059999],['samples_captured',1063199]]){const saved=manifest[field];manifest[field]=value;save();assert.throws(()=>importWatchSession(s,filename));manifest[field]=saved;}
 add(294400);manifest.sealed_samples=1254400;manifest.durable_samples=1254400;manifest.samples_captured=1254400;manifest.status='completed';save();
 const stopped=importWatchSession(s,filename);assert.equal(stopped.recording_id,first.recording_id);assert.equal(stopped.imported_count,1);assert.equal(stopped.pending_capture_samples,0);assert.equal(stopped.durable_unsealed_samples,0);assert.equal(s.entity(first.recording_id,'recording').body.watch.sealed_samples,1254400);
 const retry=importWatchSession(s,filename);assert.equal(retry.imported_count,0);assert.equal(retry.stored_count,2);
});
test('sealed, physical durable and completed counters reject impossible protocol snapshots',t=>{
 const {manifest}=fixture(t,1);manifest.chunk_seconds=60;manifest.sealed_samples=16000;manifest.status='recording';manifest.durable_samples=17000;manifest.samples_captured=18000;
 assert.equal(validateManifest(manifest).sealed_samples,16000);
 for(const mutate of [m=>m.sealed_samples=-1,m=>m.sealed_samples=17001,m=>m.sealed_samples=15999,m=>m.durable_samples=16000+960001,m=>{m.durable_samples=16000+960001;m.samples_captured=m.durable_samples;},m=>m.status='completed',m=>m.status='interrupted',m=>m.chunk_seconds=0]){const changed=JSON.parse(JSON.stringify(manifest));mutate(changed);assert.throws(()=>validateManifest(changed));}
 const old={...manifest};delete old.sealed_samples;old.durable_samples=16000;assert.equal(validateManifest(old).sealed_samples,16000);
});
test('error partial recovery can extend a stored prefix only with recovered chunks and monotonic counters',t=>{
 const {s,manifest,filename,save,add}=fixture(t,1);manifest.sealed_samples=16000;manifest.durable_samples=24000;manifest.samples_captured=25000;manifest.status='error';manifest.gaps=[{sample_start:24000,sample_count:1000,reason:'writer_error'}];save();
 const first=importWatchSession(s,filename);assert.equal(first.pending_capture_samples,9000);assert.equal(first.stored_count,1);
 const recovered=add(8000);recovered.recovered=true;manifest.sealed_samples=24000;manifest.gaps=[{sample_start:24000,sample_count:1000,reason:'process_interrupted_after_capture'},{sample_start:25000,sample_count:0,reason:'process_interrupted_unmeasured_tail'}];save();
 const retry=importWatchSession(s,filename);assert.equal(retry.recording_id,first.recording_id);assert.equal(retry.imported_count,1);assert.equal(retry.pending_capture_samples,1000);assert.equal(retry.durable_unsealed_samples,0);
});
