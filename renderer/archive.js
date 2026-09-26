window.archivePage=(()=>{
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const labels={recording_person:'人物',expression:'表达',voice:'音色',voice_sample:'参考录音',recording:'录音会话',recording_clip:'录音片段'};
 let kind='all',search='';
 function render(root,state,refresh){
  const items=(state.archived_items||[]).sort((a,b)=>(b.body.archived_at||b.updatetime)-(a.body.archived_at||a.updatetime));
  const title=r=>r.body.title||r.body.name||r.body.original||r.body.transcript||r.body.source_name||'参考录音';
  root.innerHTML=`<div class="page"><div class="page-heading"><div><h1>归档列表</h1><p>归档的内容可以恢复。彻底删除后无法恢复，独占音频文件也会移除。</p></div></div><div class="toolbar"><select class="filter" id="archive-type" aria-label="归档类型"><option value="all">全部类型</option>${Object.entries(labels).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select><label class="search"><input id="archive-search" type="search" placeholder="搜索归档内容" aria-label="搜索归档内容" value="${esc(search)}"></label></div><div id="archive-rows"></div><p id="archive-error" class="form-error" role="alert"></p></div>`;
  const rows=root.querySelector('#archive-rows');
  function update(){const filtered=items.filter(r=>(kind==='all'||r.body.type===kind)&&title(r).toLowerCase().includes(search.toLowerCase()));rows.innerHTML=filtered.map(r=>`<article class="archive-row"><div><span class="tag">${labels[r.body.type]}</span><h3>${esc(title(r))}</h3><small>${new Date(r.body.archived_at||r.updatetime).toLocaleString()}</small></div><div class="recording-item-actions"><button class="button" data-restore="${r.block_id}">恢复</button><button class="button quiet danger-text" data-purge="${r.block_id}">彻底删除</button></div></article>`).join('')||'<section class="empty"><h2>暂无符合条件的归档内容</h2></section>';}
  root.querySelector('#archive-type').value=kind;root.querySelector('#archive-type').onchange=e=>{kind=e.target.value;update();};root.querySelector('#archive-search').oninput=e=>{search=e.target.value;update();};
  rows.onclick=async e=>{const b=e.target.closest('[data-restore],[data-purge]');if(!b)return;const id=b.dataset.restore||b.dataset.purge,r=items.find(r=>r.block_id===id);try{if(b.dataset.restore){b.disabled=true;await window.sayagain.archiveItem({id,revision:r.body.revision,action:'restore'});await refresh();}else{const done=await window.itemEditor({title:'彻底删除这条归档内容？',message:`「${title(r).slice(0,100)}」将永久删除。会话或音色中的子项、相关生成记录及未被其他记录使用的音频文件也会删除，无法恢复。`,submit:'彻底删除',danger:true,onSave:()=>window.sayagain.archiveItem({id,revision:r.body.revision,action:'delete'})});if(done)await refresh();}}catch(error){b.disabled=false;root.querySelector('#archive-error').textContent=error.message;}};
  update();
 }
 return {render};
})();
