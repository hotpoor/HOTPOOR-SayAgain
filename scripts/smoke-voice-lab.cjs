// Isolated Electron UI validation. All synthesis, model and export calls are mocked.
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(),'sayagain-voice-lab-ui-'));
let app;
const errors = [];
(async () => {
  app = await electron.launch({args:[root],env:{...process.env,SAYAGAIN_DATA_DIR:temp}});
  const page = await app.firstWindow();
  page.on('pageerror',error => errors.push(error.message));
  await page.waitForSelector('#language-form');
  await page.locator('#language-form button[type=submit]').click();
  const baseline = await page.evaluate(async () => {
    localStorage.setItem('sayagain-playback-volume',JSON.stringify({volume:0,muted:true}));
    const bytes = new Uint8Array(640044), view = new DataView(bytes.buffer);
    const text = (offset,value) => [...value].forEach((char,i) => view.setUint8(offset+i,char.charCodeAt(0)));
    text(0,'RIFF');view.setUint32(4,bytes.length-8,true);text(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,16000,true);view.setUint32(28,32000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,640000,true);
    const voice = await window.sayagain.saveVoice({name:'我的日常声音'});
    await window.sayagain.addSample({voice_id:voice.block_id,language:'zh-CN',transcript:'没关系，我们慢慢来。',source:'import',bytes,media_type:'audio/wav',duration_ms:20000,waveform:Array(64).fill(0)});
    await window.sayagain.addSample({voice_id:voice.block_id,language:'zh-CN',transcript:'今天的天气真好！',source:'import',bytes,media_type:'audio/wav',duration_ms:20000,waveform:Array(64).fill(0)});
    return window.sayagain.state();
  });
  const beforeDefaults = JSON.stringify([baseline.config.body.default_voice_ids,baseline.voices[0].body.default_sample_id,baseline.speech.config]);
  await app.evaluate(({ipcMain,BrowserWindow},baseline) => {
    global.__voiceLabMock = {state:baseline,calls:[],exports:[],models:[
      {id:'mock-qwen',label:'本地 Qwen3-TTS Base',provider:'local',available:false,reason:'尚未配置本地模型',control:'none',languages:['zh','en']},
      {id:'mock-index',label:'本地 IndexTTS-2.5',provider:'local',available:true,control:'emotion-vector',languages:['zh','en','ja','es','ar'],tags:[{label:'开心',value:'happy'},{label:'安静',value:'calm'}]},
      {id:'mock-cloud',label:'Qwen Audio 3.0 Plus',provider:'cloud',available:true,control:'instruction',languages:['zh','en'],tags:[{label:'安慰',value:'温柔地安慰对方，语速稍慢。'},{label:'开心',value:'轻快、开心，带一点笑意。'}]},
      {id:'mock-minimax',label:'MiniMax Speech 2.8',provider:'cloud',available:true,control:'emotion-enum',languages:['zh','en'],tags:[{label:'开心',value:'happy'},{label:'难过',value:'sad'}]}
    ]};
    const emit = () => BrowserWindow.getAllWindows().forEach(win => win.webContents.send('sayagain:data-changed'));
    const handlers = {
      state:() => global.__voiceLabMock.state,
      voiceLabStatus:() => ({models:global.__voiceLabMock.models,max_text_length:600}),
      synthesizeVoiceLab:(_event,input) => {
        const mock = global.__voiceLabMock;mock.calls.push(input);
        const item = {block_id:'lab-'+mock.calls.length,createtime:Date.now(),body:{...input,purpose:'voice_lab',text_snapshot:input.text,voice_name_snapshot:'我的日常声音',model_label_snapshot:mock.models.find(m=>m.id===input.model_id).label,sample_name_snapshot:'没关系，我们慢慢来。',status:'queued',queued_at:Date.now()}};
        mock.state.syntheses.push(item);emit();return item;
      },
      cancelSynthesis:(_event,{id}) => { global.__voiceLabMock.state.syntheses.find(s=>s.block_id===id).body.status='cancelled';emit(); },
      exportItems:(_event,input) => { global.__voiceLabMock.exports.push(input);return {count:1,directory:'/mock/export'}; }
    };
    for (const [name,handler] of Object.entries(handlers)) { ipcMain.removeHandler('sayagain:'+name);ipcMain.handle('sayagain:'+name,handler); }
  },baseline);
  await page.reload();await page.waitForSelector('[data-page=voices]');
  await page.locator('[data-page=voices]').click();await page.locator('[data-action=voice-lab]').click();
  await page.waitForSelector('#voice-lab-form [name=model_id] option[value=mock-cloud]',{state:'attached'});
  const form = page.locator('#voice-lab-form'), select = form.locator('[name=model_id]'), generate = form.locator('[data-lab-generate]');
  await form.locator('[name=text]').fill('没关系，我会陪你一起，慢慢把这件事做好。');
  await select.selectOption('mock-qwen');assert.equal(await generate.isDisabled(),true);assert.equal(await form.locator('[name=instruction]').count(),0);
  assert.match(await form.locator('[data-lab-model-status]').innerText(),/尚未配置/);
  await select.selectOption('mock-index');assert.equal(await form.locator('[data-lab-dimension]').count(),8);
  assert.equal(await form.locator('[name=language] option[value=ko-KR]').count(),0);assert.equal(await form.locator('[name=language] option[value=ar]').count(),1);
  await form.locator('[data-lab-tag=happy]').click();assert.equal(await form.locator('[name=emotion_0]').inputValue(),'1');
  await form.locator('[name=emotion_1]').evaluate(el=>{el.value=1;el.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.equal(await generate.isDisabled(),true);assert.match(await form.locator('[data-lab-emotion-total]').innerText(),/总和不能超过100%/);
  for (const name of ['emotion_0','emotion_1']) await form.locator(`[name=${name}]`).evaluate(el=>{el.value=0.5;el.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.equal(await generate.isDisabled(),false);assert.equal(await form.locator('[data-lab-emotion-total]').innerText(),'总配比 100% / 100%');
  await generate.click();await page.waitForSelector('[data-lab-result=lab-1]');
  let calls = await app.evaluate(() => global.__voiceLabMock.calls);assert.deepEqual(calls[0].emotion_vector,[0.5,0.5,0,0,0,0,0,0]);assert.equal(calls[0].cloud_consent,false);assert.equal(calls[0].instruction,undefined);
  await select.selectOption('mock-cloud');await form.locator('[data-lab-tag]').first().click();
  assert.equal(await generate.isDisabled(),true);await form.locator('[name=cloud_consent]').check();
  await form.locator('[name=text]').fill('谢谢你愿意听我说这些。');assert.equal(await form.locator('[name=cloud_consent]').isChecked(),false);
  await form.locator('[name=cloud_consent]').check();await generate.click();await page.waitForSelector('[data-lab-result=lab-2]');
  assert.equal(await form.locator('[name=cloud_consent]').isChecked(),false);
  calls = await app.evaluate(() => global.__voiceLabMock.calls);assert.equal(calls[1].instruction,'温柔地安慰对方，语速稍慢。');assert.equal(calls[1].emotion_vector,undefined);assert.equal(calls[1].cloud_consent,true);
  await select.selectOption('mock-qwen');assert.equal(await form.locator('[name=instruction]').count(),0);
  await select.selectOption('mock-cloud');assert.equal(await form.locator('[name=instruction]').inputValue(),'温柔地安慰对方，语速稍慢。');
  await form.locator('[name=text]').fill('字'.repeat(601));await form.locator('[name=cloud_consent]').check();assert.equal(await generate.isDisabled(),true);
  await form.locator('[name=text]').fill('谢谢你愿意听我说这些。');
  await select.selectOption('mock-minimax');await form.locator('[data-lab-tag=sad]').click();assert.equal(await form.locator('[name=emotion]').inputValue(),'sad');
  await form.locator('[name=cloud_consent]').check();await generate.click();await page.waitForSelector('[data-lab-result=lab-3]');
  calls = await app.evaluate(() => global.__voiceLabMock.calls);assert.equal(calls[2].emotion,'sad');assert.equal(calls[2].instruction,undefined);
  await page.locator('[data-lab-result=lab-3] [data-lab-action=cancel]').click();await page.waitForFunction(()=>document.querySelector('[data-lab-result="lab-3"] .voice-lab-status')?.textContent==='已取消');
  await app.evaluate(({BrowserWindow}) => {const mock=global.__voiceLabMock;const result=mock.state.syntheses.find(s=>s.block_id==='lab-2');Object.assign(result.body,{status:'succeeded',asset_id:mock.state.samples[0].body.asset_id,duration_ms:20000,language:'Chinese'});BrowserWindow.getAllWindows().forEach(win=>win.webContents.send('sayagain:data-changed'));});
  const play = page.locator('[data-lab-result=lab-2] [data-lab-action=play]');await play.click();await page.waitForFunction(()=>document.querySelector('[data-lab-result="lab-2"] [data-lab-action=play]')?.getAttribute('aria-label')==='暂停试听');
  await page.locator('[data-lab-result=lab-2] [data-lab-seek]').evaluate(el=>{el.value=500;el.dispatchEvent(new Event('input',{bubbles:true}));});
  await app.evaluate(({BrowserWindow}) => {global.__voiceLabMock.state.syntheses.find(s=>s.block_id==='lab-1').body.status='failed';global.__voiceLabMock.state.syntheses.find(s=>s.block_id==='lab-1').body.error='测试失败状态';BrowserWindow.getAllWindows().forEach(win=>win.webContents.send('sayagain:data-changed'));});
  await page.waitForSelector('[data-lab-result=lab-1] .form-error');assert.equal(await form.locator('[name=text]').inputValue(),'谢谢你愿意听我说这些。');assert.equal(await play.getAttribute('aria-label'),'暂停试听');
  assert.ok(Number(await page.locator('[data-lab-result=lab-2] [data-lab-seek]').inputValue())>=490);
  assert.equal(await page.locator('[data-lab-result]').first().getAttribute('data-lab-result'),'lab-3');
  await page.locator('[data-lab-result=lab-2] [data-lab-action=export]').click();assert.equal((await app.evaluate(()=>global.__voiceLabMock.exports)).length,1);
  await select.selectOption('mock-index');
  fs.mkdirSync(path.join(root,'test-results'),{recursive:true});
  await page.setViewportSize({width:1280,height:1100});await page.locator('#main').evaluate(el=>el.scrollTop=0);await page.screenshot({path:path.join(root,'test-results/voice-lab-desktop.png'),fullPage:true});
  await page.locator('[data-lab-result=lab-2]').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(root,'test-results/voice-lab-history.png')});
  await page.setViewportSize({width:520,height:1000});await page.locator('#main').evaluate(el=>el.scrollTop=0);await page.screenshot({path:path.join(root,'test-results/voice-lab-narrow.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('[data-lab-result=lab-2]').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(root,'test-results/voice-lab-history-narrow.png')});
  await page.setViewportSize({width:1280,height:1100});
  await page.locator('.voice-lab-back').click();await page.locator('[data-action=voice-lab]').click();assert.equal(await page.locator('#voice-lab-form [name=text]').inputValue(),'谢谢你愿意听我说这些。');
  assert.equal(await page.locator('[data-lab-result=lab-2] [data-lab-action=play]').getAttribute('aria-label'),'播放试听');
  await page.reload();await page.locator('[data-page=voices]').click();await page.locator('[data-action=voice-lab]').click();assert.equal(await page.locator('#voice-lab-form [name=text]').inputValue(),'谢谢你愿意听我说这些。');
  const after = await page.evaluate(()=>window.sayagain.state());assert.equal(after.expressions.length,baseline.expressions.length);assert.equal(JSON.stringify([after.config.body.default_voice_ids,after.voices[0].body.default_sample_id,after.speech.config]),beforeDefaults);
  assert.deepEqual(errors,[]);console.log('PASS: voice lab model capabilities, languages, per-model drafts, cloud consent, snapshots, history, playback/seek across updates, cancel/export, narrow layout and unchanged defaults. Synthesis/API/export calls mocked; temporary profile only.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await app?.close();fs.rmSync(temp,{recursive:true,force:true});});
