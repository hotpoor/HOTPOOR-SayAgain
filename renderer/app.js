const api = window.sayagain;
const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const paths = {
  eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  eyeOff:'m3 3 18 18M10 5c6-1 12 7 12 7s-1 2-3 4M6 6c-3 2-4 6-4 6s4 7 10 7c2 0 4-1 5-2M10 10a3 3 0 0 0 4 4',
  upload:'M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6',
  info:'M12 8h.01M12 11v6M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  messages:'M4 4h16v12H9l-5 4V4Z', wave:'M3 10v4m4-8v12m5-16v20m5-16v12m4-8v4',
  settings:'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3Zm3 6a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  sidebar:'M3 4h18v16H3V4Zm5 0v16', expand:'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',
  search:'m20 20-5-5M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14',
  star:'m12 3 3 6 6 1-4 5 1 6-6-3-6 3 1-6-4-5 6-1 3-6Z',
  archive:'M3 4h18v4H3V4Zm2 4v12h14V8M9 12h6',
  play:'m8 5 11 7-11 7V5Z', pause:'M8 5v14m8-14v14',
  arrow:'M5 12h14m-6-6 6 6-6 6', edit:'m4 16 12-12 4 4L8 20H4v-4ZM14 6l4 4',
  globe:'M3 12h18M12 3c-7 5-7 13 0 18 7-5 7-13 0-18Zm0 0a9 9 0 1 0 0 18 9 9 0 0 0 0-18',
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.messages}"/></svg>`;
function fillIcons() { document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); }); }
const languages = [['zh-CN','中文（简体）'],['en-US','English (US)'],['en-GB','English (UK)'],['ja-JP','日本語'],['ko-KR','한국어'],['fr-FR','Français'],['de-DE','Deutsch'],['es-ES','Español'],['it-IT','Italiano'],['pt-BR','Português'],['ru-RU','Русский'],['ar','العربية']];
const labelLanguage = code => languages.find(item => item[0] === code)?.[1] || code;
const categories = { naturalness: '自然表达', grammar: '语法', word_choice: '用词', register: '语气与场合', translation_practice: '翻译练习' };
const date = timestamp => new Date(timestamp).toLocaleString('zh-CN', {year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
const duration = ms => { const s = Math.floor((ms || 0)/1000); return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; };
let state, page = 'review', search = '', filter = 'active', pair = 'current', dialogMode, editing, toastTimer;
let recording, microphone, recordingTimer, pendingAudio, previewUrl;
let audioGeneration = 0;
let player = null, playerSampleId = null, playerFrame = null, playerCleanup = null;
const editor = $('#editor');
function notify(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4500); }
function errorMessage(error) { return String(error.message || error).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''); }
async function refresh() { state = await api.state(); render(); }
function stopPlayer() {
  playerCleanup?.(); playerCleanup = null;
  cancelAnimationFrame(playerFrame); playerFrame = null;
  if (player) { player.pause(); player.removeAttribute('src'); player.load(); }
  player = null; playerSampleId = null;
}
function render() {
  stopPlayer();
  $('#entry-count').textContent = state.expressions.filter(e => e.body.status === 'active').length;
  $('#language-badge').textContent = `${state.config.body.native_language} → ${state.config.body.target_language}`;
  document.querySelectorAll('[data-page]').forEach(el => { el.classList.toggle('active', el.dataset.page === page); if (el.dataset.page === page) el.setAttribute('aria-current','page'); else el.removeAttribute('aria-current'); });
  $('#breadcrumb').textContent = {review:'表达回顾',voices:'我的音色',settings:'设置'}[page];
  if (!state.config.body.onboarding_complete && page !== 'settings') { renderOnboarding(); return; }
  if (page === 'review') renderReview();
  if (page === 'voices') renderVoices();
  if (page === 'settings') renderSettings();
}
function languageField(name, label, value) {
  return `<label class="field">${label}<input name="${name}" list="language-options" value="${escapeHtml(value)}" required maxlength="50" placeholder="例如 zh-CN、en-US"><small>可输入任意有效的语言代码</small></label>`;
}
function languageOptions() { return `<datalist id="language-options">${languages.map(([value,name]) => `<option value="${value}">${name}</option>`).join('')}</datalist>`; }
function renderOnboarding() {
  $('#main').innerHTML = `<div class="page"><section class="onboarding"><span class="eyebrow">WELCOME TO SAYAGAIN</span><h1>先从你熟悉的语言开始。</h1><p>选择母语与想练习的语言。把你说过的话留在这里，用自己的节奏，练习更自然的表达。</p><form id="language-form"><div class="fields-row">${languageField('native_language','我的母语',state.config.body.native_language)}${languageField('target_language','我想练习',state.config.body.target_language)}</div>${languageOptions()}<p class="form-error" role="alert"></p><button class="button primary" type="submit">创建本地工作空间 ${icon('arrow')}</button></form><p class="quiet-note">表达和录音保存在这台电脑。支持手动记录、Skill 评估接入与音色合成。空间不足时，可在设置中填写 Qwen AK 使用云端。</p></section></div>`;
}
function heading(kicker,title,description,button='') { return `<div class="page-heading"><div><div class="heading-kicker">${kicker}</div><h1>${title}</h1><p>${description}</p></div>${button}</div>`; }
function renderReview() {
  $('#main').innerHTML = `<div class="page">${heading('YOUR WORDS, A LITTLE BETTER','表达回顾','回到说过的话，找到更自然的表达。','<button class="button primary" data-action="add-expression">＋ 记录表达</button>')}<div class="toolbar"><label class="search">${icon('search')}<input id="search" type="search" aria-label="搜索表达" placeholder="搜索原句、建议或解释" value="${escapeHtml(search)}"></label><select class="filter" id="review-filter" aria-label="记录筛选"><option value="active">全部表达</option><option value="favorite">已收藏</option><option value="archived">已归档</option></select><select class="filter" id="pair-filter" aria-label="语言筛选"><option value="current">当前语言对</option><option value="all">所有语言</option></select><span class="count-label" id="results-count"></span></div><div id="entries"></div><p class="quiet-note">手动记录和 Skill 建议都保存在本地。选择音色，即可按设置使用本地或云端合成。</p></div>`;
  $('#review-filter').value = filter; $('#pair-filter').value = pair;
  renderEntries();
}
function renderEntries() {
  stopPlayer();
  const config = state.config.body;
  const entries = state.expressions.filter(({body:b}) => {
    if (filter === 'archived' ? b.status !== 'archived' : b.status !== 'active') return false;
    if (filter === 'favorite' && !b.favorite) return false;
    if (pair === 'current' && (b.language_pair.native_language !== config.native_language || b.language_pair.target_language !== config.target_language)) return false;
    return !search || [b.original,b.improved,b.translation,b.explanation,b.pattern].join(' ').toLocaleLowerCase().includes(search.toLocaleLowerCase());
  });
  $('#results-count').textContent = `${entries.length} 条表达`;
  if (!entries.length) {
    $('#entries').innerHTML = `<section class="empty"><div class="empty-symbol">${icon('messages')}</div><h2>${state.expressions.length ? '这里还没有符合条件的表达' : '让下一次表达，更像你。'}</h2><p>${state.expressions.length ? '换一个关键词或筛选条件，找回想练习的那句话。' : '记下一句想说得更好的话，留下建议和原因。你的个人表达库，从这里开始。'}</p><div class="empty-actions"><button class="button primary" data-action="add-expression">记录第一句</button>${!state.expressions.length && config.native_language.startsWith('zh') && config.target_language.startsWith('en') ? '<button class="button" data-action="example">填入一条示例</button>' : ''}</div></section>`; return;
  }
  $('#entries').innerHTML = entries.map(({block_id:id,body:b,createtime}) => `<article class="entry" data-entry="${id}"><div class="expression-column"><div class="meta"><span class="tag">${categories[b.category] || '表达'}</span><span>${date(createtime)}</span><span>${escapeHtml(b.language_pair.target_language)}</span></div><span class="label">当时的表达</span><p class="original" dir="auto">${escapeHtml(b.original)}</p><span class="label">可以这样说</span><p class="improved" dir="auto">${escapeHtml(b.improved)}</p>${b.translation ? `<p class="translation" dir="auto">${escapeHtml(b.translation)}</p>` : ''}<div class="entry-actions"><button data-action="favorite" data-id="${id}" class="${b.favorite ? 'selected' : ''}" aria-pressed="${!!b.favorite}">${icon('star')}${b.favorite ? '已收藏' : '收藏'}</button><button data-action="archive-expression" data-id="${id}">${icon('archive')}${b.status === 'archived' ? '恢复' : '归档'}</button><span class="tag">${b.source==='skill'?'Skill 评估':'手动记录'}</span></div></div><div class="practice-column"><h3 class="explanation-label">${icon('edit')} 修改原因</h3><p class="explanation" dir="auto">${escapeHtml(b.explanation || '尚未填写修改说明。')}</p>${b.pattern ? `<div class="pattern"><span class="label">可复用句型</span><span dir="auto">${escapeHtml(b.pattern)}</span></div>` : ''}${synthesisMarkup(id)}</div></article>`).join('');
}
function renderVoices() {
  stopPlayer();
  const archived = filter === 'archived';
  const voices = state.voices.filter(v => (v.body.status === 'archived') === archived);
  $('#main').innerHTML = `<div class="page">${heading('SOUNDS LIKE YOU','我的音色','留下不同状态下的声音，也留下那一刻的备注。','<button class="button primary" data-action="add-voice">＋ 新建音色</button>')}<div class="toolbar"><select class="filter" id="voice-filter" aria-label="音色筛选"><option value="active">使用中的音色</option><option value="archived">已归档音色</option></select><span class="count-label">${voices.length} 个音色 · 录音仅保存在本地</span></div>${voices.length ? voices.map(voiceMarkup).join('') : `<section class="empty"><div class="empty-symbol">${icon('wave')}</div><h2>${archived ? '还没有归档音色' : '这一次，听见自己的声音。'}</h2><p>${archived ? '归档会保留参考录音与历史信息，随时可以恢复。' : '创建一个音色，录制或导入参考音频。可以保存多个样本，选出最适合自己的声音。'}</p>${!archived ? '<button class="button primary" data-action="add-voice">创建我的音色</button>' : ''}</section>`}<p class="quiet-note">录音默认保存在本地。表达页可使用这些样本合成语音；云端生成需要你主动启用并确认。</p></div>`;
  $('#voice-filter').value = archived ? 'archived' : 'active';
}
function voiceMarkup({block_id:id, body:b, createtime}) {
  const samples = state.samples.filter(s => s.body.voice_id === id);
  const archived = b.status === 'archived';
  const isDefault = state.config.body.default_voice_ids.includes(id);
  return `<article class="voice" data-voice="${id}"><div class="voice-header"><div class="voice-avatar">${icon('wave')}</div><div class="voice-title"><h3>${escapeHtml(b.name)} ${isDefault ? '<span class="tag">默认音色</span>' : ''}${archived ? '<span class="tag">已归档</span>' : ''}</h3><p>${escapeHtml(b.note || '还没有备注')}</p><div class="voice-meta">创建于 ${date(createtime)} · ${samples.length} 个录音样本${archived ? ` · 归档于 ${date(b.archived_at)}` : ''}</div></div><button class="button quiet" data-action="edit-voice" data-id="${id}">编辑</button></div><div class="voice-actions">${!archived ? `<button class="button" data-action="add-sample" data-id="${id}">＋ 添加录音</button>${samples.length && !isDefault ? `<button class="button quiet" data-action="default-voice" data-id="${id}">设为默认音色</button>` : ''}` : ''}<button class="button quiet" data-action="archive-voice" data-id="${id}">${archived ? '恢复音色' : '归档'}</button></div><div class="samples">${samples.map(sample => sampleMarkup(sample,b)).join('')}</div></article>`;
}
function sampleMarkup({block_id:id,body:b,createtime}, voice) {
  const bars = b.waveform.map((v,i) => `<line x1="${i*5+2}" y1="${22-v*19}" x2="${i*5+2}" y2="${22+v*19}" stroke="#999" stroke-width="2.5" stroke-linecap="round"/>`).join('');
  return `<section class="sample" data-sample="${id}"><div class="sample-header"><span>${escapeHtml(b.language)} · ${b.recorded_at ? '录制' : '导入'} ${date(b.recorded_at || createtime)}</span>${voice.default_sample_id === id ? '<span class="tag">默认样本</span>' : voice.status === 'active' ? `<button class="button quiet" data-action="default-sample" data-id="${id}" data-voice="${b.voice_id}">设为默认</button>` : ''}</div><div class="player"><button class="player-play" aria-label="播放参考录音" data-action="play" data-id="${id}">${icon('play')}</button><div class="waveform"><svg viewBox="0 0 320 44" preserveAspectRatio="none" aria-hidden="true">${bars}<line data-progress x1="0" x2="0" y1="0" y2="44" stroke="#444" stroke-width="1"/></svg><input type="range" min="0" max="1000" value="0" aria-label="录音播放进度" data-seek="${id}"></div><span class="time">0:00 / ${duration(b.duration_ms)}</span><button class="speed" data-action="speed" data-id="${id}" aria-label="切换慢速播放">1×</button></div>${b.transcript ? `<p class="sample-transcript" dir="auto">${escapeHtml(b.transcript)}</p>` : ''}</section>`;
}
function apiKeyRow(key,active=false){return `<div class="api-key-row" data-key-id="${escapeHtml(key.id)}"><div class="key-row-heading"><label class="key-active"><input type="radio" name="active_key_id" value="${escapeHtml(key.id)}" ${active?'checked':''}>用于生成</label><input class="key-name" aria-label="Key 名称" maxlength="120" placeholder="备注名称，例如个人、工作" value="${escapeHtml(key.name)}"><button type="button" class="button quiet" data-action="remove-api-key">删除</button></div><span class="key-input"><input class="key-value" aria-label="API Key" type="text" autocomplete="off" spellcheck="false" placeholder="粘贴一个完整的 API Key" value="${escapeHtml(key.key)}"><button type="button" class="icon-button key-visibility" data-action="toggle-api-key" aria-label="隐藏 API Key" aria-pressed="true" title="隐藏 API Key">${icon('eyeOff')}</button></span></div>`;}
function renderSettings() {
  const speech=state.speech, local=speech.local, gb=n=>(n/1024**3).toFixed(1);
  $('#main').innerHTML = `<div class="page">${heading('MAKE IT YOURS','设置','语言、模型与这台电脑上的个人空间。')}<div class="settings-layout"><section class="settings-section"><h2>语言偏好</h2><p>修改后用于新记录，历史表达保留原来的语言对。</p><form id="language-form"><div class="fields-row">${languageField('native_language','母语 · 解释语言',state.config.body.native_language)}${languageField('target_language','目标语言',state.config.body.target_language)}</div>${languageOptions()}<p class="form-error" role="alert"></p><button class="button primary" type="submit">保存语言设置</button></form></section>
  <section class="settings-section"><h2>Skill 接入</h2><p>允许你自己的 Codex、Claude Code 等客户端保存表达评估。仅连接本机；Skill 自动选择不等于每轮必达。</p><div class="status-row"><span>本地接入</span><span>${state.integration?.body.enabled?'已启用':'已关闭'}</span></div><button class="button" data-action="integration">${state.integration?.body.enabled?'关闭接入':'启用 Skill 接入'}</button>${state.integration?.body.last_ack_at?`<p class="quiet-note">最近评估回执：${date(state.integration.body.last_ack_at)} · ${escapeHtml(state.integration.body.last_decision)}</p>`:''}</section>
  <section class="settings-section" id="local-model"><h2>本地 Qwen3-TTS · 优先推荐</h2><p>录音与合成留在本机。使用 0.6B Base 模型，模型文件约 2.52 GB。</p><div class="model-notice ${local.space_ok?'':'unavailable'}"><strong>${escapeHtml(local.reason)}</strong><p>可用 ${gb(local.available_bytes)} GiB / 需要至少 ${gb(local.required_bytes)} GiB。${local.installed?'包括生成音频所需预留空间。':'首次安装预算包括模型、Python 依赖、下载缓存和剩余空间。'}</p></div>${!local.space_ok?'<button class="button" data-action="cloud-settings">配置千问AI平台云端接入</button>':!local.installed?'<p class="quiet-note">在项目目录运行 <code>npm run tts:install</code> 安装本地模型。安装器会再次检查空间。</p>':'<p class="quiet-note">本地模型已准备好。CPU 为默认后端，生成速度取决于硬件。</p>'}</section>
  <section class="settings-section" id="cloud-settings"><h2>Qwen 云端 · 音色克隆与语音生成</h2><p>空间不足时，可主动选择千问AI平台云端。云端会发送选定参考录音和文本，按平台计费；不会自动切换。</p><form id="speech-form">${speech.api_key_error?`<div class="model-notice" role="alert">${escapeHtml(speech.api_key_error)}</div>`:''}<label class="field">生成方式<select name="mode"><option value="local">本地 Qwen3-TTS（优先）</option><option value="cloud">千问AI平台云端</option></select></label><label class="field">默认云端模型<select name="cloud_model">${cloudModelOptions(speech.cloud_model)}</select><small>用于后续生成，也可在生成窗口单独切换。</small></label><div class="field"><span>Qwen AK / API Keys</span><div id="api-key-list">正在读取已保存的 Key…</div><button type="button" class="button quiet" data-action="add-api-key">＋ 添加 Key</button><small>可分别命名和编辑，选中一个用于生成。Key 明文保存在本机，不写入备份。</small></div><label class="checkbox"><input name="cloud_enabled" type="checkbox" ${speech.config.body.cloud_enabled?'checked':''}>主动启用云端合成</label><p class="quiet-note">使用平台 API Key（AK），此接口不需要填写应用名称。保存设置不会发起付费请求。</p><p class="form-error" role="alert"></p><div class="form-actions"><button class="button primary" type="submit">保存语音设置</button><button class="button" type="button" data-action="cloud-platform">打开 Qwen 平台 ↗</button></div></form></section>
  <section class="settings-section"><h2>本地数据</h2><p>三个 SQLite 数据库与录音文件保存在此处。备份包含数据库与音频，不包含 API Key 或模型权重。</p><code class="path">${escapeHtml(state.directory)}</code><button class="button" data-action="backup">导出完整备份</button></section></div></div>`;
  const keyList=$('#api-key-list'),saveButton=$('#speech-form button[type="submit"]');saveButton.disabled=true;
  api.listApiKeys().then(value=>{if(!keyList.isConnected)return;keyList.innerHTML='';for(const key of value.keys)keyList.insertAdjacentHTML('beforeend',apiKeyRow(key,key.id===value.active_id));if(!value.keys.length)keyList.innerHTML=apiKeyRow({id:crypto.randomUUID(),name:'默认 Key',key:''},true);saveButton.disabled=false;}).catch(error=>{if(keyList.isConnected){keyList.textContent=errorMessage(error);}});
  const cloudSection=$('#cloud-settings');
  $('.settings-layout').prepend(cloudSection);
  if(!local.space_ok){const notice=document.createElement('div');notice.className='model-notice unavailable';notice.textContent='这台电脑空间不足，暂时无法安装本地 Qwen3-TTS。请在这里配置 Qwen 云端。';cloudSection.prepend(notice);}
  document.querySelectorAll('.model-notice').forEach(notice=>{notice.innerHTML=`<span class="notice-icon">${icon('info')}</span><div class="notice-content">${notice.innerHTML}</div>`;});
  $('#speech-form [name="mode"]').value=!local.space_ok&&!speech.has_api_key?'cloud':speech.config.body.mode;
}
function cloudModelOptions(selected) { return (state.speech.cloud_models||[]).map(model=>`<option value="${escapeHtml(model.id)}" ${model.id===selected?'selected':''}>${escapeHtml(model.label)} — ${escapeHtml(model.id)}</option>`).join(''); }
function synthesisMarkup(expressionId) {
  const items=state.syntheses.filter(s=>s.body.expression_id===expressionId);
  const labels={queued:'等待生成',running:'正在生成',failed:'生成失败',cancelled:'已取消',succeeded:'已生成'};
  return `<div class="practice">${icon('wave')}<span>用我的声音听与练</span><button class="button quiet" data-action="synthesize" data-id="${expressionId}">生成语音</button></div>${items.map(item=>{const b=item.body,voice=state.voices.find(v=>v.block_id===b.voice_id);return `<div class="synthesis"><div class="sample-header"><span>${escapeHtml(voice?.body.name||'历史音色')} · ${b.provider==='cloud'?'千问云端':'本地'} · ${labels[b.status]||b.status}</span>${['queued','running'].includes(b.status)?`<button class="button quiet" data-action="cancel-synthesis" data-id="${item.block_id}">取消</button>`:''}</div><div class="synthesis-model">模型 · <span>${escapeHtml(b.model_id||'历史记录未标注')}</span></div>${b.status==='succeeded'?playbackMarkup(item.block_id,b):b.error?`<p class="form-error">${escapeHtml(b.error)}</p>`:''}</div>`;}).join('')}`;
}
function playbackMarkup(id,b) {
 const bars=(b.waveform||[]).map((v,i)=>`<line x1="${i*5+2}" y1="${22-v*19}" x2="${i*5+2}" y2="${22+v*19}" stroke="#999" stroke-width="2.5" stroke-linecap="round"/>`).join('');
 return `<div data-sample="${id}"><div class="player"><button class="player-play" aria-label="播放音频" data-action="play" data-id="${id}">${icon('play')}</button><div class="waveform"><svg viewBox="0 0 320 44" preserveAspectRatio="none" aria-hidden="true">${bars}<line data-progress x1="0" x2="0" y1="0" y2="44" stroke="#444" stroke-width="1"/></svg><input type="range" min="0" max="1000" value="0" aria-label="音频播放进度" data-seek="${id}"></div><span class="time">0:00 / ${duration(b.duration_ms)}</span><button class="speed" data-action="speed" data-id="${id}" aria-label="切换慢速播放">1×</button></div></div>`;
}
function field(name,label,value='',extra='') { return `<label class="field">${label}<textarea name="${name}" ${extra}>${escapeHtml(value)}</textarea></label>`; }
function openDialog(mode, id, example=false) {
  if (!state.config.body.onboarding_complete) { notify('先选择母语和目标语言'); return; }
  cleanupRecording(); dialogMode = mode; editing = id;
  $('#form-error').textContent = ''; $('#save-editor').disabled = false; $('#save-editor').textContent = '保存';
  if (mode === 'expression') {
    $('#dialog-title').textContent = example ? '试着记录一条示例' : '记录一句话';
    $('#editor-fields').innerHTML = `<p class="form-hint">保存你整理好的表达建议；这里不会自动调用模型。当前语言：${escapeHtml(state.config.body.native_language)} → ${escapeHtml(state.config.body.target_language)}</p>${field('original','当时的表达',example ? 'I very like this idea.' : '', 'required maxlength="10000"')}${field('improved','可以这样说',example ? 'I really like this idea.' : '', 'required maxlength="10000"')}${field('translation','母语译文',example ? '我很喜欢这个想法。' : '')}<label class="field">类别<select name="category">${Object.entries(categories).map(([key,value]) => `<option value="${key}">${value}</option>`).join('')}</select></label>${field('explanation','修改原因',example ? 'really 可以修饰动词 like，very 通常修饰形容词或副词。' : '')}${field('pattern','可复用句型',example ? 'I really like + 名词 / 动名词.' : '')}`;
  } else if (mode === 'voice') {
    const voice = state.voices.find(v => v.block_id === id)?.body;
    $('#dialog-title').textContent = voice ? '编辑音色' : '新建音色';
    $('#editor-fields').innerHTML = `<label class="field">音色名称<input name="name" required maxlength="120" placeholder="例如：我的日常声音" value="${escapeHtml(voice?.name || '')}"></label>${field('note','备注',voice?.note || '', 'maxlength="2000"')}<p class="form-hint">先给声音起个名字，再添加录音。可以录制多次并保留各自的创建日期。</p>`;
  } else if (mode === 'synthesis') {
    if((state.speech.config.body.mode==='local'&&(!state.speech.local.space_ok||!state.speech.local.installed))&&!state.speech.has_api_key){page='settings';render();$('#cloud-settings').scrollIntoView({behavior:'smooth'});notify('先配置 Qwen AK 并启用云端，再生成语音');return;}
    const expression=state.expressions.find(e=>e.block_id===id), cloud=state.speech.config.body.mode==='cloud';
    const voices=state.voices.filter(v=>v.body.status==='active'&&v.body.default_sample_id);
    const model=cloud?state.speech.cloud_model:state.speech.local.model_id;
    $('#dialog-title').textContent=cloud?'使用千问AI平台生成':'使用本地 Qwen3-TTS 生成';
    $('#editor-fields').innerHTML=`<p class="synthesis-text" dir="auto">${escapeHtml(expression.body.improved)}</p>${cloud?`<label class="field">本次生成模型<select name="model_id">${cloudModelOptions(model)}</select><small>仅影响本次生成。首次使用该模型会创建对应音色，按平台计费。</small></label>`:`<div class="synthesis-model">本次模型 · <span>${escapeHtml(model)}</span></div>`}<label class="field">我的音色<select name="voice_id" required>${voices.map(v=>`<option value="${v.block_id}">${escapeHtml(v.body.name)}</option>`).join('')}</select></label><p class="form-hint">将使用所选音色的默认样本。${cloud?'需要 10–60 秒参考录音，建议 10–20 秒；按平台计费。':'录音与文字均在本机处理。'}</p>${cloud?'<label class="checkbox"><input type="checkbox" name="cloud_consent" required>同意将所选音色的默认参考录音和上方文字发送到千问AI平台进行克隆与合成。</label>':''}${!voices.length?'<p class="form-error">请先在「我的音色」中创建音色并添加录音。</p>':''}`;
    const defaultVoice=state.config.body.default_voice_ids[0];if(voices.some(v=>v.block_id===defaultVoice))$('#editor [name="voice_id"]').value=defaultVoice;
    $('#save-editor').textContent='开始生成';$('#save-editor').disabled=!voices.length;
  } else if (mode === 'sample') {
    $('#dialog-title').textContent = '添加参考录音';
    $('#editor-fields').innerHTML = `${recorderMarkup(state.config.body.native_language)}${languageField('language','录音所用语言',state.config.body.native_language)}${languageOptions()}${field('transcript','录音原文（可选）','', 'maxlength="10000"')}<p class="form-hint" id="audio-info">支持导入音频，最长 10 分钟、25 MB。</p>`;
    $('#save-editor').disabled = true;
  }
  editor.showModal();
}
function cleanupRecording() {
  resetClip();
  audioGeneration++;
  clearInterval(recordingTimer);
  if (recording) { recording.onstop = null; if (recording.state !== 'inactive') recording.stop(); }
  microphone?.getTracks().forEach(track => track.stop());
  microphone = null; recording = null; pendingAudio = null;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  $('#audio-preview')?.pause();
}
async function prepareAudio(file, source) {
  const generation = ++audioGeneration;
  if (file.size > 25*1024*1024) throw new Error('录音不能超过 25 MB');
  $('#save-editor').disabled = true; pendingAudio = null; clipBuffer=null; $('#clip-editor').hidden=true; $('#audio-preview').pause();
  const bytes = await file.arrayBuffer();
  const context = new AudioContext();
  let decoded;
  try { decoded = await context.decodeAudioData(bytes.slice(0)); } catch { throw new Error('无法解码此录音，请选择 WAV、MP3、M4A、OGG 或 WebM 音频'); } finally { await context.close(); }
  if (!decoded.duration || decoded.duration > 600) throw new Error('录音时长需在 10 分钟以内');
  if (!editor.open || dialogMode !== 'sample' || generation !== audioGeneration) return;
  setupClip(decoded,source);
}

function encodeWav(decoded) {
  const bytes=new Uint8Array(44+decoded.length*2),view=new DataView(bytes.buffer);
  const write=(offset,value)=>{for(let i=0;i<value.length;i++)bytes[offset+i]=value.charCodeAt(i);};
  write(0,'RIFF');view.setUint32(4,bytes.length-8,true);write(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,decoded.sampleRate,true);view.setUint32(28,decoded.sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);write(36,'data');view.setUint32(40,decoded.length*2,true);
  const channels=Array.from({length:decoded.numberOfChannels},(_,i)=>decoded.getChannelData(i));
  for(let i=0;i<decoded.length;i++){const sample=Math.max(-1,Math.min(1,channels.reduce((sum,c)=>sum+c[i],0)/channels.length));view.setInt16(44+i*2,Math.round(sample*(sample<0?32768:32767)),true);}
  return bytes;
}
async function toggleRecording() {
  if (recording?.state === 'recording') { recording.stop(); return; }
  const generation = ++audioGeneration;
  $('.record-studio').classList.remove('has-clip'); pendingAudio = null; clipBuffer=null; $('#audio-preview').pause(); $('#clip-editor').hidden=true; $('#save-editor').disabled = true; $('#record-button').disabled = true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({audio:true,video:false});
    if (!editor.open || generation !== audioGeneration) { stream.getTracks().forEach(t=>t.stop()); return; }
    microphone = stream;
    await startLiveWave(stream);
    if (!editor.open || generation !== audioGeneration) { stopLiveWave(); stream.getTracks().forEach(t=>t.stop()); return; }
    const chunks = []; recording = new MediaRecorder(microphone, {mimeType:'audio/webm;codecs=opus'});
    let size = 0;
    recording.ondataavailable = event => { chunks.push(event.data); size += event.data.size; if (size > 24*1024*1024 && recording?.state === 'recording') recording.stop(); };
    recording.onstop = async () => {
      stopLiveWave(); clearInterval(recordingTimer); microphone?.getTracks().forEach(t=>t.stop()); microphone = null;
      $('#record-button').textContent = '重新录音'; $('#record-status').textContent = '录音已停止'; $('#record-status').classList.remove('recording'); $('#audio-file').disabled = false; $('#import-button').disabled=false;
      try { await prepareAudio(new Blob(chunks,{type:'audio/webm'}),'microphone'); } catch (e) { $('#form-error').textContent = errorMessage(e); }
    };
    recording.start(1000); const started = Date.now();
    $('#record-button').textContent = '停止录音'; $('#record-status').classList.add('recording'); $('#audio-file').disabled = true; $('#import-button').disabled=true;
    recordingTimer = setInterval(() => { const elapsed=Date.now()-started; $('#record-status').textContent='正在聆听…'; $('#live-time').textContent=duration(elapsed); if(elapsed>=590000 && recording?.state==='recording') recording.stop(); },250);
  } catch(error) { stopLiveWave();microphone?.getTracks().forEach(t=>t.stop());microphone=null;throw error; } finally { if ($('#record-button')) $('#record-button').disabled = false; }
}
async function playSample(id) {
  const sample = [...state.samples,...state.syntheses].find(s=>s.block_id === id);
  if (playerSampleId !== id) {
    stopPlayer();
    document.querySelectorAll('.player-play').forEach(button=>{button.innerHTML=icon('play');button.setAttribute('aria-label','播放参考录音');});
    document.querySelectorAll('.speed').forEach(button=>button.textContent='1×');
    player = new Audio(`sayagain-asset://audio/${sample.body.asset_id}`); playerSampleId = id;
    const node = document.querySelector(`[data-sample="${id}"]`);
    const audio = player;
    const paint = () => {
      if (player !== audio || !node.isConnected) return;
      const fraction = Number.isFinite(audio.duration) && audio.duration > 0 ? Math.min(1,Math.max(0,audio.currentTime/audio.duration)) : 0;
      node.querySelector('[data-seek]').value = fraction*1000;
      const progress = fraction*320;
      node.querySelector('[data-progress]').setAttribute('x1',progress);
      node.querySelector('[data-progress]').setAttribute('x2',progress);
      node.querySelector('.time').textContent = `${duration(audio.currentTime*1000)} / ${duration(sample.body.duration_ms)}`;
    };
    const stopFrame = () => { cancelAnimationFrame(playerFrame); playerFrame = null; };
    const frame = () => {
      playerFrame = null;
      if (player !== audio || !node.isConnected || audio.paused || audio.ended) return;
      paint(); playerFrame = requestAnimationFrame(frame);
    };
    const update = () => {
      if (player !== audio || !node.isConnected) return;
      node.querySelector('.player-play').innerHTML=icon(audio.paused?'play':'pause');
      node.querySelector('.player-play').setAttribute('aria-label',audio.paused?'播放参考录音':'暂停参考录音');
      stopFrame(); paint();
      if (!audio.paused && !audio.ended) playerFrame = requestAnimationFrame(frame);
    };
    const failed = () => { stopFrame(); notify('录音文件无法播放，可能已被移动或损坏'); };
    const listeners = {play:update,pause:update,ended:update,seeked:paint,loadedmetadata:paint,error:failed};
    for(const [event,handler] of Object.entries(listeners)) audio.addEventListener(event,handler);
    playerCleanup = () => { stopFrame(); for(const [event,handler] of Object.entries(listeners)) audio.removeEventListener(event,handler); };

  }
  if(player.paused) await player.play(); else player.pause();
}
document.addEventListener('click', async event => {
  const button = event.target.closest('button'); if (!button) return;
  try {
    if (button.dataset.page) { page=button.dataset.page;filter='active';render();window.scrollTo(0,0);$('#main').scrollTop=0;return; }
    const id = button.dataset.id;
    switch(button.dataset.action) {
      case 'sidebar': {
        if(innerWidth<=760) document.body.classList.toggle('mobile-open'); else document.body.classList.toggle('collapsed');
        const closed = innerWidth<=760 ? !document.body.classList.contains('mobile-open') : document.body.classList.contains('collapsed');
        button.setAttribute('aria-label',closed?'展开侧栏':'收起侧栏'); button.title=button.getAttribute('aria-label'); break;
      }
      case 'integration': await api.setIntegration({enabled:!state.integration?.body.enabled});await refresh();break;
      case 'cloud-settings': page='settings';render();$('#cloud-settings').scrollIntoView({behavior:'smooth'});$('#cloud-settings').scrollIntoView({behavior:'smooth'});break;
      case 'cloud-platform': await api.cloudPlatform();break;
      case 'add-api-key': {const list=$('#api-key-list');list.insertAdjacentHTML('beforeend',apiKeyRow({id:crypto.randomUUID(),name:'',key:''},!list.querySelector('.api-key-row')));list.lastElementChild.querySelector('.key-name').focus();break;}
      case 'remove-api-key': {const row=button.closest('.api-key-row'),active=row.querySelector('[name="active_key_id"]').checked;row.remove();if(active){const next=$('#api-key-list [name="active_key_id"]');if(next)next.checked=true;}break;}
      case 'toggle-api-key': {
        const input=button.closest('.key-input').querySelector('input'),show=input.type==='password';input.type=show?'text':'password';button.innerHTML=icon(show?'eyeOff':'eye');button.setAttribute('aria-label',show?'隐藏 API Key':'显示 API Key');button.title=button.getAttribute('aria-label');button.setAttribute('aria-pressed',String(show));break;
      }
      case 'clear-api-key': await api.clearApiKey();await refresh();notify('密钥已移除，云端已关闭');break;
      case 'synthesize': openDialog('synthesis',id);break;
      case 'cancel-synthesis': await api.cancelSynthesis({id});await refresh();break;
      case 'fullscreen': await api.fullscreen(); break;
      case 'add-expression': openDialog('expression'); break;
      case 'example': openDialog('expression',null,true); break;
      case 'add-voice': openDialog('voice'); break;
      case 'edit-voice': openDialog('voice',id); break;
      case 'add-sample': openDialog('sample',id); break;
      case 'close-dialog': editor.close(); break;
      case 'import-audio': $('#audio-file').click();break;
      case 'use-reading': $('#editor [name="transcript"]').value=readingPrompts[state.config.body.native_language.split('-')[0]]||'';$('#editor [name="language"]').value=state.config.body.native_language;notify('已填入朗读原文，请按文案录制');break;
      case 'reset-trim': if(clipBuffer){trimStart=0;trimEnd=clipBuffer.duration;updateTrim();}break;
      case 'preview-clip': {const audio=$('#audio-preview');if(audio.paused){if(audio.currentTime<trimStart||audio.currentTime>=trimEnd)audio.currentTime=trimStart;await audio.play();}else audio.pause();break;}
      case 'record': await toggleRecording(); break;
      case 'favorite': case 'archive-expression': {
        const record=state.expressions.find(e=>e.block_id===id);
        await api.editExpression({id,revision:record.body.revision,action:button.dataset.action==='favorite'?'favorite':'archive'}); await refresh(); break;
      }
      case 'archive-voice': {
        const voice=state.voices.find(e=>e.block_id===id);await api.archiveVoice({id,revision:voice.body.revision}); await refresh();notify(voice.body.status==='archived'?'音色已恢复':'音色已归档，参考录音已保留');break;
      }
      case 'default-voice': await api.defaultVoice({id});await refresh();notify('默认音色已更新');break;
      case 'default-sample': await api.defaultSample({id,voice_id:button.dataset.voice});await refresh();break;
      case 'play': await playSample(id);break;
      case 'speed': if(playerSampleId!==id) await playSample(id);player.playbackRate=player.playbackRate===1?0.75:1;button.textContent=player.playbackRate+'×';break;
      case 'backup': { const location=await api.backup();if(location)notify(`备份已保存：${location}`);break; }
    }
  } catch(error) { if(editor.open) $('#form-error').textContent=errorMessage(error);else notify(errorMessage(error)); }
});
document.addEventListener('input',async event=>{
  if(['trim-start','trim-end'].includes(event.target.id))updateTrim(event.target.id);
  if(event.target.id==='search'){search=event.target.value;renderEntries();}
  if(event.target.dataset.seek) {
    const id = event.target.dataset.seek, fraction = Number(event.target.value)/1000;
    try { if(playerSampleId!==id) await playSample(id); if(playerSampleId===id && Number.isFinite(player?.duration)) player.currentTime=fraction*player.duration; } catch(error) { notify(errorMessage(error)); }
  }
});
document.addEventListener('change', async event=>{
  if(event.target.id==='review-filter'){filter=event.target.value;renderEntries();}
  if(event.target.id==='pair-filter'){pair=event.target.value;renderEntries();}
  if(event.target.id==='voice-filter'){filter=event.target.value;renderVoices();}
  if(event.target.id==='audio-file' && event.target.files[0]) try{await prepareAudio(event.target.files[0],'import');}catch(error){$('#form-error').textContent=errorMessage(error);}
});
document.addEventListener('submit',async event=>{
  event.preventDefault(); const form=event.target; const submit=form.querySelector('[type="submit"]');submit.disabled=true;
  try {
    const values=Object.fromEntries(new FormData(form));
    if(form.id==='language-form') { await api.saveSettings({...values,revision:state.config.body.revision}); await refresh();notify('语言设置已保存'); }
    if(form.id==='speech-form'){const keys=Array.from(form.querySelectorAll('.api-key-row')).map(row=>({id:row.dataset.keyId,name:row.querySelector('.key-name').value,key:row.querySelector('.key-value').value}));await api.speechSettings({...values,keys,cloud_enabled:values.cloud_enabled==='on'});form.reset();await refresh();notify('语音设置已保存');}
    if(form.id==='editor-form') {
      if(dialogMode==='synthesis')await api.synthesize({expression_id:editing,voice_id:values.voice_id,model_id:values.model_id,cloud_consent:values.cloud_consent==='on'});
      if(dialogMode==='expression') await api.addExpression(values);
      if(dialogMode==='voice') await api.saveVoice({...values,id:editing,revision:state.voices.find(v=>v.block_id===editing)?.body.revision});
      if(dialogMode==='sample') { buildClip();if(!pendingAudio) throw new Error('请先录制或导入音频');await api.addSample({...values,...pendingAudio,voice_id:editing}); }
      editor.close(); await refresh();notify('已保存到本地');
    }
  }catch(error){form.querySelector('.form-error').textContent=errorMessage(error);}finally{submit.disabled=false;}
});
editor.addEventListener('close',cleanupRecording);
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!editor.open)api.fullscreen(true).catch(()=>{});});
api.onFullscreen(full=>{const button=$('#fullscreen');button.setAttribute('aria-label',full?'退出全屏':'进入全屏');button.title=button.getAttribute('aria-label');});
api.onChange(async()=>{try{state=await api.state();if(!editor.open&&(!player||player.paused)&&!document.activeElement?.closest('form'))render();}catch(error){notify(errorMessage(error));}});
fillIcons();
refresh().catch(error=>{$('#main').innerHTML=`<div class="page"><h1>无法打开本地数据</h1><p class="form-error">${escapeHtml(errorMessage(error))}</p></div>`;});
