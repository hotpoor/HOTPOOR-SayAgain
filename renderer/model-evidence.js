window.modelEvidenceView=(()=>{
 const catalog=window.sayagainModelEvidence;
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function render(){return `<details class="model-evidence"><summary>语音识别模型与来源 <span>4 个来源 · 3 份不同文件</span></summary><div class="model-evidence-body"><p>公开名称、文件格式和应用中的名称分开列出，方便核对。核验日期：${catalog.verifiedOn}。以下是已核验样本，不代表这台电脑已安装或正在使用这些模型。</p><div class="model-evidence-grid">${catalog.records.map(m=>`<article class="model-evidence-item"><h3>${esc(m.title)}</h3><p class="model-evidence-label">${esc(m.label)}</p><p><strong>${esc(m.model)}</strong></p><p>${esc(m.detail)}</p><details class="model-evidence-proof"><summary>查看文件与校验证据</summary><dl><dt>文件</dt><dd>${esc(m.file)}</dd><dt>大小</dt><dd>${m.bytes.toLocaleString('en-US')} 字节</dd><dt>SHA-256</dt><dd><code>${m.sha256}</code><button type="button" class="button quiet" data-model-evidence-copy="${m.id}">复制指纹</button></dd></dl><p>${esc(m.evidence)}</p><div class="model-evidence-links">${m.sources.map(id=>`<button type="button" class="button quiet" data-model-evidence-source="${id}">${esc(catalog.sources[id].label)} ↗</button>`).join('')}</div></details></article>`).join('')}</div><p>同一套 CPU 推理代码完成公开中、英、粤样例及 ITN 开关共 24 次识别。官方通用版与 Freenote 样本的输出 token 完全一致；样例结果不代表各应用的整体识别质量。ITN 是模型内的文本规范化条件，不等于 AI 润色。</p><p>相同模型仍可能因音频分段、上下文和后处理而产生不同体验。这里仅展示来源与证据；不会下载、切换模型或发送录音。点击来源按钮会在浏览器打开对应公开页面。</p><p class="model-evidence-feedback" role="status" aria-live="polite"></p></div></details>`;}
 document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-model-evidence-source],[data-model-evidence-copy]');if(!button)return;
  const status=button.closest('.model-evidence').querySelector('.model-evidence-feedback');
  try{
   if(button.dataset.modelEvidenceSource){await window.sayagain.modelEvidenceSource(button.dataset.modelEvidenceSource);status.textContent='已在浏览器打开公开来源。';}
   else{const m=catalog.records.find(m=>m.id===button.dataset.modelEvidenceCopy);if(!m)throw Error('未找到模型记录');await window.sayagain.modelEvidenceCopy(m.id);status.textContent='已复制 '+m.title+' 的完整 SHA-256。';}
  }catch(error){status.textContent='操作未完成：'+error.message;}
 });
 return {render};
})();
