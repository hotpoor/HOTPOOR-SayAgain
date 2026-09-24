const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=path.resolve(__dirname,'..'),directory=fs.mkdtempSync(path.join(os.tmpdir(),'sayagain-recording-ui-'));let app;
function wav(){const b=Buffer.alloc(32044);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);b.writeUInt32LE(32000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(32000,40);return b;}
(async()=>{try{
 if(process.env.SAYAGAIN_TEST_RUNTIME){fs.mkdirSync(path.join(directory,'recording-models'));fs.copyFileSync(process.env.SAYAGAIN_TEST_RUNTIME,path.join(directory,'recording-models/runtime.json'));}
 app=await electron.launch({args:[root,'--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'],env:{...process.env,SAYAGAIN_DATA_DIR:directory},timeout:60000});
 const page=await app.firstWindow(),errors=[];
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].hide());page.on('pageerror',e=>errors.push(e.message));
 await page.waitForSelector('#language-form');await page.locator('#language-form [name="native_language"]').fill('zh-CN');await page.locator('#language-form [name="target_language"]').fill('en-US');await page.locator('#language-form button[type="submit"]').click();
 await page.locator('[data-page="recordings"]').click();await page.locator('#recording-title').fill('录音测试');await page.locator('#recording-create').click();await page.waitForFunction(()=>!document.querySelector('#recording-start').disabled);
 await page.locator('#recording-files').setInputFiles([{name:'one.wav',mimeType:'audio/wav',buffer:wav()},{name:'two.wav',mimeType:'audio/wav',buffer:wav()}]);
 await page.waitForFunction(()=>document.querySelectorAll('.recording-clip').length===2);
 await page.locator('#recording-start').click();await page.waitForFunction(()=>!document.querySelector('#recording-stop').disabled);await page.waitForTimeout(1500);await page.locator('#recording-stop').click();await page.waitForFunction(()=>document.querySelectorAll('.recording-clip').length===3);
 await page.locator('[data-transcript]').first().fill('手动修正');await page.locator('[data-save-transcript]').first().click();await page.waitForFunction(()=>document.querySelector('[data-transcript]').value==='手动修正');
 await page.reload();await page.locator('[data-page="recordings"]').click();await page.waitForFunction(()=>document.querySelectorAll('.recording-clip').length===3);
 assert.equal(await page.locator('audio').count(),3);assert.deepEqual(errors,[]);console.log('PASS: multi-file import, microphone recording, grouped clips, notes and reload persistence.');
 if(process.env.SAYAGAIN_TEST_AUDIO){
  await page.locator('#recording-files').setInputFiles(process.env.SAYAGAIN_TEST_AUDIO);
  await page.waitForFunction(()=>document.querySelectorAll('.recording-clip').length===4);
  await page.locator('[data-transcribe]').last().click();
  await page.waitForFunction(()=>document.querySelector('#recording-status').textContent.includes('转写已保存'),{},{timeout:180000});
  const state=await page.evaluate(()=>window.sayagain.state());assert(state.recording_clips.some(c=>c.body.transcript_status==='machine_unreviewed'&&c.body.transcript.length>0));
  const models=await page.evaluate(()=>window.sayagain.recordingModels());assert(models.every(m=>m.status==='本机推理验证通过'));console.log('PASS: client read back all four verified registrations; real speech import/transcription saved via IPC.');
 }
 }finally{await app?.close();const resolved=path.resolve(directory);if(resolved.startsWith(path.resolve(os.tmpdir())+path.sep))fs.rmSync(resolved,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
