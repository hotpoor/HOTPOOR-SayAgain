// Deterministic microphone capture callbacks; actual IPC, FFmpeg and local models.
const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=path.resolve(__dirname,'..'),directory=fs.mkdtempSync(path.join(os.tmpdir(),'sayagain-mic-pipeline-'));let app;
(async()=>{try{
 fs.mkdirSync(path.join(directory,'recording-models'));fs.copyFileSync(process.env.SAYAGAIN_TEST_RUNTIME,path.join(directory,'recording-models/runtime.json'));
 app=await electron.launch({args:[root],env:{...process.env,SAYAGAIN_DATA_DIR:directory},timeout:60000});const page=await app.firstWindow();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].hide());
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.waitForSelector('#language-form');await page.locator('[name="native_language"]').fill('zh-CN');await page.locator('[name="target_language"]').fill('en-US');await page.locator('#language-form button[type="submit"]').click();
 const id=await page.evaluate(async()=>{const session=await window.sayagain.createRecording({title:'Microphone pipeline'});return session.block_id;});
 await page.locator('[data-page="recordings"]').click();await page.locator(`[data-recording-open="${id}"]`).click();
 await page.locator('#pipeline-language').selectOption('en');
 // Decode real speech, replace only the hardware capture interface, emit two 30s checkpoints.
 await page.evaluate(async bytes=>{
  const decoder=new AudioContext(),buffer=await decoder.decodeAudioData(new Uint8Array(bytes).buffer);await decoder.close();
  const offline=new OfflineAudioContext(1,Math.round(buffer.duration*16000),16000),node=offline.createBufferSource();node.buffer=buffer;node.connect(offline.destination);node.start();const samples=(await offline.startRendering()).getChannelData(0);
  navigator.mediaDevices.getUserMedia=async()=>({getTracks:()=>[{stop(){}}]});
  window.AudioContext=class{sampleRate=16000;resume(){return Promise.resolve();}close(){}createMediaStreamSource(){return{connect(){},disconnect(){}};}createScriptProcessor(){const processor={disconnect(){},connect(){for(let start=0;start<samples.length;start+=480000)processor.onaudioprocess({inputBuffer:{getChannelData:()=>samples.slice(start,start+480000)}});}};return processor;}};
 },[...fs.readFileSync(process.env.SAYAGAIN_TEST_AUDIO)]);
 await page.locator('#recording-start').click();await page.locator('#recording-stop').click();
 await page.waitForFunction(async()=>{const job=await window.sayagain.speakerPipeline({action:'status'});if(job.state==='failed')throw Error(job.error);return job.state==='completed';},{},{timeout:300000});
 await page.waitForFunction(()=>document.querySelector('#recording-status').textContent.includes('已生成'));
 const state=await page.evaluate(()=>window.sayagain.state()),result=state.recordings.find(s=>s.body.pipeline),clips=state.recording_clips.filter(c=>c.body.recording_id===result.block_id),original=state.recording_clips.filter(c=>c.body.recording_id===id);
 assert.equal(original.length,2);assert(clips.some(c=>c.body.transcript));assert(clips.every(c=>c.body.transcription_language==='en'&&c.body.speaker_analysis.status==='machine_unreviewed'));
 const source=state.recording_sources.find(s=>s.body.recording_id===result.block_id);assert.equal(source.body.input_assets.length,2);assert.equal(source.body.duration_ms,60000);assert(source.body.original_asset_id);assert(clips.every(c=>c.body.source_clip_ids.length===2));
 assert(await page.locator(`audio[src="sayagain-asset://audio/${source.body.original_asset_id}"]`).count()>0);
 assert.deepEqual(errors,[]);console.log(`PASS: stop recording automatically joins two checkpoints, preserves originals and creates ${clips.length} transcribed speaker clips.`);
}finally{if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}fs.rmSync(directory,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
