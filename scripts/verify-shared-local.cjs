// Explicit local smoke run: imports one authorized review and voice reference.
const fs=require('node:fs'),path=require('node:path');
const {Service}=require('../desktop/service.cjs'),{Speech}=require('../desktop/speech.cjs'),{startBridge}=require('../desktop/bridge.cjs'),{parseWav}=require('../desktop/audio.cjs');
const {connectionFile}=require('../skills/sayagain/scripts/client.cjs');
(async()=>{
 const [entryFile,referenceFile]=process.argv.slice(2);
 if(!entryFile||!referenceFile)throw Error('Provide review JSON and authorized reference WAV');
 const entry=JSON.parse(fs.readFileSync(entryFile,'utf8'));
 const directory=process.env.SAYAGAIN_DATA_DIR||path.dirname(connectionFile());
 if(fs.existsSync(path.join(directory,'sayagain-connection.json')))throw Error('Close the running app before this standalone verification');
 const service=new Service(path.join(directory,'data'));
 let bridge,speech;
 try{
  if(!service.config().body.onboarding_complete)service.saveSettings({revision:service.config().body.revision,native_language:'zh-CN',target_language:'en-US'});
  service.setIntegration({enabled:true});bridge=await startBridge(service,directory);
  const descriptor=JSON.parse(fs.readFileSync(bridge.descriptor)),headers={Authorization:`Bearer ${descriptor.token}`,'Content-Type':'application/json'};
  const base=`http://127.0.0.1:${descriptor.port}`,context=await(await fetch(base+'/v1/context',{headers})).json();
  const payload={client:'codex',conversation_id:entry.source_key.split(':')[0],turn_id:entry.source_key,message_revision:1,config_id:context.config.id,config_revision:context.config.revision,policy_version:1,source_text:entry.original,decision:'needs_improvement',reason:entry.note,evaluator:'host-model',expressions:[{source_span:{start:0,end:Array.from(entry.original).length},original:entry.original,improved:entry.suggestion,translation:entry.translation,explanation:entry.note,pattern:entry.pattern,category:'naturalness',confidence:0.95}]};
  const response=await fetch(base+'/v1/reviews',{method:'POST',headers,body:JSON.stringify(payload)});const receipt=await response.json();if(!response.ok)throw Error(receipt.error);
  let voice=service.state().voices.find(v=>v.body.name==='我的音色 · 本地验证');
  if(!voice)voice=service.saveVoice({name:'我的音色 · 本地验证',note:'用户已确认的清理参考录音，本地复用'});
  if(!voice.body.default_sample_id){
   const bytes=fs.readFileSync(referenceFile),format=parseWav(bytes);
   // Extract peaks from PCM16 WAV, preserving the actual reference waveform.
   let offset=12,data;
   while(offset+8<=bytes.length){const size=bytes.readUInt32LE(offset+4);if(bytes.toString('ascii',offset,offset+4)==='data'){data=bytes.subarray(offset+8,offset+8+size);break;}offset+=8+size+(size%2);}
   if(!data)throw Error('Missing WAV samples');
   const count=data.length/2,peaks=Array.from({length:64},(_,i)=>{let peak=0;for(let j=Math.floor(i*count/64);j<Math.floor((i+1)*count/64);j++)peak=Math.max(peak,Math.abs(data.readInt16LE(j*2))/32768);return peak;});
   service.addSample({voice_id:voice.block_id,language:'zh-CN',transcript:'',bytes,media_type:'audio/wav',duration_ms:format.duration_ms,waveform:peaks,source:'import'});
  }
  service.defaultVoice({id:voice.block_id});
  speech=new Speech(service,directory);speech.configure({mode:'local',cloud_enabled:false});
  const request={expression_id:receipt.expression_ids[0],voice_id:voice.block_id};
  const job=speech.request(request);await new Promise(resolve=>setImmediate(resolve));
  while(speech.busy)await new Promise(resolve=>setTimeout(resolve,500));
  const result=service.store.get(job.block_id);if(result.body.status!=='succeeded')throw Error(result.body.error);
  const audio=service.asset(result.body.asset_id).filename;
  if(!speech.request(request).cached)throw Error('Expected cache reuse');
  console.log(JSON.stringify({saved:true,online_entry_id:entry.id,local_expression_id:request.expression_id,model:result.body.model_id,device:speech.status().local.device,audio,cached:true},null,2));
 }finally{if(speech)await speech.close();bridge?.close();service.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
