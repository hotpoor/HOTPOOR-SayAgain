const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const names={fsmn:'FSMN VAD',sensevoice:'SenseVoice INT8',campplus:'CAMPPlus',zipformer:'Zipformer 关键词'};
function runtime(directory){try{return JSON.parse(fs.readFileSync(path.join(directory,'recording-models/runtime.json'),'utf8'));}catch{return null;}}
function status(directory){const data=runtime(directory);return Object.entries(names).map(([key,name])=>{const m=data?.models?.[key];return{name,key,device:data?.device||'cpu',status:!m||!fs.existsSync(m.path)?'未登记或文件缺失':m.verified?'本机推理验证通过':'已下载登记 · 待推理验证'};});}
const running=new Set();
async function transcribe(service,directory,input){
 const clip=service.entity(input.id,'recording_clip'),r=runtime(directory);
 if(running.has(input.id))throw Error('此片段正在转写');
 if(!r?.python||!['fsmn','sensevoice'].every(k=>r.models?.[k]&&fs.existsSync(r.models[k].path)))throw Error('请先让 Skill 安装并登记 FSMN VAD 和 SenseVoice');
 running.add(input.id);
 try{
  const result=await new Promise((resolve,reject)=>{
   const child=spawn(r.python,[path.join(__dirname,'../workers/transcribe_recording.py')],{windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONIOENCODING:'utf-8'}});let output='';
   const timer=setTimeout(()=>child.kill(),180000);
   child.stdout.on('data',chunk=>{output+=chunk;if(output.length>200000)child.kill();});child.stderr.on('data',()=>{});child.stdin.on('error',()=>{});
   child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',code=>{clearTimeout(timer);try{const value=JSON.parse(output);if(code||value.error)reject(Error(value.error||'转写失败'));else resolve(value);}catch{reject(Error('本地转写超时或输出无效'));}});
   child.stdin.end(JSON.stringify({models:r.models,audio:service.asset(clip.body.asset_id).filename}));
  });
  const current=service.entity(input.id,'recording_clip');if(current.body.revision!==clip.body.revision)throw Error('文字已被修改，未覆盖；请重新转写');
  if(typeof result.text!=='string'||result.text.length>20000||!Array.isArray(result.segments))throw Error('转写结果无效');
  return service.update(current,{transcript:result.text,transcript_segments:result.segments,transcript_status:'machine_unreviewed'});
 }finally{running.delete(input.id);}
}
module.exports={status,transcribe};
