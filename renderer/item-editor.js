window.itemEditor=({title,message='',fields='',submit='保存',danger=false,onSave,onOpen,onClose})=>new Promise(resolve=>{
 const dialog=document.createElement('dialog');dialog.className='item-editor';
 dialog.innerHTML=`<form><h2></h2><p class="form-hint"></p><div class="item-editor-fields">${fields}</div><p class="form-error" role="alert"></p><div class="form-actions"><button type="button" class="button" data-cancel>取消</button><button type="submit" class="button ${danger?'danger':'primary'}"></button></div></form>`;
 dialog.querySelector('h2').textContent=title;dialog.querySelector('.form-hint').textContent=message;dialog.querySelector('[type=submit]').textContent=submit;
 const finish=value=>{dialog.close();dialog.remove();onClose?.();resolve(value);};
 dialog.querySelector('[data-cancel]').onclick=()=>finish(false);dialog.oncancel=e=>{e.preventDefault();if(!dialog.dataset.saving)finish(false);};
 dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();e.stopPropagation();if(dialog.dataset.saving)return;dialog.dataset.saving='true';dialog.querySelectorAll('button').forEach(b=>b.disabled=true);try{await onSave(Object.fromEntries(new FormData(e.currentTarget)));finish(true);}catch(error){dialog.querySelector('.form-error').textContent=error.message;delete dialog.dataset.saving;dialog.querySelectorAll('button').forEach(b=>b.disabled=false);}};
 document.body.append(dialog);dialog.showModal();onOpen?.(dialog);
});
