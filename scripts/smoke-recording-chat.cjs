const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Service}=require('../desktop/service.cjs');
const root=path.resolve(__dirname,'..'),directory=fs.mkdtempSync(path.join(os.tmpdir(),'sayagain-chat-'));let app;
function wav(){const b=Buffer.alloc(32044);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);b.writeUInt32LE(32000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(32000,40);return b;}
(async()=>{try{
 const s=new Service(path.join(directory,'data'));s.saveSettings({revision:s.config().body.revision,native_language:'zh-CN',target_language:'en-US',explanation_language:'zh-CN'});
 const session=s.createRecording({title:'产品对谈 · 界面测试'});
 for(let i=0;i<43;i++){const c=s.addRecordingClip({recording_id:session.block_id,client_id:'chat-'+i,source:'import',source_name:'示例访谈.wav',source_offset_ms:1574+i*12000,bytes:wav()});const speaker=i%3===2?'B':'A';s.update(c,{speaker,transcript:i%3===2?'We want every conversation to be easy to follow. You can listen to a short clip and read the words right below it.':'What would make this conversation easier to revisit? 我希望能看清每一段的时间，也能知道是谁在说话。',transcript_status:'machine_unreviewed',speaker_analysis:{status:'user_confirmed',segments:[{speaker,start_ms:0,end_ms:1000}]}});}
 s.close();
 app=await electron.launch({args:[root],env:{...process.env,SAYAGAIN_DATA_DIR:directory},timeout:60000});const page=await app.firstWindow(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/Content Security Policy|inline style/i.test(m.text()))errors.push(m.text());});await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setContentSize(1280,960);w.hide();});
 await page.locator('[data-page="recordings"]').click();await page.locator('[data-recording-open]').waitFor();assert.match(await page.locator('.recording-dates').innerText(),/创建.*最后更新/s);await page.locator('[data-recording-open]').click();
 assert.equal(await page.locator('.chat-message').count(),43);assert.equal(await page.locator('.speaker-card').count(),2);assert.equal(await page.locator('#clips-next,[data-source-expand]').count(),0);
 const viewport=page.locator('.conversation-source-clips').first();
 assert.equal(Math.round((await viewport.boundingBox()).height),520);
 assert(await viewport.evaluate(el=>el.scrollHeight>el.clientHeight+500));
 assert(await page.locator('[data-scroll-position]').isEnabled());
 await viewport.scrollIntoViewIfNeeded();await viewport.hover();await page.mouse.wheel(0,400);
 await page.waitForFunction(()=>document.querySelector('.conversation-source-clips').scrollTop>100);
 await page.locator('[data-scroll-top]').click();
 const slider=page.locator('[data-scroll-position]');await slider.scrollIntoViewIfNeeded();const track=await slider.boundingBox();
 await page.mouse.move(track.x+track.width/2,track.y+8);await page.mouse.down();await page.mouse.move(track.x+track.width/2,track.y+track.height-8,{steps:12});await page.mouse.up();
 await page.waitForFunction(()=>{const el=document.querySelector('.conversation-source-clips');return el.scrollTop/(el.scrollHeight-el.clientHeight)>.95;});
 await page.locator('[data-scroll-top]').click();

 await viewport.evaluate(el=>el.scrollTop=12);await page.waitForTimeout(50);
 const sticky=await page.locator('.speaker-run-identity').first().boundingBox(),container=await viewport.boundingBox();assert(sticky.y>=container.y+8);assert(sticky.y<container.y+35);
 await page.locator('[data-scroll-position]').evaluate(el=>{el.value='1000';el.dispatchEvent(new Event('input'));});
 assert(await viewport.evaluate(el=>Math.abs(el.scrollHeight-el.clientHeight-el.scrollTop)<2));assert.match(await page.locator('[data-scroll-range]').innerText(),/43 条/);
 await page.locator('[data-scroll-top]').click();assert.equal(await viewport.evaluate(el=>el.scrollTop),0);
 await page.getByLabel('列表高度（像素）').fill('340');await page.getByLabel('列表高度（像素）').press('Tab');assert.equal(Math.round((await viewport.boundingBox()).height),340);
 const handle=page.getByRole('separator',{name:'拖动调整列表高度'});await handle.scrollIntoViewIfNeeded();const grip=await handle.boundingBox();
 await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2);await page.mouse.down();await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2-80,{steps:8});await page.mouse.up();
 assert.equal(Math.round((await viewport.boundingBox()).height),260);assert.equal(await page.getByLabel('列表高度（像素）').inputValue(),'260');
 await handle.press('ArrowDown');assert.equal(Math.round((await viewport.boundingBox()).height),280);await handle.press('ArrowDown');await handle.press('ArrowDown');await handle.press('ArrowDown');
 assert.equal(await handle.getAttribute('aria-valuenow'),'340');
 assert.match(await page.locator('.chat-range').first().innerText(),/00:00:01.574 – 00:00:02.574/);assert.equal(await page.locator('.chat-transcript').first().isVisible(),true);
 await page.locator('.reader-people-button').click();await page.locator('.speaker-card summary').first().click();await page.getByLabel('A 备注名',{exact:true}).fill('主持人');await page.getByLabel('A 备注',{exact:true}).fill('负责提问与串场');await page.locator('[data-speaker-form="A"] button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('.chat-meta strong')?.textContent==='主持人');
 assert.match(await page.locator('.speaker-card').first().textContent(),/负责提问/);assert.equal(await page.locator('#clip-speaker option[value="A"]').innerText(),'主持人');assert.equal(await page.locator('.chat-message').count(),43);assert.match(await page.locator('.chat-meta').first().textContent(),/主持人/);
 await page.locator('#clip-speaker').selectOption('B');assert.equal(await page.locator('.chat-message').count(),14);await page.locator('#clip-speaker').selectOption('');
 await page.locator('.chat-row-edit > summary').first().click();await page.locator('.recording-notes summary').first().click();await page.locator('[data-transcript]').first().fill('人工修正后的文字');await page.locator('[data-save-transcript]').first().click();await page.waitForFunction(()=>document.querySelector('.chat-transcript').textContent==='人工修正后的文字');
 await page.reload();await page.locator('[data-page="recordings"]').click();await page.locator('[data-recording-open]').click();assert.equal(Math.round((await viewport.boundingBox()).height),340);assert(await slider.isEnabled());assert.equal(await page.locator('.chat-meta strong').first().textContent(),'主持人');assert.equal(await page.locator('.chat-transcript').first().innerText(),'人工修正后的文字');
 // Local avatar is resized, persisted and reflected in every speaker surface.
 await page.locator('.reader-people-button').click();await page.locator('.speaker-card summary').first().click();
 await page.locator('[data-avatar-file]').first().setInputFiles({name:'avatar.png',mimeType:'image/png',buffer:Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=16;const x=c.getContext('2d');x.fillStyle='#3478ac';x.fillRect(0,0,16,16);return c.toDataURL('image/png').split(',')[1];}),'base64')});
 await page.locator('[data-crop-zoom]').fill('2');
 assert(await page.locator('.avatar-crop-mask').isVisible());assert(await page.locator('[data-crop-thumbnail]').isVisible());
 fs.mkdirSync(path.join(root,'test-results/chat'),{recursive:true});await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].showInactive());await page.screenshot({path:path.join(root,'test-results/chat/avatar-crop.png')});
 const cropCanvas=page.locator('[data-crop-canvas]'),cropBox=await cropCanvas.boundingBox();await page.mouse.move(cropBox.x+cropBox.width/2,cropBox.y+cropBox.height/2);await page.mouse.down();await page.mouse.move(cropBox.x+cropBox.width/2+30,cropBox.y+cropBox.height/2+20,{steps:4});await page.mouse.up();
 await page.locator('[data-crop-canvas]').press('ArrowRight');await page.locator('[data-crop-confirm]').click();
 await page.locator('[data-avatar-preview] img').first().waitFor();assert.equal(await page.locator('[data-avatar-preview] img').first().evaluate(el=>el.naturalWidth),400);await page.locator('[data-speaker-form="A"] button[type=submit]').click();await page.locator('.speaker-run-identity img').first().waitFor();assert(await page.locator('.reader-avatar-stack img').count());assert(await page.locator('.source-people img').count());
 await page.locator('[data-avatar-file]').first().setInputFiles({name:'cancel.png',mimeType:'image/png',buffer:Buffer.from(await page.locator('[data-avatar-preview] img').first().getAttribute('src').then(s=>s.split(',')[1]),'base64')});
 await page.locator('[data-crop-cancel]').click();await page.waitForFunction(()=>document.querySelector('[data-avatar-status]').textContent.includes('已取消'));
 // View tabs switch without rebuilding controls or discarding draft input.
 await page.locator('.chat-row-edit > summary').first().click();await page.locator('.recording-notes summary').first().click();await page.locator('[data-transcript]').first().fill('未保存的草稿');await page.getByRole('tab',{name:'对话视图'}).click();assert.equal(await page.locator('[data-transcript]').first().inputValue(),'未保存的草稿');assert(await page.locator('.reader-chat').count());await page.getByRole('tab',{name:'对话视图'}).press('ArrowLeft');assert(await page.locator('.reader-compact').count());await page.locator('[data-transcript]').first().fill('人工修正后的文字');await page.locator('.chat-row-edit > summary').first().click();
 // Multi-speaker selection, then a new identity, persist without merging labels.
 await page.locator('.chat-row-edit > summary').first().click();await page.locator('[data-turn-editor] summary').first().click();let editor=page.locator('[data-turn-editor]').first();await editor.locator('[data-turn-speaker][value="B"]').check();await editor.locator('[data-turn-confirm]').click();await page.waitForFunction(()=>document.querySelector('.chat-meta strong').textContent==='主持人 / Speaker B');
 await page.locator('.chat-row-edit > summary').first().click();await page.locator('[data-turn-editor] summary').first().click();editor=page.locator('[data-turn-editor]').first();await editor.locator('[data-turn-speaker][value="A"]').uncheck();await editor.locator('[data-turn-speaker][value="B"]').uncheck();await editor.locator('[data-new-speaker]').fill('新嘉宾');await editor.locator('[data-speaker-add]').click();await editor.locator('[data-turn-confirm]').click();await page.waitForFunction(()=>document.querySelector('.chat-meta strong').textContent==='新嘉宾');
 assert.equal(await page.locator('.speaker-card').count(),3);assert(await page.locator('#clip-speaker option').allTextContents().then(t=>t.includes('新嘉宾')));
 const play=page.locator('[data-chat-play]').first();await play.click();await page.waitForFunction(()=>document.querySelector('[data-chat-audio]').currentTime>0.15);await play.click();assert(await page.locator('.chat-playback').first().isVisible());assert(await page.locator('[data-playback-marker]').first().isVisible());
 const browsePosition=await slider.inputValue();await page.locator('[data-chat-audio]').last().evaluate(el=>{el.dispatchEvent(new Event('timeupdate'));});await page.waitForFunction(()=>{const marker=document.querySelector('[data-playback-marker]'),track=document.querySelector('.source-scroll-track');return marker.getBoundingClientRect().top>track.getBoundingClientRect().top+track.clientHeight*.9;});assert.equal(await slider.inputValue(),browsePosition);
 // Follow is opt-in, seeks the current clip into view, and manual browsing releases it.
 const follow=page.locator('[data-source-follow]').first();assert.equal(await follow.getAttribute('aria-pressed'),'false');await follow.click();
 await page.waitForFunction(()=>{const vp=document.querySelector('.conversation-source-clips');return vp.scrollTop>vp.scrollHeight-vp.clientHeight-20;});assert.equal(await follow.getAttribute('aria-pressed'),'true');
 await page.waitForFunction(()=>{const slider=document.querySelector('[data-scroll-position]'),mark=document.querySelector('[data-playback-marker]'),r=slider.getBoundingClientRect(),radius=8*r.height/slider.offsetHeight,centre=r.top+radius+Number(slider.value)/1000*(r.height-2*radius);return Math.abs(mark.getBoundingClientRect().top+1-centre)<2;});
 await follow.click();await viewport.evaluate(el=>el.scrollTop=0);await page.locator('[data-chat-audio]').last().evaluate(el=>el.dispatchEvent(new Event('timeupdate')));await page.waitForTimeout(80);assert.equal(await viewport.evaluate(el=>el.scrollTop),0);
 await follow.click();await viewport.hover();await page.mouse.wheel(0,-100);await page.waitForFunction(()=>document.querySelector('[data-source-follow]').getAttribute('aria-pressed')==='false');await page.locator('[data-scroll-top]').click();
 // SVG zoom recomputes bins while the playback cursor stays on the same time.
 const svg=page.locator('.source-wave-svg').first();const before=await svg.getAttribute('viewBox');assert(await svg.locator('text').count()>1);assert.equal(await page.locator('.source-wave-scroll [data-source-seek]').count(),0);
 await page.locator('[data-wave-zoom]').first().evaluate(el=>{el.value='5';el.dispatchEvent(new Event('input',{bubbles:true}));});
 assert(Number((await svg.getAttribute('viewBox')).split(' ')[2])>Number(before.split(' ')[2])*4.9);
 assert.equal(await svg.locator('path[stroke-linecap="round"]').count(),3);
 assert(Number(await svg.locator('[data-wave-cursor]').getAttribute('x1'))>0);
 await page.locator('[data-wave-zoom]').first().evaluate(el=>{el.value='1';el.dispatchEvent(new Event('input',{bubbles:true}));});
 // Export through the real button and Electron download handling.
 const exported=path.join(directory,'transcript.txt');await app.evaluate(({session},filename)=>{session.defaultSession.once('will-download',(_event,item)=>item.setSavePath(filename));},exported);await page.locator('#transcript-export').click();await page.waitForFunction(()=>true);for(let i=0;i<50&&(!fs.existsSync(exported)||fs.statSync(exported).size===0);i++)await new Promise(r=>setTimeout(r,100));assert.match(fs.readFileSync(exported,'utf8'),/主持人/);assert.match(fs.readFileSync(exported,'utf8'),/人工修正后的文字/);
 // Explicitly link B to A, then choose a local avatar without changing A's avatar.
 const cardB=page.locator('.speaker-card').filter({has:page.locator('[data-person-link-form="B"]')});
 await page.locator('.reader-people-button').click();await cardB.locator('summary').click();
 await cardB.locator('[data-person-search]').fill('主持人');await cardB.locator('[data-person-link-form] select').selectOption('speaker:A');await cardB.locator('[data-person-link]').click();
 await page.waitForFunction(async()=>{const s=await window.sayagain.state();return s.recording_people?.length===1;});
 let peopleState=await page.evaluate(()=>window.sayagain.state());const linkedSession=peopleState.recordings.find(s=>s.block_id===peopleState.recording_clips[0].body.recording_id);const savedAvatar=linkedSession.body.speaker_profiles.find(p=>p.key==='A').avatar;
 // Restore both linked speakers to the person's default; all adjacent A/B clips share one rail.
 for(const key of ['A','B']){
  await page.locator('.reader-people-button').click();const card=page.locator('.speaker-card').filter({has:page.locator('[data-person-link-form="'+key+'"]')});await card.locator('summary').click();await card.locator('[data-avatar-clear]').click();await card.locator('[type=submit]').click();
  await page.waitForFunction(async key=>{const s=await window.sayagain.state();return !s.recordings.find(r=>r.body.speaker_profiles?.some(p=>p.key===key&&p.person_id))?.body.speaker_profiles.find(p=>p.key===key).avatar_override;},key);
 }
 assert.equal(await page.locator('.source-people .speaker-avatar').count(),2);assert.equal(await page.locator('.reader-avatar-stack .speaker-avatar').count(),2);assert.equal(await page.locator('.speaker-run').count(),2);assert.equal(await page.locator('.chat-message').count(),43);assert.equal(await page.locator('.speaker-card').count(),3);
 await page.locator('.reader-people-button').click();await cardB.locator('summary').click();
 await cardB.locator('[data-avatar-file]').setInputFiles({name:'local-avatar.png',mimeType:'image/png',buffer:Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=16;c.getContext('2d').fillRect(0,0,16,16);return c.toDataURL('image/png').split(',')[1];}),'base64')});
 await page.locator('[data-crop-confirm]').click();
 await cardB.locator('[data-avatar-status]').filter({hasText:'预览已更新'}).waitFor();await cardB.locator('[type=submit]').click();
 await page.waitForFunction(async()=>{const s=await window.sayagain.state();return s.recording_people[0]?.body.avatars?.length===2;});
 assert.equal(await page.locator('.source-people .speaker-avatar').count(),3);assert(await page.locator('.speaker-run').count()>2);
 peopleState=await page.evaluate(()=>window.sayagain.state());const linked=peopleState.recordings.find(s=>s.block_id===linkedSession.block_id);assert.equal(linked.body.speaker_profiles.find(p=>p.key==='A').avatar,savedAvatar);assert.notEqual(linked.body.speaker_profiles.find(p=>p.key==='B').avatar,savedAvatar);
 await page.reload();await page.locator('[data-page="recordings"]').click();await page.locator('[data-recording-open]').click();await page.locator('.reader-people-button').click();await cardB.locator('summary').click();assert.equal(await cardB.locator('[data-person-avatar]').count(),2);
 // A short filtered list has no scroll overflow: the red line aligns to the row even after resizing.
 await page.locator('#clip-speaker').selectOption({label:'新嘉宾'});
 await page.getByLabel('列表高度（像素）').fill('900');await page.getByLabel('列表高度（像素）').press('Tab');
 const shortAudio=page.locator('[data-chat-audio]').first();await page.locator('[data-chat-play]').first().click();await page.waitForFunction(()=>document.querySelector('[data-chat-audio]').currentTime>.1);await page.locator('[data-chat-play]').first().click();
 await shortAudio.evaluate(el=>{el.currentTime=.5;});
 const aligned=()=>{const vp=document.querySelector('.conversation-source-clips'),row=vp.querySelector('.chat-message'),audio=row.querySelector('audio'),mark=document.querySelector('[data-playback-marker]'),r=row.getBoundingClientRect();return vp.scrollHeight<=vp.clientHeight+1&&Math.abs(mark.getBoundingClientRect().top+1-(r.top+r.height*audio.currentTime))<3;};
 await page.waitForFunction(aligned);
 await page.getByLabel('列表高度（像素）').fill('600');await page.getByLabel('列表高度（像素）').press('Tab');await page.waitForFunction(aligned);
 await page.locator('#clip-speaker').selectOption('');
 fs.mkdirSync(path.join(root,'test-results/chat'),{recursive:true});await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].showInactive());await page.screenshot({path:path.join(root,'test-results/chat/desktop.png')});await page.getByRole('tab',{name:'对话视图'}).click();await page.screenshot({path:path.join(root,'test-results/chat/conversation.png')});await page.getByRole('tab',{name:'紧凑视图'}).click();await page.setViewportSize({width:680,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert((await page.locator('.source-heading').first().boundingBox()).width>150);assert.equal(await page.locator('[data-wave-status]').first().textContent(),'');await page.screenshot({path:path.join(root,'test-results/chat/narrow.png')});assert.deepEqual(errors,[]);
 console.log('PASS: chat times, speaker aliases/notes, filtering, full inline scrolling, height control, draggable vertical slider and return to top, corrected text, persistence, transcript export, dates and narrow layout.');
 }finally{if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}fs.rmSync(directory,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
