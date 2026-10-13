// Uses a real ADB-exported session in a disposable application profile; never starts a microphone.
const {_electron:electron}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const root=path.resolve(__dirname,'..');
const manifestPath=process.argv[2]&&path.resolve(process.argv[2]);
if(!manifestPath||!fs.existsSync(manifestPath))throw Error('Usage: node scripts/smoke-watch-import.cjs /absolute/session/manifest.json');
const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'sayagain-watch-ui-'));
const output=path.join(root,'test-results','watch');fs.mkdirSync(output,{recursive:true});
let app;
(async()=>{
 app=await electron.launch({args:[root],env:{...process.env,SAYAGAIN_DATA_DIR:temporary},timeout:60000});
 const page=await app.firstWindow(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.waitForSelector('#language-form');
 await page.locator('#language-form [name="native_language"]').fill('zh-CN');
 await page.locator('#language-form [name="target_language"]').fill('en-US');
 await page.locator('#language-form button[type="submit"]').click();
 await page.waitForSelector('[data-page="recordings"]');await page.locator('[data-page="recordings"]').click();
 await page.waitForSelector('#watch-import');
 await app.evaluate(({dialog},filename)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[filename]});},manifestPath);
 await page.locator('#watch-import').click();
 await page.waitForFunction(()=>document.querySelector('#recording-status')?.textContent.includes('手表录音已保存'));
 const importStatus=await page.locator('#recording-status').textContent();
 assert(importStatus.includes('手表录音已保存'),importStatus);
 const first=await page.evaluate(()=>window.sayagain.state());
 assert.equal(first.recordings.length,1);assert.equal(first.recording_clips.length,manifest.chunks.length);
 assert(first.recording_clips.every(clip=>clip.body.source==='watch'));
 assert.equal(first.recording_clips.reduce((n,c)=>n+c.body.duration_ms,0),manifest.chunks.reduce((n,c)=>n+c.sample_count*1000/manifest.sample_rate,0));
 // The top player is a single original recording, including the silence across save boundaries.
 await page.waitForFunction(()=>{const a=document.querySelector('#watch-full-audio');return a&&Number.isFinite(a.duration)&&a.duration>0;});
 const duration=manifest.chunks.reduce((n,c)=>n+c.sample_count,0)/manifest.sample_rate;
 assert(Math.abs(await page.locator('#watch-full-audio').evaluate(a=>a.duration)-duration)<.001);
 assert.equal(await page.locator('#watch-recognition-status').getAttribute('data-state'),'unrecognized');
 assert.equal(await page.locator('#watch-raw-chunks').getAttribute('open'),null);
 await page.locator('#global-volume [data-volume]').evaluate(el=>{el.value='0';el.dispatchEvent(new Event('input',{bubbles:true}));});
 const currentSource=await page.locator('#watch-full-audio').getAttribute('src');
 if(duration>61){
  await page.locator('#watch-full-seek').evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));},Math.round(59.8/duration*1000));
  await page.locator('#watch-full-play').click();
  await page.waitForFunction(()=>{const a=document.querySelector('#watch-full-audio');return a&&!a.paused&&a.currentTime>60.3;});
  assert.equal(await page.locator('#watch-full-audio').getAttribute('src'),currentSource);
  await page.locator('#watch-full-play').click();
  assert(await page.locator('#watch-full-audio').evaluate(a=>a.paused));
 }
 await page.locator('#watch-full-seek').evaluate(el=>{el.value='500';el.dispatchEvent(new Event('input',{bubbles:true}));});
 assert(Math.abs(await page.locator('#watch-full-audio').evaluate(a=>a.currentTime)-duration/2)<.01);
 await app.evaluate(({ipcMain},id)=>{
  globalThis.watchRecognitionRequests=[];globalThis.watchRecognitionJob={state:'idle'};
  ipcMain.removeHandler('sayagain:speakerPipeline');ipcMain.handle('sayagain:speakerPipeline',(_event,input)=>{
   if(input.action==='session'){globalThis.watchRecognitionRequests.push(input);globalThis.watchRecognitionJob={state:'running',stage:'decode',recording_id:id,engine:'campplus',done:0,total:1};}
   if(input.action==='cancel')globalThis.watchRecognitionJob={state:'cancelled',stage:'cancelled',recording_id:id};
   return globalThis.watchRecognitionJob;
  });
 },first.recordings[0].block_id);
 await page.locator('#watch-recognize').click();
 await page.waitForFunction(()=>document.querySelector('#watch-recognition-status')?.dataset.state==='recognizing');
 const requests=await app.evaluate(()=>globalThis.watchRecognitionRequests);
 assert.equal(requests.length,1);assert.deepEqual(requests[0].clip_ids.sort(),first.recording_clips.map(c=>c.block_id).sort());
 await page.locator('#watch-recognition-cancel').click();
 await page.waitForFunction(()=>document.querySelector('#watch-recognition-status')?.dataset.state==='unrecognized');
 assert.equal(await page.locator('#watch-full-audio').getAttribute('src'),currentSource);
 await page.screenshot({path:path.join(output,'import-desktop.png')});
 await page.locator('#watch-import').click();
 await page.waitForFunction(()=>document.querySelector('#recording-status')?.textContent.includes('新增 0 段'));
 const repeated=await page.evaluate(()=>window.sayagain.state());
 assert.equal(repeated.recordings.length,1);assert.equal(repeated.recording_clips.length,manifest.chunks.length);
 assert.deepEqual(errors,[]);
 console.log(`Passed Electron watch import: ${manifest.chunks.length} real device WAV chunks, whole original playback and seek across a save boundary, explicit recognition/cancel, duplicate import adds zero clips.`);
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
 if(app)await app.close();
 fs.rmSync(temporary,{recursive:true,force:true});
});
