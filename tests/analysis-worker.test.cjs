const {test}=require('node:test'),assert=require('node:assert/strict');
const {EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const {runAnalysisWorker}=require('../desktop/analysis-worker.cjs');
function fake(start){let child;return {spawn(){child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();child.kill=()=>{child.killed=true;};child.stdin.on('data',data=>queueMicrotask(()=>start(child,JSON.parse(data))));return child;},get child(){return child;}};}
const emit=(child,value)=>child.stdout.write(JSON.stringify(value)+'\n');
test('204 clips complete in one worker with progress and output exceeding the old total limit',async()=>{
 const clips=Array.from({length:204},(_,i)=>({id:String(i)})),progress=[];
 const worker=fake((child,input)=>{for(const clip of input.clips)emit(child,{type:'clip',clip:{id:clip.id,segments:[{speaker:'S1',text:'a'.repeat(11000)}]}});emit(child,{type:'done'});child.emit('close',0);});
 const result=await runAnalysisWorker('python','worker',{clips},p=>progress.push(p),worker);
 assert.equal(result.clips.length,204);assert.deepEqual(progress.at(-1),{completed:204,total:204});assert(result.clips.every(c=>c.segments[0].speaker==='S1'));
});
test('continued progress extends the deadline beyond total job time',async()=>{
 const clips=Array.from({length:4},(_,i)=>({id:String(i)}));
 const worker=fake(async(child)=>{for(const clip of clips){await new Promise(r=>setTimeout(r,40));emit(child,{type:'clip',clip:{...clip,segments:[]}});}emit(child,{type:'done'});child.emit('close',0);});
 assert.equal((await runAnalysisWorker('p','s',{clips},()=>{},{...worker,idleTimeoutMs:110})).clips.length,4);
});
test('stalled worker is killed and rejects',async()=>{
 const worker=fake(()=>{});
 await assert.rejects(runAnalysisWorker('p','s',{clips:[{id:'1'}]},()=>{},{spawn:worker.spawn,idleTimeoutMs:20}),/长时间/);assert.equal(worker.child.killed,true);
});
test('out-of-order, incomplete and failed results are rejected',async()=>{
 for(const behavior of [c=>{emit(c,{type:'clip',clip:{id:'wrong',segments:[]}});},c=>c.emit('close',0),c=>emit(c,{error:'model failed'})]){
  const worker=fake(behavior);await assert.rejects(runAnalysisWorker('p','s',{clips:[{id:'1'}]},()=>{},worker));
 }
});
test('split JSON and UTF-8 chunks retain text correctly',async()=>{
 const worker=fake(c=>{const b=Buffer.from(JSON.stringify({type:'clip',clip:{id:'1',segments:[{keyword:'学习'}]}})+'\n');for(const byte of b)c.stdout.write(Buffer.from([byte]));emit(c,{type:'done'});c.emit('close',0);});
 const result=await runAnalysisWorker('p','s',{clips:[{id:'1'}]},()=>{},worker);assert.equal(result.clips[0].segments[0].keyword,'学习');
});
