const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const {Service}=require('../desktop/service.cjs');
const {exportWatchReceipts,openReadOnlyService,SCHEMA}=require('../desktop/watch-receipts.cjs');
const {run,mergeReceipts}=require('../scripts/watch-receipts.cjs');
function wav(samples=16000,seed=1){
 const b=Buffer.alloc(44+samples*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);b.writeUInt32LE(32000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(samples*2,40);for(let i=0;i<samples;i++)b.writeInt16LE((i+seed)%10000,44+i*2);return b;
}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function fixture(t,count=2){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'sayagain-watch-receipts-')),service=new Service(path.join(root,'data')),device_id=randomUUID(),session_id=randomUUID(),recording=service.createRecording({title:'Private test recording'}),clips=[];
 let closed=false;t.after(()=>{if(!closed)service.close();fs.rmSync(root,{recursive:true,force:true});});
 function add(index=clips.length,device=device_id,session=session_id,seed=index+1){
  const chunk_id=`${session}_${index}`,clip=service.addRecordingClip({recording_id:recording.block_id,client_id:chunk_id,source:'watch',source_name:'PRIVATE FILE NAME',bytes:wav(16000,seed),watch:{schema:'sayagain-watch-v1',device_id:device,session_id:session,chunk_id,index,sample_start:index*16000,sample_count:16000,started_at_ms:1773100800000,started_elapsed_ns:'9000000000000000',recovered:false}});
  const saved=service.update(clip,{imported_at:1710000000000+index,status:'archived',transcript:'PRIVATE TRANSCRIPT',transcript_status:'user_reviewed'});clips.push(saved);return saved;
 }
 for(let i=0;i<count;i++)add();
 return {root,service,device_id,session_id,recording,clips,add,close(){if(!closed){closed=true;service.close();}}};
}
function databaseSnapshot(directory){return Object.fromEntries(['SayAgain','SayAgain1','SayAgain2'].map(name=>{const filename=path.join(directory,name),stat=fs.statSync(filename);return[name,{sha256:hash(fs.readFileSync(filename)),mtime_ms:stat.mtimeMs,bytes:stat.size}];}));}
test('verified archived raw clips get minimal STORED receipts with their actual import timestamps',t=>{
 const {service,clips,device_id,session_id}=fixture(t),before=databaseSnapshot(service.directory),exported=exportWatchReceipts(service);
 assert.equal(exported.schema,SCHEMA);assert.equal(exported.receipts.length,2);
 assert.deepEqual(exported.receipts.map(r=>r.stored_at_ms),[1710000000000,1710000000001]);
 for(const [index,r] of exported.receipts.entries()){assert.deepEqual(Object.keys(r),['device_id','session_id','chunk_id','sha256','status','stored_at_ms']);assert.equal(r.device_id,device_id);assert.equal(r.session_id,session_id);assert.equal(r.chunk_id,`${session_id}_${index}`);assert.equal(r.sha256,clips[index].body.sha256);assert.equal(r.status,'STORED');}
 assert(!JSON.stringify(exported).includes('PRIVATE'));assert.deepEqual(databaseSnapshot(service.directory),before);assert.equal(service.store.list('recording_source').length,0);
});
test('ASR-derived speech and unrelated import audio never masquerade as saved watch chunks',t=>{
 const {service,recording,clips}=fixture(t,1),raw=clips[0];
 service.store.put({...raw.body,status:'active',watch:{...raw.body.watch,kind:'speech'},client_id:'speech',pipeline_version:'speaker-clips-v1'});
 service.addRecordingClip({recording_id:recording.block_id,client_id:'manual',source:'import',bytes:wav()});
 const exported=exportWatchReceipts(service);assert.equal(exported.receipts.length,1);assert.equal(exported.receipts[0].chunk_id,raw.body.watch.chunk_id);
});
test('device filtering and optional client identity do not create persistent settings or use credentials',t=>{
 const {service,device_id,add}=fixture(t,1),other=randomUUID(),client_id=randomUUID();add(0,other,randomUUID());const before=databaseSnapshot(service.directory);
 const exported=exportWatchReceipts(service,{device_id,client_id});assert.equal(exported.receipts.length,1);assert.equal(exported.receipts[0].client_id,client_id);assert.equal(exportWatchReceipts(service,{device_id:randomUUID()}).receipts.length,0);
 assert.throws(()=>exportWatchReceipts(service,{device_id:'wrong'}),/设备标识/);assert.throws(()=>exportWatchReceipts(service,{client_id:'secret-token'}),/安装标识/);assert.deepEqual(databaseSnapshot(service.directory),before);
});
test('identical duplicate refs dedupe with the first real save timestamp and conflicting refs reject',t=>{
 const {service,clips}=fixture(t,1),raw=clips[0];service.store.put({...raw.body,imported_at:raw.body.imported_at+1000});assert.equal(exportWatchReceipts(service).receipts.length,1);assert.equal(exportWatchReceipts(service).receipts[0].stored_at_ms,raw.body.imported_at);
 service.store.put({...raw.body,watch:{...raw.body.watch,sample_start:1},sample_start:1});assert.throws(()=>exportWatchReceipts(service),/冲突/);
});
test('corrupt or missing saved audio throws without returning a false STORED batch',t=>{
 const {service,clips}=fixture(t),filename=service.asset(clips[1].body.asset_id).filename,bytes=fs.readFileSync(filename),bad=Buffer.from(bytes);bad[54]^=1;fs.writeFileSync(filename,bad);
 assert.throws(()=>exportWatchReceipts(service),/SHA-256/);fs.writeFileSync(filename,bytes);fs.unlinkSync(filename);assert.throws(()=>exportWatchReceipts(service));assert.equal(service.store.list('recording_clip').length,2);
});
test('matching hash alone does not permit malformed WAV format or count metadata',t=>{
 const {service,clips}=fixture(t,1),clip=clips[0],asset=service.entity(clip.body.asset_id,'asset'),filename=service.asset(asset.block_id).filename,bytes=fs.readFileSync(filename);bytes.writeUInt32LE(8000,24);fs.writeFileSync(filename,bytes);const sha256=hash(bytes);
 service.update(asset,{sha256});service.update(clip,{sha256});assert.throws(()=>exportWatchReceipts(service),/WAV 格式/);
});
test('asset symlinks cannot be acknowledged even when they point to matching PCM bytes',t=>{
 const {root,service,clips}=fixture(t,1),filename=service.asset(clips[0].body.asset_id).filename,target=path.join(root,'external.wav');fs.renameSync(filename,target);
 try{fs.symlinkSync(target,filename);}catch(error){if(['EPERM','EACCES'].includes(error.code)){t.skip('This Windows account cannot create file symlinks');return;}throw error;}
 assert.throws(()=>exportWatchReceipts(service),/符号链接/);
});
test('missing real import time and mismatched asset metadata cannot invent a save event',t=>{
 const {service,clips}=fixture(t,1),clip=clips[0];service.update(clip,{imported_at:null});assert.throws(()=>exportWatchReceipts(service),/保存时间/);
 const current=service.entity(clip.block_id,'recording_clip');service.update(current,{imported_at:clip.body.imported_at});const asset=service.entity(clip.body.asset_id,'asset');service.update(asset,{byte_size:asset.body.byte_size+2});assert.throws(()=>exportWatchReceipts(service),/资产元数据/);
});
test('read-only SQLite adapter and CLI preserve database bytes and timestamps and write only minimal local refs',t=>{
 const f=fixture(t);f.close();const directory=f.service.directory,before=databaseSnapshot(directory),readonly=openReadOnlyService(directory);
 try{assert.equal(exportWatchReceipts(readonly).receipts.length,2);assert.equal(readonly.store.list('recording').length,1);}finally{readonly.close();}
 assert.deepEqual(databaseSnapshot(directory),before);
 const output=path.join(f.root,'exports','receipts.json'),summary=run(['--data-dir',directory,'--output',output]);assert.equal(summary.receipt_count,2);assert.equal(summary.session_count,1);assert.equal(summary.device_count,1);assert.equal(summary.output,output);assert(!JSON.stringify(summary).includes(f.device_id));assert(!JSON.stringify(summary).includes(f.clips[0].body.sha256));
 const parsed=JSON.parse(fs.readFileSync(output,'utf8'));assert.equal(parsed.schema,SCHEMA);assert.equal(parsed.receipts.length,2);assert(!JSON.stringify(parsed).includes('PRIVATE'));assert.deepEqual(databaseSnapshot(directory),before);
 run(['--data-dir',directory,'--output',output]);assert.equal(JSON.parse(fs.readFileSync(output,'utf8')).receipts.length,2);assert.deepEqual(databaseSnapshot(directory),before);
});
test('CLI preserves an existing output on validation failure and rejects overwriting other JSON documents',t=>{
 const f=fixture(t,1),directory=f.service.directory,filename=f.service.asset(f.clips[0].body.asset_id).filename,output=path.join(f.root,'receipts.json');f.close();run(['--data-dir',directory,'--output',output]);const before=fs.readFileSync(output);fs.writeFileSync(filename,Buffer.alloc(100));assert.throws(()=>run(['--data-dir',directory,'--output',output]));assert.deepEqual(fs.readFileSync(output),before);
 fs.writeFileSync(output,JSON.stringify({schema:'different-document',important:'keep'}));const other=fs.readFileSync(output);assert.throws(()=>run(['--data-dir',directory,'--output',output]),/不是手表保存回执/);assert.deepEqual(fs.readFileSync(output),other);
});
test('receipt metadata merge preserves unrelated devices and the earliest actual save event',t=>{
 const {service}=fixture(t,1),current=exportWatchReceipts(service),earliest={...current.receipts[0],stored_at_ms:current.receipts[0].stored_at_ms-1000,client_id:randomUUID()},otherSession=randomUUID();
 const other={device_id:randomUUID(),session_id:otherSession,chunk_id:`${otherSession}_9`,sha256:'a'.repeat(64),status:'STORED',stored_at_ms:1700000000000,client_id:randomUUID(),private_extra:'do not copy'};
 const existing={schema:SCHEMA,receipts:[earliest,{...earliest,stored_at_ms:earliest.stored_at_ms+2000},other]},before=JSON.stringify(existing),merged=mergeReceipts(existing,current);
 assert.equal(merged.receipts.length,2);assert.deepEqual(merged.receipts.find(r=>r.chunk_id===earliest.chunk_id),earliest);assert.equal(merged.receipts.find(r=>r.chunk_id===other.chunk_id).device_id,other.device_id);assert(!JSON.stringify(merged).includes('private_extra'));assert.equal(JSON.stringify(existing),before);
 const reversed=mergeReceipts(current,existing);assert.deepEqual(reversed,merged);
});
test('receipt merge validates identity, checksum, STORED status and event time before acknowledging',t=>{
 const {service}=fixture(t,1),valid=exportWatchReceipts(service),copy=()=>JSON.parse(JSON.stringify(valid)),invalid=[r=>r.device_id='bad',r=>r.session_id='bad',r=>r.chunk_id=`${r.session_id}_01`,r=>r.chunk_id=`${randomUUID()}_0`,r=>r.sha256='bad',r=>r.status='COPIED',r=>r.stored_at_ms=0,r=>r.stored_at_ms=1.5,r=>r.client_id='credential-token'];
 for(const change of invalid){const bad=copy();change(bad.receipts[0]);assert.throws(()=>mergeReceipts(bad,valid));}
 assert.throws(()=>mergeReceipts({...valid,schema:'different'},valid));assert.throws(()=>mergeReceipts({...valid,receipts:null},valid));
 const upper=copy();for(const key of ['device_id','session_id','chunk_id','sha256'])upper.receipts[0][key]=upper.receipts[0][key].toUpperCase();assert.deepEqual(mergeReceipts(upper,valid),valid);
 const conflict=copy();conflict.receipts[0].sha256='f'.repeat(64);assert.throws(()=>mergeReceipts(conflict,valid),/不同 SHA-256/);
});
test('CLI merges the previous watch ledger without writing SQLite and retains old output on bad JSON or conflicts',t=>{
 const f=fixture(t,1),current=exportWatchReceipts(f.service),otherSession=randomUUID(),other={device_id:randomUUID(),session_id:otherSession,chunk_id:`${otherSession}_0`,sha256:'b'.repeat(64),status:'STORED',stored_at_ms:1700000000000};
 const earlier={...current.receipts[0],stored_at_ms:current.receipts[0].stored_at_ms-1000},ledger=path.join(f.root,'watch-ledger.json'),output=path.join(f.root,'merged-receipts.json');fs.writeFileSync(ledger,JSON.stringify({schema:SCHEMA,receipts:[earlier,other]}));f.close();const directory=f.service.directory,before=databaseSnapshot(directory);
 const summary=run(['--data-dir',directory,'--device-id',f.device_id,'--output',output,'--merge',ledger]);assert.equal(summary.receipt_count,2);assert.equal(summary.device_count,2);assert.equal(summary.session_count,2);const merged=JSON.parse(fs.readFileSync(output,'utf8'));assert.deepEqual(merged.receipts.find(r=>r.chunk_id===earlier.chunk_id),earlier);assert.deepEqual(merged.receipts.find(r=>r.chunk_id===other.chunk_id),other);assert.deepEqual(databaseSnapshot(directory),before);
 const stable=fs.readFileSync(output);fs.writeFileSync(ledger,'{broken JSON');assert.throws(()=>run(['--data-dir',directory,'--output',output,'--merge',ledger]),/JSON 损坏/);assert.deepEqual(fs.readFileSync(output),stable);assert.deepEqual(databaseSnapshot(directory),before);
 fs.writeFileSync(ledger,JSON.stringify({schema:SCHEMA,receipts:[{...earlier,sha256:'f'.repeat(64)}]}));assert.throws(()=>run(['--data-dir',directory,'--output',output,'--merge',ledger]),/不同 SHA-256/);assert.deepEqual(fs.readFileSync(output),stable);assert.deepEqual(databaseSnapshot(directory),before);
 // The watch ledger can also be the output: read and validate before atomic replacement.
 fs.writeFileSync(ledger,stable);run(['--data-dir',directory,'--output',ledger,'--merge',ledger]);assert.deepEqual(JSON.parse(fs.readFileSync(ledger,'utf8')),merged);assert.deepEqual(databaseSnapshot(directory),before);
});
