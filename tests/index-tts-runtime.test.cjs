const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {EventEmitter} = require('node:events');
const {PassThrough} = require('node:stream');
const childProcess = require('node:child_process');
const {execFileSync} = require('node:child_process');
const {status, normalizeRequest, run, register, MODEL} = require('../desktop/index-tts-runtime.cjs');
const python = () => execFileSync(process.env.SAYAGAIN_TEST_PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), ['-c','import sys; print(sys.executable)'], {encoding:'utf8'}).trim();

function directory(t) {const root=fs.mkdtempSync(path.join(os.tmpdir(),'sayagain-index-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
test('missing IndexTTS stays uninstalled even with sufficient disk space', t => {
 const result=status(directory(t));assert.equal(result.installed,false);assert.equal(result.runtime,null);assert.equal(result.model_id,MODEL);assert.match(result.reason,/登记/);
});
test('a descriptor pointing at another model or unvalidated files is not installed', t => {
 const root=directory(t);fs.mkdirSync(path.join(root,'index-tts'));
 for(const config of [{model_id:'IndexTeam/IndexTTS-2'}, {model_id:MODEL,python:'/usr/bin/python3',repo_path:root,model_path:root,device:'cpu'}]) {
  fs.writeFileSync(path.join(root,'index-tts/runtime.json'),JSON.stringify(config));
  assert.equal(status(root).installed,false);assert.equal(status(root).runtime,null);
 }
});
test('language aliases and emotion intensity preserve an unscaled vector', () => {
 const vector=[0.8,0,0,0,0,0,0,0];
 const request=normalizeRequest({reference_path:'/tmp/voice.wav',output_path:'/tmp/result.wav',text:'你好',language:'Chinese',emotion_vector:vector,emotion_intensity:0.5});
 assert.equal(request.language,'ZH');assert.equal(request.emotion_intensity,0.5);assert.deepEqual(request.emotion_vector,vector);assert.notEqual(request.emotion_vector,vector);
});
test('emotion mixture permits 50/50 and rejects total above 100 percent even at low intensity', () => {
 const input={reference_path:'/tmp/voice.wav',output_path:'/tmp/result.wav',text:'你好',language:'zh',emotion_intensity:0.2};
 const vector=[0.5,0.5,0,0,0,0,0,0];
 assert.deepEqual(normalizeRequest({...input,emotion_vector:vector}).emotion_vector,vector);
 assert.throws(()=>normalizeRequest({...input,emotion_vector:[0.8,0.5,0,0,0,0,0,0]}),/情绪配比总和不能超过 100%/);
});
test('unsupported languages and ambiguous emotion inputs fail before spawning', () => {
 const input={reference_path:'/tmp/voice.wav',output_path:'/tmp/result.wav',text:'Hello',language:'en'};
 for(const patch of [{language:'French'},{emotion_vector:[1,0]},{emotion_vector:[NaN,0,0,0,0,0,0,0]},{emotion_vector:[2,0,0,0,0,0,0,0]},{emotion_intensity:1.2},{emotion_intensity:'0.5'},{instruction:'开心'},{reference_path:'relative.wav'},{output_path:'/tmp/voice.wav'}]) assert.throws(()=>normalizeRequest({...input,...patch}));
});
test('run rejects an unavailable runtime without starting inference', async () => {
 await assert.rejects(run({model_id:MODEL}, {}, new AbortController().signal));
});
test('worker mock checks actual IndexTTS constructor and inference argument contract', () => {
 const result=execFileSync(python(),[path.join(__dirname,'index_tts_worker_test.py')],{encoding:'utf8',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
 assert.match(result,/worker-contract-ok/);
});
test('registration and process runner use the selected separate environment; missing resources revoke installation', async t => {
 const root=directory(t), repo=path.join(root,'repo'), model=path.join(root,'model'), data=path.join(root,'data');
 const write=(base,name,value)=>{const file=path.join(base,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,value);};
 // Synthetic resources satisfy the registration contract only; these are not real model weights.
 for(const name of ['gpt.pth','codec.pth','s2mel.pth','hf_cache/campplus_cn_common.bin','hf_cache/bigvgan/bigvgan_generator.pt','hf_cache/w2v-bert-2.0/model.safetensors'])write(model,name,Buffer.alloc(1024*1024));
 for(const name of ['config.yaml','multilingual_zh_ja_yue_char_del.tiktoken','wav2vec2bert_stats.pt','feat1.pt','feat2.pt','hf_cache/bigvgan/config.json','hf_cache/w2v-bert-2.0/config.json','hf_cache/w2v-bert-2.0/preprocessor_config.json'])write(model,name,'fixture');
 write(repo,'omegaconf.py',`from types import SimpleNamespace\nclass Config(dict):\n    def __getattr__(self,k): return self[k]\nclass OmegaConf:\n    @staticmethod\n    def load(path): return Config(version='2.5',gpt=SimpleNamespace(number_text_tokens=60509),gpt_checkpoint='gpt.pth',s2mel_checkpoint='s2mel.pth',w2v_stat='wav2vec2bert_stats.pt',emo_matrix='feat2.pt',spk_matrix='feat1.pt')\n`);
 write(repo,'torch.py','from contextlib import nullcontext\ninference_mode = nullcontext\nclass cuda:\n    @staticmethod\n    def is_available(): return False\n');
 write(repo,'indextts/__init__.py','');write(repo,'indextts/utils/__init__.py','');
 write(repo,'indextts/utils/model_download.py','def ensure_models_available(*a,**k): raise RuntimeError("Must never run upstream downloader")\n');
 write(repo,'indextts/infer_v2_5.py',`import json,wave\nfrom pathlib import Path\nclass IndexTTS2:\n    def __init__(self,**kwargs):\n        from indextts.utils.model_download import ensure_models_available\n        paths=ensure_models_available(kwargs['model_dir'])\n        assert Path(paths['campplus']).is_file()\n    def infer(self,spk_audio_prompt,text,output_path,lang,emo_vector,emo_alpha,**kwargs):\n        Path(output_path+'.request.json').write_text(json.dumps(dict(text=text,lang=lang,vector=emo_vector,alpha=emo_alpha)))\n        with wave.open(output_path,'wb') as w:\n            w.setnchannels(1);w.setsampwidth(2);w.setframerate(22050);w.writeframes(b'\\0\\0'*100)\n`);
 // PYTHONPATH is needed only for the fake OmegaConf dependency during probe;
 // the application always starts the exact absolute interpreter and repo cwd.
 const previous=process.env.PYTHONPATH;process.env.PYTHONPATH=repo;
 try {
  await register(data,{python:python(),repo_path:repo,model_path:model,device:'cpu'});
  const ready=status(data);assert.equal(ready.installed,true);assert.equal(ready.runtime.synthesis_verified,false);
  const reference=path.join(root,'ref.wav'),output=path.join(root,'out.wav');fs.writeFileSync(reference,'fixture');
  await run(ready.runtime,{reference_path:reference,output_path:output,text:'same words',language:'English',emotion_vector:[1,0,0,0,0,0,0,0],emotion_intensity:0.6},new AbortController().signal);
  const sent=JSON.parse(fs.readFileSync(output+'.request.json'));assert.deepEqual(sent,{text:'same words',lang:'EN',vector:[1,0,0,0,0,0,0,0],alpha:0.6});
  const aborted=new AbortController();aborted.abort();await assert.rejects(run(ready.runtime,{reference_path:reference,output_path:output,text:'cancelled',language:'English'},aborted.signal),/取消/);
  fs.unlinkSync(path.join(model,'codec.pth'));assert.equal(status(data).installed,false);
 } finally {if(previous===undefined)delete process.env.PYTHONPATH;else process.env.PYTHONPATH=previous;}
});

function mockProcess(t, onInput) {
 const root=directory(t), files=[];
 // Only process supervision is under test; no model or Python process is started.
 for(let i=0;i<10;i++) {
  const filename=`resource-${i}`;fs.writeFileSync(path.join(root,filename),'fixture');
  const stat=fs.statSync(path.join(root,filename));files.push({root:'model',path:filename,size:stat.size,mtime_ms:stat.mtimeMs});
 }
 const runtime={source:'existing',model_id:MODEL,validation_version:1,revision:'local-sha256:'+'a'.repeat(64),
  python:process.execPath,repo_path:root,model_path:root,device:'cpu',files};
 const child=new EventEmitter(), killed=[];
 child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();
 child.kill=signal=>{killed.push(signal);queueMicrotask(()=>child.emit('close',null,signal));return true;};
 child.stdin.on('finish',()=>queueMicrotask(()=>onInput(child)));
 t.mock.method(childProcess,'spawn',()=>child);
 return {killed,run:signal=>run(runtime,{reference_path:path.join(root,'private-reference.wav'),output_path:path.join(root,'out.wav'),text:'private spoken words',language:'zh'},signal)};
}
const privateLog='PRIVATE_AUDIO_TEXT /private/person/reference.wav';
function privateSafe(pattern) {
 return error=>{assert.match(error.message,pattern);assert.doesNotMatch(error.message,/PRIVATE_AUDIO_TEXT|\/private\/person|private spoken words/);return true;};
}
test('native signals are reported without exposing private model logs', async t => {
 for(const signal of ['SIGKILL','SIGSEGV','SIGABRT'])await t.test(signal,async t=>{
  const worker=mockProcess(t,child=>{child.stderr.write(privateLog);child.stdout.write(privateLog);child.emit('close',null,signal);});
  await assert.rejects(worker.run(),privateSafe(signal==='SIGKILL'?/SIGKILL.*内存或交换空间不足/:new RegExp(`信号终止.*${signal}`)));
  assert.deepEqual(worker.killed,[]);
 });
});
test('nonzero exit remains a failure even with success JSON and preserves structured worker errors', async t => {
 for(const [name,output] of [['empty',''],['private log',privateLog],['success',JSON.stringify({ok:true})],['worker error',JSON.stringify({ok:false,error:'受控模型错误'})]])await t.test(name,async t=>{
  const worker=mockProcess(t,child=>{child.stderr.write(privateLog);child.stdout.write(output);child.emit('close',7,null);});
  await assert.rejects(worker.run(),error=>{privateSafe(/退出码 7/)(error);if(name==='worker error')assert.match(error.message,/受控模型错误/);return true;});
 });
});
test('normal exit distinguishes empty output from malformed JSON or invalid result shapes', async t => {
 for(const [name,output] of [['empty',''],['malformed',privateLog],['null','null'],['array','[]'],['missing flag','{"sample_rate":22050}']])await t.test(name,async t=>{
  const worker=mockProcess(t,child=>{child.stderr.write(privateLog);child.stdout.write(output);child.emit('close',0,null);});
  await assert.rejects(worker.run(),privateSafe(name==='empty'?/未返回结果/:/返回格式无效/));
 });
});
test('UTF-8 result chunks are decoded correctly while private stderr is discarded', async t => {
 const result={ok:true,sample_rate:22050,note:'中文结果'};
 const worker=mockProcess(t,child=>{
  child.stderr.write(privateLog.repeat(10000));
  for(const byte of Buffer.from(JSON.stringify(result)))child.stdout.write(Buffer.from([byte]));
  child.emit('close',0,null);
 });
 assert.deepEqual(await worker.run(),result);
});
test('timeout is distinct from the signal used to terminate a stalled worker', async t => {
 const originalSetTimeout=global.setTimeout;
 t.mock.method(global,'setTimeout',(callback,milliseconds,...args)=>originalSetTimeout(callback,milliseconds>=5*60000?1:milliseconds,...args));
 const worker=mockProcess(t,()=>{});
 await assert.rejects(worker.run(),privateSafe(/合成超时/));
 assert.deepEqual(worker.killed,['SIGTERM']);
});
test('output limit counts UTF-8 bytes and reports overflow without the private output', async t => {
 const worker=mockProcess(t,child=>{child.stderr.write(privateLog);child.stdout.write('私'.repeat(90000));});
 await assert.rejects(worker.run(),privateSafe(/返回数据过多/));
 assert.deepEqual(worker.killed,['SIGTERM']);
});
test('explicit cancellation takes precedence over the termination signal', async t => {
 const controller=new AbortController();
 const worker=mockProcess(t,()=>controller.abort());
 await assert.rejects(worker.run(controller.signal),privateSafe(/任务已取消/));
 assert.deepEqual(worker.killed,['SIGTERM']);
});
