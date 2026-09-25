const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Service}=require('../desktop/service.cjs');
const root=path.resolve(__dirname,'..'),directory=fs.mkdtempSync(path.join(os.tmpdir(),'sayagain-header-'));let app;
function wav(){const b=Buffer.alloc(32044);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);b.writeUInt32LE(32000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(32000,40);return b;}
(async()=>{
 const service=new Service(path.join(directory,'data'));
 service.saveSettings({revision:service.config().body.revision,native_language:'zh-CN',target_language:'en-US'});
 const session=service.createRecording({title:'Many speaker candidates · layout fixture'});
 for(let i=0;i<36;i++){
  const clip=service.addRecordingClip({recording_id:session.block_id,client_id:'header-'+i,source:'import',source_name:'Bret_Taylor_Sierra_AI_agents_very_long_recording_filename_for_layout.mp3',source_offset_ms:i*1000,bytes:wav()});
  service.update(clip,{speaker:'Speaker '+i,transcript:'Layout test.',transcript_status:'machine_unreviewed'});
 }
 service.close();
 app=await electron.launch({args:[root],env:{...process.env,SAYAGAIN_DATA_DIR:directory},timeout:60000});
 const page=await app.firstWindow(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
 await page.locator('[data-page="recordings"]').click();await page.locator('[data-recording-open]').click();await page.locator('.source-heading').waitFor({state:'attached'});
 fs.mkdirSync(path.join(root,'test-results/header'),{recursive:true});
 for(const mode of ['compact','chat']){
  await page.locator(`[data-reader-mode="${mode}"]`).click();
  for(const width of [1280,1201,1200,1000,760,680,620]){
   await app.evaluate(({BrowserWindow},width)=>BrowserWindow.getAllWindows()[0].setContentSize(width,880),width);
   await page.waitForFunction(width=>innerWidth===width,width);
   for(const font of [100,130]){
    await page.locator('#font-size-slider').evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));},String(font));
    const summary=page.locator('.conversation-source>summary');await summary.scrollIntoViewIfNeeded();
    const geometry=await summary.evaluate(el=>{const r=el.getBoundingClientRect(),title=el.querySelector('.source-heading').getBoundingClientRect();return {width:innerWidth,height:r.height,titleWidth:title.width,overflow:el.scrollWidth-el.clientWidth,controls:[...el.querySelectorAll('.source-play,.source-follow,.source-more')].map(b=>{const q=b.getBoundingClientRect();return q.left>=r.left&&q.right<=r.right;})};});
    if(width===1280&&font===100)await page.screenshot({path:path.join(root,'test-results/header',`${mode}-wide.png`)});
    assert(geometry.titleWidth>=120,JSON.stringify({mode,font,...geometry}));assert(geometry.height<140,JSON.stringify(geometry));assert(geometry.overflow<=2,JSON.stringify(geometry));assert(geometry.controls.every(Boolean),JSON.stringify(geometry));
    if(width===620&&font===130)await page.screenshot({path:path.join(root,'test-results/header',`${mode}-narrow.png`)});
   }
  }
 }
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1280,880));
 assert.equal(await page.locator('.source-people .speaker-avatar').count(),3);
 const all=page.getByRole('button',{name:'查看全部 36 位说话人'});assert.equal(await all.textContent(),'+33');
 await all.click();assert(await page.locator('.reader-speakers').getAttribute('open')!==null);assert.equal(await page.locator('.speaker-card').count(),36);
 assert.deepEqual(errors,[]);console.log('PASS: 36 speakers; compact/chat layouts at 7 widths and 2 font sizes; title/control bounds; complete roster access.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(app)await app.close();const resolved=path.resolve(directory);if(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith('sayagain-header-'))fs.rmSync(resolved,{recursive:true,force:true});});
