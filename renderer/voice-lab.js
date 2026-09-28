// A separate draft and player keep experiment updates from disturbing the editor.
window.voiceLabPage = (() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const draftKey = 'sayagain-voice-lab-draft-v1';
  const dimensions = [ ['happy','开心'], ['angry','生气'], ['sad','难过'], ['afraid','害怕'], ['disgusted','厌恶'], ['melancholic','低落'], ['surprised','惊讶'], ['calm','平静'] ];
  const languageOptions = [['zh-CN','中文'],['en-US','英语'],['ja-JP','日语'],['ko-KR','韩语'],['fr-FR','法语'],['de-DE','德语'],['es-ES','西班牙语'],['it-IT','意大利语'],['pt-BR','葡萄牙语'],['ru-RU','俄语'],['ar','阿拉伯语']];
  const clock = seconds => { const n = Math.max(0, Math.floor(seconds || 0)); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2,'0')}`; };
  let draft = { voice_id:'', sample_id:'', model_id:'', language:'zh-CN', text:'', styles:{} };
  try { const saved = JSON.parse(sessionStorage.getItem(draftKey)); if (saved && typeof saved === 'object') draft = {...draft,...saved,styles:saved.styles || {}}; } catch {}
  let maxTextLength = 600;
  let root, snapshot, models = [], statusError = '', loading = false, submitting = false, audio = null, playingId = '', loadingAudioId = '', historySignature = '', statusRequest = 0;
  const q = selector => root?.querySelector(selector);
  const model = () => models.find(item => item.id === draft.model_id);
  const style = () => draft.styles[draft.model_id] ||= {instruction:'',emotion:'',emotion_vector:Array(8).fill(0),emotion_intensity:0.6};
  const activeVoices = () => (snapshot?.voices || []).filter(item => item.body.status !== 'archived');
  const samples = () => (snapshot?.samples || []).filter(item => item.body.voice_id === draft.voice_id && item.body.status !== 'archived');
  function saveDraft() { try { sessionStorage.setItem(draftKey,JSON.stringify(draft)); } catch {} window.unsaved?.clear(q('form')); }
  function message(text, error = false) { const el = q('[data-lab-message]'); if (el) { el.textContent = text; el.classList.toggle('form-error',error); } }
  function normalizeSelection() {
    if (!activeVoices().some(item => item.block_id === draft.voice_id)) draft.voice_id = activeVoices()[0]?.block_id || '';
    if (!samples().some(item => item.block_id === draft.sample_id)) draft.sample_id = samples().find(item => item.block_id === activeVoices().find(v => v.block_id === draft.voice_id)?.body.default_sample_id)?.block_id || samples()[0]?.block_id || '';
    if (!models.some(item => item.id === draft.model_id)) draft.model_id = models.find(item => item.available)?.id || models[0]?.id || '';
  }
  function languageLabel(value) { const names = {Chinese:'中文',English:'英语',Japanese:'日语',Korean:'韩语',French:'法语',German:'德语',Spanish:'西班牙语',Italian:'意大利语',Portuguese:'葡萄牙语',Russian:'俄语',Arabic:'阿拉伯语'}; return names[value] || languageOptions.find(([key]) => key === value || key.split('-')[0] === value)?.[1] || value || '自动'; }
  function sampleName(item) { return item.body.name || item.body.transcript?.trim().slice(0,48) || `参考录音 · ${new Date(item.body.recorded_at || item.createtime).toLocaleDateString('zh-CN')}`; }
  function fillReferences() {
    const voice = q('[name=voice_id]'), sample = q('[name=sample_id]'); if (!voice || !sample) return;
    const before = draft.sample_id; normalizeSelection();
    voice.innerHTML = activeVoices().map(item => `<option value="${esc(item.block_id)}">${esc(item.body.name)}</option>`).join('') || '<option value="">请先创建音色</option>';
    voice.value = draft.voice_id;
    sample.innerHTML = samples().map(item => `<option value="${esc(item.block_id)}">${esc(sampleName(item))}</option>`).join('') || '<option value="">这个音色还没有参考录音</option>';
    sample.value = draft.sample_id;
    const selected = samples().find(item => item.block_id === draft.sample_id);
    q('[data-lab-reference-note]').textContent = selected?.body.transcript ? `录音原文：${selected.body.transcript}` : '选择原文准确、背景安静的参考录音，方便比较声音。';
    q('[data-lab-preview]').disabled = !selected;
    if (before !== draft.sample_id) clearConsent();
    saveDraft(); updateSubmit();
  }
  function clearConsent() { const consent = q('[name=cloud_consent]'); if (consent) consent.checked = false; }
  function paintModel() {
    const select = q('[name=model_id]'); if (!select) return;
    normalizeSelection();
    select.innerHTML = models.map(item => `<option value="${esc(item.id)}">${esc(item.label)}${item.available ? '' : ' · 暂不可用'}</option>`).join('') || '<option value="">暂无可用模型</option>';
    select.value = draft.model_id;
    const selected = model(), controls = q('[data-lab-controls]'), current = style();
    q('[data-lab-model-note]').textContent = selected?.note || '';
    const supported = languageOptions.filter(([value]) => !selected?.languages || selected.languages.includes(value.split('-')[0]));
    if (!supported.some(([value]) => value === draft.language)) draft.language = supported[0]?.[0] || 'zh-CN';
    q('[name=language]').innerHTML = supported.map(([value,label]) => `<option value="${value}">${label}</option>`).join('');
    q('[name=language]').value = draft.language;
    q('[data-lab-model-status]').textContent = loading ? '正在检查模型…' : statusError || (selected ? `${selected.provider === 'cloud' ? '云端' : '本地'} · ${selected.available ? '可生成' : selected.reason || '暂不可用'}` : '尚未配置生成模型');
    q('[data-lab-model-status]').classList.toggle('unavailable',!selected?.available || !!statusError);
    const tags = selected?.tags || [];
    const tagMarkup = tags.map(tag => `<button type="button" class="voice-lab-tag" data-lab-tag="${esc(tag.value)}">${esc(tag.label)}</button>`).join('');
    if (selected?.control === 'instruction') {
      controls.innerHTML = `<label class="field">说话方式<textarea name="instruction" rows="3" maxlength="1000" placeholder="例如：温柔地安慰对方，语速稍慢，情绪自然克制。">${esc(current.instruction)}</textarea><small>可以留空，先听模型的自然表达。</small></label><div class="voice-lab-tags" aria-label="常用说话方式">${tagMarkup}</div>`;
    } else if (selected?.control === 'emotion-vector') {
      const dims = selected.emotion_dimensions?.length === 8 ? selected.emotion_dimensions : dimensions.map(([value,label]) => ({value,label}));
      controls.innerHTML = `<div class="voice-lab-control-heading"><h3>情绪配比</h3><button type="button" class="button quiet" data-lab-reset-style>恢复自然表达</button></div><p class="form-hint">情绪配比总和不超过100%；强度为0时保留参考录音的状态。</p><div class="voice-lab-tags" aria-label="常用情绪">${tagMarkup || dims.map(tag => `<button type="button" class="voice-lab-tag" data-lab-tag="${esc(tag.value)}">${esc(tag.label)}</button>`).join('')}</div><div class="voice-lab-emotion-total" data-lab-emotion-total role="status"></div><div class="voice-lab-emotions">${dims.map((dim,i) => `<label><span>${esc(dim.label)}</span><input type="range" min="0" max="1" step="0.05" name="emotion_${i}" data-lab-dimension="${i}" value="${Number(current.emotion_vector?.[i]) || 0}" aria-label="${esc(dim.label)}份量"><output>${Math.round((Number(current.emotion_vector?.[i]) || 0)*100)}%</output></label>`).join('')}</div><label class="voice-lab-intensity"><span>整体情绪强度</span><input type="range" min="0" max="1" step="0.05" name="emotion_intensity" value="${current.emotion_intensity ?? 0.6}" aria-label="整体情绪强度"><output>${Math.round((current.emotion_intensity ?? 0.6)*100)}%</output></label>`;
    } else if (selected?.control === 'emotion-enum') {
      controls.innerHTML = `<label class="field">情绪<select name="emotion"><option value="">自然表达</option>${tags.map(tag => `<option value="${esc(tag.value)}">${esc(tag.label)}</option>`).join('')}</select></label><div class="voice-lab-tags" aria-label="常用情绪">${tagMarkup}</div>`;
      controls.querySelector('select').value = current.emotion;
    } else {
      controls.innerHTML = '<p class="voice-lab-natural">使用参考录音的音色与说话状态。这个模型不支持单独编辑情绪；可以换一段参考录音比较。</p>';
    }
    const cloud = selected?.provider === 'cloud'; q('[data-lab-cloud]').hidden = !cloud; clearConsent();
    q('[data-lab-cloud-copy]').textContent = `允许本次把所选参考录音和文字发送到${selected?.label || '云端服务'}生成，可能产生费用`;
    saveDraft(); paintTags(); updateSubmit();
  }
  function paintTags() {
    const selected = model(), current = style();
    q('[data-lab-controls]')?.querySelectorAll('[data-lab-tag]').forEach(button => {
      const value = button.dataset.labTag, index = dimensions.findIndex(([key]) => key === value);
      const checked = selected?.control === 'emotion-enum' ? current.emotion === value : selected?.control === 'emotion-vector' ? Number(current.emotion_vector?.[index]) > 0 : current.instruction === value;
      button.setAttribute('aria-pressed',String(checked));
    });
  }
  function updateSubmit() {
    const button = q('[data-lab-generate]'); if (!button) return;
    const selected = model(), cloudReady = selected?.provider !== 'cloud' || q('[name=cloud_consent]')?.checked;
    const total = selected?.control === 'emotion-vector' ? style().emotion_vector.reduce((sum,value) => sum + Number(value || 0),0) : 0;
    const overEmotionLimit = total > 1 + 1e-6;
    const totalLabel = q('[data-lab-emotion-total]');
    if (totalLabel) { totalLabel.textContent = overEmotionLimit ? `总配比 ${Math.round(total*100)}% · 情绪配比总和不能超过100%，请降低部分情绪` : `总配比 ${Math.round(total*100)}% / 100%`; totalLabel.classList.toggle('form-error',overEmotionLimit); }
    button.disabled = submitting || loading || overEmotionLimit || !!statusError || !selected?.available || !draft.voice_id || !draft.sample_id || !draft.text.trim() || Array.from(draft.text).length > maxTextLength || !cloudReady;
    button.textContent = submitting ? '正在加入队列…' : '生成试听';
    q('[data-lab-count]').textContent = `${Array.from(draft.text).length} / ${maxTextLength}`;
  }
  async function checkModels() {
    const request = ++statusRequest; loading = true; statusError = ''; updateSubmit();
    if (q('[data-lab-model-status]')) q('[data-lab-model-status]').textContent = '正在检查模型…';
    try {
      if (typeof window.sayagain.voiceLabStatus !== 'function') throw Error('请重新打开应用，载入音色实验功能。');
      const result = await window.sayagain.voiceLabStatus(); if (request !== statusRequest) return;
      models = result.models || []; maxTextLength = Number(result.max_text_length) || 600; normalizeSelection();
    } catch (error) { if (request === statusRequest) statusError = String(error.message || error); }
    finally { if (request === statusRequest) { loading = false; paintModel(); } }
  }
  function historyItems() { return (snapshot?.syntheses || []).filter(item => item.body.purpose === 'voice_lab').sort((a,b) => Number(b.body.queued_at || b.createtime) - Number(a.body.queued_at || a.createtime) || String(b.block_id).localeCompare(String(a.block_id))); }
  function styleLabel(body) {
    if (body.instruction) return body.instruction;
    if (body.emotion) return models.find(m => m.id === body.model_id)?.tags?.find(tag => tag.value === body.emotion)?.label || body.emotion;
    if (body.emotion_vector?.some(value => value > 0)) return body.emotion_vector.map((value,i) => value > 0 ? `${dimensions[i]?.[1] || ''} ${Math.round(value*100)}%` : '').filter(Boolean).join('、') + (body.emotion_intensity != null ? ` · 强度 ${Math.round(body.emotion_intensity*100)}%` : '');
    return '自然表达';
  }
  function paintHistory() {
    const host = q('[data-lab-history]'); if (!host) return;
    const items = historyItems(), signature = JSON.stringify(items); q('[data-lab-history-count]').textContent = `${items.length} 次试听`;
    if (signature === historySignature && host.children.length) { paintPlayback(); return; } historySignature = signature;
    const activeId = document.activeElement?.closest('[data-lab-result]')?.dataset.labResult;
    const activeAction = document.activeElement?.dataset.labAction;
    const labels = {queued:'等待生成',running:'正在生成',failed:'生成失败',cancelled:'已取消',succeeded:'已生成'};
    host.innerHTML = items.map(item => { const b = item.body, busy = ['queued','running'].includes(b.status), complete = b.status === 'succeeded' && b.asset_id;
      const voice = b.voice_name_snapshot || snapshot.voices?.find(v => v.block_id === b.voice_id)?.body.name || '历史音色';
      return `<article class="voice-lab-result" data-lab-result="${esc(item.block_id)}"><header><span class="tag voice-lab-status" data-status="${esc(b.status)}">${esc(labels[b.status] || b.status)}</span><time datetime="${new Date(b.queued_at || item.createtime).toISOString()}">${esc(new Date(b.queued_at || item.createtime).toLocaleString('zh-CN'))}</time></header><p class="voice-lab-result-text" dir="auto">${esc(b.text_snapshot)}</p><dl><div><dt>音色</dt><dd>${esc(voice)}</dd></div><div><dt>模型</dt><dd>${esc(b.model_label_snapshot || models.find(m => m.id === b.model_id)?.label || b.model_id)}</dd></div><div><dt>参考</dt><dd>${esc(b.sample_name_snapshot || '录音样本')}</dd></div><div><dt>语言</dt><dd>${esc(languageLabel(b.language))}</dd></div><div class="voice-lab-style"><dt>说话方式</dt><dd dir="auto">${esc(styleLabel(b))}</dd></div></dl>${complete ? `<div class="voice-lab-player"><button type="button" class="player-play" data-lab-action="play" aria-label="播放试听">▶</button><input type="range" min="0" max="1000" value="0" step="any" data-lab-seek aria-label="试听播放进度"><span data-lab-time>0:00 / ${clock(b.duration_ms/1000)}</span><button type="button" class="button quiet" data-lab-action="export">导出音频</button></div>` : busy ? `<div class="voice-lab-pending"><span>${b.status === 'running' ? '正在准备你的声音…' : '已加入生成队列'}</span><button type="button" class="button quiet" data-lab-action="cancel">取消生成</button></div>` : ''}${b.error ? `<p class="form-error" role="status">${esc(b.error)}</p>` : ''}</article>`;
    }).join('') || '<div class="voice-lab-empty"><h3>第一段试听，从一句话开始。</h3><p>试试相同的一句话，听听不同模型和说话方式的区别。</p></div>';
    if (activeId && activeAction) [...host.querySelectorAll('[data-lab-result]')].find(el => el.dataset.labResult === activeId)?.querySelector(`[data-lab-action="${activeAction}"]`)?.focus();
    paintPlayback();
  }
  function paintPlayback() {
    q('[data-lab-history]')?.querySelectorAll('[data-lab-result]').forEach(row => {
      const item = historyItems().find(item => item.block_id === row.dataset.labResult), button = row.querySelector('[data-lab-action=play]'); if (!button) return;
      const current = playingId === row.dataset.labResult && audio, seconds = current ? audio.currentTime : 0;
      button.textContent = current && !audio.paused ? 'Ⅱ' : '▶'; button.setAttribute('aria-label',current && !audio.paused ? '暂停试听' : '播放试听');
      row.querySelector('[data-lab-time]').textContent = `${clock(seconds)} / ${clock(current && Number.isFinite(audio.duration) ? audio.duration : item.body.duration_ms/1000)}`;
      const total = current && Number.isFinite(audio.duration) ? audio.duration : item.body.duration_ms/1000;
      row.querySelector('[data-lab-seek]').value = total ? seconds / total * 1000 : 0;
    });
    const preview = q('[data-lab-preview]'); if (preview) preview.textContent = playingId === `sample:${draft.sample_id}` && audio && !audio.paused ? '暂停参考录音' : '听参考录音';
  }
  function stopAudio() { loadingAudioId = ''; if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); } audio = null; playingId = ''; paintPlayback(); }
  async function play(id, assetId) {
    if (!assetId) return;
    if (playingId !== id) {
      stopAudio(); playingId = id; audio = new Audio(`sayagain-asset://audio/${assetId}`);
      try { const volume = JSON.parse(localStorage.getItem('sayagain-playback-volume')); if (volume) { audio.volume = Math.min(1,Math.max(0,Number(volume.volume) || 0)); audio.muted = !!volume.muted; } } catch {}
      for (const event of ['timeupdate','play','pause','ended','loadedmetadata','seeked']) audio.addEventListener(event,paintPlayback);
      audio.addEventListener('error',() => message('录音无法播放，请检查文件是否完整。',true));
    }
    if (audio.paused) { loadingAudioId = id; await audio.play(); if (loadingAudioId === id) loadingAudioId = ''; } else audio.pause();
    paintPlayback();
  }
  async function submit(event) {
    event.preventDefault(); event.stopPropagation();
    if (q('[data-lab-generate]').disabled) return;
    const selected = model(), current = style();
    const input = {voice_id:draft.voice_id,sample_id:draft.sample_id,model_id:draft.model_id,text:draft.text.trim(),language:draft.language,cloud_consent:selected.provider === 'cloud' && q('[name=cloud_consent]').checked};
    if (selected.control === 'instruction' && current.instruction.trim()) input.instruction = current.instruction.trim();
    if (selected.control === 'emotion-enum' && current.emotion) input.emotion = current.emotion;
    if (selected.control === 'emotion-vector' && current.emotion_vector.some(value => value > 0)) { input.emotion_vector = [...current.emotion_vector]; input.emotion_intensity = current.emotion_intensity; }
    submitting = true; updateSubmit(); message('');
    try { await window.sayagain.synthesizeVoiceLab(input); clearConsent(); message('已加入生成队列，结果会出现在下方。'); snapshot = await window.sayagain.state(); paintHistory(); }
    catch (error) { message(String(error.message || error).replace(/^Error invoking remote method '[^']+': (Error: )?/,''),true); }
    finally { submitting = false; saveDraft(); updateSubmit(); }
  }
  function inputChanged(event) {
    const el = event.target, current = style();
    if (!el.matches('input,textarea,select') || !el.closest('#voice-lab-form')) return;
    if (el.name !== 'cloud_consent') clearConsent();
    if (['voice_id','sample_id','model_id','language','text'].includes(el.name)) draft[el.name] = el.value;
    else if (el.name === 'instruction' || el.name === 'emotion') current[el.name] = el.value;
    else if (el.dataset.labDimension != null) { current.emotion_vector[Number(el.dataset.labDimension)] = Number(el.value); el.nextElementSibling.textContent = `${Math.round(Number(el.value)*100)}%`; }
    else if (el.name === 'emotion_intensity') { current.emotion_intensity = Number(el.value); el.nextElementSibling.textContent = `${Math.round(Number(el.value)*100)}%`; }
    if (event.type === 'change' && el.name === 'voice_id') { draft.sample_id = ''; fillReferences(); }
    if (event.type === 'change' && el.name === 'sample_id') fillReferences();
    if (event.type === 'change' && el.name === 'model_id') paintModel();
    saveDraft(); paintTags(); updateSubmit();
  }
  async function clicked(event) {
    const button = event.target.closest('button'); if (!button) return;
    try {
      if (button.hasAttribute('data-lab-refresh')) { await checkModels(); return; }
      if (button.hasAttribute('data-lab-preview')) { const sample = samples().find(item => item.block_id === draft.sample_id); await play(`sample:${draft.sample_id}`,sample?.body.asset_id); return; }
      if (button.hasAttribute('data-lab-reset-style')) { style().emotion_vector = Array(8).fill(0); style().emotion_intensity = 0.6; paintModel(); return; }
      if (button.dataset.labTag != null) {
        const selected = model(), current = style(), value = button.dataset.labTag;
        if (selected.control === 'instruction') { current.instruction = value; q('[name=instruction]').value = value; }
        if (selected.control === 'emotion-enum') { current.emotion = value; q('[name=emotion]').value = value; }
        if (selected.control === 'emotion-vector') { const index = dimensions.findIndex(([key]) => key === value); if (index >= 0) { current.emotion_vector = Array(8).fill(0); current.emotion_vector[index] = 1; paintModel(); } }
        clearConsent(); saveDraft(); paintTags(); updateSubmit(); return;
      }
      const row = button.closest('[data-lab-result]'); if (!row) return;
      const item = historyItems().find(item => item.block_id === row.dataset.labResult); if (!item) return;
      if (button.dataset.labAction === 'play') await play(item.block_id,item.body.asset_id);
      if (button.dataset.labAction === 'cancel') { button.disabled = true; await window.sayagain.cancelSynthesis({id:item.block_id}); snapshot = await window.sayagain.state(); paintHistory(); }
      if (button.dataset.labAction === 'export') { button.disabled = true; const result = await window.sayagain.exportItems({kind:'audio',ids:[item.block_id],format:'audio'}); if (result) message('试听音频已导出。'); }
    } catch (error) { message(String(error.message || error),true); } finally { if (button.isConnected && button.type !== 'submit') button.disabled = false; }
  }
  function render(container, value, voiceId) {
    snapshot = value;
    if (root?.isConnected && root.parentElement === container) { update(value); return; }
    if (voiceId) { draft.voice_id = voiceId; draft.sample_id = ''; }
    normalizeSelection(); historySignature = '';
    container.innerHTML = `<div class="page voice-lab-page"><button type="button" class="button quiet voice-lab-back" data-page="voices">← 我的音色</button><div class="page-heading"><div><div class="heading-kicker">FIND YOUR EXPRESSION</div><h1>音色实验</h1><p>写一句话，听听你的声音还能怎样表达。</p></div><span class="tag">自由试听</span></div><form class="voice-lab-form" id="voice-lab-form"><section class="voice-lab-section"><div class="voice-lab-section-title"><h2>用谁的声音</h2><button type="button" class="button quiet" data-lab-preview>听参考录音</button></div><div class="fields-row"><label class="field">音色<select name="voice_id" required></select></label><label class="field">参考录音<select name="sample_id" required></select></label></div><p class="voice-lab-reference" data-lab-reference-note></p></section><section class="voice-lab-section"><div class="voice-lab-section-title"><h2>怎么说</h2><button type="button" class="button quiet" data-lab-refresh>检查模型</button></div><div class="fields-row"><label class="field">生成模型<select name="model_id" required></select><small data-lab-model-status role="status"></small><small data-lab-model-note></small></label><label class="field">语言<select name="language">${languageOptions.map(([value,label]) => `<option value="${value}">${label}</option>`).join('')}</select></label></div><div data-lab-controls></div></section><section class="voice-lab-section voice-lab-text-section"><label class="field">想说的话<textarea name="text" rows="5" required placeholder="输入任意一句话，用不同的声音和语气试听。" dir="auto">${esc(draft.text)}</textarea></label><div class="voice-lab-text-footer"><span>草稿自动保留在当前窗口</span><span data-lab-count></span></div></section><div class="voice-lab-submit"><label class="checkbox voice-lab-consent" data-lab-cloud hidden><input type="checkbox" name="cloud_consent"><span data-lab-cloud-copy></span></label><div class="voice-lab-submit-row"><p>试听独立保存，不会添加到表达库。</p><button type="submit" class="button primary" data-lab-generate disabled>生成试听</button></div><p data-lab-message role="status" class="voice-lab-message"></p></div></form><section class="voice-lab-history-section" aria-label="试听记录"><div class="voice-lab-section-title"><h2>试听记录</h2><span class="count-label" data-lab-history-count></span></div><div data-lab-history></div></section></div>`;
    root = container.firstElementChild; q('[name=language]').value = draft.language;
    root.querySelector('form').addEventListener('submit',submit);
    root.addEventListener('input',inputChanged); root.addEventListener('change',inputChanged); root.addEventListener('click',clicked);
    root.addEventListener('input',event => { if (!event.target.hasAttribute('data-lab-seek')) return; const row = event.target.closest('[data-lab-result]'); if (audio && playingId === row.dataset.labResult && Number.isFinite(audio.duration)) { audio.currentTime = Number(event.target.value)/1000*audio.duration; paintPlayback(); } });
    fillReferences(); paintModel(); paintHistory(); checkModels();
  }
  function update(value) { snapshot = value; if (!root?.isConnected) return; fillReferences(); paintHistory(); }
  function leave() { if (root?.isConnected) saveDraft(); stopAudio(); root = null; }
  function setVolume(volume,muted) { if (audio) { audio.volume = volume; audio.muted = muted; } }
  return {render,update,leave,checkModels,setVolume};
})();
