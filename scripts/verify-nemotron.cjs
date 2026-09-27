// Explicit local fixture only; never selects a user's recording implicitly.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {Service}=require('../desktop/service.cjs');
const {SpeakerPipeline}=require('../desktop/speaker-pipeline.cjs');
const [runtimeFile,audioFile,outputDirectory]=process.argv.slice(2);
if(!runtimeFile||!audioFile||!outputDirectory)throw Error('Usage: node verify-nemotron.cjs runtime.json fixture.wav NEW-output-directory');
if(fs.existsSync(outputDirectory))throw Error('Output directory must be new');
fs.mkdirSync(path.join(outputDirectory,'recording-models'),{recursive:true});
fs.copyFileSync(runtimeFile,path.join(outputDirectory,'recording-models/runtime.json'));
const service=new Service(path.join(outputDirectory,'data'));
const pipeline=new SpeakerPipeline(service,outputDirectory);
async function wait(){const deadline=Date.now()+30*60*1000;while(pipeline.status().state==='running'){
 if(Date.now()>deadline){pipeline.cancel();throw Error('Timed out');}
 await new Promise(r=>setTimeout(r,1000));
}const status=pipeline.status();assert.equal(status.state,'completed',status.error);return status;}
(async()=>{try{
 pipeline.start({filename:path.resolve(audioFile),options:{engine:'campplus',language:'auto'}});
 const first=await wait();
 const original=service.store.list('recording_source')[0];
 const oldClips=service.store.list('recording_clip').map(c=>JSON.stringify(c));
 pipeline.start({id:first.recording_id,source_id:original.block_id,options:{engine:'nemotron',language:'auto'}});
 await wait();
 const sources=service.store.list('recording_source');assert.equal(sources.length,2);
 for(const row of oldClips){const before=JSON.parse(row);assert.equal(JSON.stringify(service.entity(before.block_id,'recording_clip')),row);}
 const report=sources.map(s=>({name:s.body.name,engine:s.body.pipeline.engine,
  elapsed_seconds:s.body.pipeline.elapsed_seconds,device:s.body.pipeline.device,
  peak_cuda_bytes:s.body.pipeline.peak_cuda_bytes,overlap_ms:s.body.pipeline.overlap_ms,
  speakers:s.body.pipeline.clustering?.speakers,
  clips:service.store.list('recording_clip').filter(c=>c.body.recording_source_id===s.block_id).length}));
 fs.writeFileSync(path.join(outputDirectory,'comparison.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({outputDirectory,report}));
}finally{pipeline.close();service.close();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
