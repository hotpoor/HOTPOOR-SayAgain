const { _electron:electron }=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Service}=require('../desktop/service.cjs'),{createWatchSyncCollection}=require('../desktop/watch-sync.cjs');
const root=path.resolve(__dirname,'..'),directory=fs.mkdtempSync(path.join(os.tmpdir(),'sayagain-sync-ui-'));
let app;
(async()=>{
 const service=new Service(path.join(directory,'data'));
 try{
  service.update(service.config(),{onboarding_complete:true});
  const recordings=['录音一','录音二'].map((title,index)=>service.update(service.createRecording({title}),{watch:{session_id:title,durable_samples:16000},watch_imported_chunks:index+1}));
  service.createRecording({title:'原有录音'});
  createWatchSyncCollection(service,{recording_ids:recordings.map(r=>r.block_id),title:'手表同步 2026-10-14'});
 }finally{service.close();}
 try{
  app=await electron.launch({args:[root],env:{...process.env,SAYAGAIN_DATA_DIR:directory},timeout:60000});
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.locator('[data-page="recordings"]').click();
  const collection=page.locator('.recordings-sync-collection');await collection.waitFor();
  assert.equal(await collection.count(),1);assert.equal(await collection.locator('[data-recording-open]').count(),2);
  assert.match(await collection.locator('summary').innerText(),/2 次录音 · 3 个音频文件/);
  await collection.locator('summary').click();assert.equal(await collection.locator('[data-recording-open]').first().isVisible(),false);
  await collection.locator('summary').click();assert.equal(await collection.locator('[data-recording-open]').first().isVisible(),true);
  await page.locator('#recording-search').fill('手表同步');assert.equal(await page.locator('[data-recording-open]').count(),2);
  await page.locator('#recording-search').fill('录音一');assert.equal(await collection.locator('[data-recording-open]').count(),1);
  await page.locator('#recording-search').fill('');assert.equal(await page.locator('[data-recording-open]').count(),3);
  fs.mkdirSync(path.join(root,'test-results/watch'),{recursive:true});await page.screenshot({path:path.join(root,'test-results/watch/sync-collection-ui.png')});
  assert.deepEqual(errors,[]);console.log('Sync collection UI: grouping, folding, search and existing recordings passed');
 }finally{if(app)await app.close();fs.rmSync(directory,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
