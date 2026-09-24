window.recordingPage=(()=>{
 const api=window.sayagain;let root,sessionId=null,searchQuery='',busy=false,stream,context,processor,source,parts=[],frames=0,offset=0,started=0,queue=Promise.resolve(),pending=0,failed=[],stopping=false;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const status=text=>{const el=root?.querySelector('#recording-status');if(el)el.textContent=text;};
 async function reload(){const state=await api.state();render(root,state);}
 function render(container,state){
  root=container;if(busy)return;
  const sessions=state.recordings||[];if(!sessions.some(s=>s.block_id===sessionId))sessionId=null;
  if(!sessionId){renderList(sessions,state.recording_clips||[],state.recording_sources||[]);return;}
  const clips=(state.recording_clips||[]).filter(c=>c.body.recording_id===sessionId).sort((a,b)=>a.body.sequence-b.body.sequence);
  const current=sessions.find(s=>s.block_id===sessionId);
  const originals=(state.recording_sources||[]).filter(s=>s.body.recording_id===sessionId).sort((a,b)=>a.body.sequence-b.body.sequence);
  const confirmedNames=[...new Set(clips.filter(c=>c.body.speaker_analysis?.status==='user_confirmed').flatMap(c=>c.body.speaker_analysis.segments.map(t=>t.speaker)).filter(n=>n!=='不确定'))];
  const duration=clips.reduce((sum,c)=>sum+c.body.duration_ms,0);
  root.innerHTML=`<div class="page recordings-page">
   <button class="recordings-back" id="recording-back">← 所有语音会话</button>
   <header class="recordings-heading recordings-detail-heading"><div><h1>${esc(current.body.title)}</h1><p>在这个会话里添加音频、录音和笔记。</p></div><span class="recordings-local">仅存于本机</span></header>
   <div class="recordings-actions"><div class="recordings-action-group"><button class="button primary" id="recording-start" ${!sessionId?'disabled':''}><span aria-hidden="true">●</span> 开始录音</button><button class="button" id="recording-stop" disabled hidden>停止并保存</button><button class="button" id="recording-import" ${!sessionId?'disabled':''}>添加语音文件</button><button class="button" id="recording-import-cancel" hidden>停止导入</button><input type="file" id="recording-files" accept="audio/*" multiple hidden><button class="button" id="recording-retry" ${failed.length?'':'hidden'}>重试未保存片段 (${failed.length})</button></div><span class="recordings-count">${clips.length?`${clips.length} 个片段 · ${Math.ceil(duration/60000)} 分钟`:'等待第一段录音'}</span></div>
   <p id="recording-status" class="recordings-status" role="status">${failed.length?'有未保存片段，请重试后再离开。':'支持连续录音和音频导入，保存后可逐段试听、转写。'}</p>
   <div class="recordings-progress" hidden><progress id="recording-analysis-progress" max="1" value="0" aria-label="录音分析进度"></progress></div>
   <details class="recordings-analysis"><summary>分析录音 <span>说话人 · 关键词</span></summary><div class="recordings-analysis-body"><div><button class="button" id="recording-speakers" ${!clips.length?'disabled':''}>区分说话人</button><p>第一步：识别候选说话人。第二步：在下方修改时间和说话人并确认。第三步：转写。</p></div><div><div class="recordings-action-group"><input id="recording-keywords" placeholder="输入关键词，用逗号分隔" aria-label="检测关键词" value="${esc(current?.body.keyword_analysis?.keywords?.join(', ')||'')}"><button class="button" id="recording-detect" ${!clips.length?'disabled':''}>检测关键词</button></div><p>在整场录音中寻找你关心的词语。</p></div></div></details>
   <details class="recordings-originals" ${!clips.length?'open':''}><summary>原始音频 <span>${originals.length} 个文件 · 完整保留</span></summary>${originals.map(s=>`<div class="recording-source"><strong>${esc(s.body.name)}</strong><small>${s.body.legacy?'旧版保存的连续录音素材已保留':'原文件已完整保存到本机'}</small>${s.body.original_asset_id?`<audio controls preload="none" src="sayagain-asset://audio/${s.body.original_asset_id}"></audio>`:s.body.legacy?`<details><summary>试听保留的录音素材</summary>${s.body.input_assets.map((id,i)=>`<small>素材 ${i+1}</small><audio controls preload="none" src="sayagain-asset://audio/${id}"></audio>`).join('')}</details>`:''}${s.body.retained_notes?.length?`<details><summary>保留的手工笔记</summary>${s.body.retained_notes.map(n=>`<p>${(n.offset_ms/1000).toFixed(1)} 秒 · ${esc(n.text)}</p>`).join('')}</details>`:''}</div>`).join('')||'<p class="recordings-status">录音素材已保留；重新分段后会整理到这里。</p>'}</details>
   <div class="recordings-reset-actions"><button class="button" id="recording-resegment" ${!clips.length&&!originals.length?'disabled':''}>按停顿重新分段</button><button class="button quiet" id="recording-clear-analysis" ${!clips.length?'disabled':''}>清除分析结果</button><button class="button" id="recording-reanalyze" ${!clips.length?'disabled':''}>转写已确认片段</button><span>保留原音频、自然分段和手工笔记</span></div>
   <p class="muted">已确认 ${confirmedNames.length} 位说话人：${confirmedNames.map(esc).join('、')||'尚未确认'} · 未确认片段 ${clips.filter(c=>c.body.speaker_analysis?.status!=='user_confirmed').length} 个</p><div id="recording-clips">${clips.length?`<div class="recordings-list-heading"><h2>录音片段</h2><span>按录制顺序</span></div>${clips.map(c=>clipView(c)).join('')}`:`<div class="recordings-empty"><div class="recordings-empty-wave" aria-hidden="true">${Array.from({length:7},()=>'<i></i>').join('')}</div><h2>${sessionId?'从一段对话开始':'给对话留一个位置'}</h2><p>${sessionId?'点击「开始录音」，或导入已有音频。':'新建一个会话，再录音或导入音频。'}<br>你的声音和笔记会保存在这里。</p></div>`}</div>
   <details class="recordings-settings"><summary>录音设置与模型 <span>本地处理</span></summary><div class="recordings-settings-body"><p>音频由配套 FFmpeg 在本机解码，先检测自然停顿再保存语音片段，不受 100 MB 限制。原文件与自然分段均保留，可逐段播放。长录音按顺序分析，无片段数量上限。</p><div id="recording-models">正在检查模型…</div><button class="button quiet" id="recording-model-refresh">刷新模型状态</button>${sessionId?`<p class="recordings-id">会话标识 ${esc(sessionId)}</p>`:''}</div></details>
  </div>`;
  root.querySelector('#recording-back').onclick=async()=>{if(busy||failed.length){status('请先完成当前操作并保存片段。');return;}sessionId=null;await reload();};
  root.querySelector('#recording-start').onclick=()=>start().catch(e=>{cleanup();busy=false;status(e.message);lock(false);});
  root.querySelector('#recording-stop').onclick=()=>stop();
  root.querySelector('#recording-import').onclick=()=>root.querySelector('#recording-files').click();
  root.querySelector('#recording-files').onchange=e=>importFiles([...e.target.files]);
  root.querySelector('#recording-retry').onclick=async()=>{busy=true;lock(true);const retry=failed;failed=[];for(const input of retry)enqueue(input);await queue;busy=false;await reload();};
  root.querySelectorAll('[data-save-transcript]').forEach(b=>b.onclick=async()=>{try{await api.updateRecordingTranscript({id:b.dataset.saveTranscript,revision:Number(b.dataset.revision),text:root.querySelector(`[data-transcript="${b.dataset.saveTranscript}"]`).value});await reload();}catch(e){status(e.message);}});
  root.querySelectorAll('[data-transcribe]').forEach(b=>b.onclick=async()=>{b.disabled=true;status('正在本地转写…');try{await api.transcribeRecording({id:b.dataset.transcribe});await reload();status('转写已保存，请核对识别结果。');}catch(e){status(e.message);b.disabled=false;}});
  root.querySelector('#recording-speakers').onclick=()=>analyze('speakers');
  root.querySelector('#recording-detect').onclick=()=>analyze('keywords');
  root.querySelector('#recording-reanalyze').onclick=()=>analyze('all');
  root.querySelector('#recording-resegment').onclick=()=>importFiles([],true);
  root.querySelector('#recording-clear-analysis').onclick=async()=>{busy=true;lock(true);try{await api.clearRecordingAnalysis({id:sessionId});busy=false;await reload();status('已清除机器转写、说话人和关键词结果；原音频、自然分段及手工笔记已保留。');}catch(e){busy=false;lock(false);status(e.message);}};
  bindTurns();
  root.querySelector('#recording-model-refresh').onclick=models;models();
 }
 function renderList(sessions,clips,sources){
  root.innerHTML=`<div class="page recordings-page recordings-library">
   <header class="recordings-heading"><div><h1>我的录音</h1><p>按会话整理声音，随时回来继续。</p></div><details class="recordings-new"><summary>＋ 新建会话</summary><form class="recordings-new-form" id="recording-create-form"><input id="recording-title" maxlength="120" aria-label="新录音名称" placeholder="给这次对话起个名字" required><button class="button primary" id="recording-create" type="submit">创建</button></form></details></header>
   <div class="recordings-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"></circle><path d="m16 16 4 4"></path></svg><input type="search" id="recording-search" aria-label="搜索语音会话" placeholder="搜索会话名称或音频文件" value="${esc(searchQuery)}"></div>
   <div class="recordings-library-heading"><h2>语音会话</h2><span id="recording-search-count" role="status"></span></div><div id="recording-session-list"></div><p id="recording-status" class="recordings-status" role="status"></p>
  </div>`;
  const list=root.querySelector('#recording-session-list');
  const matches=new Map();for(const clip of clips){const id=clip.body.recording_id;if(!matches.has(id))matches.set(id,[]);matches.get(id).push(clip);}
  const sourceNames=id=>sources.filter(s=>s.body.recording_id===id).map(s=>s.body.name);
  function updateList(){
   const q=searchQuery.trim().toLocaleLowerCase();
   const filtered=sessions.filter(s=>!q||s.body.title.toLocaleLowerCase().includes(q)||sourceNames(s.block_id).some(name=>name.toLocaleLowerCase().includes(q))||(matches.get(s.block_id)||[]).some(c=>(c.body.source_name||'').toLocaleLowerCase().includes(q)));
   root.querySelector('#recording-search-count').textContent=q?`${filtered.length} / ${sessions.length} 个会话`:`${sessions.length} 个会话`;
   list.innerHTML=filtered.length?filtered.map(s=>{const items=matches.get(s.block_id)||[];const ms=items.reduce((sum,c)=>sum+c.body.duration_ms,0);const files=[...new Set([...sourceNames(s.block_id),...items.map(c=>c.body.source_name)])];return `<button type="button" class="recordings-session-row" data-recording-open="${s.block_id}"><span class="recordings-row-icon" aria-hidden="true">${Array.from({length:5},()=>'<i></i>').join('')}</span><span class="recordings-row-copy"><strong>${esc(s.body.title)}</strong><span>${items.length?`${items.length} 个片段 · ${ms<60000?`${Math.round(ms/1000)} 秒`:`${Math.ceil(ms/60000)} 分钟`}`:files.length?`${files.length} 个原文件 · 尚无语音片段`:'还没有音频'}${files.length?' · '+esc(files.slice(0,2).join('、'))+(files.length>2?' 等':''):''}</span></span><span class="recordings-row-arrow" aria-hidden="true">›</span></button>`;}).join(''):`<div class="recordings-empty"><h2>${q?'没有找到相关会话':'还没有语音会话'}</h2><p>${q?'换个名称或音频文件名试试。':'点击右上角「新建会话」，再添加语音文件或开始录音。'}</p></div>`;
  }
  root.querySelector('#recording-search').oninput=e=>{searchQuery=e.target.value;updateList();};
  list.onclick=async e=>{const row=e.target.closest('[data-recording-open]');if(!row)return;sessionId=row.dataset.recordingOpen;await reload();};
  root.querySelector('#recording-create-form').onsubmit=async e=>{e.preventDefault();const button=root.querySelector('#recording-create');button.disabled=true;try{sessionId=(await api.createRecording({title:root.querySelector('#recording-title').value.trim()})).block_id;await reload();}catch(error){button.disabled=false;status(error.message);}};
  updateList();
 }
 async function models(){try{const rows=await api.recordingModels();const el=root?.querySelector('#recording-models');if(el)el.innerHTML=rows.map(m=>`<p><strong>${esc(m.name)}</strong> · ${esc(m.status)}${m.device?' · '+esc(m.device):''}</p>`).join('');}catch(e){status(e.message);}}
 async function analyze(mode){
  busy=true;lock(true);status('正在加载本地模型…');
  const progress=root.querySelector('#recording-analysis-progress');progress.parentElement.hidden=false;progress.value=0;progress.max=1;
  let updatingText=false;
  const unsubscribe=api.onRecordingAnalysisProgress?.(value=>{if(value.id!==sessionId)return;
   if(value.stage==='transcribing'&&value.completed&&!updatingText){updatingText=true;api.state().then(state=>{if(!busy||value.id!==sessionId)return;for(const clip of state.recording_clips||[]){if(clip.body.recording_id!==sessionId)continue;const field=root.querySelector(`[data-transcript="${clip.block_id}"]`);if(field&&clip.body.transcript_status==='machine_unreviewed'){field.value=clip.body.transcript;if(clip.body.transcript)field.closest('details').open=true;}}}).catch(()=>{}).finally(()=>{updatingText=false;});}
  progress.max=value.total;progress.value=value.completed;status(`${value.stage==='transcribing'?'正在转写':value.stage==='speakers'?'正在区分说话人':'正在分析'} · 已完成 ${value.completed} / ${value.total} 个片段`);});
  try{if(mode==='all')await api.reanalyzeRecording({id:sessionId});else await api.analyzeRecording({id:sessionId,mode,keywords:root.querySelector('#recording-keywords').value});busy=false;await reload();status('分析结果已保存，请核对。');}
  catch(e){busy=false;lock(false);progress.parentElement.hidden=true;status(e.message);}
  finally{unsubscribe?.();}
 }
 function clipView(c){return `<section class="recording-clip"><div class="recording-clip-heading"><span class="recording-sequence">${String(c.body.sequence+1).padStart(2,'0')}</span><div><strong>${esc(c.body.source_name)}</strong><small>${(c.body.source_offset_ms/1000).toFixed(0)} 秒起 · ${(c.body.duration_ms/1000).toFixed(0)} 秒</small></div><button class="button quiet" data-transcribe="${c.block_id}" ${c.body.speaker_analysis?.status!=='user_confirmed'?'disabled':''}>转写文字</button></div><audio controls preload="none" src="sayagain-asset://audio/${c.body.asset_id}"></audio>${turnEditor(c)}${analysisView(c)}${c.body.transcript_turns_stale?'<p class="muted">分段已修改，旧文字保留待重新转写。</p>':''}${(c.body.transcript_segments||[]).filter(t=>t.speaker).map(t=>`<p>${esc(t.speaker)} · ${(t.start_ms/1000).toFixed(3)}–${(t.end_ms/1000).toFixed(3)} 秒：${esc(t.text)}</p>`).join('')}<details class="recording-notes" ${c.body.transcript?'open':''}><summary>文字与笔记${c.body.transcript?'':' · 尚未转写'}</summary><label><span class="recording-note-label">转写结果可直接修改</span><textarea aria-label="录音文字与笔记" data-transcript="${c.block_id}" placeholder="写下笔记，或点击转写文字…">${esc(c.body.transcript)}</textarea></label><button class="button quiet" data-save-transcript="${c.block_id}" data-revision="${c.body.revision}">保存文字</button></details></section>`;}
 function turnRow(t){return `<div class="recording-turn"><label>开始（秒）<input data-turn-start type="number" step="0.001" min="0" value="${(t.start_ms/1000).toFixed(3)}"></label><label>结束（秒）<input data-turn-end type="number" step="0.001" min="0" value="${(t.end_ms/1000).toFixed(3)}"></label><label>说话人<input data-turn-speaker maxlength="60" value="${esc(t.speaker||'不确定')}"></label><button class="button quiet" data-turn-play>试听</button><button class="button quiet" data-turn-remove>删除</button></div>`;}
 function turnEditor(c){const turns=c.body.speaker_analysis?.segments||[{start_ms:0,end_ms:c.body.duration_ms,speaker:'不确定'}];return `<details class="recording-turn-editor" data-turn-editor="${c.block_id}" data-revision="${c.body.revision}" open><summary>确认说话人和时间段 · ${c.body.speaker_analysis?.status==='user_confirmed'?'已确认':'待确认'}</summary><p class="muted">时间相对于本片段。可修改边界、统一同一人的名称；不确定时保留“不确定”。人数按确认名称统计，不代表真实身份。</p><div data-turn-rows>${turns.map(turnRow).join('')}</div><button class="button quiet" data-turn-add>增加发言段</button><button class="button" data-turn-confirm>确认这些时间段和说话人</button><span data-turn-state></span></details>`;}
 function analysisView(c){const b=c.body;return b.keyword_analysis?'<p>关键词：'+(b.keyword_analysis.segments.map(s=>esc(s.keyword)).join('、')||'未检出')+'</p>':'';}
 function bindTurns(){
 root.querySelectorAll('[data-turn-editor]').forEach(editor=>{
  const clip=editor.closest('.recording-clip');
  editor.oninput=()=>{root.querySelector('#recording-reanalyze').disabled=true;clip.querySelector('[data-transcribe]').disabled=true;editor.querySelector('[data-turn-state]').textContent='修改尚未确认';};
  editor.onclick=async e=>{const b=e.target.closest('button');if(!b)return;const row=b.closest('.recording-turn');
   if(b.hasAttribute('data-turn-remove')){row.remove();editor.oninput();}
   if(b.hasAttribute('data-turn-add')){const rows=editor.querySelectorAll('.recording-turn');const at=rows.length?Number(rows[rows.length-1].querySelector('[data-turn-end]').value)*1000:0;editor.querySelector('[data-turn-rows]').insertAdjacentHTML('beforeend',turnRow({start_ms:at,end_ms:at+1000,speaker:'不确定'}));editor.oninput();}
   if(b.hasAttribute('data-turn-play')){const audio=clip.querySelector('audio'),start=Number(row.querySelector('[data-turn-start]').value),end=Number(row.querySelector('[data-turn-end]').value);try{if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)throw Error('请检查试听时间');audio.currentTime=start;audio.ontimeupdate=()=>{if(audio.currentTime>=end){audio.pause();audio.ontimeupdate=null;}};await audio.play();}catch(error){status(error.message);}}
   if(b.hasAttribute('data-turn-confirm')){b.disabled=true;try{const segments=[...editor.querySelectorAll('.recording-turn')].map(r=>({start_ms:Number(r.querySelector('[data-turn-start]').value)*1000,end_ms:Number(r.querySelector('[data-turn-end]').value)*1000,speaker:r.querySelector('[data-turn-speaker]').value}));await api.confirmRecordingTurns({id:editor.dataset.turnEditor,revision:Number(editor.dataset.revision),segments});await reload();status('已确认，现在可以按这些时间段转写。');}catch(error){b.disabled=false;status(error.message);}}
  };
 });
 }
 function lock(value){root.querySelectorAll('#recording-back,#recording-start,#recording-import,#recording-speakers,#recording-detect,#recording-resegment,#recording-clear-analysis,#recording-reanalyze,[data-save-transcript],[data-transcribe],[data-transcript],[data-turn-editor] input,[data-turn-editor] button').forEach(el=>el.disabled=value);root.querySelector('#recording-stop').disabled=!stream;root.querySelector('#recording-stop').hidden=!stream;if(!value){root.querySelector('#recording-speakers').disabled=!root.querySelector('.recording-clip');root.querySelector('#recording-detect').disabled=!root.querySelector('.recording-clip');root.querySelectorAll('[data-turn-editor]').forEach(e=>{e.closest('.recording-clip').querySelector('[data-transcribe]').disabled=!e.querySelector('summary').textContent.includes('已确认')||!!e.querySelector('[data-turn-state]').textContent;});}}
 function pcm(samples,rate){const bytes=new Uint8Array(44+samples.length*2),v=new DataView(bytes.buffer);const str=(p,t)=>[...t].forEach((c,i)=>v.setUint8(p+i,c.charCodeAt(0)));str(0,'RIFF');v.setUint32(4,bytes.length-8,true);str(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,bytes.length-44,true);samples.forEach((s,i)=>v.setInt16(44+i*2,Math.max(-32768,Math.min(32767,Math.round(s*32767))),true));return bytes;}
 function enqueue(input){pending++;queue=queue.then(async()=>{try{await api.addRecordingClip(input);status('片段已保存 · '+new Date().toLocaleTimeString());}catch(e){failed.push(input);status('保存失败：'+e.message);if(stream&&!stopping)setTimeout(stop,0);}finally{pending--;}});}
 function flush(){if(!frames)return;const samples=new Float32Array(frames);let at=0;parts.forEach(p=>{samples.set(p,at);at+=p.length;});const rate=context.sampleRate;enqueue({recording_id:sessionId,client_id:crypto.randomUUID(),source:'microphone',source_name:'连续录音',source_offset_ms:offset,captured_at:started+offset,bytes:pcm(samples,rate)});offset+=frames/rate*1000;frames=0;parts=[];}
 async function start(){if(failed.length)throw Error('请先重试未保存片段');busy=true;lock(true);stream=await navigator.mediaDevices.getUserMedia({audio:true});context=new AudioContext();await context.resume();source=context.createMediaStreamSource(stream);processor=context.createScriptProcessor(4096,1,1);parts=[];frames=0;offset=0;started=Date.now();stopping=false;processor.onaudioprocess=e=>{if(stopping)return;const samples=e.inputBuffer.getChannelData(0).slice();parts.push(samples);frames+=samples.length;status('正在录音 · '+Math.floor((offset+frames/context.sampleRate*1000)/1000)+' 秒');if(frames>=context.sampleRate*30)flush();if(pending>=3){status('保存速度不足，正在停止录音以保护未保存数据');stop();}};source.connect(processor);processor.connect(context.destination);lock(true);}
 function cleanup(){processor?.disconnect();source?.disconnect();stream?.getTracks().forEach(t=>t.stop());context?.close();processor=source=stream=context=null;}
 async function stop(){if(stopping)return;stopping=true;flush();cleanup();await queue;busy=false;stopping=false;await reload();}
 async function importFiles(files,resegment=false){
  if(!files.length&&!resegment)return;
  if(failed.length){status('请先重试未保存片段');return;}
  busy=true;lock(true);status(resegment?'正在重新检测自然停顿，当前分段会保留至处理成功…':'正在保留原音频文件…');
  const empty=root.querySelector('.recordings-empty');if(empty){empty.querySelector('h2').textContent='正在整理音频';empty.querySelector('p').textContent='先检测自然停顿，再保存可逐段播放的语音；原文件完整保留。';}
  root.querySelector('.recordings-count').textContent='正在导入…';
  const progress=root.querySelector('#recording-analysis-progress'),cancel=root.querySelector('#recording-import-cancel');
  progress.parentElement.hidden=false;progress.removeAttribute('value');progress.setAttribute('aria-label','音频导入进度');cancel.hidden=false;cancel.disabled=false;
  cancel.onclick=async()=>{cancel.disabled=true;status('正在停止导入，已保存片段会保留…');try{await api.cancelRecordingImport({id:sessionId});}catch(e){status(e.message);cancel.disabled=false;}};
  const clock=ms=>`${Math.floor(ms/60000)}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}`;
  const unsubscribe=api.onRecordingImportProgress(value=>{
   if(value.id!==sessionId)return;
   root.querySelector('.recordings-count').textContent=`已保存 ${value.saved} 个片段`;
   if(value.durationMs){progress.max=value.durationMs;progress.value=Math.min(value.processedMs,value.durationMs);}else progress.removeAttribute('value');
   const stage={preserving:'保留原文件',decoding:'解码音频',vad:'检测自然停顿','file-complete':'分段完成'}[value.stage]||'处理中';
   const percent=value.durationMs?` · ${Math.min(100,Math.floor(value.processedMs/value.durationMs*100))}%`:'';
   status(`${value.fileIndex}/${value.fileCount} · ${value.file} · ${stage} · ${clock(value.processedMs||0)}${value.durationMs?' / '+clock(value.durationMs):''}${percent} · 已保存 ${value.saved} 个片段`);
  });
  let message;
  try{const result=resegment?await api.resegmentRecording({id:sessionId}):await api.importRecordingFiles({id:sessionId,files});message=`${result.cancelled?'已停止导入':resegment?'重新分段完成':'导入完成'} · 已保存 ${result.saved} 个自然语音片段${result.cancelled?'。重新选择同一文件可继续导入。':'。'}`;}
  catch(error){message=error.message;}
  finally{unsubscribe();busy=false;await reload();status(message);}
 }
 document.addEventListener('click',e=>{if((busy||failed.length)&&e.target.closest('[data-page]')){e.stopImmediatePropagation();e.preventDefault();status('请先完成当前操作并保存未完成片段。');return;}if(e.target.closest('[data-page="recordings"]'))sessionId=null;},true);
 window.addEventListener('beforeunload',e=>{if(busy||failed.length){e.preventDefault();e.returnValue='';}});
 return{render,get busy(){return busy;}};
})();
