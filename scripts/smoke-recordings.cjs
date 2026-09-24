const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=path.resolve(__dirname,'..'),directory=fs.mkdtempSync(path.join(os.tmpdir(),'sayagain-recording-ui-'));let app;
function wav(){const b=Buffer.alloc(32044);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);b.writeUInt32LE(32000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(32000,40);return b;}
(async()=>{try{
 if(process.env.SAYAGAIN_TEST_RUNTIME){fs.mkdirSync(path.join(directory,'recording-models'));fs.copyFileSync(process.env.SAYAGAIN_TEST_RUNTIME,path.join(directory,'recording-models/runtime.json'));}
 app=await electron.launch({args:[root,'--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'],env:{...process.env,SAYAGAIN_DATA_DIR:directory},timeout:60000});
 const page=await app.firstWindow(),errors=[];
 await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setPosition(-1800,0);w.showInactive();});page.on('pageerror',e=>errors.push(e.message));
 await page.waitForSelector('#language-form');await page.locator('#language-form [name="native_language"]').fill('zh-CN');await page.locator('#language-form [name="target_language"]').fill('en-US');await page.locator('#language-form button[type="submit"]').click();
 await page.locator('[data-page="recordings"]').click();assert.equal(await page.locator('#recording-search').count(),1);assert.equal(await page.locator('#recording-files').count(),0);await page.locator('.recordings-new summary').click();await page.locator('#recording-title').fill('录音测试');await page.locator('#recording-create').click();await page.waitForFunction(()=>!document.querySelector('#recording-start').disabled);
 fs.mkdirSync(path.join(root,'test-results'),{recursive:true});await page.screenshot({path:path.join(root,'test-results/recordings-empty.png')});
 await page.locator('#recording-files').setInputFiles([{name:'one.wav',mimeType:'audio/wav',buffer:wav()},{name:'two.wav',mimeType:'audio/wav',buffer:wav()}]);
 await page.waitForFunction(()=>document.querySelectorAll('.recording-clip').length===2);
 await page.locator('#recording-start').click();await page.waitForFunction(()=>!document.querySelector('#recording-stop').disabled);await page.waitForTimeout(1500);await page.locator('#recording-stop').click();await page.waitForFunction(()=>document.querySelectorAll('.recording-clip').length===3);
 await page.locator('.recording-notes summary').first().click();await page.locator('[data-transcript]').first().fill('手动修正');await page.locator('[data-save-transcript]').first().click();await page.waitForFunction(()=>document.querySelector('[data-transcript]').value==='手动修正');
 await page.reload();await page.locator('[data-page="recordings"]').click();await page.locator('[data-recording-open]').filter({hasText:'录音测试'}).click();await page.waitForFunction(()=>document.querySelectorAll('.recording-clip').length===3);
 await page.screenshot({path:path.join(root,'test-results/recordings-populated.png')});await page.setViewportSize({width:680,height:850});await page.screenshot({path:path.join(root,'test-results/recordings-narrow.png')});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.setViewportSize({width:1280,height:880});
 assert.equal(await page.locator('audio').count(),3);assert.deepEqual(errors,[]);console.log('PASS: multi-file import, microphone recording, grouped clips, notes and reload persistence.');
 await page.locator('#recording-back').click();
 await page.evaluate(async()=>{await window.sayagain.createRecording({title:'英语口语练习'});await window.sayagain.createRecording({title:'产品讨论 · 九月'});});
 await page.locator('[data-page="recordings"]').click();assert.equal(await page.locator('[data-recording-open]').count(),3);
 await page.locator('#recording-search').fill('英语');assert.equal(await page.locator('[data-recording-open]').count(),1);
 await page.locator('[data-recording-open]').click();assert.equal(await page.locator('.recording-clip').count(),0);
 await page.locator('#recording-files').setInputFiles([{name:'practice.wav',mimeType:'audio/wav',buffer:wav()}]);await page.waitForFunction(()=>document.querySelectorAll('.recording-clip').length===1);
 await page.locator('#recording-back').click();assert.equal(await page.locator('#recording-search').inputValue(),'英语');
 await page.locator('#recording-search').fill('不存在');assert.equal(await page.locator('[data-recording-open]').count(),0);assert(await page.locator('#recording-session-list').textContent().then(t=>t.includes('没有找到')));
 await page.locator('#recording-search').fill('ONE.WAV');assert.equal(await page.locator('[data-recording-open]').count(),1);
 await page.locator('#recording-search').fill('');await page.screenshot({path:path.join(root,'test-results/recordings-list.png')});
 await page.setViewportSize({width:680,height:850});await page.screenshot({path:path.join(root,'test-results/recordings-list-narrow.png')});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.setViewportSize({width:1280,height:880});
 await page.locator('[data-recording-open]').filter({hasText:'录音测试'}).click();assert.equal(await page.locator('.recording-clip').count(),3);
 console.log('PASS: list-first navigation, title/file search, empty results, back navigation and adding files into separate sessions.');
 if(process.env.SAYAGAIN_TEST_LONG_RECORDING){
  const id=await page.evaluate(async bytes=>{const session=await window.sayagain.createRecording({title:'204 片段长录音验证'});for(let i=0;i<204;i++)await window.sayagain.addRecordingClip({recording_id:session.block_id,client_id:'long-'+i,source:'import',source_name:'silence.wav',source_offset_ms:i*1000,bytes:new Uint8Array(bytes)});return session.block_id;},[...wav()]);
  await page.reload();await page.locator('[data-page="recordings"]').click();await page.locator(`[data-recording-open="${id}"]`).click();await page.waitForFunction(()=>document.querySelectorAll('.recording-clip').length===204);
  await page.locator('.recordings-analysis summary').click();await page.locator('#recording-speakers').click();
  await page.waitForFunction(()=>document.querySelector('#recording-status').textContent.includes('分析结果已保存'),{},{timeout:600000});
  const state=await page.evaluate(()=>window.sayagain.state());assert.equal(state.recordings.find(s=>s.block_id===id).body.speaker_analysis.clip_count,204);
  assert.equal(state.recording_clips.filter(c=>c.body.recording_id===id&&c.body.speaker_analysis).length,204);
  console.log('PASS: 204 clips analyzed with registered local models through desktop IPC.');
 }
 if(process.env.SAYAGAIN_TEST_AUDIO){
  await page.locator('#recording-files').setInputFiles(process.env.SAYAGAIN_TEST_AUDIO);
  await page.waitForFunction(()=>document.querySelectorAll('.recording-clip').length===4);
  await page.locator('[data-transcribe]').last().click();
  await page.waitForFunction(()=>document.querySelector('#recording-status').textContent.includes('转写已保存'),{},{timeout:180000});
  const state=await page.evaluate(()=>window.sayagain.state());assert(state.recording_clips.some(c=>c.body.transcript_status==='machine_unreviewed'&&c.body.transcript.length>0));
  await page.locator('.recordings-analysis summary').click();await page.locator('#recording-speakers').click();
  await page.waitForFunction(()=>document.querySelector('#recording-status').textContent.includes('分析结果已保存'),{},{timeout:180000});
  await page.locator('.recordings-analysis summary').click();await page.locator('#recording-keywords').fill('你好,学习');await page.locator('#recording-detect').click();
  await page.waitForFunction(()=>document.querySelector('#recording-status').textContent.includes('分析结果已保存'),{},{timeout:180000});
  await page.reload();await page.locator('[data-page="recordings"]').click();
  const analyzed=await page.evaluate(()=>window.sayagain.state());
  assert(analyzed.recording_clips.some(c=>c.body.speaker_analysis?.segments.some(s=>s.speaker)));
  assert(analyzed.recording_clips.some(c=>c.body.keyword_analysis?.segments.some(s=>s.keyword==='学习')));
  console.log('PASS: speaker grouping and custom keyword inference saved and restored in client.');
  const models=await page.evaluate(()=>window.sayagain.recordingModels());assert(models.every(m=>m.status==='本机推理验证通过'));console.log('PASS: client read back all four verified registrations; real speech import/transcription saved via IPC.');
 }
 }finally{await app?.close();const resolved=path.resolve(directory);if(resolved.startsWith(path.resolve(os.tmpdir())+path.sep))fs.rmSync(resolved,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
