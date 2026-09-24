const fs=require('node:fs'),path=require('node:path');
const MODEL='Qwen/Qwen3-TTS-12Hz-0.6B-Base';
const REVISION='5d83992436eae1d760afd27aff78a71d676296fc';
const INSTALL_BYTES=10*1024**3, RUN_BYTES=512*1024**2;
function modelStatus(userDirectory) {
 const root=path.join(userDirectory,'tts');let runtime=null;
 try{runtime=JSON.parse(fs.readFileSync(path.join(root,'runtime.json'),'utf8'));}catch{}
 const installed=!!(((runtime?.model_id===MODEL&&runtime?.revision===REVISION)||(runtime?.source==='existing'&&['Qwen/Qwen3-TTS-12Hz-0.6B-Base','Qwen/Qwen3-TTS-12Hz-1.7B-Base'].includes(runtime?.model_id)&&/^local-sha256:[a-f0-9]{64}$/.test(runtime?.revision||'')))&&path.isAbsolute(runtime.python||'')&&path.isAbsolute(runtime.model_path||'')&&fs.existsSync(runtime.python)&&fs.existsSync(path.join(runtime.model_path,'model.safetensors'))&&fs.existsSync(path.join(runtime.model_path,'speech_tokenizer/model.safetensors')));
 let available=0;try{const stat=fs.statfsSync(userDirectory);available=stat.bavail*stat.bsize;}catch{}
 const required=installed?RUN_BYTES:INSTALL_BYTES;
 return{installed,available_bytes:available,required_bytes:required,space_ok:available>=required,reason:available<required?'磁盘空间不足，无法使用本地 Qwen3-TTS':installed?'本地模型已安装':'本地模型尚未安装',model_id:installed?runtime.model_id:MODEL,revision:installed?runtime.revision:REVISION,device:installed?runtime.device:null,runtime:installed?runtime:null};
}
module.exports={modelStatus,MODEL,REVISION,INSTALL_BYTES};
