const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {Service} = require('../desktop/service.cjs');
const {Speech,CLOUD_MODEL} = require('../desktop/speech.cjs');
const {INDEX_MODEL} = require('../desktop/voice-lab.cjs');

function wav(seconds=10,rate=24000) {
  const b = Buffer.alloc(44+seconds*rate*2);
  b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(b.length-44,40);return b;
}
function fixture(t,options={}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'sayagain-voice-lab-'));
  const service = new Service(path.join(root,'data'));
  let key = '';
  const secrets = {has:()=>!!key,get:()=>key,set:value=>{key=value;},clear:()=>{key='';}};
  const runtime = {model_id:'Qwen/Qwen3-TTS-12Hz-1.7B-Base',revision:'test-revision',python:'unused',model_path:'unused',device:'cpu'};
  const speech = new Speech(service,root,{secrets,localStatus:()=>({installed:true,space_ok:true,runtime}),indexStatus:()=>({installed:false,space_ok:true,reason:'IndexTTS 未登记'}),localRunner:async request=>fs.writeFileSync(request.output_path,wav(1)),fetch:async()=>{throw Error('Network must be mocked');},...options});
  const voice = service.saveVoice({name:'我的测试声音',note:''});
  const sample = service.addSample({voice_id:voice.block_id,language:'zh-CN',transcript:'这是一段参考录音。',bytes:wav(),media_type:'audio/wav',duration_ms:10000,waveform:Array(64).fill(0),source:'import'});
  t.after(async()=>{await speech.close();service.close();fs.rmSync(root,{recursive:true,force:true});});
  return {root,service,speech,secrets,runtime,voice,sample,input:{voice_id:voice.block_id,sample_id:sample.block_id,model_id:runtime.model_id,text:'今天很高兴见到你。',language:'zh-CN'}};
}
async function finish(speech) {
  await new Promise(resolve=>setImmediate(resolve));await speech.drain();
  while(speech.busy) await new Promise(resolve=>setTimeout(resolve,5));
}
function cloudFetch(calls,{failSynthesis=false}={}) {
  return async (url,options) => {
    calls.push({url,options});
    if (url.includes('getPolicy')) return Response.json({data:{upload_dir:'tests',upload_host:'https://test.aliyuncs.com/',oss_access_key_id:'upload-id',signature:'signature',policy:'policy',x_oss_object_acl:'private',x_oss_forbid_overwrite:'true'}});
    if (options?.body instanceof FormData) return new Response('');
    if (url.endsWith('/customization')) return Response.json({output:{voice_id:'voice-test',voice:'voice-test'}});
    if (url.endsWith('/SpeechSynthesizer')) return failSynthesis?new Response('private upstream error',{status:400}):Response.json({output:{audio:{url:'https://test.aliyuncs.com/audio.wav'}}});
    if (url.endsWith('/generation')) {
      const body = JSON.parse(options.body);
      if (body.input.action === 'voice_clone') return Response.json({output:{base_resp:{status_code:0}}});
      return Response.json({output:{base_resp:{status_code:0},data:{audio:wav(1).toString('hex'),status:2}}});
    }
    return new Response(wav(1));
  };
}

test('each lab click persists independently without an expression, default changes or synthesis cache reuse',async t=>{
  let runs=0;const {service,speech,input,root}=fixture(t,{localRunner:async request=>{runs++;fs.writeFileSync(request.output_path,wav(1));}});
  const settings=JSON.stringify(service.config()),speechSettings=JSON.stringify(speech.config());
  const first=speech.requestVoiceLab(input);await finish(speech);
  const second=speech.requestVoiceLab(input);await finish(speech);
  assert.notEqual(first.block_id,second.block_id);assert.equal(runs,2);
  assert.equal(first.body.content_cache_key,second.body.content_cache_key);
  assert.notEqual(first.body.cache_key,second.body.cache_key);
  assert.equal(service.state().expressions.length,0);
  assert.equal(JSON.stringify(service.config()),settings);assert.equal(JSON.stringify(speech.config()),speechSettings);
  const saved=service.store.get(second.block_id);
  assert.equal(saved.body.status,'succeeded');assert.equal(saved.body.purpose,'voice_lab');assert.equal(saved.body.expression_id,undefined);
  assert.equal(saved.body.voice_name_snapshot,'我的测试声音');assert.equal(saved.body.language,'Chinese');
  const exported=require('../desktop/exports.cjs').write(service,{kind:'audio',ids:[second.block_id]},root);
  assert.equal(exported.count,1);assert(fs.existsSync(path.join(exported.directory,second.block_id+'.wav')));
  const reopened=new Service(path.join(root,'data'));
  try {assert.equal(reopened.state().syntheses.filter(item=>item.body.purpose==='voice_lab').length,2);}finally{reopened.close();}
});

test('main process rejects unsupported controls, invalid vectors, language and text before any task',t=>{
  const {speech,service,input}=fixture(t);
  assert.throws(()=>speech.requestVoiceLab({...input,instruction:'开心'}),/不支持/);
  assert.throws(()=>speech.requestVoiceLab({...input,emotion:'happy'}),/不支持/);
  assert.throws(()=>speech.requestVoiceLab({...input,model_id:'unknown'}),/支持的实验模型/);
  assert.throws(()=>speech.requestVoiceLab({...input,text:' '}),/文字/);
  assert.throws(()=>speech.requestVoiceLab({...input,text:'字'.repeat(601)}),/文字/);
  assert.throws(()=>speech.requestVoiceLab({...input,language:'ar'}),/模型不支持/);
  assert.throws(()=>speech.requestVoiceLab({...input,model_id:INDEX_MODEL,emotion_vector:[1]}),/8 个/);
  assert.throws(()=>speech.requestVoiceLab({...input,model_id:INDEX_MODEL,emotion_vector:[0,0,0,0,0,0,0,NaN]}),/8 个/);
  assert.throws(()=>speech.requestVoiceLab({...input,model_id:INDEX_MODEL,language:'ko'}),/模型不支持/);
  assert.throws(()=>speech.requestVoiceLab({...input,model_id:INDEX_MODEL,emotion_intensity:0.6}),/先选择情绪向量/);
  assert.equal(service.state().syntheses.length,0);
});

test('selected sample is honored; foreign, archived and cross-profile samples cannot be used',async t=>{
  const {speech,service,input,sample}=fixture(t);
  const second=service.addSample({voice_id:input.voice_id,language:'zh-CN',transcript:'另一个样本。',bytes:wav(11),media_type:'audio/wav',duration_ms:11000,waveform:Array(64).fill(0),source:'import'});
  const result=speech.requestVoiceLab({...input,sample_id:second.block_id});await finish(speech);
  assert.equal(result.body.sample_id,second.block_id);assert.equal(result.body.reference_text,'另一个样本。');
  assert.equal(service.entity(input.voice_id,'voice').body.default_sample_id,sample.block_id);
  const other=service.saveVoice({name:'另一个音色',note:''});
  assert.throws(()=>speech.requestVoiceLab({...input,voice_id:other.block_id}),/不属于/);
  service.update(service.entity(second.block_id,'voice_sample'),{status:'archived'});
  assert.throws(()=>speech.requestVoiceLab({...input,sample_id:second.block_id}),/已归档/);
  service.update(service.entity(sample.block_id,'voice_sample'),{profile_id:'other-profile'});
  assert.throws(()=>speech.requestVoiceLab(input),/不属于/);
});

test('cloud instruction uses singular input.instruction, retains styles and never mutates defaults',async t=>{
  const calls=[];const {speech,service,input}=fixture(t,{fetch:cloudFetch(calls)});
  speech.configure({mode:'local',cloud_enabled:true,api_key:'test-key',cloud_model:CLOUD_MODEL});
  const before=JSON.stringify(speech.config());
  const trial={...input,model_id:'qwen-audio-3.0-tts-plus',instruction:'温柔地说',cloud_consent:true};
  assert.throws(()=>speech.requestVoiceLab({...trial,cloud_consent:false}),/确认/);
  const first=speech.requestVoiceLab(trial);await finish(speech);
  const second=speech.requestVoiceLab({...trial,instruction:'开心地说'});await finish(speech);
  const payloads=calls.filter(call=>call.url.endsWith('/SpeechSynthesizer')).map(call=>JSON.parse(call.options.body));
  assert.equal(payloads.length,2);assert.equal(payloads[0].input.instruction,'温柔地说');assert.equal(payloads[0].input.instructions,undefined);assert.equal(payloads[1].input.instruction,'开心地说');
  assert.equal(calls.filter(call=>call.url.endsWith('/customization')).length,1);
  assert.equal(service.store.get(first.block_id).body.style.instruction,'温柔地说');
  assert.notEqual(first.body.content_cache_key,second.body.content_cache_key);
  assert.equal(JSON.stringify(speech.config()),before);
  assert.equal(service.state().expressions.length,0);
  assert(!JSON.stringify(speech.voiceLabStatus()).includes('test-key'));
  assert.equal(speech.voiceLabStatus().models.find(model=>model.id===trial.model_id).verification,'documented_proxy_unverified');
});

test('MiniMax enum is nested in voice_setting; ambiguous model emotions are rejected',async t=>{
  const calls=[];const {speech,service,input}=fixture(t,{fetch:cloudFetch(calls)});
  speech.configure({mode:'cloud',cloud_enabled:true,api_key:'test-key'});
  const trial={...input,model_id:'MiniMax/speech-2.8-hd',emotion:'sad',cloud_consent:true};
  assert.throws(()=>speech.requestVoiceLab({...trial,emotion:'whisper'}),/支持的情绪/);
  const result=speech.requestVoiceLab(trial);await finish(speech);
  const payload=calls.filter(call=>call.url.endsWith('/generation')).map(call=>JSON.parse(call.options.body)).find(body=>!body.input.action);
  assert.equal(payload.input.voice_setting.emotion,'sad');assert.equal(payload.input.emotion,undefined);
  assert.equal(service.store.get(result.block_id).body.status,'succeeded');
});

test('cloud provider rejection records failure once without fallback or automatic retry',async t=>{
  const calls=[];const {speech,service,input}=fixture(t,{fetch:cloudFetch(calls,{failSynthesis:true})});
  speech.configure({mode:'cloud',cloud_enabled:true,api_key:'test-key'});
  const result=speech.requestVoiceLab({...input,model_id:'qwen-audio-3.0-tts-plus',instruction:'开心',cloud_consent:true});
  await finish(speech);await speech.drain();
  const saved=service.store.get(result.block_id);
  assert.equal(saved.body.status,'failed');assert.match(saved.body.error,/400/);
  assert.equal(calls.filter(call=>call.url.endsWith('/SpeechSynthesizer')).length,1);
  assert(!JSON.stringify(service.state()).includes('private upstream error'));
});

test('Index trials keep vector unscaled and route to their own runtime',async t=>{
  const indexRuntime={model_id:INDEX_MODEL,revision:'index-test',python:'unused-index',repo_path:'repo',model_path:'model',device:'cpu'};
  const calls=[];
  const {speech,service,input}=fixture(t,{indexStatus:()=>({installed:true,space_ok:true,runtime:indexRuntime}),indexRunner:async(runtime,request)=>{calls.push({runtime,request});fs.writeFileSync(request.output_path,wav(1));}});
  const vector=[0.7,0,0.3,0,0,0,0,0];
  const result=speech.requestVoiceLab({...input,model_id:INDEX_MODEL,language:'ar',emotion_vector:vector,emotion_intensity:0.4});
  vector[0]=0;await finish(speech);
  assert.equal(calls.length,1);assert.equal(calls[0].runtime,indexRuntime);assert.equal(calls[0].request.emotion_vector[0],0.7);assert.equal(calls[0].request.emotion_intensity,0.4);assert.equal(calls[0].request.language,'Arabic');
  assert.equal(service.store.get(result.block_id).body.status,'succeeded');
});

test('Index rejects overfilled emotion mixtures before queueing even when intensity is low',t=>{
  const indexRuntime={model_id:INDEX_MODEL,revision:'index-test',python:'unused-index',repo_path:'repo',model_path:'model',device:'cpu'};
  const {speech,service,input}=fixture(t,{indexStatus:()=>({installed:true,space_ok:true,runtime:indexRuntime})});
  const vector=[0.7,0,0.4,0,0,0,0,0];
  assert.throws(()=>speech.requestVoiceLab({...input,model_id:INDEX_MODEL,emotion_vector:vector,emotion_intensity:0.2}),/情绪配比总和不能超过 100%/);
  assert.deepEqual(vector,[0.7,0,0.4,0,0,0,0,0]);
  assert.equal(service.state().syntheses.length,0);
});

test('queued cancellation and changed runtime cannot execute stale lab snapshots',async t=>{
  let runs=0;const {speech,service,input,runtime}=fixture(t,{localRunner:async request=>{runs++;fs.writeFileSync(request.output_path,wav(1));}});
  const cancelled=speech.requestVoiceLab(input);speech.cancel({id:cancelled.block_id});
  await finish(speech);assert.equal(runs,0);assert.equal(service.store.get(cancelled.block_id).body.status,'cancelled');
  const stale=speech.requestVoiceLab(input);runtime.revision='changed';await finish(speech);
  assert.equal(runs,0);assert.equal(service.store.get(stale.block_id).body.status,'failed');assert.match(service.store.get(stale.block_id).body.error,/配置已变化/);
});

test('running Index cancellation waits for its runner and saves cancelled status',async t=>{
  let started;
  const ready=new Promise(resolve=>{started=resolve;});
  const indexRuntime={model_id:INDEX_MODEL,revision:'index-test',python:'unused',repo_path:'repo',model_path:'model',device:'cpu'};
  const {speech,service,input}=fixture(t,{indexStatus:()=>({installed:true,space_ok:true,runtime:indexRuntime}),indexRunner:async(runtime,request,signal)=>{started();await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}));}});
  const result=speech.requestVoiceLab({...input,model_id:INDEX_MODEL});await ready;speech.cancel({id:result.block_id});await finish(speech);
  assert.equal(service.store.get(result.block_id).body.status,'cancelled');assert.equal(speech.busy,false);
});
