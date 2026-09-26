const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createServer}=require('./server.cjs');
test('authenticated API, validation, no silent cloud fallback, single job and cancellation',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sayagain-api-test-')),token='test'.repeat(16);
 let unblock;const server=createServer({token,directory:dir,env:{},handlers:{transcribe:()=>new Promise(r=>{unblock=r;})}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 const req=(route,body,headers={})=>fetch(base+route,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
 try{
  assert.equal((await req('/v1/capabilities',undefined,{Authorization:'Bearer wrong'})).status,403);
  assert.equal((await req('/v1/capabilities',undefined,{Origin:'https://untrusted.example'})).status,403);
  const cap=await (await req('/v1/capabilities')).json();assert.equal(cap.improve,false);assert.equal(cap.clone,false);assert.equal(cap.transcribe,false);
  assert.equal((await req('/v1/improve',{text:'hello'})).status,503);
  assert.equal((await req('/v1/unknown',{})).status,404);
  assert.equal((await req('/v1/clone',{audio:'$$',format:'wav'})).status,400);
  const first=req('/v1/transcribe',{});while(!unblock)await new Promise(r=>setTimeout(r,10));
  assert.equal((await req('/v1/transcribe',{})).status,409);unblock({text:'fixture'});assert.equal((await first).status,200);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});}
});
