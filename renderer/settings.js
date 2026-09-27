// Settings sections keep their DOM while switching categories, preserving unsaved fields.
window.settingsPage=(()=>{
 let selected='general',selectCurrent;
 const navigation=[['general','通用','偏好设置'],['inference','service-inference','账号与服务'],['qwen','Qwen 账号',''],['speech','语音生成','功能设置'],['local','本地模型',''],['integration','Skill 接入',''],['shortcuts','截图与快捷键',''],['data','数据与备份','']];
 function mount(root){
  root.classList.add('settings-page');
  const layout=root.querySelector('.settings-layout'),sections=[...layout.children];
  const [general,integration,local,speech,shortcuts,recognition,data]=sections;
  const account=document.createElement('section');account.className='settings-section';
  account.innerHTML='<h2>Qwen 账号</h2><p>管理用于音色克隆与语音合成的账号，选择一个作为默认调用账号。</p><form id="qwen-accounts-form"><div data-qwen-fields></div><p class="form-error" role="alert"></p><div class="form-actions"><button class="button primary" type="submit" disabled>保存账号</button><button class="button" type="button" data-action="cloud-platform">打开 Qwen 平台 ↗</button></div><p class="form-hint">账号和模型偏好分别保存。删除全部账号会关闭云端合成。</p></form>';
  account.querySelector('[data-qwen-fields]').append(speech.querySelector('#api-key-list').closest('.field'));
  speech.querySelector('h2').textContent='语音生成';
  speech.querySelector(':scope > p').textContent='选择本地或云端生成方式，以及默认语音模型。保存偏好不会发起生成。';
  speech.querySelector('[data-action="cloud-platform"]').remove();
  const accountLink=document.createElement('p');accountLink.className='form-hint';accountLink.innerHTML='云端使用已选中的 Qwen 账号。<button type="button" class="settings-inline-link" data-settings-open="qwen">管理账号 →</button>';speech.querySelector('form').prepend(accountLink);
  local.append(recognition);recognition.classList.add('settings-subsection');
  general.querySelector('h2').textContent='通用';
  const inference=document.createElement('section');inference.className='settings-section';
  inference.innerHTML='<h2>service-inference</h2><p>管理组织凭据，绑定应用 AK，并选择用于表达优化的文本模型。</p><div class="settings-provider-row"><div><strong>表达优化模型</strong><p data-text-config>正在读取配置…</p></div><button type="button" class="button" data-text-settings>配置模型</button></div><div data-ak-host></div>';
  const panels={general,inference,qwen:account,speech,local,integration,shortcuts,data};
  layout.replaceChildren();layout.className='settings-layout settings-shell';
  const nav=document.createElement('nav');nav.className='settings-nav';nav.setAttribute('aria-label','设置分类');nav.setAttribute('role','tablist');nav.setAttribute('aria-orientation','vertical');
  nav.innerHTML=navigation.map(([id,label,group])=>`${group?`<span class="settings-nav-group">${group}</span>`:''}<button type="button" role="tab" id="settings-tab-${id}" aria-controls="settings-panel-${id}" data-settings-tab="${id}"><span class="settings-nav-dot" aria-hidden="true"></span>${label}</button>`).join('');
  const content=document.createElement('div');content.className='settings-content';
  for(const [id,panel] of Object.entries(panels)){panel.dataset.settingsPanel=id;panel.id=panel.id||`settings-panel-${id}`;nav.querySelector(`[data-settings-tab="${id}"]`).setAttribute('aria-controls',panel.id);panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',`settings-tab-${id}`);content.append(panel);}
  layout.append(nav,content);
  function select(id,focus=false){if(!panels[id])return;selected=id;for(const [key,panel] of Object.entries(panels))panel.hidden=key!==id;for(const button of nav.querySelectorAll('button')){const active=button.dataset.settingsTab===id;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;if(active&&focus)button.focus();}root.closest('main').scrollTop=0;}
  selectCurrent=select;select(selected);
  nav.onclick=e=>{const button=e.target.closest('[data-settings-tab]');if(button)select(button.dataset.settingsTab);};
  nav.onkeydown=e=>{if(!e.target.matches('[data-settings-tab]')||!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;e.preventDefault();const index=navigation.findIndex(([id])=>id===selected),next=e.key==='Home'?0:e.key==='End'?navigation.length-1:(index+(e.key==='ArrowDown'?1:-1)+navigation.length)%navigation.length;select(navigation[next][0],true);};
  root.addEventListener('click',e=>{const button=e.target.closest('[data-settings-open]');if(button)select(button.dataset.settingsOpen);});
  async function summary(){try{const status=await window.sayagain.textReviewStatus(),keys=await window.sayagain.inferenceKeysStatus();if(!inference.isConnected)return;inference.querySelector('[data-text-config]').textContent=status.model?`${status.provider} · ${status.model}${status.provider==='service-inference'?' · 应用：'+(keys.usages.find(p=>p.id===status.usage_id)?.name||'未绑定'):''}${status.has_key?'':' · 配置不可用'}`:'尚未选择文本模型';}catch(e){if(inference.isConnected)inference.querySelector('[data-text-config]').textContent=e.message;}}
  inference.querySelector('[data-text-settings]').onclick=async()=>{try{await window.workflows.textSettings();await summary();await window.inferenceKeys.mount(inference.querySelector('[data-ak-host]'));}catch(e){inference.querySelector('[data-text-config]').textContent=e.message;}};
  inference.addEventListener('ak-config-changed',summary);
  summary();window.inferenceKeys.mount(inference.querySelector('[data-ak-host]'));
 }
 return{mount,select:id=>selectCurrent?.(id)};
})();
