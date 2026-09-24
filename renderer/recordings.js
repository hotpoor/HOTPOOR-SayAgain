window.recordingPage=(()=>{
 const api=window.sayagain;let root,sessionId=null,searchQuery='',busy=false,stream,context,processor,source,parts=[],frames=0,offset=0,started=0,queue=Promise.resolve(),pending=0,failed=[],stopping=false;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const status=text=>{const el=root?.querySelector('#recording-status');if(el)el.textContent=text;};
 async function reload(){const state=await api.state();render(root,state);}
 function render(container,state){
  root=container;if(busy)return;
  const sessions=state.recordings||[];if(!sessions.some(s=>s.block_id===sessionId))sessionId=null;
  if(!sessionId){renderList(sessions,state.recording_clips||[]);return;}
  const clips=(state.recording_clips||[]).filter(c=>c.body.recording_id===sessionId).sort((a,b)=>a.body.sequence-b.body.sequence);
  const current=sessions.find(s=>s.block_id===sessionId);
  const duration=clips.reduce((sum,c)=>sum+c.body.duration_ms,0);
  root.innerHTML=`<div class="page recordings-page">
   <button class="recordings-back" id="recording-back">← 所有语音会话</button>
   <header class="recordings-heading recordings-detail-heading"><div><h1>${esc(current.body.title)}</h1><p>在这个会话里添加音频、录音和笔记。</p></div><span class="recordings-local">仅存于本机</span></header>
   <div class="recordings-actions"><div class="recordings-action-group"><button class="button primary" id="recording-start" ${!sessionId?'disabled':''}><span aria-hidden="true">●</span> 开始录音</button><button class="button" id="recording-stop" disabled hidden>停止并保存</button><button class="button" id="recording-import" ${!sessionId?'disabled':''}>添加语音文件</button><input type="file" id="recording-files" accept="audio/*" multiple hidden><button class="button" id="recording-retry" ${failed.length?'':'hidden'}>重试未保存片段 (${failed.length})</button></div><span class="recordings-count">${clips.length?`${clips.length} 个片段 · ${Math.ceil(duration/60000)} 分钟`:'等待第一段录音'}</span></div>
   <p id="recording-status" class="recordings-status" role="status">${failed.length?'有未保存片段，请重试后再离开。':'支持连续录音和音频导入，保存后可逐段试听、转写。'}</p>
   <div class="recordings-progress" hidden><progress id="recording-analysis-progress" max="1" value="0" aria-label="录音分析进度"></progress></div>
   <details class="recordings-analysis"><summary>分析录音 <span>说话人 · 关键词</span></summary><div class="recordings-analysis-body"><div><button class="button" id="recording-speakers" ${!clips.length?'disabled':''}>区分说话人</button><p>将声音相近的发言分组，结果需核对。</p></div><div><div class="recordings-action-group"><input id="recording-keywords" placeholder="输入关键词，用逗号分隔" aria-label="检测关键词" value="${esc(current?.body.keyword_analysis?.keywords?.join(', ')||'')}"><button class="button" id="recording-detect" ${!clips.length?'disabled':''}>检测关键词</button></div><p>在整场录音中寻找你关心的词语。</p></div></div></details>
   <div id="recording-clips">${clips.length?`<div class="recordings-list-heading"><h2>录音片段</h2><span>按录制顺序</span></div>${clips.map(c=>clipView(c)).join('')}`:`<div class="recordings-empty"><div class="recordings-empty-wave" aria-hidden="true">${Array.from({length:7},()=>'<i></i>').join('')}</div><h2>${sessionId?'从一段对话开始':'给对话留一个位置'}</h2><p>${sessionId?'点击「开始录音」，或导入已有音频。':'新建一个会话，再录音或导入音频。'}<br>你的声音和笔记会保存在这里。</p></div>`}</div>
   <details class="recordings-settings"><summary>录音设置与模型 <span>本地处理</span></summary><div class="recordings-settings-body"><p>导入音频每 30 秒保存一段，单文件支持 100 MB 以内。长录音按顺序分析，无片段数量上限。</p><div id="recording-models">正在检查模型…</div><button class="button quiet" id="recording-model-refresh">刷新模型状态</button>${sessionId?`<p class="recordings-id">会话标识 ${esc(sessionId)}</p>`:''}</div></details>
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
  root.querySelector('#recording-model-refresh').onclick=models;models();
 }
 function renderList(sessions,clips){
  root.innerHTML=`<div class="page recordings-page recordings-library">
   <header class="recordings-heading"><div><h1>我的录音</h1><p>按会话整理声音，随时回来继续。</p></div><details class="recordings-new"><summary>＋ 新建会话</summary><form class="recordings-new-form" id="recording-create-form"><input id="recording-title" maxlength="120" aria-label="新录音名称" placeholder="给这次对话起个名字" required><button class="button primary" id="recording-create" type="submit">创建</button></form></details></header>
   <div class="recordings-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"></circle><path d="m16 16 4 4"></path></svg><input type="search" id="recording-search" aria-label="搜索语音会话" placeholder="搜索会话名称或音频文件" value="${esc(searchQuery)}"></div>
   <div class="recordings-library-heading"><h2>语音会话</h2><span id="recording-search-count" role="status"></span></div><div id="recording-session-list"></div><p id="recording-status" class="recordings-status" role="status"></p>
  </div>`;
  const list=root.querySelector('#recording-session-list');
  const matches=new Map();for(const clip of clips){const id=clip.body.recording_id;if(!matches.has(id))matches.set(id,[]);matches.get(id).push(clip);}
  function updateList(){
   const q=searchQuery.trim().toLocaleLowerCase();
   const filtered=sessions.filter(s=>!q||s.body.title.toLocaleLowerCase().includes(q)||(matches.get(s.block_id)||[]).some(c=>(c.body.source_name||'').toLocaleLowerCase().includes(q)));
   root.querySelector('#recording-search-count').textContent=q?`${filtered.length} / ${sessions.length} 个会话`:`${sessions.length} 个会话`;
   list.innerHTML=filtered.length?filtered.map(s=>{const items=matches.get(s.block_id)||[];const ms=items.reduce((sum,c)=>sum+c.body.duration_ms,0);const files=[...new Set(items.map(c=>c.body.source_name))];return `<button type="button" class="recordings-session-row" data-recording-open="${s.block_id}"><span class="recordings-row-icon" aria-hidden="true">${Array.from({length:5},()=>'<i></i>').join('')}</span><span class="recordings-row-copy"><strong>${esc(s.body.title)}</strong><span>${items.length?`${items.length} 个片段 · ${ms<60000?`${Math.round(ms/1000)} 秒`:`${Math.ceil(ms/60000)} 分钟`}`:'还没有音频'}${files.length?' · '+esc(files.slice(0,2).join('、'))+(files.length>2?' 等':''):''}</span></span><span class="recordings-row-arrow" aria-hidden="true">›</span></button>`;}).join(''):`<div class="recordings-empty"><h2>${q?'没有找到相关会话':'还没有语音会话'}</h2><p>${q?'换个名称或音频文件名试试。':'点击右上角「新建会话」，再添加语音文件或开始录音。'}</p></div>`;
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
  const unsubscribe=api.onRecordingAnalysisProgress?.(value=>{if(value.id!==sessionId)return;progress.max=value.total;progress.value=value.completed;status(value.completed===value.total?'分析完成，正在保存…':`正在分析 · 已完成 ${value.completed} / ${value.total} 个片段`);});
  try{await api.analyzeRecording({id:sessionId,mode,keywords:root.querySelector('#recording-keywords').value});busy=false;await reload();status('分析结果已保存，请核对。');}
  catch(e){busy=false;lock(false);progress.parentElement.hidden=true;status(e.message);}
  finally{unsubscribe?.();}
 }
 function clipView(c){return `<section class="recording-clip"><div class="recording-clip-heading"><span class="recording-sequence">${String(c.body.sequence+1).padStart(2,'0')}</span><div><strong>${esc(c.body.source_name)}</strong><small>${(c.body.source_offset_ms/1000).toFixed(0)} 秒起 · ${(c.body.duration_ms/1000).toFixed(0)} 秒</small></div><button class="button quiet" data-transcribe="${c.block_id}">转写文字</button></div><audio controls preload="none" src="sayagain-asset://audio/${c.body.asset_id}"></audio>${analysisView(c)}<details class="recording-notes" ${c.body.transcript?'open':''}><summary>文字与笔记${c.body.transcript?'':' · 尚未转写'}</summary><label><span class="recording-note-label">转写结果可直接修改</span><textarea aria-label="录音文字与笔记" data-transcript="${c.block_id}" placeholder="写下笔记，或点击转写文字…">${esc(c.body.transcript)}</textarea></label><button class="button quiet" data-save-transcript="${c.block_id}" data-revision="${c.body.revision}">保存文字</button></details></section>`;}
 function analysisView(c){const b=c.body;return (b.speaker_analysis?'<p>候选说话人：'+(b.speaker_analysis.segments.map(s=>`${(s.start_ms/1000).toFixed(1)}–${(s.end_ms/1000).toFixed(1)}s ${esc(s.speaker||"不确定")}`).join('；')||'未发现可分组的语音')+'</p>':'')+(b.keyword_analysis?'<p>关键词：'+(b.keyword_analysis.segments.map(s=>esc(s.keyword)).join('、')||'未检出')+'</p>':'');}
 function lock(value){root.querySelectorAll('#recording-back,#recording-start,#recording-import,#recording-speakers,#recording-detect').forEach(el=>el.disabled=value);root.querySelector('#recording-stop').disabled=!stream;root.querySelector('#recording-stop').hidden=!stream;if(!value){root.querySelector('#recording-speakers').disabled=!root.querySelector('.recording-clip');root.querySelector('#recording-detect').disabled=!root.querySelector('.recording-clip');}}
 function pcm(samples,rate){const bytes=new Uint8Array(44+samples.length*2),v=new DataView(bytes.buffer);const str=(p,t)=>[...t].forEach((c,i)=>v.setUint8(p+i,c.charCodeAt(0)));str(0,'RIFF');v.setUint32(4,bytes.length-8,true);str(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,bytes.length-44,true);samples.forEach((s,i)=>v.setInt16(44+i*2,Math.max(-32768,Math.min(32767,Math.round(s*32767))),true));return bytes;}
 function enqueue(input){pending++;queue=queue.then(async()=>{try{await api.addRecordingClip(input);status('片段已保存 · '+new Date().toLocaleTimeString());}catch(e){failed.push(input);status('保存失败：'+e.message);if(stream&&!stopping)setTimeout(stop,0);}finally{pending--;}});}
 function flush(){if(!frames)return;const samples=new Float32Array(frames);let at=0;parts.forEach(p=>{samples.set(p,at);at+=p.length;});const rate=context.sampleRate;enqueue({recording_id:sessionId,client_id:crypto.randomUUID(),source:'microphone',source_name:'连续录音',source_offset_ms:offset,captured_at:started+offset,bytes:pcm(samples,rate)});offset+=frames/rate*1000;frames=0;parts=[];}
 async function start(){if(failed.length)throw Error('请先重试未保存片段');busy=true;lock(true);stream=await navigator.mediaDevices.getUserMedia({audio:true});context=new AudioContext();await context.resume();source=context.createMediaStreamSource(stream);processor=context.createScriptProcessor(4096,1,1);parts=[];frames=0;offset=0;started=Date.now();stopping=false;processor.onaudioprocess=e=>{if(stopping)return;const samples=e.inputBuffer.getChannelData(0).slice();parts.push(samples);frames+=samples.length;status('正在录音 · '+Math.floor((offset+frames/context.sampleRate*1000)/1000)+' 秒');if(frames>=context.sampleRate*30)flush();if(pending>=3){status('保存速度不足，正在停止录音以保护未保存数据');stop();}};source.connect(processor);processor.connect(context.destination);lock(true);}
 function cleanup(){processor?.disconnect();source?.disconnect();stream?.getTracks().forEach(t=>t.stop());context?.close();processor=source=stream=context=null;}
 async function stop(){if(stopping)return;stopping=true;flush();cleanup();await queue;busy=false;stopping=false;await reload();}
 async function importFiles(files){if(failed.length){status('请先重试未保存片段');return;}busy=true;lock(true);let error='';try{for(const file of files){if(file.size>100*1024*1024)throw Error(file.name+' 超过100MB');const ctx=new AudioContext();let audio;try{audio=await ctx.decodeAudioData(await file.arrayBuffer());}finally{await ctx.close();}for(let start=0;start<audio.length;start+=audio.sampleRate*30){const end=Math.min(audio.length,start+audio.sampleRate*30),mono=new Float32Array(end-start);for(let c=0;c<audio.numberOfChannels;c++){const data=audio.getChannelData(c);for(let i=start;i<end;i++)mono[i-start]+=data[i]/audio.numberOfChannels;}enqueue({recording_id:sessionId,client_id:crypto.randomUUID(),source:'import',source_name:file.name,source_offset_ms:start/audio.sampleRate*1000,bytes:pcm(mono,audio.sampleRate)});await queue;if(failed.length)throw Error('有片段未保存，已暂停导入，请重试该片段后重新选择未导入文件。');}}}catch(e){error=e.message;}await queue;busy=false;await reload();if(error)status(error);}
 document.addEventListener('click',e=>{if((busy||failed.length)&&e.target.closest('[data-page]')){e.stopImmediatePropagation();e.preventDefault();status('请先完成当前操作并保存未完成片段。');return;}if(e.target.closest('[data-page="recordings"]'))sessionId=null;},true);
 window.addEventListener('beforeunload',e=>{if(busy||failed.length){e.preventDefault();e.returnValue='';}});
 return{render,get busy(){return busy;}};
})();
