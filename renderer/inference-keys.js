window.inferenceKeys=(()=>{
 const api=window.sayagain,esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 async function mount(host){
  let config,tab='manager',busy=false;const prefix='ak-'+crypto.randomUUID();
  host.innerHTML='<p class="form-hint" role="status">正在读取 AK 配置…</p>';
  function render(){
   const managers=config.managers,usages=config.usages,rows=tab==='manager'?managers:usages;
   host.innerHTML=`<div class="ak-overview"><span><strong>${managers.length}</strong> 管理 AK</span><span><strong>${usages.length}</strong> 应用 AK</span><span>默认应用 <strong>${esc(usages.find(p=>p.id===config.active)?.name||'未选择')}</strong></span></div><div class="ak-tabs" role="tablist" aria-label="AK 类型">${[['manager','管理 AK'],['usage','应用 AK']].map(([kind,label])=>`<button type="button" id="${prefix}-tab-${kind}" role="tab" aria-selected="${tab===kind}" aria-controls="${prefix}-panel" tabindex="${tab===kind?0:-1}" data-ak-tab="${kind}">${label}</button>`).join('')}</div><section role="tabpanel" id="${prefix}-panel" aria-labelledby="${prefix}-tab-${tab}" data-ak-groups><div class="ak-list-heading"><div><h3>${tab==='manager'?'组织与管理凭据':'应用凭据与组织绑定'}</h3><p>${tab==='manager'?'管理 AK 用于验证组织、查询组织费用。':'应用 AK 用于调用模型；多个应用 AK 可绑定同一个管理 AK。'}</p></div><button type="button" class="button" data-ak-add="${tab}">＋ 添加${tab==='manager'?'管理':'应用'} AK</button></div>${rows.map(p=>{
    const manager=managers.find(m=>m.id===p.managerId),available=p.enabled&&(tab==='manager'||manager?.enabled),bound=usages.filter(u=>u.managerId===p.id).length;
    return `<article class="ak-row" data-ak-id="${esc(p.id)}" data-ak-kind="${tab}"><div class="ak-row-top"><div><h4>${esc(p.name)} ${config.active===p.id?'<span class="ak-badge">默认应用</span>':''}</h4><p>${tab==='manager'?`组织 ${esc(p.organizationId)} · 已绑定 ${bound} 个应用`:`管理 AK：${esc(manager?.name||'待绑定')} · 组织 ${esc(manager?.organizationId||'—')}`}</p></div><span class="ak-status ${available?'enabled':''}">${available?'已启用':!p.enabled?'已停用':'绑定不可用'}</span></div><div class="ak-row-detail">${tab==='usage'?`${p.models?.length||0} 个可用模型 · `:''}${p.checkedAt?'最近验证 '+esc(new Date(p.checkedAt).toLocaleString()):'尚未验证'}</div><div class="ak-row-actions"><button type="button" class="button quiet" data-ak-action="edit">${tab==='usage'?'编辑 / 绑定':'编辑'}</button><button type="button" class="button quiet" data-ak-action="refresh">${tab==='usage'?'刷新模型':'验证组织'}</button><button type="button" class="button quiet" data-ak-action="enable">${p.enabled?'停用':'启用'}</button>${tab==='usage'?`<button type="button" class="button quiet" data-ak-action="select" ${!available||config.active===p.id?'disabled':''}>设为默认</button><button type="button" class="button quiet" data-ak-action="report" ${!available?'disabled':''}>组织费用</button>`:''}<button type="button" class="button quiet ak-delete" data-ak-action="delete">删除</button></div>${tab==='usage'&&p.models?.length?`<details class="ak-models"><summary>查看模型列表</summary><ul>${p.models.map(m=>`<li>${esc(m)}</li>`).join('')}</ul></details>`:''}</article>`;
   }).join('')||`<div class="ak-empty"><strong>${tab==='manager'?'先连接一个管理组织':'添加用于模型调用的应用 AK'}</strong><p>${tab==='manager'?'添加管理 AK 并验证组织后，即可绑定应用 AK。':'已有管理 AK 后，添加应用 AK 并选择对应组织。'}</p></div>`}</section><p class="form-error" role="alert" data-ak-error></p><p class="form-hint" role="status" aria-live="polite" data-ak-status></p><p class="ak-footnote">绑定关系由你选择；组织身份与应用模型列表分别验证，平台未自动校验两把 AK 的归属。密钥仅保存在本机，费用为组织汇总。默认应用用于新配置，已保存的表达优化配置仍使用其选定的应用 AK。</p>`;
  }
  function changed(){host.dispatchEvent(new Event('ak-config-changed',{bubbles:true}));}
  async function edit(kind,p={}){
   await window.itemEditor({title:kind==='manager'?'管理 AK · 验证组织':'应用 AK · 绑定管理 AK',message:kind==='manager'?'验证并保存组织身份。管理 AK 不用于模型生成。':'选择此应用所属的管理组织。保存时读取模型列表，不发起生成。',fields:`<label class="field">名称<input name="name" maxlength="80" required value="${esc(p.name)}" placeholder="例如：个人项目、工作组织"></label><label class="field">${kind==='manager'?'管理 AK（sk-mgmt-v1-…）':'应用 AK'}<input name="key" type="password" autocomplete="off" spellcheck="false" maxlength="4096" placeholder="${p.id?'已保存，留空保留':'输入完整 AK'}"></label><div class="form-actions"><button type="button" class="button quiet" data-ak-reveal>显示 AK</button><button type="button" class="button quiet" data-ak-copy>复制 AK</button></div>${kind==='usage'?`<label class="field">绑定管理 AK<select name="managerId" required><option value="">请选择管理 AK</option>${config.managers.filter(m=>m.enabled||m.id===p.managerId).map(m=>`<option value="${esc(m.id)}" ${m.id===p.managerId?'selected':''} ${!m.enabled?'disabled':''}>${esc(m.name)} · ${esc(m.organizationId)}${m.enabled?'':'（已停用）'}</option>`).join('')}</select></label>${!config.managers.some(m=>m.enabled)?'<p class="form-hint">请先返回管理 AK，添加或启用一个管理组织。</p>':''}`:''}`,submit:'验证并保存',onSave:async values=>{config=await api.inferenceKeysUpdate({...values,kind,id:p.id,action:'save'});},onOpen:dialog=>{
    const input=dialog.querySelector('[name=key]'),reveal=dialog.querySelector('[data-ak-reveal]'),copy=dialog.querySelector('[data-ak-copy]');let request=0;
    input.addEventListener('input',()=>request++);
    reveal.onclick=async()=>{if(input.type==='text'){input.type='password';reveal.textContent='显示 AK';return;}const token=++request;reveal.disabled=true;try{const key=input.value||(p.id?(await api.inferenceKeysReveal({kind,id:p.id})).key:'');if(!key)throw Error('请先输入 AK');if(!dialog.isConnected||token!==request)return;input.value=key;input.type='text';reveal.textContent='隐藏 AK';}catch(e){dialog.querySelector('.form-error').textContent=e.message;}finally{reveal.disabled=false;}};
    copy.onclick=async()=>{copy.disabled=true;try{if(!input.value&&!p.id)throw Error('请先输入 AK');await api.inferenceKeysCopy({kind,id:p.id,key:input.value||undefined});copy.textContent='已复制';}catch(e){dialog.querySelector('.form-error').textContent=e.message;}finally{copy.disabled=false;}};
   }});if(host.isConnected){render();changed();}
  }
  host.onclick=async event=>{
   const switcher=event.target.closest('[data-ak-tab]'),add=event.target.closest('[data-ak-add]'),button=event.target.closest('[data-ak-action]');if(busy)return;
   if(switcher){tab=switcher.dataset.akTab;render();host.querySelector(`[data-ak-tab="${tab}"]`).focus();return;}
   if(!add&&!button)return;
   busy=true;
   try{
    if(add){await edit(add.dataset.akAdd);return;}
    const row=button.closest('[data-ak-id]'),kind=row.dataset.akKind,id=row.dataset.akId,p=(kind==='manager'?config.managers:config.usages).find(p=>p.id===id),action=button.dataset.akAction;
    if(action==='edit'){await edit(kind,p);return;}
    if(action==='report'){button.disabled=true;const report=await api.inferenceKeysReport({id});await window.itemEditor({title:'绑定组织费用 · 最近30天',message:`应用 AK：${report.usageName}\n管理 AK：${report.managerName}\n组织：${report.organizationId}\n组织总费用：USD ${report.totalCostUsd}\n这是组织汇总，不是此应用 AK 的单独费用。`,submit:'完成',onSave:async()=>{}});return;}
    if(action==='delete'){await window.itemEditor({title:'删除此 AK？',message:p.name,danger:true,submit:'删除',onSave:async()=>{config=await api.inferenceKeysUpdate({kind,id,action});}});}else{button.disabled=true;config=await api.inferenceKeysUpdate({kind,id,action,enabled:!p.enabled});}
    if(host.isConnected){render();changed();host.querySelector('[data-ak-status]').textContent='配置已更新';}
   }catch(e){if(host.isConnected)host.querySelector('[data-ak-error]').textContent=e.message;}
   finally{busy=false;if(button?.isConnected)button.disabled=false;}
  };
  host.onkeydown=e=>{if(!e.target.matches('[data-ak-tab]')||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)||busy)return;e.preventDefault();tab=e.key==='Home'?'manager':e.key==='End'?'usage':tab==='manager'?'usage':'manager';render();host.querySelector(`[data-ak-tab="${tab}"]`).focus();};
  try{config=await api.inferenceKeysStatus();if(host.isConnected)render();}catch(e){if(host.isConnected)host.textContent=e.message;}
 }
 async function open(){return window.itemEditor({title:'service-inference · 管理 AK 与应用 AK',fields:'<div data-ak-host></div>',submit:'完成',onSave:async()=>{},onOpen:d=>mount(d.querySelector('[data-ak-host]'))});}
 return{mount,open};
})();
