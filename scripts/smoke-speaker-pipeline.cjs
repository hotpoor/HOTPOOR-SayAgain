// Isolated end-to-end inference through the actual desktop IPC and persistence.
const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=path.resolve(__dirname,'..'),directory=fs.mkdtempSync(path.join(os.tmpdir(),'sayagain-speaker-ui-'));let app;
(async()=>{try{
 if(!process.env.SAYAGAIN_TEST_RUNTIME||!process.env.SAYAGAIN_TEST_AUDIO)throw Error('Set SAYAGAIN_TEST_RUNTIME and SAYAGAIN_TEST_AUDIO');
 fs.mkdirSync(path.join(directory,'recording-models'));fs.copyFileSync(process.env.SAYAGAIN_TEST_RUNTIME,path.join(directory,'recording-models/runtime.json'));
 app=await electron.launch({args:[root],env:{...process.env,SAYAGAIN_DATA_DIR:directory},timeout:60000});const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept().catch(()=>{}));console.log('Desktop launched');
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].hide());
 await page.waitForSelector('#language-form');await page.locator('#language-form [name="native_language"]').fill('zh-CN');await page.locator('#language-form [name="target_language"]').fill('en-US');await page.locator('#language-form button[type="submit"]').click();await page.locator('[data-page="recordings"]').click();
 await app.evaluate(({dialog},filename)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[filename]});},path.resolve(process.env.SAYAGAIN_TEST_AUDIO));
 await page.locator('#pipeline-language').selectOption('en');await page.locator('#pipeline-count').selectOption('2');await page.locator('#pipeline-import').click();console.log('Pipeline started');
 await page.waitForFunction(async()=>{const j=await window.sayagain.speakerPipeline({action:'status'});if(j.state==='failed')throw Error(j.error);return j.state==='completed';},{},{timeout:300000});
 await page.waitForFunction(()=>document.querySelector('#recording-status').textContent.includes('已生成'));
 console.log('Pipeline UI completed');let state=await page.evaluate(()=>window.sayagain.state());const result=state.recordings.find(r=>r.body.pipeline);assert(result);assert(result.body.clip_count>5);assert.equal(result.body.pipeline.clustering.speakers,2);
 const clips=state.recording_clips.filter(c=>c.body.recording_id===result.block_id);assert(clips.every(c=>c.body.duration_ms<=18001&&c.body.transcript_status==='machine_unreviewed'));assert(clips.some(c=>c.body.transcript.length>10));
 await page.locator('#clip-speaker').selectOption('A');assert((await page.locator('.recording-clip').count())>0);await page.locator('#clip-speaker').selectOption('');
 const audio=page.locator('.recording-clip audio').first();await audio.evaluate(a=>a.play());await page.waitForFunction(()=>document.querySelector('.recording-clip audio').currentTime>0);await audio.evaluate(a=>a.pause());
 console.log('Playback passed');await page.reload();await page.locator('[data-page="recordings"]').click();state=await page.evaluate(()=>window.sayagain.state());assert(state.recordings.some(r=>r.block_id===result.block_id));
 // Cancel a second run and ensure there is no second result or partial assets.
 const before=state.recordings.length;await page.locator('#pipeline-import').click();await page.waitForFunction(()=>!document.querySelector('#pipeline-cancel').hidden);await page.locator('#pipeline-cancel').click();
 await page.waitForFunction(()=>document.querySelector('#recording-status').textContent.includes('已取消'),{},{timeout:30000});state=await page.evaluate(()=>window.sayagain.state());assert.equal(state.recordings.length,before);
 assert.deepEqual(errors,[]);console.log(`PASS: native file import, inference, ${clips.length} clips, two speakers, filtering, playback, reload, cancellation.`);
 if(process.env.SAYAGAIN_TEST_SCREENSHOT){await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].show());await page.screenshot({path:path.join(root,'test-results/speaker-pipeline/ui.png')});}
 }catch(e){console.error('Smoke failure:',e);throw e;}finally{if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}fs.rmSync(directory,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
