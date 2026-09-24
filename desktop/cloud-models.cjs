const CLOUD_MODEL='qwen3-tts-vc-2026-01-22';
const CLOUD_MODELS=[
 {id:CLOUD_MODEL,label:'Qwen3-TTS VC · 2026-01-22',family:'qwen-tts',hint:'已验证的声音克隆模型'},
 {id:'qwen-audio-3.0-tts-plus',label:'Qwen-Audio 3.0 TTS Plus',family:'qwen-audio',hint:'支持克隆音色，可与当前模型对比听感'},
 {id:'qwen-audio-3.1-tts-flash',label:'Qwen-Audio 3.1 TTS Flash',family:'qwen-audio',hint:'支持克隆音色的 Flash 模型'},
 {id:'qwen-audio-3.0-tts-flash',label:'Qwen-Audio 3.0 TTS Flash',family:'qwen-audio',hint:'支持克隆音色的 Flash 模型'},
];
function cloudModel(id){const model=CLOUD_MODELS.find(item=>item.id===id);if(!model)throw new Error('不支持此云端语音模型，请从列表选择');return model;}
module.exports={CLOUD_MODEL,CLOUD_MODELS,cloudModel};
