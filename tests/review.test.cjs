const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Service}=require('../desktop/service.cjs');
const {startBridge}=require('../desktop/bridge.cjs');
function setup(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'sayagain-review-')),s=new Service(path.join(root,'data'));t.after(()=>{s.close();fs.rmSync(root,{recursive:true,force:true});});s.saveSettings({revision:s.config().body.revision,native_language:'zh-CN',target_language:'en-US'});return{s,root};}
function payload(s){const c=s.reviewContext().config;return{client:'test',conversation_id:'session',turn_id:'turn',message_revision:1,source_text:'😀 I very like it.',config_id:c.id,config_revision:c.revision,policy_version:1,decision:'needs_improvement',reason:'用词',expressions:[{source_span:{start:2,end:17},original:'I very like it.',improved:'I really like it.',category:'naturalness',confidence:.9,explanation:'副词用 really'}]};}
test('review gates, Unicode spans, dedupe, privacy and stale config',t=>{const{s}=setup(t);assert.throws(()=>s.submitReview(payload(s)),/启用/);s.setIntegration({enabled:true});const p=payload(s),receipt=s.submitReview(p);assert.equal(receipt.expression_ids.length,1);assert.equal(s.submitReview(p).duplicate,true);assert.equal(s.state().expressions.length,1);assert.equal(s.store.list('turn')[0].body.source_text,undefined);assert.throws(()=>s.submitReview({...p,turn_id:'bad',expressions:[{...p.expressions[0],source_span:{start:3,end:17}}]}),/匹配/);s.saveSettings({revision:s.config().body.revision,native_language:'zh-CN',target_language:'ja-JP'});assert.throws(()=>s.submitReview({...p,turn_id:'new'}),/改变/);for(const decision of ['no_change','skipped','uncertain','failed'])s.submitReview({...payload(s),turn_id:decision,decision,expressions:[]});assert.equal(s.state().expressions.length,1);});
test('loopback bridge denies unauthorized and browser requests; accepts enabled authenticated client',async t=>{const{s,root}=setup(t);const bridge=await startBridge(s,root);try{const d=JSON.parse(fs.readFileSync(bridge.descriptor)),url=`http://127.0.0.1:${d.port}/v1/context`,headers={Authorization:`Bearer ${d.token}`};assert.equal((await fetch(url)).status,403);assert.equal((await fetch(url,{headers})).status,403);s.setIntegration({enabled:true});assert.equal((await fetch(url,{headers:{...headers,Origin:'https://example.com'}})).status,403);assert.equal((await(await fetch(url,{headers})).json()).enabled,true);const reply=await fetch(url.replace('/context','/reviews'),{method:'POST',headers,body:JSON.stringify(payload(s))});assert.equal(reply.status,200);assert.equal((await reply.json()).expression_ids.length,1);}finally{bridge.close();}});
test('open categories persist through review and manual entry; invalid labels never write records',t=>{
 const {s,root}=setup(t);s.setIntegration({enabled:true});
 assert.deepEqual(s.reviewContext().category_policy,{type:'open_text',max_length:64});
 for(const category of ['逻辑衔接','ambiguity_resolution','信息完整性','grammar','toString','<img src=x onerror=alert(1)>','语'.repeat(64)]){
  const p=payload(s);p.turn_id=category;p.expressions[0].category=category;
  const r=s.submitReview(p);assert.equal(s.entity(r.expression_ids[0],'expression').body.category,category);
  const manual=s.addExpression({original:'a',improved:'b',category:'  '+category+'  '});assert.equal(manual.body.category,category);
 }
 const before=s.state().expressions.length,turns=s.store.list('turn').length;
 for(const category of ['', '   ', '语'.repeat(65),42,{},[],null,'bad\nlabel','bad\u202Elabel']){
  const p=payload(s);p.turn_id='invalid-'+JSON.stringify(category);p.expressions[0].category=category;
  assert.throws(()=>s.submitReview(p),/类别/);
  if(category!==null)assert.throws(()=>s.addExpression({original:'a',improved:'b',category}),/类别/);
 }
 assert.equal(s.state().expressions.length,before);assert.equal(s.store.list('turn').length,turns);
 const reopened=new Service(path.join(root,'data'));try{assert(reopened.state().expressions.some(e=>e.body.category==='逻辑衔接'));}finally{reopened.close();}
});
