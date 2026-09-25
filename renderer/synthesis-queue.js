(() => {
 const host=document.createElement('div');host.className='synthesis-queue';
 host.innerHTML='<button type="button" class="icon-button queue-toggle" aria-label="生成队列" title="生成队列" aria-expanded="false" aria-controls="synthesis-queue-panel"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 8v5l3 2M9 2h6M12 2v3"/></svg><span class="queue-badge" hidden></span></button><section id="synthesis-queue-panel" class="queue-panel" aria-label="生成队列" hidden><header><strong>生成队列</strong><button type="button" class="icon-button queue-close" aria-label="关闭生成队列">×</button></header><p class="queue-summary" role="status"></p><div class="queue-items"></div></section>';
 document.querySelector('.topbar-right').insertBefore(host,document.querySelector('#fullscreen'));
 const toggle=host.querySelector('.queue-toggle'),panel=host.querySelector('.queue-panel');
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const elapsed=ms=>{const s=Math.max(0,Math.floor(ms/1000));return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;};
 let snapshot={syntheses:[],voices:[]};
 function open(value){panel.hidden=!value;toggle.setAttribute('aria-expanded',String(value));if(value)paint();}
 toggle.addEventListener('click',()=>open(panel.hidden));
 host.querySelector('.queue-close').addEventListener('click',()=>{open(false);toggle.focus();});
 document.addEventListener('click',event=>{if(!host.contains(event.target))open(false);});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden){event.stopImmediatePropagation();open(false);toggle.focus();}},true);
 function tick(){host.querySelectorAll('[data-queue-start]').forEach(el=>{el.textContent='已用 '+elapsed(Date.now()-Number(el.dataset.queueStart));});}
 function paint(){
  const all=snapshot.syntheses||[],active=all.filter(x=>['queued','running'].includes(x.body.status));
  const order=snapshot.synthesis_queue||[];
  const running=active.filter(x=>x.body.status==='running'),waiting=active.filter(x=>x.body.status==='queued').sort((a,b)=>order.includes(a.block_id)&&order.includes(b.block_id)?order.indexOf(a.block_id)-order.indexOf(b.block_id):(a.body.queued_at||a.createtime)-(b.body.queued_at||b.createtime));
  const done=all.filter(x=>!['queued','running'].includes(x.body.status)).sort((a,b)=>(b.body.completed_at||b.updatetime||b.createtime)-(a.body.completed_at||a.updatetime||a.createtime)).slice(0,20);
  const badge=host.querySelector('.queue-badge');badge.hidden=!active.length;badge.textContent=active.length;
  toggle.setAttribute('aria-label',`生成队列，${running.length} 条生成中，${waiting.length} 条等待`);
  host.querySelector('.queue-summary').textContent=active.length?`${running.length} 条生成中 · ${waiting.length} 条等待 · 按顺序逐条处理`:'暂无等待任务 · 最近的生成记录';
  const focusId=host.contains(document.activeElement)?document.activeElement.dataset.queueCancel:null;
  host.querySelector('.queue-items').innerHTML=[...running,...waiting,...done].map(item=>{
   const b=item.body,status={running:'正在生成',queued:`排队第 ${waiting.indexOf(item)+1} 位`,succeeded:'已完成',failed:'生成失败',cancelled:'已取消'}[b.status]||b.status;
   const voice=snapshot.voices?.find(v=>v.block_id===b.voice_id)?.body.name||'历史音色';
   return `<article class="queue-item" data-status="${esc(b.status)}"><div class="queue-item-heading"><strong>${esc(status)}</strong>${b.status==='running'&&b.started_at?`<span data-queue-start="${Number(b.started_at)}"></span>`:''}</div><p dir="auto">${esc(b.text_snapshot)}</p><small>${esc(voice)} · ${b.provider==='cloud'?'云端':'本地'}</small>${b.error?`<p class="queue-error">${esc(b.error)}</p>`:''}${['running','queued'].includes(b.status)?`<button type="button" class="button quiet" data-queue-cancel="${esc(item.block_id)}">取消</button>`:''}</article>`;
  }).join('')||'<p class="queue-empty">还没有生成任务。点击表达旁的「生成语音」即可加入。</p>';
  if(focusId)Array.from(host.querySelectorAll('[data-queue-cancel]')).find(el=>el.dataset.queueCancel===focusId)?.focus();
  tick();
 }
 host.addEventListener('click',async event=>{const button=event.target.closest('[data-queue-cancel]');if(!button)return;button.disabled=true;try{await window.sayagain.cancelSynthesis({id:button.dataset.queueCancel});snapshot=await window.sayagain.state();paint();}catch(error){host.querySelector('.queue-summary').textContent=String(error.message||error);button.disabled=false;}});
 window.synthesisQueue={update(value){snapshot=value;paint();}};
 setInterval(()=>{if(!panel.hidden)tick();},1000);
})();
