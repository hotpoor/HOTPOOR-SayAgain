const fs = require('node:fs');
const {createHash} = require('node:crypto');
const {newId} = require('../storage/store.cjs');
const {parseWav} = require('./audio.cjs');
const {CLOUD_MODELS} = require('./cloud-models.cjs');
const {MODEL} = require('./local-model.cjs');

const LANGUAGES = {zh:'Chinese',en:'English',ja:'Japanese',ko:'Korean',de:'German',fr:'French',ru:'Russian',pt:'Portuguese',es:'Spanish',it:'Italian',ar:'Arabic'};
const INDEX_MODEL = 'IndexTeam/IndexTTS-2.5';
const INSTRUCTIONS = new Set(['qwen-audio-3.0-tts-plus','qwen-audio-3.0-tts-flash','qwen-audio-3.1-tts-flash','cosyvoice-v3.5-plus','cosyvoice-v3.5-flash','cosyvoice-v3-flash']);
const EMOTIONS = [['开心','happy'],['难过','sad'],['生气','angry'],['害怕','fearful'],['厌恶','disgusted'],['惊讶','surprised'],['平静','calm']];
const INDEX_EMOTIONS = [['开心','happy'],['生气','angry'],['难过','sad'],['害怕','afraid'],['厌恶','disgusted'],['低落','melancholic'],['惊讶','surprised'],['平静','calm']];
const tagList = entries => entries.map(([label,value]) => ({label,value}));
const hash = value => createHash('sha256').update(value).digest('hex');
const has = (input,key) => input[key] !== undefined && input[key] !== null && input[key] !== '';

function indexStatus(directory) {
  return require('./index-tts-runtime.cjs').status(directory);
}
function status(speech) {
  const local = speech.localStatus(speech.userDirectory);
  const index = speech.indexStatus(speech.userDirectory);
  const key = speech.secrets?.status?.() || {usable:!!speech.secrets?.has()};
  const cloudAvailable = speech.config().body.cloud_enabled && key.usable;
  const localId = local.runtime?.model_id || MODEL;
  const models = [
    {id:localId,label:'本地 Qwen3-TTS Base',provider:'local',engine:'qwen',available:!!(local.installed && local.space_ok),reason:local.installed && local.space_ok?'':local.reason || '请先登记本地 Qwen3-TTS Base',control:'none',tags:[],verification:'local',note:'使用参考录音的说话方式；Base 不支持情绪指令。'},
    {id:INDEX_MODEL,label:'本地 IndexTTS-2.5',provider:'local',engine:'indextts',available:!!(index.installed && index.space_ok),reason:index.installed && index.space_ok?'':index.reason || '请先登记已有 IndexTTS-2.5 环境',control:'emotion-vector',tags:tagList(INDEX_EMOTIONS),emotion_dimensions:tagList(INDEX_EMOTIONS),emotion_intensity:{min:0,max:1,default:0.6},verification:'local',note:'八维情绪与强度；不会自动安装或下载模型。'},
    ...CLOUD_MODELS.map(model => {
      const control = INSTRUCTIONS.has(model.id)?'instruction':model.family === 'minimax'?'emotion-enum':'none';
      const tags = control === 'emotion-enum'?tagList(EMOTIONS):control === 'instruction'?tagList([['自然','自然、平稳地说，像日常聊天。'],['开心','轻快、开心，带一点笑意，但不要夸张。'],['安慰','用温柔、安慰的语气说，语速稍慢，情绪自然克制。'],['坚定','认真、坚定地说，吐字清楚，重音明确。'],['难过','低落、难过地说，语速稍慢，情绪克制，不要刻意哭腔。'],['生气','压着怒气说，语气坚定，重音清晰，不要大喊。'],['惊讶','带一点意外和惊讶，语调自然上扬，不要夸张。']]):[];
      return {id:model.id,label:model.label,provider:'cloud',engine:'cloud',family:model.family,available:!!cloudAvailable,reason:cloudAvailable?'':!speech.config().body.cloud_enabled?'请在设置中主动启用云端合成':key.error || '请配置可用的千问 API Key',control,tags,verification:'documented_proxy_unverified',note:control === 'none'?'此复刻模型未开放情绪控制。':'按模型文档发送控制参数；当前接入平台尚未实测，失败不会换模型或自动重试。'};
    }),
  ];
  for (const model of models) model.languages = model.engine === 'indextts'?['zh','en','ja','es','ar']:Object.keys(LANGUAGES).filter(code=>code !== 'ar');
  return {models,cloud_enabled:!!speech.config().body.cloud_enabled,has_api_key:!!key.usable,max_text_length:600,languages:Object.entries(LANGUAGES).map(([value,label])=>({value,label})),notice:'实验独立保存；每次点击会生成一条新结果，不改变默认音色或模型。'};
}

function validateStyle(input, model) {
  const style = {};
  const controls = ['instruction','emotion','emotion_vector','emotion_intensity'];
  const allowed = model.control === 'instruction'?['instruction']:model.control === 'emotion-enum'?['emotion']:model.control === 'emotion-vector'?['emotion_vector','emotion_intensity']:[];
  for (const key of controls) if (has(input,key) && !allowed.includes(key)) throw Error('所选模型不支持此情绪控制：' + key);
  if (has(input,'instruction')) {
    if (typeof input.instruction !== 'string' || Array.from(input.instruction).length > 1000) throw Error('情绪指令最多 1000 个字符');
    const value = input.instruction.trim(); if (value) style.instruction = value;
  }
  if (has(input,'emotion')) {
    if (typeof input.emotion !== 'string' || !model.tags.some(tag => tag.value === input.emotion)) throw Error('请选择模型支持的情绪');
    style.emotion = input.emotion;
  }
  if (has(input,'emotion_vector')) {
    if (!Array.isArray(input.emotion_vector) || input.emotion_vector.length !== 8 || input.emotion_vector.some(value=>typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1)) throw Error('情绪向量必须是 8 个 0–1 的数值');
    if (input.emotion_vector.reduce((sum,value)=>sum+value,0) > 1+1e-6) throw Error('情绪配比总和不能超过 100%，请降低部分情绪');
    style.emotion_vector = [...input.emotion_vector];
  }
  if (has(input,'emotion_intensity')) {
    if (typeof input.emotion_intensity !== 'number' || !Number.isFinite(input.emotion_intensity) || input.emotion_intensity < 0 || input.emotion_intensity > 1) throw Error('情绪强度需在 0–1 之间');
    if (!style.emotion_vector) throw Error('请先选择情绪向量，再设置强度');
    style.emotion_intensity = input.emotion_intensity;
  }
  if (style.emotion_vector && style.emotion_intensity === undefined) style.emotion_intensity = 0.6;
  return style;
}

function request(speech,input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('无效的实验参数');
  if (speech.closed) throw Error('语音服务已关闭');
  const model = status(speech).models.find(model=>model.id === input.model_id);
  if (!model) throw Error('请选择支持的实验模型');
  const style = validateStyle(input,model);
  if (typeof input.text !== 'string' || !input.text.trim() || Array.from(input.text.trim()).length > 600) throw Error('实验文字需为 1–600 个字符');
  const text = input.text.trim();
  if (typeof input.language !== 'string') throw Error('请选择合成语言');
  const language = Object.values(LANGUAGES).includes(input.language)?input.language:LANGUAGES[input.language.split('-')[0]];
  if (!language) throw Error('不支持此合成语言');
  if (!model.languages.some(code=>LANGUAGES[code] === language)) throw Error('所选模型不支持此合成语言');
  const s = speech.service, voice = s.entity(input.voice_id,'voice');
  if (voice.body.profile_id !== s.profileId || voice.body.status !== 'active') throw Error('请选择当前用户的可用音色');
  if (!input.sample_id && !voice.body.default_sample_id) throw Error('请先为音色添加参考录音');
  const sample = s.entity(input.sample_id || voice.body.default_sample_id,'voice_sample');
  if (sample.body.voice_id !== voice.block_id || sample.body.profile_id !== s.profileId || sample.body.status !== 'active') throw Error('参考录音不属于所选音色或已归档');
  const asset = s.entity(sample.body.asset_id,'asset');
  if (asset.body.profile_id !== s.profileId || asset.body.media_type !== 'audio/wav') throw Error('请使用当前用户的 WAV 参考录音');
  const bytes = fs.readFileSync(s.asset(asset.block_id).filename), format = parseWav(bytes);
  if (!model.available) throw Error(model.reason);
  let runtime = null, fingerprint = 'local';
  if (model.provider === 'cloud') {
    if (input.cloud_consent !== true) throw Error('请确认将所选参考录音和实验文字发送到千问AI平台');
    if (format.sample_rate < 24000 || format.channels !== 1 || format.duration_ms < 10000 || format.duration_ms > 60000 || bytes.length > 10*1024*1024) throw Error('云端克隆需要 10–60 秒、至少 24 kHz 单声道、10 MB 以内的 WAV 参考录音');
    fingerprint = hash(speech.secrets.get());
  } else {
    runtime = (model.engine === 'indextts'?speech.indexStatus(speech.userDirectory):speech.localStatus(speech.userDirectory)).runtime;
    if (!runtime || runtime.model_id !== model.id) throw Error('本地模型配置已变化，请刷新后重试');
  }
  const sampleHash = hash(bytes), revision = runtime?.revision || model.id;
  const runtimeSnapshot = runtime?{model_id:runtime.model_id,revision:runtime.revision,python:runtime.python,model_path:runtime.model_path,repo_path:runtime.repo_path,device:runtime.device}:null;
  const contentCache = hash(JSON.stringify({purpose:'voice_lab',text,language,model:model.id,revision,engine:model.engine,runtime:runtimeSnapshot,voice:voice.block_id,sample:sample.block_id,sample_hash:sampleHash,reference_text:sample.body.transcript,style,key:fingerprint}));
  // A lab click is an independent trial. Keep a content fingerprint for comparison,
  // but never use expression deduplication to silently reuse an earlier trial.
  const record = s.store.transaction(()=>{
    const queued = s.store.put({type:'synthesis',purpose:'voice_lab',profile_id:s.profileId,text_snapshot:text,voice_id:voice.block_id,voice_name_snapshot:voice.body.name,voice_revision:voice.body.voice_revision,sample_id:sample.block_id,sample_name_snapshot:sample.body.transcript?.slice(0,20) || '参考录音',sample_hash:sampleHash,reference_text:sample.body.transcript || '',reference_asset_id:asset.block_id,provider:model.provider,engine:model.engine,model_id:model.id,model_label_snapshot:model.label,model_revision:revision,runtime_snapshot:runtimeSnapshot,language,style,...style,status:'queued',queued_at:Date.now(),started_at:null,completed_at:null,error:null,content_cache_key:contentCache,cache_key:contentCache + ':' + newId(),key_fingerprint:fingerprint,links:[{relation:'voice',target_id:voice.block_id},{relation:'sample',target_id:sample.block_id}]});
    s.store.put({type:'job',profile_id:s.profileId,kind:'synthesis',target_id:queued.block_id,status:'queued',attempts:1,links:[{relation:'synthesis',target_id:queued.block_id}]});
    return queued;
  });
  speech.onChange(); queueMicrotask(()=>speech.drain()); return record;
}

function validateRun(speech, record, sample, reference) {
  if (record.body.purpose !== 'voice_lab') return;
  if (sample.body.status !== 'active' || sample.body.profile_id !== speech.service.profileId || sample.body.voice_id !== record.body.voice_id || sample.body.asset_id !== record.body.reference_asset_id || hash(fs.readFileSync(reference)) !== record.body.sample_hash) throw Error('参考录音已改变，请重新提交实验');
  if (record.body.provider !== 'local') return;
  const state = record.body.engine === 'indextts'?speech.indexStatus(speech.userDirectory):speech.localStatus(speech.userDirectory);
  if (!state.installed || !state.space_ok) throw Error(state.reason || '本地实验模型不可用');
  const snapshot = record.body.runtime_snapshot;
  if (!snapshot || ['model_id','revision','python','model_path','repo_path','device'].some(key=>snapshot[key] !== state.runtime?.[key])) throw Error('本地模型配置已变化，请重新提交实验');
}

module.exports = {status,request,indexStatus,validateStyle,validateRun,INDEX_MODEL};
