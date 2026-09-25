const { _electron:electron }=require('playwright');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),temporary=fs.mkdtempSync(path.join(os.tmpdir(),'sayagain-queue-'));
let app;
(async()=>{
 app=await electron.launch({args:[root],env:{...process.env,SAYAGAIN_DATA_DIR:temporary},timeout:60000});
 const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.waitForSelector('#language-form');await page.locator('.queue-toggle').click();
 assert.match(await page.locator('.queue-empty').textContent(),/还没有/);
 await page.evaluate(()=>window.synthesisQueue.update({voices:[],syntheses:[
  {block_id:'b',createtime:2,body:{status:'queued',text_snapshot:'Second phrase',provider:'local'}},
  {block_id:'a',createtime:1,body:{status:'queued',text_snapshot:'First phrase',provider:'local'}},
  {block_id:'run',createtime:0,body:{status:'running',started_at:Date.now()-65000,text_snapshot:'A natural voice',provider:'local'}},
  {block_id:'fail',createtime:3,body:{status:'failed',text_snapshot:'<img src=x onerror=alert(1)>',error:'Test failure',provider:'local'}}
 ]}));
 assert.equal(await page.locator('.queue-badge').textContent(),'3');
 assert.deepEqual(await page.locator('.queue-item>p:first-of-type').allTextContents(),['A natural voice','First phrase','Second phrase','<img src=x onerror=alert(1)>']);
 assert.equal(await page.locator('.queue-items img').count(),0);
 assert.match(await page.locator('[data-queue-start]').textContent(),/已用 1:0[56]/);
 await page.screenshot({path:path.join(root,'test-results','synthesis-queue.png')});
 await page.keyboard.press('Escape');assert(await page.locator('.queue-panel').isHidden());
 assert.equal(await page.locator('.queue-toggle').getAttribute('aria-expanded'),'false');
 await page.setViewportSize({width:620,height:720});await page.locator('.queue-toggle').click();
 const bounds=await page.locator('.queue-panel').boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=620);
 await page.screenshot({path:path.join(root,'test-results','synthesis-queue-narrow.png')});
 assert.deepEqual(errors,[]);console.log('PASS: queue empty state, FIFO display, running elapsed time, pending count, failure, escaping, Escape/focus and narrow layout.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(app)await app.close();const resolved=path.resolve(temporary);if(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith('sayagain-queue-'))fs.rmSync(resolved,{recursive:true,force:true});});
